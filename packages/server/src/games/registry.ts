import type { GameId } from '@backspace/shared/src/games.js';
import type { BaseState, GameRules } from './types.js';
import { ticTacToe } from './rules/tictactoe.js';
import { connectFour } from './rules/connect4.js';
import { rps } from './rules/rps.js';
import { chess } from './rules/chess.js';
import { checkers } from './rules/checkers.js';
import { battleship } from './rules/battleship.js';
import { memory } from './rules/memory.js';
import { wordRace } from './rules/wordrace.js';
import { hangman } from './rules/hangman.js';
import { wordDuel } from './rules/wordduel.js';
import { trivia } from './rules/trivia.js';
import { drawing } from './rules/drawing.js';

/** Every game's rules. Adding a game: a rules module here, its id and meta in shared/games.ts, a board on the client. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const RULES: Record<GameId, GameRules<any>> = {
  tictactoe: ticTacToe,
  connect4: connectFour,
  rps,
  chess,
  checkers,
  battleship,
  memory,
  wordrace: wordRace,
  hangman,
  wordduel: wordDuel,
  trivia,
  drawing,
};

export type AnyRules = GameRules<BaseState>;
