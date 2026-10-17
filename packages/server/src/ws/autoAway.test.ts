import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let testDb: TestDb;

// A connection manager with two sessions for Alice; each can go idle.
const cm = vi.hoisted(() => {
  const idle = new Map<string, boolean>();
  const status = new Map<string, string>();
  const sent: Array<{ to: string; status: string }> = [];
  return {
    idle, status, sent,
    sessions: ['phone', 'desktop'],
    isUserOnline: () => true,
    allSessionsIdle(): boolean { return this.sessions.length > 0 && this.sessions.every((s) => idle.get(s) === true); },
    getUserStatus: (u: string) => status.get(u) ?? 'offline',
    setUserStatus: (u: string, s: string) => { status.set(u, s); },
    getUserActivities: () => [],
    sendToUser: (to: string, e: { status: string }) => { sent.push({ to, status: e.status }); },
  };
});

vi.mock('../db/index.js', () => ({ getDb: () => testDb, getRawDb: () => sqlite, schema }));
vi.mock('./handler.js', () => ({ connectionManager: cm }));
vi.mock('../utils/userDeletion.js', () => ({ collectProfileBroadcastTargetIds: () => new Set(['bob']) }));
vi.mock('./replicaPresence.js', () => ({ showReplicaChoice: vi.fn() }));
vi.mock('../utils/federationPresence.js', () => ({ queuePresenceRelay: vi.fn() }));

function applyMigrations(db: Database.Database): void {
  const dir = path.resolve(__dirname, '../../drizzle');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    for (const stmt of fs.readFileSync(path.join(dir, f), 'utf8').split(/-->\s*statement-breakpoint/)) if (stmt.trim()) db.exec(stmt.trim());
  }
}

const row = () => testDb.select().from(schema.users).where(eq(schema.users.id, 'alice')).get()!;

beforeEach(() => {
  sqlite = new Database(':memory:');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  testDb.insert(schema.users).values({ id: 'alice', username: 'alice', passwordHash: 'x', createdAt: 1, status: 'online', chosenStatus: 'online' }).run();
  cm.idle.clear();
  cm.status.set('alice', 'online');
  cm.sent.length = 0;
  cm.sessions = ['phone', 'desktop'];
});

describe('automatic Away', () => {
  it('shows Away only while every session is idle, and never changes the choice', async () => {
    const { refreshAutoAway } = await import('./presence.js');
    cm.idle.set('desktop', true);
    refreshAutoAway('alice');
    expect(row().status).toBe('online'); // the phone is still in use

    cm.idle.set('phone', true);
    refreshAutoAway('alice');
    expect(row()).toMatchObject({ status: 'idle', chosenStatus: 'online' });
    expect(cm.sent).toContainEqual({ to: 'bob', status: 'idle' });

    cm.idle.set('phone', false);
    refreshAutoAway('alice');
    expect(row()).toMatchObject({ status: 'online', chosenStatus: 'online' });
  });

  it('leaves a chosen Away or Do Not Disturb alone', async () => {
    const { applyChosenStatus, refreshAutoAway } = await import('./presence.js');
    applyChosenStatus('alice', 'dnd');
    cm.idle.set('phone', true);
    cm.idle.set('desktop', true);
    refreshAutoAway('alice');
    expect(row()).toMatchObject({ status: 'dnd', chosenStatus: 'dnd' });
    cm.idle.clear();
    refreshAutoAway('alice');
    expect(row().status).toBe('dnd');
  });

  it('choosing Online while every device is idle still shows Away until one is used', async () => {
    const { applyChosenStatus } = await import('./presence.js');
    testDb.update(schema.users).set({ chosenStatus: 'idle', status: 'idle' }).where(eq(schema.users.id, 'alice')).run();
    cm.idle.set('phone', true);
    cm.idle.set('desktop', true);
    applyChosenStatus('alice', 'online');
    expect(row()).toMatchObject({ status: 'idle', chosenStatus: 'online' });
  });
});
