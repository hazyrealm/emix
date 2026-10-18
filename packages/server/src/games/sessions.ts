/**
 * Emix games: sessions. A session is a private lobby that invited players
 * join; matches are played in it, one after another (rematches, switching
 * games), until everyone leaves.
 *
 * The server is the only authority. Every move goes through the game's rules
 * here, in order (Node runs one request at a time), against the session's
 * `seq` where the client sends one, so a duplicate or out-of-order move is
 * refused instead of applied twice. Hidden information stays in `state`,
 * which is never sent: each player gets the view their seat may see.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { ErrorCode } from '@backspace/shared/src/errors.js';
import {
  GAMES,
  GAME_INVITE_TTL_MS,
  normalizeGameOptions,
  type GameContext,
  type GameId,
  type GameMove,
  type GameOptions,
  type GameResult,
  type GameSessionStatus,
  type GameSessionView,
} from '@backspace/shared/src/games.js';
import { getDb, schema } from '../db/index.js';
import { connectionManager } from '../ws/handler.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { canReach } from '../utils/reachability.js';
import { RULES } from './registry.js';
import type { BaseState, RuleContext } from './types.js';

/** A seat is kept this long for a disconnected player before they forfeit. */
export const AWAY_FORFEIT_MS = 90_000;
/** A lobby nobody touches closes after this long; so does a finished session. */
export const IDLE_CLOSE_MS = 30 * 60_000;
/** Open sessions one person may be part of at once. */
export const MAX_OPEN_SESSIONS = 6;
const MAX_PENDING_INVITES = 7;
const SWEEP_MS = 5_000;

export interface Session {
  id: string;
  gameId: GameId;
  hostId: string;
  context: GameContext;
  status: GameSessionStatus;
  players: string[];
  /** userId → invited at. */
  invited: Record<string, number>;
  options: GameOptions;
  state: BaseState | null;
  /** Matches started in this session so far. */
  round: number;
  result: GameResult | null;
  series: Record<string, number>;
  draws: number;
  rematch: string[];
  /** userId → when they went offline (only while away). */
  awaySince: Record<string, number>;
  seq: number;
  createdAt: number;
  updatedAt: number;
}

export class GameError extends Error {
  constructor(readonly status: number, readonly code: ErrorCode) {
    super(code);
  }
}

const sessions = new Map<string, Session>();
const timers = new Map<string, NodeJS.Timeout>();
let sweeper: NodeJS.Timeout | null = null;
let clock: () => number = () => Date.now();
let random: () => number = Math.random;

/** Tests swap the clock and the random source. */
export function __setGameEnvironment(env: { now?: () => number; rng?: () => number }): void {
  if (env.now) clock = env.now;
  if (env.rng) random = env.rng;
}

export function __resetGamesForTests(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  sessions.clear();
}

const ctx = (): RuleContext => ({ now: clock(), rng: random });

// ── Persistence ────────────────────────────────────────────────────────────

function persist(s: Session): void {
  const db = getDb();
  if (s.status === 'closed') {
    db.delete(schema.gameSessions).where(eq(schema.gameSessions.id, s.id)).run();
    return;
  }
  const data = JSON.stringify({
    players: s.players, invited: s.invited, options: s.options, state: s.state, round: s.round,
    result: s.result, series: s.series, draws: s.draws, rematch: s.rematch, awaySince: s.awaySince,
  });
  const row = {
    id: s.id, gameId: s.gameId, hostId: s.hostId, context: JSON.stringify(s.context), status: s.status,
    data, seq: s.seq, createdAt: s.createdAt, updatedAt: s.updatedAt,
  };
  db.insert(schema.gameSessions).values(row)
    .onConflictDoUpdate({ target: schema.gameSessions.id, set: { gameId: row.gameId, hostId: row.hostId, status: row.status, data: row.data, seq: row.seq, updatedAt: row.updatedAt } })
    .run();
}

/** Restore open sessions after a restart and start the sweeper. */
export function restoreGameSessions(): void {
  const rows = getDb().select().from(schema.gameSessions)
    .where(inArray(schema.gameSessions.status, ['lobby', 'playing', 'finished'])).all();
  for (const row of rows) {
    try {
      const d = JSON.parse(row.data) as Omit<Session, 'id' | 'gameId' | 'hostId' | 'context' | 'status' | 'seq' | 'createdAt' | 'updatedAt'>;
      const s: Session = {
        id: row.id, gameId: row.gameId as GameId, hostId: row.hostId, context: JSON.parse(row.context) as GameContext,
        status: row.status as GameSessionStatus, seq: row.seq, createdAt: row.createdAt, updatedAt: row.updatedAt,
        ...d,
      };
      sessions.set(s.id, s);
      armTimer(s);
    } catch {
      getDb().delete(schema.gameSessions).where(eq(schema.gameSessions.id, row.id)).run();
    }
  }
  startSweeper();
}

