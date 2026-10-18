import { useTranslation } from 'react-i18next';
import { GameStatsView, useGameStats } from './GameStatsView';

/** A profile's Games tab: statistics the owner chose to show (private ones say so). */
export function ProfileGames({ userId }: { userId: string }) {
  const { t } = useTranslation(['games']);
  const { stats, hidden, failed } = useGameStats(userId);
  if (failed) return <p className="text-[13px] text-txt-tertiary">{t('games:common.loadFailed')}</p>;
  if (hidden) return <p className="text-[13px] text-txt-tertiary">{t('games:profile.hidden')}</p>;
  if (!stats) return <p className="text-[13px] text-txt-tertiary" role="status">{t('games:common.loading')}</p>;
  return <GameStatsView stats={stats} compact />;
}
