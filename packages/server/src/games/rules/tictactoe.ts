import type { TicTacToeView } from '@backspace/shared/src/games.js';
import { drawn, forfeit, isInt, winFor, type BaseState, type GameRules } from '../types.js';

interface State extends BaseState {
  board: (0 | 1 | null)[];
  turn: 0 | 1;
  line: number[] | null;
}

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

/** Tic-Tac-Toe. Seat 0 plays X; whoever starts alternates every match. */
export const ticTacToe: GameRules<State> = {
  start: (players, _o, _c, round) => ({ players, result: null, board: Array(9).fill(null), turn: (round % 2) as 0 | 1, line: null }),
  move(state, seat, move) {
    if (move.type === 'resign') return { state: forfeit(state, seat, 'resigned') };
    if (move.type !== 'place' || !isInt(move.index, 0, 8)) return { error: 'game_illegal_move' };
    if (seat !== state.turn) return { error: 'game_not_your_turn' };
    if (state.board[move.index] !== null) return { error: 'game_illegal_move' };
    const board = [...state.board];
    board[move.index] = seat as 0 | 1;
    const line = LINES.find((l) => l.every((i) => board[i] === seat)) ?? null;
    const full = board.every((c) => c !== null);
    return {
      state: {
        ...state, board, line,
        turn: (seat === 0 ? 1 : 0),
        result: line ? winFor(state.players, seat) : full ? drawn() : null,
      },
    };
  },
  deadline: () => null,
  view: (s, me): TicTacToeView => ({ me, board: s.board, turn: s.turn, line: s.line }),
  drop: (s, seat) => forfeit(s, seat, 'abandoned'),
};
