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

const cm = vi.hoisted(() => ({
  sent: [] as Array<{ to: string; event: { type: string; session?: { seq: number; view: unknown; status: string } } }>,
  online: new Set<string>(),
  rooms: new Map<string, string>(),
  sendToUser(to: string, event: never) { this.sent.push({ to, event }); },
  isUserOnline(id: string) { return this.online.has(id); },
  getUserRoom(id: string) { const r = this.rooms.get(id); return r ? { roomId: r, room: {} } : null; },
}));

vi.mock('../db/index.js', () => ({ getDb: () => testDb, getRawDb: () => sqlite, schema }));
vi.mock('../ws/handler.js', () => ({ connectionManager: cm }));

import * as games from './sessions.js';
import { setWorkerId } from '../utils/snowflake.js';

setWorkerId(1);
import { dailyGuess, dailyState, answerFor, puzzleNumber } from './daily.js';
import { gameStats } from './stats.js';

function applyMigrations(db: Database.Database): void {
  const dir = path.resolve(__dirname, '../../drizzle');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    for (const stmt of fs.readFileSync(path.join(dir, f), 'utf8').split(/-->\s*statement-breakpoint/)) if (stmt.trim()) db.exec(stmt.trim());
  }
}

let now = 1_800_000_000_000;
const user = (id: string) => testDb.insert(schema.users).values({ id, username: id, passwordHash: 'x', createdAt: 1 }).run();
const befriend = (a: string, b: string) => testDb.insert(schema.friends).values([{ userId: a, friendId: b, createdAt: 1 }, { userId: b, friendId: a, createdAt: 1 }]).run();
const code = (fn: () => unknown) => { try { fn(); return 'ok'; } catch (e) { return (e as games.GameError).code; } };

beforeEach(() => {
  sqlite = new Database(':memory:');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  games.__resetGamesForTests();
  games.__setGameEnvironment({ now: () => now, rng: () => 0.42 });
  cm.sent.length = 0;
  cm.online = new Set(['alice', 'bob', 'carol', 'dave']);
  cm.rooms.clear();
  for (const id of ['alice', 'bob', 'carol', 'dave']) user(id);
  befriend('alice', 'bob');
});

function startTicTacToe() {
  const s = games.createSession('alice', { gameId: 'tictactoe', context: { kind: 'direct' }, invite: ['bob'] });
  games.acceptInvite(s.id, 'bob');
  games.startMatch(s.id, 'alice');
  return s;
}

describe('invitations and private lobbies', () => {
  it('invites only reachable people, and outsiders cannot see or join', () => {
    expect(code(() => games.createSession('alice', { gameId: 'chess', context: { kind: 'direct' }, invite: ['carol'] }))).toBe('game_invite_unreachable');
    const s = games.createSession('alice', { gameId: 'chess', context: { kind: 'direct' }, invite: ['bob'] });
    expect(cm.sent.some((m) => m.to === 'bob' && m.event.type === 'game_session')).toBe(true);
    expect(code(() => games.sessionFor(s.id, 'carol'))).toBe('game_forbidden');
    expect(code(() => games.acceptInvite(s.id, 'carol'))).toBe('game_forbidden');
    expect(code(() => games.makeMove(s.id, 'carol', { type: 'resign' }))).toBe('game_forbidden');
  });

  it('does not duplicate an invitation, and a declined invite removes the session for the invitee', () => {
    const s = games.createSession('alice', { gameId: 'chess', context: { kind: 'direct' }, invite: ['bob'] });
    games.inviteToSession(s.id, 'alice', ['bob']);
    expect(Object.keys(s.invited)).toEqual(['bob']);
    games.declineInvite(s.id, 'bob');
    expect(cm.sent.at(-1)).toEqual({ to: 'bob', event: { type: 'game_session_removed', sessionId: s.id } });
    expect(games.sessionsOf('bob')).toEqual([]);
  });

  it('a call’s session can invite anyone in that call', () => {
    cm.rooms.set('alice', 'room1');
    cm.rooms.set('dave', 'room1');
    const s = games.createSession('alice', { gameId: 'trivia', context: { kind: 'voice', roomId: 'ignored' }, invite: ['dave'] });
    expect(s.context).toEqual({ kind: 'voice', roomId: 'room1' });
    expect(code(() => games.inviteToSession(s.id, 'alice', ['carol']))).toBe('game_invite_unreachable');
  });

  it('only the host starts, and only with enough players', () => {
    const s = games.createSession('alice', { gameId: 'tictactoe', context: { kind: 'direct' }, invite: ['bob'] });
    expect(code(() => games.startMatch(s.id, 'alice'))).toBe('game_not_enough_players');
    games.acceptInvite(s.id, 'bob');
    expect(code(() => games.startMatch(s.id, 'bob'))).toBe('game_forbidden');
    expect(code(() => games.startMatch(s.id, 'alice'))).toBe('ok');
  });
});

