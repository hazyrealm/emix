import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameId, GameStats } from '@backspace/shared/src/games';
import { api } from '../../api/client';
import { useFormatters } from '../../i18n/formatters';
import { GameArt } from './GameArt';
import { GAME_NAME_KEYS } from './gameCatalog';
import { PlayerName } from './gameUi';

const OUTCOME_KEYS = { win: 'games:stats.outcomes.win', loss: 'games:stats.outcomes.loss', draw: 'games:stats.outcomes.draw' } as const;

/** Someone's game statistics (null while loading; hidden ones say so). */
export function useGameStats(userId: string, reloadKey = 0): { stats: GameStats | null; hidden: boolean; failed: boolean } {
  const [state, setState] = useState<{ stats: GameStats | null; hidden: boolean; failed: boolean }>({ stats: null, hidden: false, failed: false });
  useEffect(() => {
    let cancelled = false;
    api.games.stats(userId)
      .then(({ stats }) => { if (!cancelled) setState({ stats, hidden: stats === null, failed: false }); })
      .catch(() => { if (!cancelled) setState({ stats: null, hidden: false, failed: true }); });
    return () => { cancelled = true; };
  }, [userId, reloadKey]);
  return state;
}

export function GameStatsView({ stats, compact = false }: { stats: GameStats; compact?: boolean }) {
  const { t } = useTranslation(['games']);
  const { formatRelativeDay } = useFormatters();
  const { totals } = stats;
  const pct = totals.played ? Math.round((totals.wins / totals.played) * 100) : 0;
  const rows = (Object.entries(stats.byGame) as [GameId, { played: number; wins: number; losses: number; draws: number }][])
    .sort((a, b) => b[1].played - a[1].played);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-5 gap-2 text-center">
        {[
          [totals.played, t('games:stats.played')],
          [totals.wins, t('games:stats.wins')],
          [totals.losses, t('games:stats.losses')],
          [totals.draws, t('games:stats.draws')],
          [`${pct}%`, t('games:stats.winRate')],
        ].map(([n, label]) => (
          <div key={String(label)} className="rounded-lg bg-white/[0.04] py-2">
            <div className="text-[18px] font-bold tabular-nums">{n}</div>
            <div className="text-[11px] text-txt-tertiary">{label}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-txt-secondary">
        {stats.favorite && <span>{t('games:stats.favorite')}: <span className="font-medium text-txt-primary">{t(GAME_NAME_KEYS[stats.favorite])}</span></span>}
        <span>{t('games:stats.dailyStreak')}: <span className="font-medium text-txt-primary tabular-nums">{stats.daily.currentStreak}</span> ({t('games:stats.best')} {stats.daily.bestStreak})</span>
      </div>
      {!compact && rows.length > 0 && (
        <table className="w-full text-[13px]">
          <thead className="text-[11px] uppercase tracking-wider text-txt-tertiary">
            <tr><th className="text-left font-semibold py-1">{t('games:stats.game')}</th><th className="font-semibold">{t('games:stats.played')}</th><th className="font-semibold">{t('games:stats.wins')}</th><th className="font-semibold">{t('games:stats.losses')}</th><th className="font-semibold">{t('games:stats.draws')}</th></tr>
          </thead>
          <tbody>
            {rows.map(([id, r]) => (
              <tr key={id} className="border-t border-white/[0.05]">
                <td className="py-1.5"><span className="flex items-center gap-2"><GameArt id={id} className="w-6 h-6 rounded" />{t(GAME_NAME_KEYS[id])}</span></td>
                <td className="text-center tabular-nums">{r.played}</td><td className="text-center tabular-nums">{r.wins}</td><td className="text-center tabular-nums">{r.losses}</td><td className="text-center tabular-nums">{r.draws}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {stats.recent.length > 0 && (
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-txt-tertiary mb-1.5">{t('games:stats.recent')}</div>
          <ul className="flex flex-col gap-1">
            {stats.recent.slice(0, compact ? 5 : 10).map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px]">
                <GameArt id={r.gameId} className="w-5 h-5 rounded" />
                <span className="font-medium">{t(GAME_NAME_KEYS[r.gameId])}</span>
                <span className={r.outcome === 'win' ? 'text-status-online' : r.outcome === 'loss' ? 'text-txt-danger' : 'text-txt-secondary'}>{t(OUTCOME_KEYS[r.outcome])}</span>
                {r.opponents.length > 0 && <span className="text-txt-tertiary truncate">{t('games:stats.vs')} {r.opponents.map((o, j) => <span key={o}>{j > 0 ? ', ' : ''}<PlayerName id={o} /></span>)}</span>}
                <span className="ml-auto text-[11px] text-txt-tertiary">{formatRelativeDay(r.finishedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {totals.played === 0 && stats.daily.played === 0 && <p className="text-[13px] text-txt-tertiary">{t('games:stats.none')}</p>}
    </div>
  );
}
