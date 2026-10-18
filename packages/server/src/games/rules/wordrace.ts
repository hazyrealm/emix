import type { WordGuess, WordRaceView } from '@backspace/shared/src/games.js';
import { drawn, forfeit, winFor, type BaseState, type GameRules } from '../types.js';
import { cleanWord, fiveLetterAnswers, isWord, markGuess } from '../words.js';

/**
 * Word Race: both players solve the same hidden five-letter word at once,
 * six guesses each. The first to solve it wins; if nobody does (or the
 * optional timer runs out first) it is a draw. Opponents see only how many
 * guesses the other has made until the match ends.
 */
const MAX = 6;

interface State extends BaseState {
  answer: string;
  guesses: [WordGuess[], WordGuess[]];
  solved: [boolean, boolean];
  endsAt: number | null;
}

export const wordRace: GameRules<State> = {
  start(players, options, ctx) {
    const list = fiveLetterAnswers();
    const timer = options.timer ?? 0;
    return {
      players, result: null, answer: list[Math.floor(ctx.rng() * list.length)]!,
      guesses: [[], []], solved: [false, false], endsAt: timer ? ctx.now + timer * 1000 : null,
    };
  },
  move(state, seat, move) {
    if (move.type === 'resign') return { state: forfeit(state, seat, 'resigned') };
    if (move.type !== 'guess') return { error: 'game_illegal_move' };
    const word = cleanWord(move.word, 5, 5);
    if (!word) return { error: 'game_illegal_move' };
    if (state.solved[seat] || state.guesses[seat]!.length >= MAX) return { error: 'game_wrong_state' };
    if (!isWord(word)) return { error: 'game_unknown_word' };
    const guesses: State['guesses'] = [[...state.guesses[0]], [...state.guesses[1]]];
    guesses[seat]!.push({ word, marks: markGuess(word, state.answer) });
    const solved: State['solved'] = [...state.solved];
    if (word === state.answer) solved[seat] = true;
    let result = null;
    if (solved[seat]) result = winFor(state.players, seat);
    else if (guesses.every((g, i) => g.length >= MAX && !solved[i])) result = drawn();
    return { state: { ...state, guesses, solved, result } };
  },
  deadline: (s) => (s.result ? null : s.endsAt),
  timeout: (s) => ({ ...s, result: drawn('timeout') }),
  view(s, me): WordRaceView {
    const over = s.result !== null;
    return {
      me, guesses: me >= 0 ? s.guesses[me] ?? [] : [], counts: [s.guesses[0].length, s.guesses[1].length],
      solved: s.solved, maxGuesses: MAX, answer: over ? s.answer : null, all: over ? s.guesses : null,
    };
  },
  drop: (s, seat) => forfeit(s, seat, 'abandoned'),
};
