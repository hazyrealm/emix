import type { WordDuelView } from '@backspace/shared/src/games.js';
import { drawn, forfeit, winFor, type BaseState, type GameRules } from '../types.js';
import { START_LETTERS, cleanWord, duelPoints, isWord } from '../words.js';

/**
 * Word Duel (an Emix original): a word chain.
 * - The first word starts with a letter drawn at random; every word after
 *   that starts with the last letter of the previous word.
 * - Words are dictionary words of at least 3 letters, and none may repeat.
 * - Each word scores one point per letter, +1 for each of K, V, W, Y and +3
 *   for each of J, Q, X, Z.
 * - Each player has 8 turns of 30 seconds. A turn that runs out scores
 *   nothing and passes the same letter on. A rejected word costs nothing but
 *   time. After 16 turns the higher score wins; equal scores draw.
 */
export const DUEL_TURNS = 8;
export const DUEL_TURN_MS = 30_000;

interface State extends BaseState {
  turn: 0 | 1;
  letter: string;
  words: { seat: 0 | 1; word: string; points: number }[];
  scores: [number, number];
  turnsLeft: [number, number];
  turnEndsAt: number;
  rejected: [WordDuelView['rejected'], WordDuelView['rejected']];
}

function passTurn(state: State, now: number): State {
  const turnsLeft: [number, number] = [...state.turnsLeft];
  turnsLeft[state.turn] -= 1;
  const next = { ...state, turnsLeft, turn: (state.turn === 0 ? 1 : 0) as 0 | 1, turnEndsAt: now + DUEL_TURN_MS };
  if (turnsLeft[0] <= 0 && turnsLeft[1] <= 0) {
    const [a, b] = state.scores;
    return { ...next, result: a === b ? drawn() : winFor(state.players, a > b ? 0 : 1) };
  }
  return next;
}

export const wordDuel: GameRules<State> = {
  start: (players, _o, ctx, round) => ({
    players, result: null, turn: (round % 2) as 0 | 1,
    letter: START_LETTERS[Math.floor(ctx.rng() * START_LETTERS.length)]!,
    words: [], scores: [0, 0], turnsLeft: [DUEL_TURNS, DUEL_TURNS], turnEndsAt: ctx.now + DUEL_TURN_MS, rejected: [null, null],
  }),
  move(state, seat, move, ctx) {
    if (move.type === 'resign') return { state: forfeit(state, seat, 'resigned') };
    if (move.type !== 'word') return { error: 'game_illegal_move' };
    if (seat !== state.turn) return { error: 'game_not_your_turn' };
    const word = cleanWord(move.word, 1, 20);
    if (!word) return { error: 'game_illegal_move' };
    let reason: NonNullable<WordDuelView['rejected']>['reason'] | null = null;
    if (word.length < 3) reason = 'too_short';
    else if (word[0] !== state.letter) reason = 'wrong_letter';
    else if (state.words.some((w) => w.word === word)) reason = 'used';
    else if (!isWord(word)) reason = 'not_a_word';
    if (reason) {
      const rejected: State['rejected'] = [...state.rejected];
      rejected[seat] = { word, reason };
      return { state: { ...state, rejected } };
    }
    const points = duelPoints(word);
    const scores: [number, number] = [...state.scores];
    scores[seat] += points;
    const rejected: State['rejected'] = [...state.rejected];
    rejected[seat] = null;
    return {
      state: passTurn({ ...state, scores, rejected, words: [...state.words, { seat: seat as 0 | 1, word, points }], letter: word[word.length - 1]! }, ctx.now),
    };
  },
  deadline: (s) => (s.result ? null : s.turnEndsAt),
  timeout: (s, ctx) => passTurn(s, ctx.now),
  view: (s, me): WordDuelView => ({
    me, turn: s.turn, letter: s.letter, words: s.words, scores: s.scores, turnsLeft: s.turnsLeft,
    rejected: me >= 0 ? s.rejected[me] ?? null : null,
  }),
  drop: (s, seat) => forfeit(s, seat, 'abandoned'),
};
