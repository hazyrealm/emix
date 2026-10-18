import { Chess, type Square } from 'chess.js';
import type { ChessClock, ChessView, GameResult } from '@backspace/shared/src/games.js';
import { drawn, forfeit, winFor, type BaseState, type GameRules, type RuleContext } from '../types.js';

/**
 * Chess. Rules (legal moves, check, mate, stalemate, castling, en passant,
 * promotion, the fifty-move rule, threefold repetition, insufficient
 * material) come from chess.js; this file adds seats, clocks, draw offers
 * and resignation. Colours alternate every match.
 */
interface State extends BaseState {
  /** Moves from the start position in SAN; replayed so repetition is known. */
  san: string[];
  colors: ['w' | 'b', 'w' | 'b'];
  clock: ChessClock;
  /** Remaining ms per seat (null without a clock). */
  clocks: [number, number] | null;
  /** When the side to move started thinking (clock games). */
  turnStartedAt: number;
  drawOffer: 0 | 1 | null;
  last: { from: string; to: string } | null;
}

const CLOCKS: Record<Exclude<ChessClock, 'none'>, { base: number; inc: number }> = {
  '3+2': { base: 3 * 60_000, inc: 2_000 },
  '5+0': { base: 5 * 60_000, inc: 0 },
  '10+0': { base: 10 * 60_000, inc: 0 },
  '15+10': { base: 15 * 60_000, inc: 10_000 },
};

function replay(san: string[]): Chess {
  const game = new Chess();
  for (const m of san) game.move(m);
  return game;
}

function seatToMove(state: State, game: Chess): 0 | 1 {
  return state.colors[0] === game.turn() ? 0 : 1;
}

/** How the game ended by the board alone, if it did. */
function boardResult(game: Chess, state: State): GameResult | null {
  if (game.isCheckmate()) {
    const loser = seatToMove(state, game);
    return winFor(state.players, loser === 0 ? 1 : 0);
  }
  if (game.isStalemate()) return drawn('stalemate');
  if (game.isInsufficientMaterial()) return drawn('material');
  if (game.isThreefoldRepetition()) return drawn('repetition');
  if (game.isDrawByFiftyMoves()) return drawn('fifty');
  return null;
}

/** The clock of the side to move, charged up to `now`. */
function charge(state: State, game: Chess, now: number): [number, number] | null {
  if (!state.clocks) return null;
  const clocks: [number, number] = [...state.clocks];
  const seat = seatToMove(state, game);
  clocks[seat] = Math.max(0, clocks[seat] - (now - state.turnStartedAt));
  return clocks;
}

function flagFall(state: State, game: Chess, ctx: RuleContext): State {
  const loser = seatToMove(state, game);
  const winnerColor = state.colors[loser === 0 ? 1 : 0];
  // Running out of time against a lone king (or too little to mate) is a draw.
  const pieces = game.board().flat().filter((p) => p && p.color === winnerColor).map((p) => p!.type);
  const canMate = pieces.some((t) => t === 'q' || t === 'r' || t === 'p') || pieces.length >= 3;
  const clocks = charge(state, game, ctx.now);
  return { ...state, clocks, result: canMate ? winFor(state.players, loser === 0 ? 1 : 0, 'flag') : drawn('material') };
}

export const chess: GameRules<State> = {
  start(players, options, ctx, round) {
    const clock = options.clock ?? 'none';
    const base = clock === 'none' ? null : CLOCKS[clock].base;
    return {
      players, result: null, san: [], clock,
      colors: round % 2 === 0 ? ['w', 'b'] : ['b', 'w'],
      clocks: base === null ? null : [base, base],
      turnStartedAt: ctx.now, drawOffer: null, last: null,
    };
  },
  move(state, seat, move, ctx) {
    if (move.type === 'resign') return { state: forfeit(state, seat, 'resigned') };
    const game = replay(state.san);
    if (move.type === 'offer_draw') {
      if (state.drawOffer !== null) return { error: 'game_wrong_state' };
      return { state: { ...state, drawOffer: seat as 0 | 1 } };
    }
    if (move.type === 'answer_draw') {
      if (state.drawOffer === null || state.drawOffer === seat) return { error: 'game_wrong_state' };
      return { state: move.accept ? { ...state, drawOffer: null, result: drawn('agreed') } : { ...state, drawOffer: null } };
    }
    if (move.type !== 'move' || typeof move.from !== 'string' || typeof move.to !== 'string') return { error: 'game_illegal_move' };
    if (seatToMove(state, game) !== seat) return { error: 'game_not_your_turn' };
    const clocks = charge(state, game, ctx.now);
    if (clocks && clocks[seat] <= 0) return { state: flagFall(state, game, ctx) };
    let made;
    try {
      made = game.move({ from: move.from as Square, to: move.to as Square, ...(move.promotion ? { promotion: move.promotion } : {}) });
    } catch {
      return { error: 'game_illegal_move' };
    }
    if (clocks && state.clock !== 'none') clocks[seat] += CLOCKS[state.clock].inc;
    const next: State = {
      ...state, san: [...state.san, made.san], clocks, turnStartedAt: ctx.now,
      last: { from: made.from, to: made.to },
      // Moving answers an opponent's draw offer with no; one's own offer stands.
      drawOffer: state.drawOffer === seat ? state.drawOffer : null,
    };
    return { state: { ...next, result: boardResult(game, next) } };
  },
  deadline(state) {
    if (!state.clocks || state.result) return null;
    const seat = state.colors[0] === (state.san.length % 2 === 0 ? 'w' : 'b') ? 0 : 1;
    return state.turnStartedAt + state.clocks[seat];
  },
  timeout: (state, ctx) => flagFall(state, replay(state.san), ctx),
  view(state, me): ChessView {
    const game = replay(state.san);
    const myColor = me >= 0 ? state.colors[me] : null;
    const legal = !state.result && myColor === game.turn()
      ? game.moves({ verbose: true }).map((m) => ({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion as 'q' | 'r' | 'b' | 'n' } : {}) }))
      : [];
    return {
      me, fen: game.fen(), turn: game.turn(), colors: state.colors, legal,
      check: game.inCheck(), last: state.last, san: state.san,
      clocks: state.clocks, clockRunningSince: state.clocks && !state.result ? state.turnStartedAt : null,
      drawOffer: state.drawOffer,
    };
  },
  drop: (s, seat) => forfeit(s, seat, 'abandoned'),
};
