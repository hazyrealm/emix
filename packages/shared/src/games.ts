/**
 * Emix Games: the catalogue and the wire types shared by the server (which
 * owns every rule and all hidden state) and the client (which only draws
 * views). A client never receives information a rule says it may not see yet:
 * each game's view is built per viewer on the server.
 */

export const GAME_IDS = [
  'tictactoe', 'connect4', 'rps',
  'chess', 'checkers', 'battleship', 'memory',
  'wordrace', 'hangman', 'wordduel',
  'trivia', 'drawing',
] as const;
export type GameId = (typeof GAME_IDS)[number];

export const GAME_CATEGORIES = ['classic', 'strategy', 'word', 'party'] as const;
export type GameCategory = (typeof GAME_CATEGORIES)[number];

export interface GameMeta {
  id: GameId;
  category: GameCategory;
  minPlayers: number;
  maxPlayers: number;
  /** Rough length of one match, in minutes, shown on the card. */
  minutes: number;
}

export const GAMES: Record<GameId, GameMeta> = {
  tictactoe: { id: 'tictactoe', category: 'classic', minPlayers: 2, maxPlayers: 2, minutes: 1 },
  connect4: { id: 'connect4', category: 'classic', minPlayers: 2, maxPlayers: 2, minutes: 5 },
  rps: { id: 'rps', category: 'classic', minPlayers: 2, maxPlayers: 2, minutes: 1 },
  chess: { id: 'chess', category: 'strategy', minPlayers: 2, maxPlayers: 2, minutes: 20 },
  checkers: { id: 'checkers', category: 'strategy', minPlayers: 2, maxPlayers: 2, minutes: 15 },
  battleship: { id: 'battleship', category: 'strategy', minPlayers: 2, maxPlayers: 2, minutes: 10 },
  memory: { id: 'memory', category: 'classic', minPlayers: 2, maxPlayers: 2, minutes: 5 },
  wordrace: { id: 'wordrace', category: 'word', minPlayers: 2, maxPlayers: 2, minutes: 3 },
  hangman: { id: 'hangman', category: 'word', minPlayers: 2, maxPlayers: 2, minutes: 3 },
  wordduel: { id: 'wordduel', category: 'word', minPlayers: 2, maxPlayers: 2, minutes: 6 },
  trivia: { id: 'trivia', category: 'party', minPlayers: 2, maxPlayers: 8, minutes: 5 },
  drawing: { id: 'drawing', category: 'party', minPlayers: 2, maxPlayers: 8, minutes: 10 },
};

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value);
}

// ── Options (validated on the server; the defaults are what a lobby starts with) ──

export const RPS_BEST_OF = [3, 5] as const;
export const CHESS_CLOCKS = ['none', '3+2', '5+0', '10+0', '15+10'] as const;
export type ChessClock = (typeof CHESS_CLOCKS)[number];
export const MEMORY_SIZES = [16, 36] as const;
export const WORDRACE_TIMERS = [0, 120, 300] as const;
export const TRIVIA_CATEGORIES = ['mixed', 'science', 'geography', 'history', 'nature', 'arts', 'sports'] as const;
export type TriviaCategory = (typeof TRIVIA_CATEGORIES)[number];
export const TRIVIA_LENGTHS = [5, 10, 15] as const;
export const DRAWING_ROUNDS = [1, 2, 3] as const;
export const DRAWING_TIMES = [60, 80, 100] as const;

export interface GameOptions {
  bestOf?: (typeof RPS_BEST_OF)[number];
  clock?: ChessClock;
  size?: (typeof MEMORY_SIZES)[number];
  timer?: (typeof WORDRACE_TIMERS)[number];
  category?: TriviaCategory;
  questions?: (typeof TRIVIA_LENGTHS)[number];
  rounds?: (typeof DRAWING_ROUNDS)[number];
  drawTime?: (typeof DRAWING_TIMES)[number];
}