export function startSweeper(): void {
  if (sweeper) return;
  sweeper = setInterval(sweep, SWEEP_MS);
  sweeper.unref?.();
}

// ── Views and fan-out ──────────────────────────────────────────────────────

/** Everyone who should hear about the session: players and pending invitees. */
function audience(s: Session): string[] {
  return [...new Set([...s.players, ...Object.keys(s.invited)])];
}

export function viewFor(s: Session, userId: string): GameSessionView {
  const rules = RULES[s.gameId];
  const seat = s.state ? s.state.players.indexOf(userId) : -1;
  return {
    id: s.id, gameId: s.gameId, hostId: s.hostId, context: s.context, status: s.status,
    players: s.players, seats: s.state?.players ?? [], invited: Object.keys(s.invited), options: s.options, seq: s.seq,
    view: s.state && (seat >= 0 || s.players.includes(userId)) ? rules.view(s.state, seat) : null,
    result: s.result, series: s.series, draws: s.draws, rematch: s.rematch,
    away: Object.keys(s.awaySince),
    deadline: s.state && s.status === 'playing' ? rules.deadline(s.state) : null,
    createdAt: s.createdAt, updatedAt: s.updatedAt,
  };
}

function broadcast(s: Session, removed: string[] = []): void {
  for (const uid of audience(s)) connectionManager.sendToUser(uid, { type: 'game_session', session: viewFor(s, uid) });
  for (const uid of removed) connectionManager.sendToUser(uid, { type: 'game_session_removed', sessionId: s.id });
}

/** Save, re-arm the timer and tell everyone. Every mutation ends here. */
function commit(s: Session, removed: string[] = []): void {
  s.seq += 1;
  s.updatedAt = clock();
  persist(s);
  armTimer(s);
  broadcast(s, removed);
  if (s.status === 'closed') {
    sessions.delete(s.id);
    const t = timers.get(s.id);
    if (t) clearTimeout(t);
    timers.delete(s.id);
  }
}

/** Close the session for good. `also`: people already taken off it who must still be told. */
function close(s: Session, also: string[] = []): void {
  const removed = [...new Set([...audience(s), ...also])];
  s.status = 'closed';
  s.invited = {};
  commit(s, removed);
}

// ── Timers ─────────────────────────────────────────────────────────────────

function armTimer(s: Session): void {
  const old = timers.get(s.id);
  if (old) clearTimeout(old);
  timers.delete(s.id);
  if (s.status !== 'playing' || !s.state) return;
  const at = RULES[s.gameId].deadline(s.state);
  if (at === null) return;
  const t = setTimeout(() => onDeadline(s.id, at), Math.max(0, at - clock()));
  t.unref?.();
  timers.set(s.id, t);
}

function onDeadline(id: string, at: number): void {
  const s = sessions.get(id);
  if (!s || s.status !== 'playing' || !s.state) return;
  const rules = RULES[s.gameId];
  // A move since this timer was armed moved the deadline: nothing to do.
  if (rules.deadline(s.state) !== at || !rules.timeout) return;
  applyState(s, rules.timeout(s.state, ctx()));
  commit(s);
}

// ── Results ────────────────────────────────────────────────────────────────

/** Adopt a new rules state; record the match if it just ended. */
function applyState(s: Session, state: BaseState): void {
  const wasOver = s.state?.result != null;
  s.state = state;
  if (!wasOver && state.result) {
    s.status = 'finished';
    s.result = state.result;
    s.rematch = [];
    if (state.result.draw) s.draws += 1;
    else for (const w of state.result.winners) s.series[w] = (s.series[w] ?? 0) + 1;
    recordResult(s, state);
  }
}

function recordResult(s: Session, state: BaseState): void {
  const result = state.result!;
  const finishedAt = clock();
  const rows = state.players.map((userId) => ({
    id: generateSnowflake(),
    sessionId: s.id,
    gameId: s.gameId,
    userId,
    outcome: result.winners.includes(userId) ? (result.draw ? 'draw' : 'win') : (result.draw && result.winners.length === 0 ? 'draw' : 'loss'),
    opponents: JSON.stringify(state.players.filter((p) => p !== userId)),
    finishedAt,
  }));
  // A player whose account is gone has no row to point at.
  const existing = new Set(getDb().select({ id: schema.users.id }).from(schema.users)
    .where(inArray(schema.users.id, rows.map((r) => r.userId))).all().map((r) => r.id));
  const valid = rows.filter((r) => existing.has(r.userId));
  if (valid.length) getDb().insert(schema.gameResults).values(valid).run();
}

