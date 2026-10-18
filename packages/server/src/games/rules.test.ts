import { describe, it, expect } from 'vitest';
import type { GameMove } from '@backspace/shared/src/games.js';
import { RULES } from './registry.js';
import type { BaseState, MoveOutcome, RuleContext } from './types.js';
import { legalMoves } from './rules/checkers.js';
import { randomFleet, validFleet } from './rules/battleship.js';
import { markGuess, isWord, fiveLetterAnswers, hangmanWords } from './words.js';
import { DRAWING_WORDS } from './drawingWords.js';
import { TRIVIA } from './triviaBank.js';

const P = ['alice', 'bob'];
const t = 1_000_000;
const ctx = (now = t): RuleContext => ({ now, rng: seeded(42) });
function seeded(seed: number) {
  let a = seed;
  return () => { a = (a * 16807) % 2147483647; return (a - 1) / 2147483646; };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
function play(game: keyof typeof RULES, state: Any, seat: number, move: GameMove, now = t): Any {
  const out: MoveOutcome<BaseState> = RULES[game].move(state, seat, move, ctx(now));
  if ('error' in out) throw new Error(out.error);
  return out.state;
}
function refuse(game: keyof typeof RULES, state: Any, seat: number, move: GameMove): string {
  const out = RULES[game].move(state, seat, move, ctx());
  return 'error' in out ? out.error : 'accepted';
}

describe('tic-tac-toe', () => {
  it('detects a row, refuses occupied cells and moves out of turn', () => {
    let s = RULES.tictactoe.start(P, {}, ctx(), 0);
    s = play('tictactoe', s, 0, { type: 'place', index: 0 });
    expect(refuse('tictactoe', s, 0, { type: 'place', index: 1 })).toBe('game_not_your_turn');
    expect(refuse('tictactoe', s, 1, { type: 'place', index: 0 })).toBe('game_illegal_move');
    s = play('tictactoe', s, 1, { type: 'place', index: 3 });
    s = play('tictactoe', s, 0, { type: 'place', index: 1 });
    s = play('tictactoe', s, 1, { type: 'place', index: 4 });
    s = play('tictactoe', s, 0, { type: 'place', index: 2 });
    expect(s.result).toEqual({ winners: ['alice'], draw: false, reason: 'normal' });
  });

  it('a full board without a line is a draw, and the second match is started by the other player', () => {
    let s = RULES.tictactoe.start(P, {}, ctx(), 0);
    for (const [seat, i] of [[0, 0], [1, 1], [0, 2], [1, 4], [0, 3], [1, 5], [0, 7], [1, 6], [0, 8]] as const) s = play('tictactoe', s, seat, { type: 'place', index: i });
    expect(s.result?.draw).toBe(true);
    expect(RULES.tictactoe.start(P, {}, ctx(), 1).turn).toBe(1);
  });
});

describe('connect four', () => {
  it('finds a vertical four and refuses a full column', () => {
    let s = RULES.connect4.start(P, {}, ctx(), 0);
    for (let i = 0; i < 3; i++) { s = play('connect4', s, 0, { type: 'drop', column: 3 }); s = play('connect4', s, 1, { type: 'drop', column: 4 }); }
    s = play('connect4', s, 0, { type: 'drop', column: 3 });
    expect(s.result?.winners).toEqual(['alice']);
    let f = RULES.connect4.start(P, {}, ctx(), 0);
    for (let i = 0; i < 6; i++) f = play('connect4', f, i % 2, { type: 'drop', column: 0 });
    expect(refuse('connect4', f, 0, { type: 'drop', column: 0 })).toBe('game_illegal_move');
  });

  it('finds a diagonal four', () => {
    let s = RULES.connect4.start(P, {}, ctx(), 0);
    const moves = [[0, 0], [1, 1], [0, 1], [1, 2], [0, 2], [1, 3], [0, 2], [1, 3], [0, 3], [1, 6], [0, 3]] as const;
    for (const [seat, col] of moves) s = play('connect4', s, seat, { type: 'drop', column: col });
    expect(s.result?.winners).toEqual(['alice']);
  });
});

describe('rock paper scissors', () => {
  it('keeps the opponent’s choice hidden until both have chosen, then scores best of three', () => {
    let s = RULES.rps.start(P, { bestOf: 3 }, ctx(), 0);
    s = play('rps', s, 0, { type: 'choose', choice: 'rock' });
    const bobView = RULES.rps.view(s, 1) as Any;
    expect(bobView.mine).toBeNull();
    expect(bobView.opponentChose).toBe(true);
    expect(JSON.stringify(bobView)).not.toContain('rock');
    expect(refuse('rps', s, 0, { type: 'choose', choice: 'paper' })).toBe('game_wrong_state');
    s = play('rps', s, 1, { type: 'choose', choice: 'scissors' });
    expect(s.wins).toEqual([1, 0]);
    s = play('rps', s, 0, { type: 'choose', choice: 'paper' });
    s = play('rps', s, 1, { type: 'choose', choice: 'rock' });
    expect(s.result?.winners).toEqual(['alice']);
  });

  it('a player who does not choose in time loses the round', () => {
    let s = RULES.rps.start(P, { bestOf: 3 }, ctx(), 0);
    s = play('rps', s, 1, { type: 'choose', choice: 'rock' });
    s = RULES.rps.timeout!(s, ctx(t + 31_000));
    expect(s.wins).toEqual([0, 1]);
  });
});

describe('chess', () => {
  it('plays fool’s mate, and refuses illegal moves and moves out of turn', () => {
    let s = RULES.chess.start(P, { clock: 'none' }, ctx(), 0);
    expect(refuse('chess', s, 0, { type: 'move', from: 'e2', to: 'e5' })).toBe('game_illegal_move');
    expect(refuse('chess', s, 1, { type: 'move', from: 'e7', to: 'e5' })).toBe('game_not_your_turn');
    s = play('chess', s, 0, { type: 'move', from: 'f2', to: 'f3' });
    s = play('chess', s, 1, { type: 'move', from: 'e7', to: 'e5' });
    s = play('chess', s, 0, { type: 'move', from: 'g2', to: 'g4' });
    s = play('chess', s, 1, { type: 'move', from: 'd8', to: 'h4' });
    expect(s.result).toEqual({ winners: ['bob'], draw: false, reason: 'normal' });
  });

  it('supports castling, en passant and promotion through chess.js', () => {
    let s = RULES.chess.start(P, { clock: 'none' }, ctx(), 0);
    const line: [number, string, string][] = [[0, 'e2', 'e4'], [1, 'a7', 'a6'], [0, 'e4', 'e5'], [1, 'd7', 'd5'], [0, 'e5', 'd6'], [1, 'a6', 'a5'], [0, 'g1', 'f3'], [1, 'a5', 'a4'], [0, 'f1', 'e2'], [1, 'a4', 'a3'], [0, 'e1', 'g1']];
    for (const [seat, from, to] of line) s = play('chess', s, seat, { type: 'move', from, to });
    const view = RULES.chess.view(s, 1) as Any;
    expect(view.san).toContain('exd6');
    expect(view.san).toContain('O-O');
    // a3xb2, then b2xa1=Q.
    s = play('chess', s, 1, { type: 'move', from: 'a3', to: 'b2' });
    s = play('chess', s, 0, { type: 'move', from: 'd6', to: 'c7' });
    expect(refuse('chess', s, 1, { type: 'move', from: 'b2', to: 'a1' })).toBe('game_illegal_move');
    s = play('chess', s, 1, { type: 'move', from: 'b2', to: 'a1', promotion: 'q' });
    expect((RULES.chess.view(s, 0) as Any).fen.split(' ')[0]).toContain('q');
  });

  it('a flag fall loses on time, and agreed draws end the game', () => {
    let s = RULES.chess.start(P, { clock: '3+2' }, ctx(), 0);
    expect(RULES.chess.deadline(s)).toBe(t + 180_000);
    s = RULES.chess.timeout!(s, ctx(t + 180_001));
    expect(s.result).toMatchObject({ winners: ['bob'], reason: 'flag' });
    let d = RULES.chess.start(P, { clock: 'none' }, ctx(), 0);
    d = play('chess', d, 0, { type: 'offer_draw' });
    d = play('chess', d, 1, { type: 'answer_draw', accept: true });
    expect(d.result).toMatchObject({ draw: true, reason: 'agreed' });
  });

  it('only shows legal moves to the player whose turn it is', () => {
    const s = RULES.chess.start(P, { clock: 'none' }, ctx(), 0);
    expect((RULES.chess.view(s, 0) as Any).legal.length).toBe(20);
    expect((RULES.chess.view(s, 1) as Any).legal).toEqual([]);
  });
});

describe('checkers', () => {
  it('has 7 opening moves and makes captures compulsory', () => {
    const s = RULES.checkers.start(P, {}, ctx(), 0);
    expect(legalMoves(s.board, 0)).toHaveLength(7);
    const board = Array.from({ length: 8 }, () => Array(8).fill(null)) as Any;
    board[5][2] = { seat: 0, king: false };
    board[4][3] = { seat: 1, king: false };
    board[6][7] = { seat: 0, king: false };
    expect(legalMoves(board, 0)).toEqual([[[5, 2], [3, 4]]]);
  });

  it('chains multiple jumps and crowns a man on the far row', () => {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null)) as Any;
    board[6][1] = { seat: 0, king: false };
    board[5][2] = { seat: 1, king: false };
    board[3][4] = { seat: 1, king: false };
    board[1][4] = { seat: 1, king: false };
    expect(legalMoves(board, 0)).toEqual([[[6, 1], [4, 3], [2, 5], [0, 3]]]);
    let s = { ...RULES.checkers.start(P, {}, ctx(), 0), board };
    s = play('checkers', s, 0, { type: 'path', path: [[6, 1], [4, 3], [2, 5], [0, 3]] });
    expect(s.board[0][3]).toEqual({ seat: 0, king: true });
    expect(s.result?.winners).toEqual(['alice']);
  });

  it('refuses a plain move when a capture exists', () => {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null)) as Any;
    board[5][2] = { seat: 0, king: false };
    board[4][3] = { seat: 1, king: false };
    board[0][1] = { seat: 1, king: false };
    const s = { ...RULES.checkers.start(P, {}, ctx(), 0), board };
    expect(refuse('checkers', s, 0, { type: 'path', path: [[5, 2], [4, 1]] })).toBe('game_illegal_move');
  });
});