export const DEFAULT_GAME_OPTIONS: Record<GameId, GameOptions> = {
  tictactoe: {}, connect4: {}, rps: { bestOf: 3 },
  chess: { clock: '10+0' }, checkers: {}, battleship: {}, memory: { size: 16 },
  wordrace: { timer: 0 }, hangman: {}, wordduel: {},
  trivia: { category: 'mixed', questions: 10 }, drawing: { rounds: 1, drawTime: 80 },
};

/** The valid part of `raw` for `game`, every field filled from the defaults. */
export function normalizeGameOptions(game: GameId, raw: unknown): GameOptions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T>(list: readonly T[], v: unknown, d: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : d);
  const d = DEFAULT_GAME_OPTIONS[game];
  switch (game) {
    case 'rps': return { bestOf: pick(RPS_BEST_OF, r.bestOf, d.bestOf!) };
    case 'chess': return { clock: pick(CHESS_CLOCKS, r.clock, d.clock!) };
    case 'memory': return { size: pick(MEMORY_SIZES, r.size, d.size!) };
    case 'wordrace': return { timer: pick(WORDRACE_TIMERS, r.timer, d.timer!) };
    case 'trivia': return { category: pick(TRIVIA_CATEGORIES, r.category, d.category!), questions: pick(TRIVIA_LENGTHS, r.questions, d.questions!) };
    case 'drawing': return { rounds: pick(DRAWING_ROUNDS, r.rounds, d.rounds!), drawTime: pick(DRAWING_TIMES, r.drawTime, d.drawTime!) };
    default: return {};
  }
}

// ── Sessions (a lobby, then matches in it) ─────────────────────────────────

/**
 * Where a session was started. `voice` sessions belong to a call room and can
 * invite anyone in it; `dm` and `direct` sessions invite friends or people
 * who share a conversation.
 */
export type GameContext =
  | { kind: 'direct' }
  | { kind: 'dm'; dmChannelId: string }
  | { kind: 'voice'; roomId: string };

export type GameSessionStatus = 'lobby' | 'playing' | 'finished' | 'closed';

export interface GameResult {
  winners: string[];
  draw: boolean;
  /** Why the match ended, for the results screen. */
  reason: 'normal' | 'resigned' | 'timeout' | 'abandoned' | 'agreed' | 'stalemate' | 'repetition' | 'fifty' | 'material' | 'flag';
}

export interface GameSessionView {
  id: string;
  gameId: GameId;
  hostId: string;
  context: GameContext;
  status: GameSessionStatus;
  /** Everyone who has joined, in join order. */
  players: string[];
  /** Seat order of the current (or last) match: index = seat. */
  seats: string[];
  /** Invited and not yet answered. */
  invited: string[];
  options: GameOptions;
  /** Bumped on every change; a move names the version it was made against. */
  seq: number;
  /** Game-specific view for this viewer (null in the lobby). */
  view: unknown;
  result: GameResult | null;
  /** Match wins per player in this session, and drawn matches. */
  series: Record<string, number>;
  draws: number;
  /** Players who asked for a rematch after the last match. */
  rematch: string[];
  /** Players currently disconnected (their seat is kept for a while). */
  away: string[];
  /** When the current timer (turn, question, round) runs out, if any. */
  deadline: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface GameInvite {
  sessionId: string;
  gameId: GameId;
  fromUserId: string;
  context: GameContext;
  createdAt: number;
}

// ── Per-game views ─────────────────────────────────────────────────────────

/** Seat index of the viewer, or -1 for someone who only watches the lobby. */
export interface SeatView { me: number }

export interface TicTacToeView extends SeatView { board: (0 | 1 | null)[]; turn: 0 | 1; line: number[] | null }
export interface ConnectFourView extends SeatView { board: (0 | 1 | null)[][]; turn: 0 | 1; line: [number, number][] | null; last: [number, number] | null }

export type RpsChoice = 'rock' | 'paper' | 'scissors';
export interface RpsView extends SeatView {
  bestOf: number;
  round: number;
  wins: [number, number];
  /** My choice this round, if made. The opponent's is only `opponentChose`. */
  mine: RpsChoice | null;
  opponentChose: boolean;
  history: { choices: [RpsChoice | null, RpsChoice | null]; winner: 0 | 1 | null }[];
}

export interface ChessView extends SeatView {
  fen: string;
  turn: 'w' | 'b';
  /** Seat 0 plays white in even matches; the colour for each seat. */
  colors: ['w' | 'b', 'w' | 'b'];
  legal: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }[];
  check: boolean;
  last: { from: string; to: string } | null;
  san: string[];
  /** Remaining ms per seat, or null without a clock. */
  clocks: [number, number] | null;
  clockRunningSince: number | null;
  drawOffer: 0 | 1 | null;
}

