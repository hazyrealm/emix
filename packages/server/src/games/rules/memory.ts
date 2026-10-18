import type { MemoryView } from '@backspace/shared/src/games.js';
import { drawn, forfeit, isInt, shuffle, winFor, type BaseState, type GameRules } from '../types.js';

/**
 * Memory Match for two: flip two cards on your turn; a pair scores and you
 * go again, otherwise both stay visible briefly and the turn passes. Card
 * faces stay on the server until turned.
 */
export const REVEAL_MS = 1_400;

interface State extends BaseState {
  cards: number[];
  owner: (0 | 1 | null)[];
  flipped: number[];
  turn: 0 | 1;
  scores: [number, number];
  revealUntil: number | null;
}

function hide(state: State): State {
  return { ...state, flipped: [], revealUntil: null, turn: state.turn === 0 ? 1 : 0 };
}

export const memory: GameRules<State> = {
  start(players, options, ctx, round) {
    const size = options.size ?? 16;
    const pairs = size / 2;
    const cards = shuffle([...Array.from({ length: pairs }, (_, i) => i), ...Array.from({ length: pairs }, (_, i) => i)], ctx.rng);
    return { players, result: null, cards, owner: Array(size).fill(null), flipped: [], turn: (round % 2) as 0 | 1, scores: [0, 0], revealUntil: null };
  },
  move(state, seat, move, ctx) {
    if (move.type === 'resign') return { state: forfeit(state, seat, 'resigned') };
    if (move.type !== 'flip' || !isInt(move.index, 0, state.cards.length - 1)) return { error: 'game_illegal_move' };
    if (seat !== state.turn) return { error: 'game_not_your_turn' };
    if (state.revealUntil !== null) return { error: 'game_wrong_state' };
    if (state.owner[move.index] !== null || state.flipped.includes(move.index)) return { error: 'game_illegal_move' };
    const flipped = [...state.flipped, move.index];
    if (flipped.length < 2) return { state: { ...state, flipped } };
    const [a, b] = flipped as [number, number];
    if (state.cards[a] !== state.cards[b]) return { state: { ...state, flipped, revealUntil: ctx.now + REVEAL_MS } };
    const owner = [...state.owner];
    owner[a] = seat as 0 | 1;
    owner[b] = seat as 0 | 1;
    const scores: [number, number] = [...state.scores];
    scores[seat] += 1;
    const done = owner.every((o) => o !== null);
    return {
      state: {
        ...state, owner, scores, flipped: [],
        result: done ? (scores[0] === scores[1] ? drawn() : winFor(state.players, scores[0] > scores[1] ? 0 : 1)) : null,
      },
    };
  },
  deadline: (s) => (s.result ? null : s.revealUntil),
  timeout: (s) => hide(s),
  view: (s, me): MemoryView => ({
    me, size: s.cards.length,
    faces: s.cards.map((c, i) => (s.owner[i] !== null || s.flipped.includes(i) || s.result ? c : null)),
    owner: s.owner, turn: s.turn, scores: s.scores, revealUntil: s.revealUntil,
  }),
  drop: (s, seat) => forfeit(s, seat, 'abandoned'),
};