describe('battleship', () => {
  it('accepts only the standard fleet and never shows ships before they sink', () => {
    expect(validFleet([{ x: 0, y: 0, len: 5, dir: 'h' }])).toBeNull();
    expect(validFleet([{ x: 0, y: 0, len: 5, dir: 'h' }, { x: 0, y: 0, len: 4, dir: 'v' }, { x: 0, y: 2, len: 3, dir: 'h' }, { x: 0, y: 3, len: 3, dir: 'h' }, { x: 0, y: 4, len: 2, dir: 'h' }])).toBeNull();
    const fleetA = randomFleet(seeded(1));
    const fleetB = randomFleet(seeded(2));
    expect(validFleet(fleetA)).not.toBeNull();
    let s = RULES.battleship.start(P, {}, ctx(), 0);
    s = play('battleship', s, 0, { type: 'fleet', ships: fleetA });
    expect((RULES.battleship.view(s, 1) as Any).myShips).toBeNull();
    expect(JSON.stringify(RULES.battleship.view(s, 1))).not.toContain(JSON.stringify(fleetA[0]));
    s = play('battleship', s, 1, { type: 'fleet', ships: fleetB });
    expect(s.phase).toBe('battle');
    expect(refuse('battleship', s, 1, { type: 'fire', x: 0, y: 0 })).toBe('game_not_your_turn');
  });

  it('wins when every enemy cell is hit', () => {
    let s = RULES.battleship.start(P, {}, ctx(), 0);
    const fleetB = randomFleet(seeded(5));
    s = play('battleship', s, 0, { type: 'fleet', ships: randomFleet(seeded(4)) });
    s = play('battleship', s, 1, { type: 'fleet', ships: fleetB });
    const targets = fleetB.flatMap((ship) => Array.from({ length: ship.len }, (_, i) => (ship.dir === 'h' ? [ship.x + i, ship.y] : [ship.x, ship.y + i])));
    let bobShot = 0;
    for (const [x, y] of targets) {
      s = play('battleship', s, 0, { type: 'fire', x: x!, y: y! });
      if (s.result) break;
      s = play('battleship', s, 1, { type: 'fire', x: bobShot % 10, y: Math.floor(bobShot / 10) });
      bobShot++;
    }
    expect(s.result?.winners).toEqual(['alice']);
  });

  it('places a random fleet for a player who runs out of placement time', () => {
    let s = RULES.battleship.start(P, {}, ctx(), 0);
    s = RULES.battleship.timeout!(s, ctx(t + 200_000));
    expect(s.phase).toBe('battle');
    expect(validFleet(s.fleets[0])).not.toBeNull();
  });
});