// ── Access ─────────────────────────────────────────────────────────────────

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

/** The session, if `userId` is a player or a pending invitee. */
export function sessionFor(id: string, userId: string): Session {
  const s = sessions.get(id);
  if (!s) throw new GameError(404, 'game_not_found');
  if (!s.players.includes(userId) && !(userId in s.invited)) throw new GameError(403, 'game_forbidden');
  return s;
}

export function sessionsOf(userId: string): GameSessionView[] {
  return [...sessions.values()]
    .filter((s) => s.players.includes(userId) || userId in s.invited)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((s) => viewFor(s, userId));
}

function openSessionCount(userId: string): number {
  let n = 0;
  for (const s of sessions.values()) if (s.players.includes(userId)) n += 1;
  return n;
}

/**
 * Whether `inviter` may invite `invitee` into `s`: friends or people sharing
 * a conversation, plus, for a call's session, anyone in that call, and, for
 * a conversation's session, anyone in that conversation.
 */
function mayInvite(s: Session, inviter: string, invitee: string): boolean {
  if (s.context.kind === 'voice') {
    const room = connectionManager.getUserRoom(invitee);
    if (room && room.roomId === s.context.roomId && connectionManager.getUserRoom(inviter)?.roomId === s.context.roomId) return true;
  }
  if (s.context.kind === 'dm') {
    const dmChannelId = s.context.dmChannelId;
    const both = getDb().select({ userId: schema.dmMembers.userId }).from(schema.dmMembers)
      .where(and(eq(schema.dmMembers.dmChannelId, dmChannelId), inArray(schema.dmMembers.userId, [inviter, invitee]))).all();
    if (both.length === 2) return true;
  }
  return canReach(inviter, invitee);
}

function userExists(id: string): boolean {
  return !!getDb().select({ id: schema.users.id }).from(schema.users)
    .where(and(eq(schema.users.id, id), eq(schema.users.isDeleted, 0))).get();
}

function addInvites(s: Session, inviter: string, ids: string[]): void {
  const fresh = [...new Set(ids)].filter((id) => id !== inviter && !s.players.includes(id) && !(id in s.invited));
  if (Object.keys(s.invited).length + fresh.length > MAX_PENDING_INVITES) throw new GameError(400, 'game_full');
  if (s.players.length + Object.keys(s.invited).length + fresh.length > GAMES[s.gameId].maxPlayers + MAX_PENDING_INVITES) throw new GameError(400, 'game_full');
  for (const id of fresh) {
    if (!userExists(id) || !mayInvite(s, inviter, id)) throw new GameError(403, 'game_invite_unreachable');
  }
  const now = clock();
  for (const id of fresh) s.invited[id] = now;
}

// ── Actions ────────────────────────────────────────────────────────────────

export function createSession(hostId: string, input: { gameId: GameId; options?: unknown; context: GameContext; invite: string[] }): Session {
  if (openSessionCount(hostId) >= MAX_OPEN_SESSIONS) throw new GameError(400, 'game_limit_reached');
  let context: GameContext = { kind: 'direct' };
  if (input.context.kind === 'voice') {
    const room = connectionManager.getUserRoom(hostId);
    if (!room) throw new GameError(400, 'game_wrong_state');
    context = { kind: 'voice', roomId: room.roomId };
  } else if (input.context.kind === 'dm') {
    const member = getDb().select({ userId: schema.dmMembers.userId }).from(schema.dmMembers)
      .where(and(eq(schema.dmMembers.dmChannelId, input.context.dmChannelId), eq(schema.dmMembers.userId, hostId))).get();
    if (!member) throw new GameError(403, 'game_forbidden');
    context = { kind: 'dm', dmChannelId: input.context.dmChannelId };
  }
  const now = clock();
  const s: Session = {
    id: generateSnowflake(), gameId: input.gameId, hostId, context, status: 'lobby',
    players: [hostId], invited: {}, options: normalizeGameOptions(input.gameId, input.options),
    state: null, round: 0, result: null, series: {}, draws: 0, rematch: [], awaySince: {},
    seq: 0, createdAt: now, updatedAt: now,
  };
  addInvites(s, hostId, input.invite);
  sessions.set(s.id, s);
  commit(s);
  return s;
}