describe('server-authoritative moves', () => {
  it('rejects moves for the other player, stale versions and duplicates', () => {
    const s = startTicTacToe();
    expect(code(() => games.makeMove(s.id, 'bob', { type: 'place', index: 0 }))).toBe('game_not_your_turn');
    const seq = s.seq;
    games.makeMove(s.id, 'alice', { type: 'place', index: 4 }, seq);
    expect(code(() => games.makeMove(s.id, 'alice', { type: 'place', index: 4 }, seq))).toBe('game_stale');
    expect(code(() => games.makeMove(s.id, 'bob', { type: 'place', index: 4 }, s.seq))).toBe('game_illegal_move');
  });

  it('sends each player a view without the other’s hidden choice', () => {
    const s = games.createSession('alice', { gameId: 'rps', context: { kind: 'direct' }, invite: ['bob'] });
    games.acceptInvite(s.id, 'bob');
    games.startMatch(s.id, 'alice');
    cm.sent.length = 0;
    games.makeMove(s.id, 'alice', { type: 'choose', choice: 'scissors' });
    const toBob = cm.sent.find((m) => m.to === 'bob')!;
    expect(JSON.stringify(toBob.event)).not.toContain('scissors');
    expect(JSON.stringify(cm.sent.find((m) => m.to === 'alice')!.event)).toContain('scissors');
  });

  it('records the result, counts the series and starts a rematch when both ask, with the other player starting', () => {
    const s = startTicTacToe();
    for (const [who, i] of [['alice', 0], ['bob', 3], ['alice', 1], ['bob', 4], ['alice', 2]] as const) games.makeMove(s.id, who, { type: 'place', index: i });
    expect(s.status).toBe('finished');
    expect(s.series).toEqual({ alice: 1 });
    const rows = testDb.select().from(schema.gameResults).all();
    expect(rows.map((r) => [r.userId, r.outcome]).sort()).toEqual([['alice', 'win'], ['bob', 'loss']]);
    games.voteRematch(s.id, 'alice');
    expect(s.status).toBe('finished');
    games.voteRematch(s.id, 'bob');
    expect(s.status).toBe('playing');
    expect((s.state as unknown as { turn: number }).turn).toBe(1);
    expect(gameStats('alice', now).totals).toEqual({ played: 1, wins: 1, losses: 0, draws: 0 });
  });

  it('leaving mid-match forfeits; switching games returns to the lobby', () => {
    const s = startTicTacToe();
    games.leaveSession(s.id, 'bob');
    expect(s.result).toMatchObject({ winners: ['alice'], reason: 'resigned' });
    expect(s.players).toEqual(['alice']);
    games.changeGame(s.id, 'alice', 'connect4', {});
    expect(s.status).toBe('lobby');
    expect(s.gameId).toBe('connect4');
  });
});