describe('memory', () => {
  it('hides faces until turned, keeps the turn on a match and passes it after a miss', () => {
    let s = RULES.memory.start(P, { size: 16 }, ctx(), 0);
    expect((RULES.memory.view(s, 0) as Any).faces.every((f: unknown) => f === null)).toBe(true);
    const a = 0;
    const b = s.cards.findIndex((c: number, i: number) => i !== a && c === s.cards[a]);
    s = play('memory', s, 0, { type: 'flip', index: a });
    s = play('memory', s, 0, { type: 'flip', index: b });
    expect(s.scores).toEqual([1, 0]);
    expect(s.turn).toBe(0);
    const c = s.cards.findIndex((_: number, i: number) => s.owner[i] === null);
    const d = s.cards.findIndex((x: number, i: number) => s.owner[i] === null && x !== s.cards[c]);
    s = play('memory', s, 0, { type: 'flip', index: c });
    s = play('memory', s, 0, { type: 'flip', index: d });
    expect(refuse('memory', s, 0, { type: 'flip', index: 5 })).toBe('game_wrong_state');
    s = RULES.memory.timeout!(s, ctx(t + 2000));
    expect(s.turn).toBe(1);
    expect((RULES.memory.view(s, 1) as Any).faces.filter((f: unknown) => f !== null)).toHaveLength(2);
  });
});

