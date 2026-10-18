import type { CheckersPiece, CheckersView } from '@backspace/shared/src/games.js';
import { drawn, forfeit, winFor, type BaseState, type GameRules } from '../types.js';

/**
 * Checkers, American rules (English draughts):
 * - 8×8 board, pieces on dark squares, 12 each. Seat 0 starts at the bottom
 *   and moves up; who moves first alternates every match.
 * - Men move one square diagonally forward; kings move one square in any
 *   diagonal direction (no flying kings).
 * - Capturing is compulsory. A capture continues while the same piece can
 *   jump again, and must be completed; the player may choose any capturing
 *   sequence (not necessarily the longest). Men capture forward only.
 * - A man reaching the far row becomes a king, and the move ends there.
 * - A player with no legal move loses. 40 moves each (80 plies) with no
 *   capture and no promotion is a draw. Players may also agree a draw.
 */
type Cell = [number, number];
type Board = CheckersPiece[][];

interface State extends BaseState {
  board: Board;
  turn: 0 | 1;
  last: Cell[] | null;
  /** Plies since the last capture or promotion. */
  quietPlies: number;
  drawOffer: 0 | 1 | null;
}

const QUIET_DRAW = 80;
const dark = (r: number, c: number) => (r + c) % 2 === 1;
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

function initialBoard(): Board {
  return Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c): CheckersPiece => {
    if (!dark(r, c)) return null;
    if (r <= 2) return { seat: 1, king: false };
    if (r >= 5) return { seat: 0, king: false };
    return null;
  }));
}

function directions(piece: NonNullable<CheckersPiece>): Cell[] {
  const forward = piece.seat === 0 ? -1 : 1;
  return piece.king ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[forward, -1], [forward, 1]];
}

const kingRow = (seat: 0 | 1) => (seat === 0 ? 0 : 7);

/** Every complete capture sequence for the piece at `from`. */
function jumps(board: Board, from: Cell): Cell[][] {
  const piece = board[from[0]]![from[1]]!;
  const out: Cell[][] = [];
  const walk = (at: Cell, path: Cell[], taken: Set<string>, b: Board) => {
    let extended = false;
    for (const [dr, dc] of directions(piece)) {
      const mid: Cell = [at[0] + dr, at[1] + dc];
      const land: Cell = [at[0] + 2 * dr, at[1] + 2 * dc];
      if (!inside(...land)) continue;
      const victim = b[mid[0]]![mid[1]];
      if (!victim || victim.seat === piece.seat || taken.has(`${mid[0]},${mid[1]}`)) continue;
      if (b[land[0]]![land[1]] !== null) continue;
      extended = true;
      const nextPath = [...path, land];
      // A man that reaches the far row is crowned and stops.
      if (!piece.king && land[0] === kingRow(piece.seat)) { out.push(nextPath); continue; }
      walk(land, nextPath, new Set([...taken, `${mid[0]},${mid[1]}`]), b);
    }
    if (!extended && path.length > 1) out.push(path);
  };
  // The moving piece's square counts as empty while it travels.
  const b = board.map((row) => [...row]);
  b[from[0]]![from[1]] = null;
  walk(from, [from], new Set(), b);
  return out;
}

/** All legal moves for `seat` as paths of cells (captures only, if any exist). */
export function legalMoves(board: Board, seat: 0 | 1): Cell[][] {
  const captures: Cell[][] = [];
  const steps: Cell[][] = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const piece = board[r]![c];
    if (!piece || piece.seat !== seat) continue;
    captures.push(...jumps(board, [r, c]));
    for (const [dr, dc] of directions(piece)) {
      const to: Cell = [r + dr, c + dc];
      if (inside(...to) && board[to[0]]![to[1]] === null) steps.push([[r, c], to]);
    }
  }
  return captures.length ? captures : steps;
}

function applyPath(board: Board, path: Cell[]): { board: Board; captured: number; crowned: boolean } {
  const b = board.map((row) => [...row]);
  const [fr, fc] = path[0]!;
  let piece = b[fr]![fc]!;
  b[fr]![fc] = null;
  let captured = 0;
  for (let i = 1; i < path.length; i++) {
    const [ar, ac] = path[i - 1]!;
    const [br, bc] = path[i]!;
    if (Math.abs(br - ar) === 2) { b[(ar + br) / 2]![(ac + bc) / 2] = null; captured += 1; }
  }
  const [tr, tc] = path[path.length - 1]!;
  const crowned = !piece.king && tr === kingRow(piece.seat);
  if (crowned) piece = { ...piece, king: true };
  b[tr]![tc] = piece;
  return { board: b, captured, crowned };
}

const samePath = (a: Cell[], b: Cell[]) => a.length === b.length && a.every(([r, c], i) => r === b[i]![0] && c === b[i]![1]);

export const checkers: GameRules<State> = {
  start: (players, _o, _c, round) => ({
    players, result: null, board: initialBoard(), turn: (round % 2) as 0 | 1, last: null, quietPlies: 0, drawOffer: null,
  }),
  move(state, seat, move) {
    if (move.type === 'resign') return { state: forfeit(state, seat, 'resigned') };
    if (move.type === 'offer_draw') {
      if (state.drawOffer !== null) return { error: 'game_wrong_state' };
      return { state: { ...state, drawOffer: seat as 0 | 1 } };
    }
    if (move.type === 'answer_draw') {
      if (state.drawOffer === null || state.drawOffer === seat) return { error: 'game_wrong_state' };
      return { state: move.accept ? { ...state, drawOffer: null, result: drawn('agreed') } : { ...state, drawOffer: null } };
    }
    if (move.type !== 'path' || !Array.isArray(move.path) || move.path.length < 2 || move.path.length > 13) return { error: 'game_illegal_move' };
    if (seat !== state.turn) return { error: 'game_not_your_turn' };
    const path = move.path.map((cell) => (Array.isArray(cell) ? [Number(cell[0]), Number(cell[1])] : [NaN, NaN]) as Cell);
    if (!legalMoves(state.board, seat as 0 | 1).some((m) => samePath(m, path))) return { error: 'game_illegal_move' };
    const { board, captured, crowned } = applyPath(state.board, path);
    const next = (seat === 0 ? 1 : 0) as 0 | 1;
    const quietPlies = captured || crowned ? 0 : state.quietPlies + 1;
    let result = null;
    if (legalMoves(board, next).length === 0) result = winFor(state.players, seat);
    else if (quietPlies >= QUIET_DRAW) result = drawn('fifty');
    return {
      state: {
        ...state, board, turn: next, last: path, quietPlies, result,
        drawOffer: state.drawOffer === seat ? state.drawOffer : null,
      },
    };
  },
  deadline: () => null,
  view: (s, me): CheckersView => ({
    me, board: s.board, turn: s.turn,
    legal: me === s.turn && !s.result ? legalMoves(s.board, s.turn) : [],
    last: s.last, quietPlies: s.quietPlies, drawOffer: s.drawOffer,
  }),
  drop: (s, seat) => forfeit(s, seat, 'abandoned'),
};
