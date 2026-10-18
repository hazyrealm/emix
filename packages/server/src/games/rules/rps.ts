import type { RpsChoice, RpsView } from '@backspace/shared/src/games.js';
import { drawn, forfeit, winFor, type BaseState, type GameRules, type RuleContext } from '../types.js';

/** Each round closes after this long; a player who has not chosen loses it. */
export const RPS_ROUND_MS = 30_000;
const CHOICES: readonly RpsChoice[] = ['rock', 'paper', 'scissors'];
const BEATS: Record<RpsChoice, RpsChoice> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

interface State extends BaseState {
  bestOf: number;
  /** This round's choices. Never sent to the other player before both chose. */
  choices: [RpsChoice | null, RpsChoice | null];
  wins: [number, number];
  history: { choices: [RpsChoice | null, RpsChoice | null]; winner: 0 | 1 | null }[];
  roundEndsAt: number;
}

function roundWinner(a: RpsChoice | null, b: RpsChoice | null): 0 | 1 | null {
  if (a && !b) return 0;
  if (b && !a) return 1;
  if (!a || !b || a === b) return null;
  return BEATS[a] === b ? 0 : 1;
}

/** Close the round: score it, and end the match once someone has a majority. */
function closeRound(state: State, ctx: RuleContext): State {
  const winner = roundWinner(state.choices[0], state.choices[1]);
  const wins: [number, number] = [...state.wins];
  if (winner !== null) wins[winner] += 1;
  const history = [...state.history, { choices: state.choices, winner }];
  const need = Math.ceil(state.bestOf / 2);
  let result = state.result;
  if (wins[0] >= need) result = winFor(state.players, 0);
  else if (wins[1] >= need) result = winFor(state.players, 1);
  // Endless ties (or both players idle) cannot keep a match open forever.
  else if (history.length >= state.bestOf * 3) result = wins[0] === wins[1] ? drawn() : winFor(state.players, wins[0] > wins[1] ? 0 : 1);
  return { ...state, choices: [null, null], wins, history, result, roundEndsAt: ctx.now + RPS_ROUND_MS };
}

/** Rock, Paper, Scissors, best of 3 or 5, with hidden simultaneous choices. */
export const rps: GameRules<State> = {
  start: (players, options, ctx) => ({
    players, result: null, bestOf: options.bestOf ?? 3,
    choices: [null, null], wins: [0, 0], history: [], roundEndsAt: ctx.now + RPS_ROUND_MS,
  }),
  move(state, seat, move, ctx) {
    if (move.type === 'resign') return { state: forfeit(state, seat, 'resigned') };
    if (move.type !== 'choose' || !CHOICES.includes(move.choice)) return { error: 'game_illegal_move' };
    if (state.choices[seat]) return { error: 'game_wrong_state' };
    const choices: [RpsChoice | null, RpsChoice | null] = [...state.choices];
    choices[seat] = move.choice;
    const next = { ...state, choices };
    return { state: choices[0] && choices[1] ? closeRound(next, ctx) : next };
  },
  deadline: (s) => (s.result ? null : s.roundEndsAt),
  timeout: (s, ctx) => closeRound(s, ctx),
  view: (s, me): RpsView => ({
    me, bestOf: s.bestOf, round: s.history.length + 1, wins: s.wins,
    mine: me >= 0 ? s.choices[me] ?? null : null,
    opponentChose: me >= 0 ? s.choices[me === 0 ? 1 : 0] !== null : false,
    history: s.history,
  }),
  drop: (s, seat) => forfeit(s, seat, 'abandoned'),
};
