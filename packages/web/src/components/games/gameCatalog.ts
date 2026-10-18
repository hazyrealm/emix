import type { GameCategory, GameId } from '@backspace/shared/src/games';

export const GAME_NAME_KEYS = {
  tictactoe: 'games:catalog.tictactoe.name',
  connect4: 'games:catalog.connect4.name',
  rps: 'games:catalog.rps.name',
  chess: 'games:catalog.chess.name',
  checkers: 'games:catalog.checkers.name',
  battleship: 'games:catalog.battleship.name',
  memory: 'games:catalog.memory.name',
  wordrace: 'games:catalog.wordrace.name',
  hangman: 'games:catalog.hangman.name',
  wordduel: 'games:catalog.wordduel.name',
  trivia: 'games:catalog.trivia.name',
  drawing: 'games:catalog.drawing.name',
} as const satisfies Record<GameId, string>;

export const GAME_BLURB_KEYS = {
  tictactoe: 'games:catalog.tictactoe.blurb',
  connect4: 'games:catalog.connect4.blurb',
  rps: 'games:catalog.rps.blurb',
  chess: 'games:catalog.chess.blurb',
  checkers: 'games:catalog.checkers.blurb',
  battleship: 'games:catalog.battleship.blurb',
  memory: 'games:catalog.memory.blurb',
  wordrace: 'games:catalog.wordrace.blurb',
  hangman: 'games:catalog.hangman.blurb',
  wordduel: 'games:catalog.wordduel.blurb',
  trivia: 'games:catalog.trivia.blurb',
  drawing: 'games:catalog.drawing.blurb',
} as const satisfies Record<GameId, string>;

export const GAME_RULES_KEYS = {
  tictactoe: 'games:catalog.tictactoe.rules',
  connect4: 'games:catalog.connect4.rules',
  rps: 'games:catalog.rps.rules',
  chess: 'games:catalog.chess.rules',
  checkers: 'games:catalog.checkers.rules',
  battleship: 'games:catalog.battleship.rules',
  memory: 'games:catalog.memory.rules',
  wordrace: 'games:catalog.wordrace.rules',
  hangman: 'games:catalog.hangman.rules',
  wordduel: 'games:catalog.wordduel.rules',
  trivia: 'games:catalog.trivia.rules',
  drawing: 'games:catalog.drawing.rules',
} as const satisfies Record<GameId, string>;

export const CATEGORY_KEYS = {
  classic: 'games:hub.categories.classic',
  strategy: 'games:hub.categories.strategy',
  word: 'games:hub.categories.word',
  party: 'games:hub.categories.party',
} as const satisfies Record<GameCategory, string>;

/** Card colours per game (the art draws on top). Fixed, so cards look alike on every theme. */
export const GAME_TINT: Record<GameId, [string, string]> = {
  tictactoe: ['#5b21b6', '#db2777'],
  connect4: ['#1d4ed8', '#7c3aed'],
  rps: ['#be185d', '#f97316'],
  chess: ['#1f2937', '#6b21a8'],
  checkers: ['#7f1d1d', '#1f2937'],
  battleship: ['#0c4a6e', '#0f766e'],
  memory: ['#6d28d9', '#0891b2'],
  wordrace: ['#065f46', '#0ea5e9'],
  hangman: ['#374151', '#9333ea'],
  wordduel: ['#9a3412', '#be123c'],
  trivia: ['#4338ca', '#c026d3'],
  drawing: ['#0f766e', '#ca8a04'],
};