export function inviteToSession(id: string, userId: string, ids: string[]): Session {
  const s = sessionFor(id, userId);
  if (!s.players.includes(userId)) throw new GameError(403, 'game_forbidden');
  if (s.status === 'closed') throw new GameError(400, 'game_wrong_state');
  addInvites(s, userId, ids);
  commit(s);
  return s;
}

export function acceptInvite(id: string, userId: string): Session {
  const s = sessionFor(id, userId);
  if (s.players.includes(userId)) return s;
  if (s.status === 'playing') throw new GameError(400, 'game_wrong_state');
  if (s.players.length >= GAMES[s.gameId].maxPlayers) throw new GameError(400, 'game_full');
  if (openSessionCount(userId) >= MAX_OPEN_SESSIONS) throw new GameError(400, 'game_limit_reached');
  delete s.invited[userId];
  s.players.push(userId);
  // A finished two-player match with a fresh opponent starts over as a lobby.
  if (s.status === 'finished') { s.status = 'lobby'; s.state = null; s.result = null; s.rematch = []; }
  commit(s);
  return s;
}

export function declineInvite(id: string, userId: string): void {
  const s = sessionFor(id, userId);
  if (!(userId in s.invited)) return;
  // The host keeps the lobby even when nobody is left to come, to invite someone else.
  delete s.invited[userId];
  commit(s, [userId]);
}

/** Leave a session. Mid-match this forfeits (or, in party games, drops out). */
export function leaveSession(id: string, userId: string, reason: GameResult['reason'] = 'resigned'): void {
  const s = sessionFor(id, userId);
  if (userId in s.invited) return declineInvite(id, userId);
  dropPlayer(s, userId, reason);
  s.players = s.players.filter((p) => p !== userId);
  s.rematch = s.rematch.filter((p) => p !== userId);
  delete s.awaySince[userId];
  if (s.players.length === 0) return close(s, [userId]);
  if (s.hostId === userId) s.hostId = s.players[0]!;
  if (s.status === 'finished' && s.players.length < GAMES[s.gameId].minPlayers) s.status = 'lobby';
  commit(s, [userId]);
}

function dropPlayer(s: Session, userId: string, reason: GameResult['reason']): void {
  if (s.status !== 'playing' || !s.state) return;
  const seat = s.state.players.indexOf(userId);
  if (seat < 0) return;
  const rules = RULES[s.gameId];
  const remaining = s.state.players.length - 1;
  if (GAMES[s.gameId].maxPlayers > 2 && remaining >= 2 && rules.drop) {
    applyState(s, rules.drop(s.state, seat, ctx()));
    return;
  }
  const others = s.state.players.filter((p) => p !== userId);
  applyState(s, { ...s.state, result: { winners: others, draw: false, reason } });
}

export function startMatch(id: string, userId: string): Session {
  const s = sessionFor(id, userId);
  if (s.hostId !== userId) throw new GameError(403, 'game_forbidden');
  if (s.status === 'playing') throw new GameError(400, 'game_wrong_state');
  beginMatch(s);
  commit(s);
  return s;
}

function beginMatch(s: Session): void {
  const meta = GAMES[s.gameId];
  if (s.players.length < meta.minPlayers) throw new GameError(400, 'game_not_enough_players');
  if (s.players.length > meta.maxPlayers) throw new GameError(400, 'game_full');
  s.state = RULES[s.gameId].start([...s.players], s.options, ctx(), s.round);
  s.round += 1;
  s.status = 'playing';
  s.result = null;
  s.rematch = [];
  // Invitations to a match already under way would have nowhere to go.
  if (meta.maxPlayers <= s.players.length) s.invited = {};
}

/** Apply a move. `seq`, when sent, must match the session's current version. */
export function makeMove(id: string, userId: string, move: GameMove, seq?: number): Session {
  const s = sessionFor(id, userId);
  if (s.status !== 'playing' || !s.state) throw new GameError(400, 'game_wrong_state');
  if (seq !== undefined && seq !== s.seq) throw new GameError(409, 'game_stale');
  const seat = s.state.players.indexOf(userId);
  if (seat < 0) throw new GameError(403, 'game_forbidden');
  if (!move || typeof move !== 'object' || typeof (move as { type?: unknown }).type !== 'string') throw new GameError(400, 'game_illegal_move');
  if (move.type === 'resign' && GAMES[s.gameId].maxPlayers > 2) {
    leaveSession(id, userId, 'resigned');
    return s;
  }
  const out = RULES[s.gameId].move(s.state, seat, move, ctx());
  if ('error' in out) throw new GameError(out.error === 'game_not_your_turn' ? 409 : 400, out.error);
  applyState(s, out.state);
  commit(s);
  return s;
}