/** Checkers: 8×8 board, row 0 at the top; seat 0 moves up (toward row 0). */
export type CheckersPiece = { seat: 0 | 1; king: boolean } | null;
export interface CheckersView extends SeatView {
  board: CheckersPiece[][];
  turn: 0 | 1;
  /** Legal moves for the viewer on their turn, each a path of [row, col]. */
  legal: [number, number][][];
  last: [number, number][] | null;
  quietPlies: number;
  drawOffer: 0 | 1 | null;
}

export const BATTLESHIP_FLEET = [5, 4, 3, 3, 2] as const;
export interface BattleshipShip { x: number; y: number; len: number; dir: 'h' | 'v' }
export type BattleshipShot = { x: number; y: number; hit: boolean };
export interface BattleshipView extends SeatView {
  phase: 'placement' | 'battle' | 'over';
  turn: 0 | 1;
  placed: [boolean, boolean];
  /** My fleet (null until placed). */
  myShips: BattleshipShip[] | null;
  /** Shots each seat has taken at the other. */
  shots: [BattleshipShot[], BattleshipShot[]];
  /** Opponent ships I have sunk (all of them once the match is over). */
  sunk: [BattleshipShip[], BattleshipShip[]];
}

export interface MemoryView extends SeatView {
  size: number;
  /** Symbol id of each card that is face up or matched, else null. */
  faces: (number | null)[];
  /** Seat that matched each card, else null. */
  owner: (0 | 1 | null)[];
  turn: 0 | 1;
  scores: [number, number];
  /** Two unmatched cards stay visible until this time, then the turn passes. */
  revealUntil: number | null;
}

export type LetterMark = 'correct' | 'present' | 'absent';
export interface WordGuess { word: string; marks: LetterMark[] }
export interface WordRaceView extends SeatView {
  /** My guesses with their marks. */
  guesses: WordGuess[];
  /** How many guesses each seat has made, and whether they solved it. */
  counts: [number, number];
  solved: [boolean, boolean];
  maxGuesses: number;
  /** Revealed once the match is over, with everyone's guesses. */
  answer: string | null;
  all: [WordGuess[], WordGuess[]] | null;
}

export interface HangmanView extends SeatView {
  setter: 0 | 1;
  phase: 'choose' | 'guess' | 'over';
  /** The word with unguessed letters as null; the setter sees all of it. */
  pattern: (string | null)[];
  length: number;
  wrong: string[];
  guessed: string[];
  maxWrong: number;
  /** The full word, for the setter during play and for everyone after. */
  word: string | null;
}

export interface WordDuelView extends SeatView {
  turn: 0 | 1;
  /** The letter the next word must start with. */
  letter: string;
  words: { seat: 0 | 1; word: string; points: number }[];
  scores: [number, number];
  turnsLeft: [number, number];
  /** My last rejected word and why (only shown to me). */
  rejected: { word: string; reason: 'not_a_word' | 'wrong_letter' | 'used' | 'too_short' } | null;
}

export interface TriviaView extends SeatView {
  index: number;
  total: number;
  phase: 'question' | 'reveal' | 'over';
  category: Exclude<TriviaCategory, 'mixed'>;
  question: string;
  choices: string[];
  /** My answer this question. */
  mine: number | null;
  answered: string[];
  /** Revealed after the question closes. */
  correct: number | null;
  /** Points each player earned on the last revealed question. */
  gained: Record<string, number>;
  scores: Record<string, number>;
}

