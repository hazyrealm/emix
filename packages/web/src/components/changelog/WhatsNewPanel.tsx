import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useChangelogStore, useWhatsNewUnread } from '../../stores/changelogStore';
import { ChangelogList } from './ChangelogList';

/** The What's New settings tab: the full changelog. Opening it marks everything read. */
export function WhatsNewPanel() {
  const { t } = useTranslation(['settings']);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const load = useChangelogStore((s) => s.load);
  const acknowledgeLatest = useChangelogStore((s) => s.acknowledgeLatest);
  const unread = useWhatsNewUnread();

  useEffect(() => { if (userId) void load(userId); }, [userId, load]);
  useEffect(() => { if (unread) acknowledgeLatest(); }, [unread, acknowledgeLatest]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-txt-primary">{t('settings:whatsNew.title')}</h2>
      <p className="text-sm text-txt-tertiary mt-1">{t('settings:whatsNew.subtitle')}</p>
      <div className="mt-2"><ChangelogList /></div>
    </div>
  );
}