describe('timers, disconnects and restarts', () => {
  it('a timer closes a Rock Paper Scissors round on time', () => {
    vi.useFakeTimers();
    try {
      const s = games.createSession('alice', { gameId: 'rps', context: { kind: 'direct' }, invite: ['bob'] });
      games.acceptInvite(s.id, 'bob');
      games.startMatch(s.id, 'alice');
      games.makeMove(s.id, 'alice', { type: 'choose', choice: 'rock' });
      now += 31_000;
      vi.advanceTimersByTime(31_000);
      expect((s.state as unknown as { wins: number[] }).wins).toEqual([1, 0]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a player gone longer than the grace period forfeits; a quick reconnect keeps the seat', () => {
    const s = startTicTacToe();
    cm.online.delete('bob');
    games.sweep();
    expect(s.awaySince.bob).toBe(now);
    now += 30_000;
    cm.online.add('bob');
    games.sweep();
    expect(s.awaySince.bob).toBeUndefined();
    expect(s.status).toBe('playing');
    cm.online.delete('bob');
    games.sweep();
    now += games.AWAY_FORFEIT_MS + 1_000;
    games.sweep();
    expect(s.result).toMatchObject({ winners: ['alice'], reason: 'abandoned' });
  });

  it('restores an open match after a restart', () => {
    const s = startTicTacToe();
    games.makeMove(s.id, 'alice', { type: 'place', index: 4 });
    games.__resetGamesForTests();
    expect(games.getSession(s.id)).toBeUndefined();
    games.restoreGameSessions();
    const back = games.getSession(s.id)!;
    expect(back.status).toBe('playing');
    expect((back.state as unknown as { board: unknown[] }).board[4]).toBe(0);
    expect(code(() => games.makeMove(s.id, 'bob', { type: 'place', index: 0 }))).toBe('ok');
  });

  it('the last player to leave is told the session is gone', () => {
    const s = startTicTacToe();
    games.leaveSession(s.id, 'bob');
    cm.sent.length = 0;
    games.leaveSession(s.id, 'alice');
    expect(cm.sent).toContainEqual({ to: 'alice', event: { type: 'game_session_removed', sessionId: s.id } });
    expect(games.getSession(s.id)).toBeUndefined();
  });

  it('a deleted account leaves its sessions', () => {
    const s = startTicTacToe();
    games.removeUserFromGames('bob');
    expect(s.players).toEqual(['alice']);
    expect(s.result?.winners).toEqual(['alice']);
  });
});

describe('daily word', () => {
  it('is the same puzzle for everyone and reveals the answer only when finished', () => {
    const before = dailyState('alice', now);
    expect(before.answer).toBeNull();
    expect(dailyState('bob', now).number).toBe(before.number);
    const answer = answerFor(puzzleNumber(now));
    const wrong = answer === 'house' ? 'mouse' : 'house';
    expect(code(() => dailyGuess('alice', 'qqqqq', now))).toBe('game_unknown_word');
    dailyGuess('alice', wrong, now);
    const done = dailyGuess('alice', answer, now);
    expect(done.status).toBe('won');
    expect(done.answer).toBe(answer);
    expect(done.stats).toMatchObject({ played: 1, won: 1, currentStreak: 1, bestStreak: 1 });
    expect(done.stats.distribution[1]).toBe(1);
    expect(code(() => dailyGuess('alice', answer, now))).toBe('game_wrong_state');
  });

  it('counts streaks over consecutive days and resets them after a miss', () => {
    const day = 86_400_000;
    for (let d = 0; d < 3; d++) dailyGuess('bob', answerFor(puzzleNumber(now + d * day)), now + d * day);
    expect(dailyState('bob', now + 2 * day).stats).toMatchObject({ currentStreak: 3, bestStreak: 3 });
    expect(dailyState('bob', now + 5 * day).stats.currentStreak).toBe(0);
    expect(testDb.select().from(schema.gameDaily).where(eq(schema.gameDaily.userId, 'bob')).all()).toHaveLength(3);
  });
});