describe('word games', () => {
  it('marks repeated letters like the familiar word game', () => {
    expect(markGuess('allee', 'apple')).toEqual(['correct', 'present', 'absent', 'absent', 'correct']);
    expect(markGuess('speed', 'abide')).toEqual(['absent', 'absent', 'present', 'absent', 'present']);
  });

  it('has answer lists made only of dictionary words', () => {
    expect(fiveLetterAnswers().length).toBeGreaterThan(400);
    expect(fiveLetterAnswers().every(isWord)).toBe(true);
    expect(hangmanWords().length).toBeGreaterThan(80);
    expect(isWord('zzzzq')).toBe(false);
  });

  it('word race hides the opponent’s guesses and ends when someone solves it', () => {
    let s = RULES.wordrace.start(P, { timer: 0 }, ctx(), 0);
    s = play('wordrace', s, 1, { type: 'guess', word: 'house' === s.answer ? 'mouse' : 'house' });
    const aliceView = RULES.wordrace.view(s, 0) as Any;
    expect(aliceView.counts).toEqual([0, 1]);
    expect(JSON.stringify(aliceView)).not.toContain('"word"');
    expect(aliceView.answer).toBeNull();
    expect(refuse('wordrace', s, 0, { type: 'guess', word: 'qzxvw' })).toBe('game_unknown_word');
    s = play('wordrace', s, 0, { type: 'guess', word: s.answer });
    expect(s.result?.winners).toEqual(['alice']);
    expect((RULES.wordrace.view(s, 1) as Any).answer).toBe(s.answer);
  });

  it('hangman hides the word from the guesser and ends after six misses', () => {
    let s = RULES.hangman.start(P, {}, ctx(), 0);
    expect(refuse('hangman', s, 0, { type: 'set_word', word: 'qwrtzp' })).toBe('game_unknown_word');
    s = play('hangman', s, 0, { type: 'set_word', word: 'rhythm' });
    const guesser = RULES.hangman.view(s, 1) as Any;
    expect(guesser.word).toBeNull();
    expect(guesser.pattern.every((c: unknown) => c === null)).toBe(true);
    for (const l of 'abcdef') s = play('hangman', s, 1, { type: 'letter', letter: l });
    expect(s.result?.winners).toEqual(['alice']);
    expect(RULES.hangman.start(P, {}, ctx(), 1).setter).toBe(1);
  });

  it('word duel chains on the last letter and rejects repeats and non-words without passing the turn', () => {
    let s = RULES.wordduel.start(P, {}, ctx(), 0);
    s = { ...s, letter: 's' };
    s = play('wordduel', s, 0, { type: 'word', word: 'stone' });
    expect(s.letter).toBe('e');
    expect(s.scores[0]).toBe(5);
    s = play('wordduel', s, 1, { type: 'word', word: 'apple' });
    expect(s.rejected[1]).toEqual({ word: 'apple', reason: 'wrong_letter' });
    expect(s.turn).toBe(1);
    s = play('wordduel', s, 1, { type: 'word', word: 'eqzz' });
    expect(s.rejected[1]?.reason).toBe('not_a_word');
    s = play('wordduel', s, 1, { type: 'word', word: 'eagle' });
    expect(s.turn).toBe(0);
    s = play('wordduel', s, 0, { type: 'word', word: 'ear' });
    s = play('wordduel', s, 1, { type: 'word', word: 'rose' });
    s = play('wordduel', s, 0, { type: 'word', word: 'eagle' });
    expect(s.rejected[0]?.reason).toBe('used');
  });
});

