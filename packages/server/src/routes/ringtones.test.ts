import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';
import { setWorkerId } from '../utils/snowflake.js';

setWorkerId(7);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Set before routes/ringtones.js (and with it config.js) is first imported in beforeEach.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emix-ringtones-'));
process.env.UPLOAD_DIR = path.join(dataDir, 'uploads');

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let testDb: TestDb;
let app: FastifyInstance;
const as = vi.hoisted(() => ({ userId: '100' }));

vi.mock('../db/index.js', () => ({ getDb: () => testDb, getRawDb: () => sqlite, schema }));
vi.mock('../utils/auth.js', () => ({ authenticate: async (req: { userId?: string }) => { req.userId = as.userId; } }));

function applyMigrations(db: Database.Database): void {
  const dir = path.resolve(__dirname, '../../drizzle');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    for (const stmt of fs.readFileSync(path.join(dir, f), 'utf8').split(/-->\s*statement-breakpoint/)) if (stmt.trim()) db.exec(stmt.trim());
  }
}

// 100 = Hero (shares a ringtone), 200 = Bob (in a DM with Hero), 300 = a stranger.
const HERO = '100', BOB = '200', STRANGER = '300', TONE = '9001';

beforeEach(async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  for (const id of [HERO, BOB, STRANGER]) testDb.insert(schema.users).values({ id, username: `u${id}`, passwordHash: 'x', createdAt: 1 }).run();
  testDb.insert(schema.dmChannels).values({ id: 'dm1', createdAt: 1 }).run();
  testDb.insert(schema.dmMembers).values([{ dmChannelId: 'dm1', userId: HERO }, { dmChannelId: 'dm1', userId: BOB }]).run();
  testDb.insert(schema.ringtones).values({ id: TONE, ownerId: HERO, name: 'Hero theme', durationMs: 4000, size: 4, createdAt: 1 }).run();
  fs.mkdirSync(path.join(dataDir, 'ringtones'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'ringtones', `${TONE}.ogg`), 'OggS');
  as.userId = HERO;
  const { ringtoneRoutes } = await import('./ringtones.js');
  app = Fastify();
  await app.register(ringtoneRoutes);
});

const putSettings = (settings: unknown) => app.inject({ method: 'PUT', url: '/api/users/@me/ringtone-settings', payload: { settings } });
const audio = () => app.inject({ method: 'GET', url: `/api/ringtones/${TONE}/audio` });
const sharedOfHero = async () => (await app.inject({ method: 'GET', url: `/api/users/${HERO}/shared-ringtone` })).json().ringtone;

describe('ringtones', () => {
  it('keeps uploads private until shared, and then only for people who can call', async () => {
    expect((await audio()).statusCode).toBe(200);
    as.userId = BOB;
    expect((await audio()).statusCode).toBe(404);
    expect(await sharedOfHero()).toBeNull();

    as.userId = HERO;
    // Selected as the shared ringtone but sharing still off: private.
    await putSettings({ shared: { kind: 'custom', id: TONE }, shareEnabled: false });
    as.userId = BOB;
    expect(await sharedOfHero()).toBeNull();

    as.userId = HERO;
    await putSettings({ shared: { kind: 'custom', id: TONE }, shareEnabled: true });
    as.userId = BOB;
    expect(await sharedOfHero()).toEqual({ kind: 'custom', id: TONE, name: 'Hero theme' });
    const res = await audio();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('private');

    as.userId = STRANGER;
    expect(await sharedOfHero()).toBeNull();
    expect((await audio()).statusCode).toBe(404);
  });

  it('never shares the private incoming ringtone', async () => {
    await putSettings({ incoming: { kind: 'custom', id: TONE }, shareEnabled: true });
    as.userId = BOB;
    expect(await sharedOfHero()).toBeNull();
    expect((await audio()).statusCode).toBe(404);
  });

  it('accepts only your own uploads in settings', async () => {
    as.userId = BOB;
    expect((await putSettings({ incoming: { kind: 'custom', id: TONE } })).statusCode).toBe(400);
    expect((await putSettings({ incoming: { kind: 'builtin', id: 'marimba' }, callerPlays: 'theirs', incomingVolume: 500 })).json().settings)
      .toMatchObject({ incoming: { kind: 'builtin', id: 'marimba' }, callerPlays: 'theirs', incomingVolume: 100 });
  });

  it('deleting an upload removes the file and every reference to it', async () => {
    await putSettings({ incoming: { kind: 'custom', id: TONE }, shared: { kind: 'custom', id: TONE }, shareEnabled: true, friends: { [BOB]: { incoming: { kind: 'custom', id: TONE } } } });
    as.userId = BOB;
    expect((await app.inject({ method: 'DELETE', url: `/api/ringtones/${TONE}` })).statusCode).toBe(404);
    as.userId = HERO;
    const res = await app.inject({ method: 'DELETE', url: `/api/ringtones/${TONE}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toMatchObject({ incoming: { kind: 'default' }, shared: null, friends: {} });
    expect(fs.existsSync(path.join(dataDir, 'ringtones', `${TONE}.ogg`))).toBe(false);
    expect(testDb.select().from(schema.ringtones).where(eq(schema.ringtones.id, TONE)).all()).toHaveLength(0);
  });

  it('refuses files that are not MP3, WAV or OGG before decoding them', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
    const res = await app.inject({ method: 'POST', url: '/api/ringtones', payload: { name: 'x', data: html } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('ringtone_invalid_audio');
  });

  it('stores uploads outside the public uploads folder', async () => {
    const { ringtoneDir } = await import('../utils/ringtoneStorage.js');
    expect(path.relative(path.join(dataDir, 'uploads'), ringtoneDir()).startsWith('..')).toBe(true);
  });
});