/** Ask for a rematch; it starts once every player has asked. */
export function voteRematch(id: string, userId: string): Session {
  const s = sessionFor(id, userId);
  if (s.status !== 'finished' || !s.players.includes(userId)) throw new GameError(400, 'game_wrong_state');
  if (!s.rematch.includes(userId)) s.rematch.push(userId);
  if (s.players.every((p) => s.rematch.includes(p)) && s.players.length >= GAMES[s.gameId].minPlayers) beginMatch(s);
  commit(s);
  return s;
}

/** The host picks another game (or new options); the session returns to its lobby. */
export function changeGame(id: string, userId: string, gameId: GameId, options: unknown): Session {
  const s = sessionFor(id, userId);
  if (s.hostId !== userId) throw new GameError(403, 'game_forbidden');
  if (s.status === 'playing') throw new GameError(400, 'game_wrong_state');
  if (s.players.length > GAMES[gameId].maxPlayers) throw new GameError(400, 'game_full');
  if (gameId !== s.gameId) { s.series = {}; s.draws = 0; s.round = 0; }
  s.gameId = gameId;
  s.options = normalizeGameOptions(gameId, options);
  s.status = 'lobby';
  s.state = null;
  s.result = null;
  s.rematch = [];
  commit(s);
  return s;
}

/** Drawing strokes (or a clear/undo) from the drawer, relayed to the other players. */
export function relayDrawing(id: string, userId: string, op: unknown): void {
  const s = sessions.get(id);
  if (!s || s.gameId !== 'drawing' || s.status !== 'playing' || !s.state || !s.players.includes(userId)) return;
  const rules = RULES.drawing as unknown as { applyCanvas?: (state: BaseState, userId: string, op: unknown) => BaseState | null };
  const next = rules.applyCanvas?.(s.state, userId, op);
  if (!next) return;
  s.state = next;
  for (const uid of s.players) if (uid !== userId) connectionManager.sendToUser(uid, { type: 'game_draw', sessionId: s.id, op: op as never });
}

/** The current drawing, for a player who (re)opens the game. */
export function canvasOf(id: string, userId: string): unknown {
  const s = sessionFor(id, userId);
  const state = s.state as unknown as { strokes?: unknown[] } | null;
  return s.gameId === 'drawing' && state?.strokes ? state.strokes : [];
}

/** A deleted account leaves every session it was in. */
export function removeUserFromGames(userId: string): void {
  for (const s of [...sessions.values()]) {
    if (userId in s.invited) { delete s.invited[userId]; commit(s); continue; }
    if (s.players.includes(userId)) leaveSession(s.id, userId, 'abandoned');
  }
}

// ── Sweeper: invites, disconnected players, idle sessions ─────────────────

export function sweep(): void {
  const now = clock();
  for (const s of [...sessions.values()]) {
    let changed = false;
    const expired = Object.entries(s.invited).filter(([, at]) => now - at > GAME_INVITE_TTL_MS).map(([id]) => id);
    for (const id of expired) delete s.invited[id];
    if (expired.length) changed = true;

    for (const uid of s.players) {
      const online = connectionManager.isUserOnline(uid);
      if (online && uid in s.awaySince) { delete s.awaySince[uid]; changed = true; }
      if (!online && !(uid in s.awaySince)) { s.awaySince[uid] = now; changed = true; }
    }

    if (s.status === 'playing') {
      const gone = Object.entries(s.awaySince).filter(([, at]) => now - at > AWAY_FORFEIT_MS).map(([id]) => id);
      if (gone.length) {
        for (const uid of gone) {
          dropPlayer(s, uid, 'abandoned');
          if (s.status !== 'playing') break;
        }
        changed = true;
      }
    }

    const everyoneGone = s.players.every((p) => p in s.awaySince && now - s.awaySince[p]! > AWAY_FORFEIT_MS);
    if ((s.status !== 'playing' && now - s.updatedAt > IDLE_CLOSE_MS) || (s.status !== 'playing' && everyoneGone && Object.keys(s.invited).length === 0)) {
      close(s);
      continue;
    }
    if (changed) commit(s, expired);
  }
}

/** For statistics: whether a session's game is one this server knows. */
export function knownGame(id: unknown): id is GameId {
  return typeof id === 'string' && id in GAMES;
}
