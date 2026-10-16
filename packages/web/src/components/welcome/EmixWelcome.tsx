import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { Modal } from '../ui/Modal';
import { create } from 'zustand';

/** Whether the welcome is on screen; What's New waits for it. */
export const useWelcomeOpenStore = create<{ open: boolean }>(() => ({ open: false }));

/**
 * Emix welcome, shown once per account on each device after sign-in. It
 * replaces upstream's admin-only telemetry introduction; it asks for nothing
 * and sends nothing. The "seen" mark is local (no server state), so a new
 * browser or device shows it once more.
 */
const seenKey = (userId: string) => `emix_welcome_seen:${userId}`;

function readSeen(userId: string): boolean {
  try {
    return localStorage.getItem(seenKey(userId)) === '1';
  } catch {
    return true; // storage blocked: never nag on every load
  }
}

const FEATURES = [
  { key: 'voice', icon: 'M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z' },
  { key: 'video', icon: 'M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z' },
  { key: 'screen', icon: 'M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25' },
  { key: 'messages', icon: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z' },
  { key: 'communities', icon: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z' },
] as const;

export function EmixWelcome() {
  const { t } = useTranslation(['welcome', 'common']);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (userId && !readSeen(userId)) setOpen(true);
  }, [userId]);

  useEffect(() => {
    useWelcomeOpenStore.setState({ open });
  }, [open]);

  const close = useCallback(() => {
    if (userId) {
      try { localStorage.setItem(seenKey(userId), '1'); } catch { /* shown again next load */ }
    }
    setOpen(false);
  }, [userId]);

  return (
    <Modal isOpen={open} onClose={close} maxWidth="max-w-2xl" mobileStyle="fullscreen">
      <div className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(var(--accent-primary)/0.28),transparent)] pointer-events-none" aria-hidden="true" />
        <div className="relative px-6 pt-8 pb-6 desktop:px-10 desktop:pt-10 text-center">
          <img src="/icons/icon-192.png" alt="" className="w-20 h-20 mx-auto mb-5 drop-shadow-[0_10px_30px_rgba(147,51,234,0.45)]" draggable={false} />
          <h2 className="text-3xl font-bold tracking-tight text-txt-primary">{t('welcome:title')}</h2>
          <p className="mt-1 text-lg font-semibold bg-gradient-to-r from-[#ff3ea5] via-[#a855f7] to-[#38c8ff] bg-clip-text text-transparent">
            {t('welcome:tagline')}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-txt-secondary max-w-[540px] mx-auto">{t('welcome:intro')}</p>
          <p className="mt-2 text-sm leading-relaxed text-txt-secondary max-w-[540px] mx-auto">{t('welcome:intro2')}</p>

          <ul className="mt-7 grid gap-2.5 desktop:grid-cols-2 text-left">
            {FEATURES.map((f, i) => (
              <li
                key={f.key}
                className={`flex gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 ${i === FEATURES.length - 1 ? 'desktop:col-span-2' : ''}`}
              >
                <span className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center bg-gradient-to-br from-[#ff3ea5]/20 via-[#9333ea]/20 to-[#22a0ff]/20 text-[#d8b4fe]">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-txt-primary">{t(`welcome:features.${f.key}.title`)}</span>
                  <span className="block text-xs text-txt-tertiary mt-0.5">{t(`welcome:features.${f.key}.body`)}</span>
                </span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={close}
            autoFocus
            className="emix-gradient-button mt-7 w-full desktop:w-auto desktop:min-w-[220px] px-8 py-3 text-white font-semibold rounded-xl"
          >
            {t('welcome:getStarted')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
