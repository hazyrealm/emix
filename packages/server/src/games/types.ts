import type { ErrorCode } from '@backspace/shared/src/errors.js';
import type { GameMove, GameOptions, GameResult } from '@backspace/shared/src/games.js';

/** What a rule may read besides the state: the clock and a random source. */
export interface RuleContext {
  now: number;
  /** Uniform in [0, 1). Seeded in tests. */
  rng: () => number;
}

/** Every game state carries its players (seat order) and, once over, its result. */
export interface BaseState {
  players: string[];
  result: GameResult | null;
}

export type MoveOutcome<S> = { state: S } | { error: ErrorCode };

/**
 * One game's rules. Pure: each call returns a new state (or an error) and
 * never touches the network, the database or the clock outside `ctx`. The
 * session manager owns timers, persistence and who may call what.
 */
export interface GameRules<S extends BaseState> {
  /**
   * A fresh match. `round` counts matches in the session from 0, so games
   * alternate who starts (and Hangman who sets the word).
   */
  start(players: string[], options: GameOptions, ctx: RuleContext, round: number): S;
  move(state: S, seat: number, move: GameMove, ctx: RuleContext): MoveOutcome<S>;
  /** When the current timer runs out, or null for no timer. */
  deadline(state: S): number | null;
  /** The state after the deadline passed (a forfeit, an auto-pick, the next question…). */
  timeout?(state: S, ctx: RuleContext): S;
  /** The view for the player in `seat` (-1: not seated). Hides what they may not see. */
  view(state: S, seat: number): unknown;
  /**
   * A player left or was gone too long. Two-player games end with the other
   * player winning; party games carry on without them while two remain.
   */
  drop?(state: S, seat: number, ctx: RuleContext): S;
}

export function isOver(state: BaseState): boolean {
  return state.result !== null;
}

/** The match won by `seat`. */
export function winFor(players: string[], seat: number, reason: GameResult['reason'] = 'normal'): GameResult {
  return { winners: [players[seat]!], draw: false, reason };
}

export function drawn(reason: GameResult['reason'] = 'normal'): GameResult {
  return { winners: [], draw: true, reason };
}

/** Two-player forfeit: the other seat wins. */
export function forfeit<S extends BaseState>(state: S, seat: number, reason: GameResult['reason']): S {
  return { ...state, result: winFor(state.players, seat === 0 ? 1 : 0, reason) };
}

/** Highest score wins; a shared top score is a draw between those players. */
export function byScore(scores: Record<string, number>, players: string[], reason: GameResult['reason'] = 'normal'): GameResult {
  const top = Math.max(...players.map((p) => scores[p] ?? 0));
  const winners = players.filter((p) => (scores[p] ?? 0) === top);
  return { winners, draw: winners.length > 1, reason };
}

export function shuffle<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
