import type { ConnectFourView } from '@backspace/shared/src/games.js';
import { drawn, forfeit, isInt, winFor, type BaseState, type GameRules } from '../types.js';

const COLS = 7;
const ROWS = 6;

interface State extends BaseState {
  /** board[row][col], row 0 at the top. */
  board: (0 | 1 | null)[][];
  turn: 0 | 1;
  line: [number, number][] | null;
  last: [number, number] | null;
}

/** The four (or more) in a row through (r, c) for `seat`, if any. */
export function fourFrom(board: (0 | 1 | null)[][], r: number, c: number, seat: 0 | 1): [number, number][] | null {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
    const cells: [number, number][] = [[r, c]];
    for (const sign of [1, -1]) {
      let rr = r + dr * sign;
      let cc = c + dc * sign;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr]![cc] === seat) {
        cells.push([rr, cc]);
        rr += dr * sign;
        cc += dc * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

/** Connect Four: seven columns, six rows, pieces fall to the lowest free cell. */
export const connectFour: GameRules<State> = {
  start: (players, _o, _c, round) => ({
    players, result: null,
    board: Array.from({ length: ROWS }, () => Array<0 | 1 | null>(COLS).fill(null)),
    turn: (round % 2) as 0 | 1, line: null, last: null,
  }),
  move(state, seat, move) {
    if (move.type === 'resign') return { state: forfeit(state, seat, 'resigned') };
    if (move.type !== 'drop' || !isInt(move.column, 0, COLS - 1)) return { error: 'game_illegal_move' };
    if (seat !== state.turn) return { error: 'game_not_your_turn' };
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) if (state.board[r]![move.column] === null) { row = r; break; }
    if (row < 0) return { error: 'game_illegal_move' };
    const board = state.board.map((r) => [...r]);
    board[row]![move.column] = seat as 0 | 1;
    const line = fourFrom(board, row, move.column, seat as 0 | 1);
    const full = board[0]!.every((c) => c !== null);
    return {
      state: {
        ...state, board, line, last: [row, move.column],
        turn: seat === 0 ? 1 : 0,
        result: line ? winFor(state.players, seat) : full ? drawn() : null,
      },
    };
  },
  deadline: () => null,
  view: (s, me): ConnectFourView => ({ me, board: s.board, turn: s.turn, line: s.line, last: s.last }),
  drop: (s, seat) => forfeit(s, seat, 'abandoned'),
};
