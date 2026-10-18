import type { HangmanView } from '@backspace/shared/src/games.js';
import { forfeit, winFor, type BaseState, type GameRules } from '../types.js';
import { cleanWord, hangmanWords, isWord } from '../words.js';

/**
 * Hangman for two. One player sets a word (any dictionary word of 4 to 12
 * letters, or a random one); the other guesses letters, or the whole word.
 * Six wrong guesses and the setter wins. Roles swap every match.
 */
const MAX_WRONG = 6;
export const HANGMAN_CHOOSE_MS = 60_000;

interface State extends BaseState {
  setter: 0 | 1;
  word: string | null;
  guessed: string[];
  wrong: string[];
  chooseEndsAt: number;
}

function solvedBy(word: string, guessed: string[]): boolean {
  return [...word].every((ch) => guessed.includes(ch));
}

export const hangman: GameRules<State> = {
  start: (players, _o, ctx, round) => ({
    players, result: null, setter: (round % 2) as 0 | 1, word: null, guessed: [], wrong: [], chooseEndsAt: ctx.now + HANGMAN_CHOOSE_MS,
  }),
  move(state, seat, move, ctx) {
    if (move.type === 'resign') return { state: forfeit(state, seat, 'resigned') };
    const guesser = state.setter === 0 ? 1 : 0;
    if (move.type === 'set_word') {
      if (seat !== state.setter) return { error: 'game_not_your_turn' };
      if (state.word) return { error: 'game_wrong_state' };
      if (move.word === null) {
        const list = hangmanWords();
        return { state: { ...state, word: list[Math.floor(ctx.rng() * list.length)]! } };
      }
      const word = cleanWord(move.word, 4, 12);
      if (!word) return { error: 'game_illegal_move' };
      if (!isWord(word)) return { error: 'game_unknown_word' };
      return { state: { ...state, word } };
    }
    if (!state.word) return { error: 'game_wrong_state' };
    if (seat !== guesser) return { error: 'game_not_your_turn' };
    if (move.type === 'letter') {
      const letter = cleanWord(move.letter, 1, 1);
      if (!letter || state.guessed.includes(letter)) return { error: 'game_illegal_move' };
      const guessed = [...state.guessed, letter];
      const wrong = state.word.includes(letter) ? state.wrong : [...state.wrong, letter];
      let result = null;
      if (solvedBy(state.word, guessed)) result = winFor(state.players, guesser);
      else if (wrong.length >= MAX_WRONG) result = winFor(state.players, state.setter);
      return { state: { ...state, guessed, wrong, result } };
    }
    if (move.type === 'solve') {
      const word = cleanWord(move.word, 1, 12);
      if (!word) return { error: 'game_illegal_move' };
      if (word === state.word) return { state: { ...state, guessed: [...new Set([...state.guessed, ...word])], result: winFor(state.players, guesser) } };
      const wrong = [...state.wrong, word];
      return { state: { ...state, wrong, result: wrong.length >= MAX_WRONG ? winFor(state.players, state.setter) : null } };
    }
    return { error: 'game_illegal_move' };
  },
  deadline: (s) => (s.word || s.result ? null : s.chooseEndsAt),
  timeout(s, ctx) {
    const list = hangmanWords();
    return { ...s, word: list[Math.floor(ctx.rng() * list.length)]! };
  },
  view(s, me): HangmanView {
    const over = s.result !== null;
    const word = s.word ?? '';
    return {
      me, setter: s.setter, phase: over ? 'over' : s.word ? 'guess' : 'choose',
      pattern: [...word].map((ch) => (over || me === s.setter || s.guessed.includes(ch) ? ch : null)),
      length: word.length, wrong: s.wrong, guessed: s.guessed, maxWrong: MAX_WRONG,
      word: over || me === s.setter ? s.word : null,
    };
  },
  drop: (s, seat) => forfeit(s, seat, 'abandoned'),
};
