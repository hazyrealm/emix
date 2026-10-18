/** Game statistics, computed from the server's own match records. */
import { desc, eq, sql } from 'drizzle-orm';
import { GAME_IDS, type GameId, type GameStats } from '@backspace/shared/src/games.js';
import { getDb, schema } from '../db/index.js';
import { dailyStats } from './daily.js';

type Outcome = 'win' | 'loss' | 'draw';
type Tally = { played: number; wins: number; losses: number; draws: number };

const empty = (): Tally => ({ played: 0, wins: 0, losses: 0, draws: 0 });

function add(t: Tally, outcome: Outcome, n: number): void {
  t.played += n;
  if (outcome === 'win') t.wins += n;
  else if (outcome === 'loss') t.losses += n;
  else t.draws += n;
}

export function gameStats(userId: string, now: number): GameStats {
  const db = getDb();
  const user = db.select({ show: schema.users.showGameStats }).from(schema.users).where(eq(schema.users.id, userId)).get();
  const grouped = db.select({ gameId: schema.gameResults.gameId, outcome: schema.gameResults.outcome, n: sql<number>`count(*)` })
    .from(schema.gameResults).where(eq(schema.gameResults.userId, userId))
    .groupBy(schema.gameResults.gameId, schema.gameResults.outcome).all();
  const totals = empty();
  const byGame: GameStats['byGame'] = {};
  for (const g of grouped) {
    if (!(GAME_IDS as readonly string[]).includes(g.gameId)) continue;
    const id = g.gameId as GameId;
    add(totals, g.outcome as Outcome, g.n);
    add((byGame[id] ??= empty()), g.outcome as Outcome, g.n);
  }
  const favorite = (Object.entries(byGame) as [GameId, Tally][]).sort((a, b) => b[1].played - a[1].played)[0]?.[0] ?? null;
  const recent = db.select().from(schema.gameResults).where(eq(schema.gameResults.userId, userId))
    .orderBy(desc(schema.gameResults.finishedAt)).limit(10).all()
    .filter((r) => (GAME_IDS as readonly string[]).includes(r.gameId))
    .map((r) => ({ gameId: r.gameId as GameId, outcome: r.outcome as Outcome, opponents: JSON.parse(r.opponents) as string[], finishedAt: r.finishedAt }));
  return { visible: (user?.show ?? 1) === 1, totals, byGame, favorite, recent, daily: dailyStats(userId, now) };
}
