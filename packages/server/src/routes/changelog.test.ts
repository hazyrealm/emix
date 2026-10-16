import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';
import {
  compareVersions,
  publishedReleases,
  unseenReleases,
  validateChangelog,
  type ChangelogRelease,
} from '@backspace/shared/src/changelog.js';
import { normalizeProfileStyle } from '@backspace/shared/src/profileStyle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let testDb: TestDb;
let app: FastifyInstance;
const USER_ID = 'user-1';

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  getRawDb: () => sqlite,
  schema,
}));

vi.mock('../utils/auth.js', () => ({
  authenticate: async (req: { userId?: string }) => { req.userId = USER_ID; },
}));

function applyMigrations(db: Database.Database): void {
  const migrationsDir = path.resolve(__dirname, '../../drizzle');
  for (const f of fs.readdirSync(migrationsDir).filter((n) => n.endsWith('.sql')).sort()) {
    for (const stmt of fs.readFileSync(path.join(migrationsDir, f), 'utf8').split(/-->\s*statement-breakpoint/)) {
      if (stmt.trim()) db.exec(stmt.trim());
    }
  }
}

const shipped = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../shared/changelog.json'), 'utf8')) as ChangelogRelease[];

describe('shipped changelog', () => {
  it('is valid', () => {
    expect(validateChangelog(shipped)).toEqual([]);
  });

  it('announces the running version', async () => {
    const { config } = await import('../config.js');
    expect(publishedReleases(shipped, config.version)[0]?.version).toBe(config.version);
  });
});

describe('changelog rules', () => {
  const rel = (version: string, extra: Partial<ChangelogRelease> = {}): ChangelogRelease => ({
    version, date: '2026-01-01', status: 'published', sections: { new: ['x'] }, ...extra,
  });

  it('orders versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('hides drafts and releases newer than the running server', () => {
    const all = [rel('1.0.0'), rel('1.1.0', { status: 'draft' }), rel('2.0.0')];
    expect(publishedReleases(all, '1.5.0').map((r) => r.version)).toEqual(['1.0.0']);
  });

  it('shows only releases after the acknowledged one', () => {
    const list = publishedReleases([rel('1.0.0'), rel('1.1.0'), rel('1.2.0')], '9.0.0');
    expect(unseenReleases(list, '1.0.0').map((r) => r.version)).toEqual(['1.2.0', '1.1.0']);
    expect(unseenReleases(list, '1.2.0')).toEqual([]);
  });

  it('shows a new account only the latest major release', () => {
    const list = publishedReleases([rel('1.0.0', { major: true }), rel('1.1.0'), rel('1.2.0')], '9.0.0');
    expect(unseenReleases(list, null).map((r) => r.version)).toEqual(['1.0.0']);
  });

  it('rejects malformed documents', () => {
    expect(validateChangelog([{ version: 'v1', date: 'x', status: 'live', sections: {} }]).length).toBeGreaterThan(0);
  });
});

describe('changelog routes', () => {
  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    applyMigrations(sqlite);
    testDb = drizzle(sqlite, { schema });
    testDb.insert(schema.users).values({ id: USER_ID, username: 'maya', passwordHash: 'x', createdAt: Date.now() }).run();
    const { changelogRoutes } = await import('./changelog.js');
    app = Fastify();
    await app.register(changelogRoutes);
  });

  it('serves published releases publicly', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/changelog' });
    expect(res.statusCode).toBe(200);
    expect(res.json().releases.every((r: ChangelogRelease) => r.status === 'published')).toBe(true);
  });

  it('records acknowledgment per account and never moves it backwards', async () => {
    const latest = (await app.inject({ method: 'GET', url: '/api/changelog' })).json().releases[0].version as string;
    expect((await app.inject({ method: 'GET', url: '/api/changelog/state' })).json()).toEqual({ acknowledged: null });

    const ack = await app.inject({ method: 'POST', url: '/api/changelog/ack', payload: { version: latest } });
    expect(ack.json()).toEqual({ acknowledged: latest });
    expect(testDb.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get()?.changelogAck).toBe(latest);

    const older = shipped.find((r) => r.status === 'published' && compareVersions(r.version, latest) < 0);
    if (older) {
      const back = await app.inject({ method: 'POST', url: '/api/changelog/ack', payload: { version: older.version } });
      expect(back.json()).toEqual({ acknowledged: latest });
    }
  });

  it('refuses a version that was never announced', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/changelog/ack', payload: { version: '99.0.0' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('profile style normalization', () => {
  it('keeps valid fields and drops the rest', () => {
    const style = normalizeProfileStyle({
      name: { effect: 'gradient', colors: ['#FF00AA', 'not-a-colour', '#00aaff'], glow: true },
      nameplate: 'galaxy',
      decoration: 'made-up',
      effect: 'snow',
      background: { preset: 'nebula', image: '../etc/passwd', zoom: 900 },
      banner: { x: -20, y: 40, zoom: 150 },
      pronouns: '  they/them‮  ',
      links: [{ label: 'Site', url: 'example.com' }, { label: 'Bad', url: 'javascript:alert(1)' }],
      css: 'body{}',
    });
    expect(style).toEqual({
      name: { effect: 'gradient', colors: ['#ff00aa', '#00aaff'], glow: true },
      nameplate: 'galaxy',
      effect: 'snow',
      background: { preset: 'nebula' },
      banner: { x: 0, y: 40, zoom: 150 },
      pronouns: 'they/them',
      links: [{ label: 'Site', url: 'https://example.com/' }],
    });
  });

  it('returns null for nothing valid', () => {
    expect(normalizeProfileStyle({ nameplate: 'nope' })).toBeNull();
    expect(normalizeProfileStyle('not json')).toBeNull();
  });
});
