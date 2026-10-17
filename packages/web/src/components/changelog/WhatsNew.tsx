import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  CHANGELOG_SECTIONS,
  unseenReleases,
  type ChangelogItem,
  type ChangelogSection,
} from '@backspace/shared/src/changelog';
import { useChangelogStore } from '../../stores/changelogStore';
import { ChangelogList, ItemList, SectionChip } from './ChangelogList';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useCameraPreviewStore } from '../../stores/cameraPreviewStore';
import { useWelcomeOpenStore } from '../welcome/EmixWelcome';

/** An account this much newer than the latest release gets the welcome, not release notes. */
const NEW_ACCOUNT_GRACE_MS = 24 * 60 * 60 * 1000;

function Dialog({ label, onClose, children, wide = false }: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[350] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={label} className={`relative w-full ${wide ? 'max-w-[640px]' : 'max-w-[460px]'} max-h-[calc(calc(100*var(--app-vh))-2rem)] flex flex-col glass-modal rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden animate-slide-up`}>
        <div aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#ff3ea5] via-[#9333ea] to-[#22a0ff]" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Shows What's New after sign-in when there are releases this account has
 * not acknowledged, combined into one summary. Never during a call, a ring
 * or another dialog: it waits. Any way of closing it acknowledges the
 * newest release on the server, so it is not shown again on any device.
 */
export function WhatsNewController() {
  const { t } = useTranslation(['common']);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const createdAt = useAuthStore((s) => s.user?.createdAt ?? 0);
  const welcomeOpen = useWelcomeOpenStore((s) => s.open);
  const releases = useChangelogStore((s) => s.releases);
  const acknowledged = useChangelogStore((s) => s.acknowledged);
  const viewerOpen = useChangelogStore((s) => s.viewerOpen);
  const load = useChangelogStore((s) => s.load);
  const acknowledgeLatest = useChangelogStore((s) => s.acknowledgeLatest);
  const setViewerOpen = useChangelogStore((s) => s.setViewerOpen);
  const busy = useVoiceStore((s) => s.isLiveKitConnected || !!s.activeDmCall || !!s.incomingCall || !!s.outgoingCall);
  const modalOpen = useUIStore((s) => s.activeModal !== null);
  const previewOpen = useCameraPreviewStore((s) => s.onConfirm !== null);
  const otherDialog = modalOpen || previewOpen || welcomeOpen;
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!userId) return;
    // After the first screen has settled; failure leaves nothing to show.
    const timer = setTimeout(() => { void load(userId).then(() => setReady(true)); }, 1500);
    return () => clearTimeout(timer);
  }, [userId, load]);

  // A brand-new account has the welcome as its introduction: the release it
  // joined after counts as read, so it is not greeted by two dialogs.
  const latestDate = releases[0]?.date;
  const joinedAfterLatest = acknowledged === null && !!latestDate
    && createdAt > Date.parse(`${latestDate}T00:00:00Z`) + NEW_ACCOUNT_GRACE_MS;
  useEffect(() => {
    if (ready && joinedAfterLatest) acknowledgeLatest();
  }, [ready, joinedAfterLatest, acknowledgeLatest]);

  const unseen = useMemo(() => (acknowledged === undefined ? [] : unseenReleases(releases, acknowledged)), [releases, acknowledged]);
  const merged = useMemo(() => {
    const out: Partial<Record<ChangelogSection, ChangelogItem[]>> = {};
    for (const r of unseen) for (const section of CHANGELOG_SECTIONS) {
      const items = r.sections[section];
      if (items?.length) out[section] = [...(out[section] ?? []), ...items];
    }
    return out;
  }, [unseen]);

  const showPopup = ready && !dismissed && !joinedAfterLatest && unseen.length > 0 && !busy && !otherDialog && !viewerOpen;

  const dismiss = () => { setDismissed(true); acknowledgeLatest(); };
  const viewAll = () => { dismiss(); setViewerOpen(true); };
  const newest = unseen[0];

  return (
    <>
      {showPopup && newest && (
        <Dialog label={t('common:changelog.title')} onClose={dismiss}>
          <div className="px-5 pt-6 pb-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ff7cc4]">{t('common:changelog.eyebrow')}</div>
            <h2 className="text-xl font-bold text-txt-primary mt-1">{t('common:changelog.title')}</h2>
            <p className="text-sm text-txt-secondary mt-0.5">
              {unseen.length === 1
                ? (newest.title ?? t('common:changelog.version', { version: newest.version }))
                : t('common:changelog.combined', { versions: unseen.map((r) => r.version).join(', ') })}
            </p>
          </div>
          <div className="px-5 pb-2 overflow-y-auto scrollbar-thin flex-1">
            {CHANGELOG_SECTIONS.map((section) => {
              const items = merged[section];
              if (!items?.length) return null;
              return (
                <div key={section} className="mb-3">
                  <SectionChip section={section} />
                  <ItemList items={items.slice(0, 8)} />
                  {items.length > 8 && <p className="text-xs text-txt-tertiary mt-1 pl-3.5">{t('common:changelog.more', { count: items.length - 8 })}</p>}
                </div>
              );
            })}
          </div>
          <div className="px-5 py-4 border-t border-white/[0.06] flex justify-end gap-2">
            <button type="button" onClick={viewAll} className="px-4 py-2 rounded-full text-sm text-txt-secondary hover:text-txt-primary hover:bg-white/[0.06]">
              {t('common:changelog.viewFull')}
            </button>
            <button type="button" onClick={dismiss} autoFocus className="px-5 py-2 rounded-full text-sm font-medium text-on-accent emix-gradient-button">
              {t('common:changelog.gotIt')}
            </button>
          </div>
        </Dialog>
      )}
      {viewerOpen && (
        <Dialog label={t('common:changelog.fullTitle')} onClose={() => setViewerOpen(false)} wide>
          <div className="px-5 pt-6 pb-2 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-txt-primary">{t('common:changelog.fullTitle')}</h2>
              <a href="https://getemix.com/changelog/" target="_blank" rel="noopener noreferrer" className="text-xs text-accent-primary hover:underline">{t('common:changelog.siteLink')}</a>
            </div>
            <button type="button" onClick={() => setViewerOpen(false)} aria-label={t('common:actions.close')} className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-txt-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" /></svg>
            </button>
          </div>
          <div className="px-5 pb-4 overflow-y-auto scrollbar-thin flex-1"><ChangelogList /></div>
        </Dialog>
      )}
    </>
  );
}
