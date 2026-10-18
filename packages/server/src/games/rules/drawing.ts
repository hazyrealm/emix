import { DRAWING_COLORS, DRAWING_SIZES, type DrawingCanvasOp, type DrawingStroke, type DrawingView } from '@backspace/shared/src/games.js';
import { byScore, isInt, shuffle, type BaseState, type GameRules, type RuleContext } from '../types.js';
import { DRAWING_WORDS } from '../drawingWords.js';

/**
 * Sketch & Guess (an Emix original drawing game) for 2 to 8 players. Each
 * round, everyone draws once. The drawer picks one of three words (15 s) and
 * draws it; the others type guesses. A right guess scores 100 plus up to 200
 * for speed and gives the drawer 50; wrong guesses show in the feed, right
 * ones never reveal the word. Two letters are hinted as time runs down.
 * The turn ends when time runs out or everyone has guessed.
 */
export const CHOOSE_MS = 15_000;
export const REVEAL_MS = 5_000;
const MAX_STROKES = 1_500;
const MAX_POINTS = 40_000;
const FEED_MAX = 30;

interface State extends BaseState {
  rounds: number;
  drawTime: number;
  round: number;
  /** Index into `players` of the drawer. */
  drawerIndex: number;
  phase: 'choose' | 'draw' | 'reveal';
  phaseEndsAt: number;
  drawStartedAt: number;
  choices: string[];
  word: string | null;
  guessed: string[];
  scores: Record<string, number>;
  feed: DrawingView['feed'];
  close: string[];
  strokes: DrawingStroke[];
  revealed: string | null;
  usedWords: string[];
  /** Letters hinted so far this turn (0, 1 or 2). */
  hintLevel: number;
}

function chooseTurn(state: State, ctx: RuleContext, drawerIndex: number, round: number): State {
  const fresh = DRAWING_WORDS.filter((w) => !state.usedWords.includes(w));
  const choices = shuffle(fresh.length >= 3 ? fresh : DRAWING_WORDS, ctx.rng).slice(0, 3);
  return {
    ...state, round, drawerIndex, phase: 'choose', phaseEndsAt: ctx.now + CHOOSE_MS, choices, word: null,
    guessed: [], close: [], strokes: [], revealed: null, feed: [],
  };
}

function beginDrawing(state: State, word: string, ctx: RuleContext): State {
  return { ...state, word, phase: 'draw', drawStartedAt: ctx.now, phaseEndsAt: ctx.now + state.drawTime * 1000, usedWords: [...state.usedWords, word], hintLevel: 0 };
}

function endTurn(state: State, ctx: RuleContext): State {
  return { ...state, phase: 'reveal', phaseEndsAt: ctx.now + REVEAL_MS, revealed: state.word };
}

function nextTurn(state: State, ctx: RuleContext): State {
  let drawerIndex = state.drawerIndex + 1;
  let round = state.round;
  if (drawerIndex >= state.players.length) { drawerIndex = 0; round += 1; }
  if (round > state.rounds) return { ...state, result: byScore(state.scores, state.players) };
  return chooseTurn(state, ctx, drawerIndex, round);
}

/** When the next letter is hinted: at half time, then at three quarters. */
function nextHintAt(state: State): number | null {
  if (state.phase !== 'draw' || state.hintLevel >= 2) return null;
  return state.drawStartedAt + state.drawTime * 1000 * (state.hintLevel === 0 ? 0.5 : 0.75);
}

/** The word as underscores with `hintLevel` letters shown, the same for every viewer. */
function hintFor(state: State): string {
  if (!state.word) return '';
  const letters = [...state.word].map((ch, i) => ({ ch, i })).filter(({ ch }) => /[a-z]/.test(ch));
  const order = letters.map(({ i }) => i).sort((a, b) => ((a * 7 + 3) % 11) - ((b * 7 + 3) % 11));
  const shown = new Set(order.slice(0, Math.min(state.hintLevel, Math.max(0, letters.length - 2))));
  return [...state.word].map((ch, i) => (ch === ' ' || ch === '-' ? ch : shown.has(i) ? ch : '_')).join('');
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function oneOff(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function validStroke(raw: unknown): DrawingStroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.color !== 'string' || !(DRAWING_COLORS as readonly string[]).includes(s.color)) return null;
  if (!(DRAWING_SIZES as readonly number[]).includes(s.size as number)) return null;
  if (!Array.isArray(s.points) || s.points.length === 0 || s.points.length > 400) return null;
  const points: [number, number][] = [];
  for (const p of s.points) {
    if (!Array.isArray(p) || !isInt(p[0], 0, 1000) || !isInt(p[1], 0, 1000)) return null;
    points.push([p[0], p[1]]);
  }
  return { color: s.color, size: s.size as number, points, ...(s.erase === true ? { erase: true } : {}), ...(isInt(s.g, 0, 1_000_000) ? { g: s.g } : {}) };
}

type DrawingRules = GameRules<State> & { applyCanvas(state: State, userId: string, op: unknown): State | null };

