import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';
import { setWorkerId } from '../utils/snowflake.js';
import { USERNAME_CHANGE_COOLDOWN_MS } from '@backspace/shared/src/username.js';

setWorkerId(7);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let testDb: TestDb;
let app: FastifyInstance;
const as = vi.hoisted(() => ({ userId: 'alice' }));
const sent = vi.hoisted(() => [] as Array<{ to: string; event: unknown }>);

vi.mock('../db/index.js', () => ({ getDb: () => testDb, getRawDb: () => sqlite, schema }));
vi.mock('../utils/auth.js', async (orig) => ({
  ...(await orig<typeof import('../utils/auth.js')>()),
  authenticate: async (req: { userId?: string }) => { req.userId = as.userId; },
}));
vi.mock('../ws/handler.js', () => ({ connectionManager: { sendToUser: (to: string, event: unknown) => { sent.push({ to, event }); } } }));
vi.mock('../utils/userDeletion.js', () => ({ collectProfileBroadcastTargetIds: () => new Set(['bob']) }));
vi.mock('../utils/federationOutbox.js', () => ({ isFederationRelayEnabled: () => false }));

function applyMigrations(db: Database.Database): void {
  const dir = path.resolve(__dirname, '../../drizzle');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    for (const stmt of fs.readFileSync(path.join(dir, f), 'utf8').split(/-->\s*statement-breakpoint/)) if (stmt.trim()) db.exec(stmt.trim());
  }
}

const hash = bcrypt.hashSync('correct horse', 4);

beforeEach(async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  for (const id of ['alice', 'bob']) testDb.insert(schema.users).values({ id, username: id, passwordHash: hash, createdAt: Date.now() }).run();
  testDb.insert(schema.friends).values({ userId: 'alice', friendId: 'bob', createdAt: 1 }).run();
  as.userId = 'alice';
  sent.length = 0;
  const { usernameRoutes } = await import('./username.js');
  app = Fastify();
  await app.register(usernameRoutes);
});

const change = (username: string, password = 'correct horse') =>
  app.inject({ method: 'POST', url: '/api/users/@me/username', payload: { username, password } });
const check = async (username: string) =>
  (await app.inject({ method: 'GET', url: `/api/users/@me/username/check?username=${encodeURIComponent(username)}` })).json();

describe('username changes', () => {
  it('checks availability case-insensitively and applies the rules', async () => {
    expect(await check('Bob')).toMatchObject({ username: 'bob', available: false, reason: 'taken' });
    expect(await check('alice')).toMatchObject({ available: false, reason: 'current' });
    expect(await check('ad')).toMatchObject({ available: false, reason: 'too_short' });
    expect(await check('no spaces')).toMatchObject({ available: false, reason: 'characters' });
    expect(await check('Admin')).toMatchObject({ available: false, reason: 'reserved' });
    expect(await check('Alice_2')).toMatchObject({ username: 'alice_2', available: true, reason: null });
  });

  it('renames by id only, re-issues the token and tells friends', async () => {
    const res = await change('Alice_New');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ id: 'alice', username: 'alice_new' });
    expect(typeof body.token).toBe('string');
    expect(body.status.nextChangeAt).toBeGreaterThan(Date.now() + USERNAME_CHANGE_COOLDOWN_MS - 60_000);
    // The friendship row still points at the same id.
    expect(testDb.select().from(schema.friends).where(eq(schema.friends.userId, 'alice')).all()).toHaveLength(1);
    expect(sent.map((s) => s.to).sort()).toEqual(['alice', 'bob']);
  });

  it('refuses a taken name in any case, and a wrong password', async () => {
    expect((await change('BOB')).json().code).toBe('username_taken');
    const wrong = await change('alice_two', 'nope');
    expect(wrong.statusCode).toBe(403);
    expect(testDb.select().from(schema.users).where(eq(schema.users.id, 'alice')).get()?.username).toBe('alice');
  });

  it('allows one change per 30 days, enforced on the server', async () => {
    expect((await change('alice_one')).statusCode).toBe(200);
    const again = await change('alice_two');
    expect(again.statusCode).toBe(429);
    expect(again.json().code).toBe('username_change_cooldown');
    // Thirty days later it is allowed again.
    testDb.update(schema.users).set({ usernameChangedAt: Date.now() - USERNAME_CHANGE_COOLDOWN_MS - 1 }).where(eq(schema.users.id, 'alice')).run();
    expect((await change('alice_two')).statusCode).toBe(200);
  });

  it('lets only one of two parallel changes through', async () => {
    const [a, b] = await Promise.all([change('alice_x'), change('alice_y')]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 429]);
  });

  it('turns a unique-index conflict into "taken"', async () => {
    // Bob takes the name after Alice's check but before her write.
    testDb.update(schema.users).set({ username: 'carol' }).where(eq(schema.users.id, 'bob')).run();
    expect((await change('carol')).json().code).toBe('username_taken');
  });

  it('does not rename accounts homed on another instance', async () => {
    testDb.update(schema.users).set({ homeInstance: 'peer.example', username: 'alice@peer.example' }).where(eq(schema.users.id, 'alice')).run();
    expect((await change('alice_local')).json().code).toBe('username_change_unavailable');
    expect((await app.inject({ method: 'GET', url: '/api/users/@me/username' })).json().canChange).toBe(false);
  });
});
