import { TRIVIA_CATEGORIES, type TriviaCategory, type TriviaView } from '@backspace/shared/src/games.js';
import { byScore, isInt, shuffle, type BaseState, type GameRules, type RuleContext } from '../types.js';
import { TRIVIA } from '../triviaBank.js';

/**
 * Trivia Battle for 2 to 8 players. Everyone answers the same question within
 * 20 seconds: a right answer scores 500 plus up to 500 for speed. The question
 * closes when everyone has answered or time is up, the answer shows for a
 * few seconds, then the next one comes. Highest total wins.
 */
export const QUESTION_MS = 20_000;
export const REVEAL_MS = 4_000;

type Category = Exclude<TriviaCategory, 'mixed'>;
interface Question { category: Category; question: string; choices: string[]; correct: number }

interface State extends BaseState {
  questions: Question[];
  index: number;
  phase: 'question' | 'reveal';
  phaseEndsAt: number;
  askedAt: number;
  answers: Record<string, { choice: number; at: number }>;
  gained: Record<string, number>;
  scores: Record<string, number>;
}

function pickQuestions(category: TriviaCategory, count: number, rng: () => number): Question[] {
  const cats = (category === 'mixed' ? TRIVIA_CATEGORIES.filter((c) => c !== 'mixed') : [category]) as Category[];
  const pool = cats.flatMap((c) => TRIVIA[c].map((e) => ({ c, e })));
  return shuffle(pool, rng).slice(0, count).map(({ c, e }) => {
    const [question, correct, ...wrong] = e;
    const choices = shuffle([correct, ...wrong], rng);
    return { category: c, question, choices, correct: choices.indexOf(correct) };
  });
}

function reveal(state: State, ctx: RuleContext): State {
  const q = state.questions[state.index]!;
  const gained: Record<string, number> = {};
  const scores = { ...state.scores };
  for (const p of state.players) {
    const a = state.answers[p];
    let pts = 0;
    if (a && a.choice === q.correct) {
      const speed = Math.max(0, 1 - (a.at - state.askedAt) / QUESTION_MS);
      pts = 500 + Math.round(500 * speed);
    }
    gained[p] = pts;
    scores[p] = (scores[p] ?? 0) + pts;
  }
  return { ...state, phase: 'reveal', phaseEndsAt: ctx.now + REVEAL_MS, gained, scores };
}

function next(state: State, ctx: RuleContext): State {
  if (state.index + 1 >= state.questions.length) return { ...state, result: byScore(state.scores, state.players) };
  return { ...state, index: state.index + 1, phase: 'question', askedAt: ctx.now, phaseEndsAt: ctx.now + QUESTION_MS, answers: {}, gained: {} };
}

export const trivia: GameRules<State> = {
  start(players, options, ctx) {
    return {
      players, result: null,
      questions: pickQuestions(options.category ?? 'mixed', options.questions ?? 10, ctx.rng),
      index: 0, phase: 'question', askedAt: ctx.now, phaseEndsAt: ctx.now + QUESTION_MS,
      answers: {}, gained: {}, scores: Object.fromEntries(players.map((p) => [p, 0])),
    };
  },
  move(state, seat, move, ctx) {
    if (move.type !== 'answer' || !isInt(move.choice, 0, 3) || !isInt(move.index, 0, 100)) return { error: 'game_illegal_move' };
    if (state.phase !== 'question' || move.index !== state.index) return { error: 'game_wrong_state' };
    const player = state.players[seat]!;
    if (state.answers[player]) return { error: 'game_wrong_state' };
    const answers = { ...state.answers, [player]: { choice: move.choice, at: ctx.now } };
    const updated = { ...state, answers };
    return { state: state.players.every((p) => answers[p]) ? reveal(updated, ctx) : updated };
  },
  deadline: (s) => (s.result ? null : s.phaseEndsAt),
  timeout: (s, ctx) => (s.phase === 'question' ? reveal(s, ctx) : next(s, ctx)),
  view(s, me): TriviaView {
    const q = s.questions[s.index]!;
    const player = me >= 0 ? s.players[me]! : null;
    const over = s.result !== null;
    return {
      me, index: s.index, total: s.questions.length, phase: over ? 'over' : s.phase,
      category: q.category, question: q.question, choices: q.choices,
      mine: player ? s.answers[player]?.choice ?? null : null,
      answered: Object.keys(s.answers),
      correct: s.phase === 'reveal' || over ? q.correct : null,
      gained: s.phase === 'reveal' || over ? s.gained : {},
      scores: s.scores,
    };
  },
  drop(s, seat, ctx) {
    const players = s.players.filter((_, i) => i !== seat);
    const dropped = { ...s, players };
    // If everyone still here has answered, the question can close now.
    if (s.phase === 'question' && players.every((p) => s.answers[p])) return reveal(dropped, ctx);
    return dropped;
  },
};