export const drawing: DrawingRules = {
  start(players, options, ctx) {
    const base: State = {
      players, result: null, rounds: options.rounds ?? 1, drawTime: options.drawTime ?? 80, round: 1, drawerIndex: 0,
      phase: 'choose', phaseEndsAt: 0, drawStartedAt: 0, choices: [], word: null, guessed: [],
      scores: Object.fromEntries(players.map((p) => [p, 0])), feed: [], close: [], strokes: [], revealed: null, usedWords: [], hintLevel: 0,
    };
    return chooseTurn(base, ctx, 0, 1);
  },
  move(state, seat, move, ctx) {
    const player = state.players[seat]!;
    const drawer = state.players[state.drawerIndex]!;
    if (move.type === 'pick') {
      if (player !== drawer || state.phase !== 'choose' || !isInt(move.index, 0, state.choices.length - 1)) return { error: 'game_illegal_move' };
      return { state: beginDrawing(state, state.choices[move.index]!, ctx) };
    }
    if (move.type !== 'guess' || typeof move.word !== 'string') return { error: 'game_illegal_move' };
    const text = normalize(move.word).slice(0, 60);
    if (!text) return { error: 'game_illegal_move' };
    if (state.phase !== 'draw' || player === drawer || state.guessed.includes(player)) return { error: 'game_wrong_state' };
    const word = state.word!;
    if (text === word) {
      const speed = Math.max(0, 1 - (ctx.now - state.drawStartedAt) / (state.drawTime * 1000));
      const scores = { ...state.scores, [player]: (state.scores[player] ?? 0) + 100 + Math.round(200 * speed), [drawer]: (state.scores[drawer] ?? 0) + 50 };
      const guessed = [...state.guessed, player];
      const feed = [...state.feed, { userId: player, text: null, correct: true }].slice(-FEED_MAX);
      const updated = { ...state, scores, guessed, feed, close: state.close.filter((p) => p !== player) };
      const everyone = state.players.filter((p) => p !== drawer).every((p) => guessed.includes(p));
      return { state: everyone ? endTurn(updated, ctx) : updated };
    }
    const close = oneOff(text, word) ? [...new Set([...state.close, player])] : state.close.filter((p) => p !== player);
    return { state: { ...state, close, feed: [...state.feed, { userId: player, text, correct: false }].slice(-FEED_MAX) } };
  },
  deadline(s) {
    if (s.result) return null;
    const hint = nextHintAt(s);
    return hint !== null && hint < s.phaseEndsAt ? hint : s.phaseEndsAt;
  },
  timeout(s, ctx) {
    if (s.phase === 'choose') return beginDrawing(s, s.choices[Math.floor(ctx.rng() * s.choices.length)]!, ctx);
    if (s.phase === 'draw' && ctx.now < s.phaseEndsAt) return { ...s, hintLevel: s.hintLevel + 1 };
    if (s.phase === 'draw') return endTurn(s, ctx);
    return nextTurn(s, ctx);
  },
  view(s, me): DrawingView {
    const player = me >= 0 ? s.players[me]! : null;
    const drawer = s.players[s.drawerIndex]!;
    const isDrawer = player === drawer;
    const over = s.result !== null;
    return {
      me, round: s.round, rounds: s.rounds, drawer, phase: over ? 'over' : s.phase,
      choices: isDrawer && s.phase === 'choose' ? s.choices : null,
      word: (isDrawer || over || s.phase === 'reveal' || (player && s.guessed.includes(player))) ? s.word : null,
      hint: hintFor(s),
      guessed: s.guessed, scores: s.scores, feed: s.feed,
      close: !!player && s.close.includes(player),
      revealed: s.phase === 'reveal' || over ? s.revealed ?? s.word : null,
    };
  },
  drop(s, seat, ctx) {
    const leaving = s.players[seat]!;
    const drawer = s.players[s.drawerIndex]!;
    const players = s.players.filter((p) => p !== leaving);
    // The drawer left: their turn is over, and the next player (now at the
    // same index) draws next.
    if (leaving === drawer) return nextTurn({ ...s, players, drawerIndex: s.drawerIndex - 1 }, ctx);
    const dropped = { ...s, players, drawerIndex: players.indexOf(drawer) };
    const everyone = s.phase === 'draw' && players.filter((p) => p !== drawer).every((p) => s.guessed.includes(p));
    return everyone ? endTurn(dropped, ctx) : dropped;
  },
  /** A canvas change from the drawer during their turn; anything else is ignored. */
  applyCanvas(state, userId, op) {
    if (state.phase !== 'draw' || state.players[state.drawerIndex] !== userId || !op || typeof op !== 'object') return null;
    const o = op as DrawingCanvasOp;
    if (o.kind === 'clear') return { ...state, strokes: [] };
    if (o.kind === 'undo') {
      // Remove the last pen stroke: every trailing chunk with its group number.
      const last = state.strokes[state.strokes.length - 1];
      if (!last) return null;
      let cut = state.strokes.length - 1;
      while (cut > 0 && last.g !== undefined && state.strokes[cut - 1]!.g === last.g) cut -= 1;
      return { ...state, strokes: state.strokes.slice(0, cut) };
    }
    if (o.kind !== 'stroke') return null;
    const stroke = validStroke(o.stroke);
    if (!stroke) return null;
    const total = state.strokes.reduce((n, s) => n + s.points.length, 0);
    if (state.strokes.length >= MAX_STROKES || total + stroke.points.length > MAX_POINTS) return null;
    return { ...state, strokes: [...state.strokes, stroke] };
  },
};
