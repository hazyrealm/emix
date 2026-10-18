/**
 * The daily word puzzle: one five-letter word a day, the same for everyone,
 * six guesses. A new puzzle starts at 00:00 UTC. The answer never leaves the
 * server until the player has finished today's puzzle.
 */
import { and, asc, eq } from 'drizzle-orm';
import { DAILY_WORD_GUESSES, DAILY_WORD_LENGTH, type DailyWordState, type DailyWordStats, type WordGuess } from '@backspace/shared/src/games.js';
import { getDb, schema } from '../db/index.js';
import { GameError } from './sessions.js';
import { cleanWord, fiveLetterAnswers, isWord, markGuess } from './words.js';

const EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;

export function puzzleNumber(now: number): number {
  return Math.floor((now - EPOCH) / DAY_MS) + 1;
}

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Puzzle `n`'s answer: the list in a fixed shuffled order, reshuffled each time it is used up. */
export function answerFor(n: number): string {
  const list = fiveLetterAnswers();
  const cycle = Math.floor((n - 1) / list.length);
  const rng = mulberry32(0x5eed + cycle * 7919);
  const order = list.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return list[order[(n - 1) % list.length]!]!;
}

interface Row { day: string; guesses: string; status: string }

function rowsOf(userId: string): Row[] {
  return getDb().select({ day: schema.gameDaily.day, guesses: schema.gameDaily.guesses, status: schema.gameDaily.status })
    .from(schema.gameDaily).where(eq(schema.gameDaily.userId, userId)).orderBy(asc(schema.gameDaily.day)).all();
}

const prevDay = (day: string) => dayKey(Date.parse(`${day}T00:00:00Z`) - DAY_MS);

export function dailyStats(userId: string, now: number): DailyWordStats {
  const rows = rowsOf(userId).filter((r) => r.status !== 'playing');
  const distribution = Array<number>(DAILY_WORD_GUESSES).fill(0);
  let best = 0;
  let run = 0;
  let lastWon: string | null = null;
  for (const r of rows) {
    if (r.status === 'won') {
      const n = (JSON.parse(r.guesses) as string[]).length;
      distribution[Math.min(DAILY_WORD_GUESSES, n) - 1]! += 1;
      run = lastWon && prevDay(r.day) === lastWon ? run + 1 : 1;
      lastWon = r.day;
      best = Math.max(best, run);
    } else {
      run = 0;
      lastWon = null;
    }
  }
  // A streak is current if it reaches today or yesterday (today may be unplayed).
  const today = dayKey(now);
  const current = lastWon && (lastWon === today || lastWon === prevDay(today)) ? run : 0;
  return { played: rows.length, won: rows.filter((r) => r.status === 'won').length, currentStreak: current, bestStreak: best, distribution };
}

export function dailyState(userId: string, now: number): DailyWordState {
  const n = puzzleNumber(now);
  const day = dayKey(now);
  const answer = answerFor(n);
  const row = getDb().select().from(schema.gameDaily)
    .where(and(eq(schema.gameDaily.userId, userId), eq(schema.gameDaily.day, day))).get();
  const words = row ? (JSON.parse(row.guesses) as string[]) : [];
  const guesses: WordGuess[] = words.map((w) => ({ word: w, marks: markGuess(w, answer) }));
  const status = (row?.status ?? 'playing') as DailyWordState['status'];
  return {
    number: n, day, guesses, status, answer: status === 'playing' ? null : answer,
    nextAt: Date.parse(`${day}T00:00:00Z`) + DAY_MS, stats: dailyStats(userId, now),
  };
}

export function dailyGuess(userId: string, raw: unknown, now: number): DailyWordState {
  const word = cleanWord(raw, DAILY_WORD_LENGTH, DAILY_WORD_LENGTH);
  if (!word) throw new GameError(400, 'game_illegal_move');
  if (!isWord(word)) throw new GameError(400, 'game_unknown_word');
  const day = dayKey(now);
  const answer = answerFor(puzzleNumber(now));
  const db = getDb();
  const row = db.select().from(schema.gameDaily).where(and(eq(schema.gameDaily.userId, userId), eq(schema.gameDaily.day, day))).get();
  const words = row ? (JSON.parse(row.guesses) as string[]) : [];
  if ((row && row.status !== 'playing') || words.length >= DAILY_WORD_GUESSES) throw new GameError(400, 'game_wrong_state');
  const next = [...words, word];
  const status = word === answer ? 'won' : next.length >= DAILY_WORD_GUESSES ? 'lost' : 'playing';
  db.insert(schema.gameDaily).values({ userId, day, guesses: JSON.stringify(next), status, updatedAt: now })
    .onConflictDoUpdate({ target: [schema.gameDaily.userId, schema.gameDaily.day], set: { guesses: JSON.stringify(next), status, updatedAt: now } })
    .run();
  return dailyState(userId, now);
}