describe('party games', () => {
  const four = ['a', 'b', 'c', 'd'];

  it('trivia has four choices per question, hides the answer until the reveal, and scores speed', () => {
    let s = RULES.trivia.start(four, { category: 'science', questions: 5 }, ctx(), 0);
    const v = RULES.trivia.view(s, 0) as Any;
    expect(v.choices).toHaveLength(4);
    expect(v.correct).toBeNull();
    const right = s.questions[0].correct;
    s = play('trivia', s, 0, { type: 'answer', index: 0, choice: right }, t + 1000);
    expect(refuse('trivia', s, 0, { type: 'answer', index: 0, choice: right })).toBe('game_wrong_state');
    s = play('trivia', s, 1, { type: 'answer', index: 0, choice: (right + 1) % 4 }, t + 2000);
    s = play('trivia', s, 2, { type: 'answer', index: 0, choice: right }, t + 15_000);
    s = play('trivia', s, 3, { type: 'answer', index: 0, choice: right }, t + 19_000);
    expect(s.phase).toBe('reveal');
    expect(s.scores.a).toBeGreaterThan(s.scores.c);
    expect(s.scores.b).toBe(0);
  });

  it('every trivia entry has four distinct answers', () => {
    for (const list of Object.values(TRIVIA)) for (const [, ...answers] of list) expect(new Set(answers).size).toBe(4);
  });

  it('sketch & guess hides the word from guessers, scores a right guess and hints letters over time', () => {
    let s = RULES.drawing.start(four, { rounds: 1, drawTime: 80 }, ctx(), 0);
    expect((RULES.drawing.view(s, 1) as Any).choices).toBeNull();
    expect((RULES.drawing.view(s, 0) as Any).choices).toHaveLength(3);
    s = play('drawing', s, 0, { type: 'pick', index: 0 });
    const word = s.word;
    expect((RULES.drawing.view(s, 1) as Any).word).toBeNull();
    expect(JSON.stringify(RULES.drawing.view(s, 1))).not.toContain(`"${word}"`);
    s = play('drawing', s, 1, { type: 'guess', word: 'definitely wrong' });
    expect(s.feed.at(-1)).toMatchObject({ userId: 'b', correct: false });
    s = play('drawing', s, 2, { type: 'guess', word: word.toUpperCase() });
    expect(s.scores.c).toBeGreaterThan(100);
    expect(s.scores.a).toBe(50);
    expect(s.feed.at(-1)).toEqual({ userId: 'c', text: null, correct: true });
    expect(RULES.drawing.deadline(s)).toBe(t + 40_000);
    s = RULES.drawing.timeout!(s, ctx(t + 40_000));
    expect((RULES.drawing.view(s, 1) as Any).hint.replace(/[_ -]/g, '').length).toBe(1);
  });

  it('drawing words are unique and drawable lengths', () => {
    expect(new Set(DRAWING_WORDS).size).toBe(DRAWING_WORDS.length);
    expect(DRAWING_WORDS.every((w) => /^[a-z]+( [a-z]+)?$/.test(w))).toBe(true);
  });
});