export interface DrawingView extends SeatView {
  round: number;
  rounds: number;
  drawer: string;
  phase: 'choose' | 'draw' | 'reveal' | 'over';
  /** The drawer's three choices while choosing (drawer only). */
  choices: string[] | null;
  /** The word for the drawer; the hint (letters or _) for everyone else. */
  word: string | null;
  hint: string;
  guessed: string[];
  scores: Record<string, number>;
  /** Recent chat lines: wrong guesses are shown; correct ones say who got it. */
  feed: { userId: string; text: string | null; correct: boolean }[];
  /** Mine only: my last guess was one letter off. */
  close: boolean;
  /** The word just finished (during reveal). */
  revealed: string | null;
}

/** A drawing stroke in canvas units (0 to 1000 on both axes). */
export interface DrawingStroke {
  color: string;
  size: number;
  points: [number, number][];
  erase?: boolean;
  /** Pen-down number: chunks of one stroke share it, so undo removes the whole stroke. */
  g?: number;
}
/** A change to the shared canvas: a stroke, or the drawer clearing or undoing. */
export type DrawingCanvasOp = { kind: 'stroke'; stroke: DrawingStroke } | { kind: 'clear' } | { kind: 'undo' };
export const DRAWING_COLORS = ['#111111', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#a16207', '#6b7280'] as const;
export const DRAWING_SIZES = [4, 8, 16, 32] as const;

// ── Daily word (solo, one puzzle a day for everyone) ───────────────────────

export const DAILY_WORD_LENGTH = 5;
export const DAILY_WORD_GUESSES = 6;

export interface DailyWordState {
  /** Puzzle number (days since 2026-01-01, UTC). */
  number: number;
  day: string;
  guesses: WordGuess[];
  status: 'playing' | 'won' | 'lost';
  /** Revealed once the puzzle is finished. */
  answer: string | null;
  /** The next puzzle starts at this time (00:00 UTC). */
  nextAt: number;
  stats: DailyWordStats;
}

export interface DailyWordStats {
  played: number;
  won: number;
  currentStreak: number;
  bestStreak: number;
  /** Wins by number of guesses (index 0 = solved in one). */
  distribution: number[];
}

// ── Statistics ────────────────────────────────────────────────────────────

export interface GameStats {
  visible: boolean;
  totals: { played: number; wins: number; losses: number; draws: number };
  byGame: Partial<Record<GameId, { played: number; wins: number; losses: number; draws: number }>>;
  favorite: GameId | null;
  recent: { gameId: GameId; outcome: 'win' | 'loss' | 'draw'; opponents: string[]; finishedAt: number }[];
  daily: DailyWordStats;
}

// ── Client → server moves (shapes only; the server validates everything) ──

export type GameMove =
  | { type: 'place'; index: number }                       // tictactoe
  | { type: 'drop'; column: number }                       // connect4
  | { type: 'choose'; choice: RpsChoice }                  // rps
  | { type: 'move'; from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' } // chess
  | { type: 'path'; path: [number, number][] }             // checkers
  | { type: 'fleet'; ships: BattleshipShip[] }             // battleship placement
  | { type: 'fire'; x: number; y: number }                 // battleship
  | { type: 'flip'; index: number }                        // memory
  | { type: 'guess'; word: string }                        // wordrace, drawing
  | { type: 'set_word'; word: string | null }              // hangman setter (null = random)
  | { type: 'letter'; letter: string }                     // hangman
  | { type: 'solve'; word: string }                        // hangman
  | { type: 'word'; word: string }                         // wordduel
  | { type: 'answer'; index: number; choice: number }      // trivia
  | { type: 'pick'; index: number }                        // drawing word choice
  | { type: 'resign' }
  | { type: 'offer_draw' }
  | { type: 'answer_draw'; accept: boolean };

export const GAME_INVITE_TTL_MS = 10 * 60_000;
