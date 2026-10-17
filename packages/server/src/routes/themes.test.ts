import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';
import { setWorkerId } from '../utils/snowflake.js';
import { BUILTIN_THEMES } from '@backspace/shared/src/builtinThemes.js';

setWorkerId(7);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let testDb: TestDb;
let app: FastifyInstance;
const as = vi.hoisted(() => ({ userId: 'alice' }));

vi.mock('../db/index.js', () => ({ getDb: () => testDb, getRawDb: () => sqlite, schema }));
vi.mock('../utils/auth.js', () => ({ authenticate: async (req: { userId?: string }) => { req.userId = as.userId; } }));

function applyMigrations(db: Database.Database): void {
  const dir = path.resolve(__dirname, '../../drizzle');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    for (const stmt of fs.readFileSync(path.join(dir, f), 'utf8').split(/-->\s*statement-breakpoint/)) if (stmt.trim()) db.exec(stmt.trim());
  }
}

const theme = BUILTIN_THEMES.find((t) => t.id === 'crimson')!.data;

beforeEach(async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  for (const id of ['alice', 'bob']) testDb.insert(schema.users).values({ id, username: id, passwordHash: 'x', createdAt: Date.now() }).run();
  as.userId = 'alice';
  const { themeRoutes } = await import('./themes.js');
  app = Fastify();
  await app.register(themeRoutes);
});

async function create(body: Record<string, unknown>) {
  const res = await app.inject({ method: 'POST', url: '/api/themes', payload: body });
  return { status: res.statusCode, theme: res.json().theme };
}

describe('themes', () => {
  it('stores only normalized theme data and refuses anything else', async () => {
    const ok = await create({ name: 'Mine', data: { ...theme, css: 'body{display:none}' } });
    expect(ok.status).toBe(201);
    expect(ok.theme.data).not.toHaveProperty('css');
    expect((await create({ name: 'Bad', data: { mode: 'dark', colors: { bg: 'red' } } })).status).toBe(400);
    expect((await create({ name: '', data: theme })).status).toBe(400);
    expect((await create({ name: 'Img', data: { ...theme, background: { image: 'not-uploaded.png' } } })).status).toBe(400);
  });

  it('keeps private themes out of the gallery but opens them by share code', async () => {
    const priv = (await create({ name: 'Private one', data: theme })).theme;
    await create({ name: 'Public one', data: theme, visibility: 'public', category: 'dark' });
    as.userId = 'bob';
    const gallery = (await app.inject({ method: 'GET', url: '/api/themes/gallery' })).json().themes;
    expect(gallery.map((t: { name: string }) => t.name)).toEqual(['Public one']);
    const shared = await app.inject({ method: 'GET', url: `/api/themes/share/${priv.shareCode}` });
    expect(shared.statusCode).toBe(200);
    expect(shared.json().theme.creator).toEqual({ id: 'alice', username: 'alice', displayName: null });
    expect((await app.inject({ method: 'GET', url: '/api/themes/share/nonexistentcode' })).statusCode).toBe(404);
  });

  it('lets only the owner change or delete a theme', async () => {
    const t = (await create({ name: 'Alice', data: theme })).theme;
    as.userId = 'bob';
    expect((await app.inject({ method: 'PATCH', url: `/api/themes/${t.id}`, payload: { name: 'Hijacked' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/themes/${t.id}` })).statusCode).toBe(404);
    as.userId = 'alice';
    expect((await app.inject({ method: 'PATCH', url: `/api/themes/${t.id}`, payload: { name: 'Renamed' } })).json().theme.name).toBe('Renamed');
  });

  it('credits the creator when someone saves a shared theme', async () => {
    const t = (await create({ name: 'Rose Night', data: theme })).theme;
    as.userId = 'bob';
    const copy = (await create({ name: 'Rose Night', data: theme, basedOnCode: t.shareCode })).theme;
    expect(copy.basedOn).toEqual({ name: 'Rose Night', creatorName: 'alice' });
    expect(testDb.select().from(schema.themes).where(eq(schema.themes.id, t.id)).get()?.installs).toBe(1);
  });

  it('counts one like per person', async () => {
    const t = (await create({ name: 'Liked', data: theme, visibility: 'public' })).theme;
    as.userId = 'bob';
    await app.inject({ method: 'POST', url: `/api/themes/${t.id}/like` });
    const twice = (await app.inject({ method: 'POST', url: `/api/themes/${t.id}/like` })).json().theme;
    expect(twice.likes).toBe(1);
    expect(twice.likedByMe).toBe(true);
    expect((await app.inject({ method: 'DELETE', url: `/api/themes/${t.id}/like` })).json().theme.likes).toBe(0);
  });

  it('saves the selected theme per account and validates it', async () => {
    const put = (selection: unknown) => app.inject({ method: 'PUT', url: '/api/users/@me/app-theme', payload: { selection } });
    expect((await put({ kind: 'builtin', id: 'ocean' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/users/@me/app-theme' })).json().selection).toEqual({ kind: 'builtin', id: 'ocean' });
    expect((await put({ kind: 'builtin', id: 'not-a-theme' })).statusCode).toBe(400);
    expect((await put({ kind: 'custom', themeId: null, name: 'Mine', data: theme })).statusCode).toBe(200);
    await put(null);
    expect(testDb.select().from(schema.users).where(eq(schema.users.id, 'alice')).get()?.appTheme).toBeNull();
  });
});
