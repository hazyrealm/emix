import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CHOSEN_USER_STATUSES, type ChosenUserStatus } from '@backspace/shared';
import { selectMyChosenStatus, useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { describeError } from '../../i18n/errors';
import { presenceKey } from '../../i18n/presence';

const DOT: Record<ChosenUserStatus, string> = {
  online: 'bg-status-online',
  idle: 'bg-status-idle',
  dnd: 'bg-status-dnd',
};

const HINT = {
  online: 'spaces:sidebar.userArea.statusMenu.onlineHint',
  idle: 'spaces:sidebar.userArea.statusMenu.idleHint',
  dnd: 'spaces:sidebar.userArea.statusMenu.dndHint',
} as const satisfies Record<ChosenUserStatus, string>;

/**
 * Online, Away or Do Not Disturb. There is deliberately no Invisible or
 * "appear offline": Offline only ever means no connection is open.
 */
export function StatusMenu({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['spaces', 'common']);
  const chosen = useAuthStore(selectMyChosenStatus) ?? 'online';
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      // The anchor toggles the menu itself.
      if (ref.current?.contains(target) || target.closest?.('[data-status-anchor]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const pick = async (status: ChosenUserStatus) => {
    onClose();
    if (status === chosen) return;
    try {
      await useAuthStore.getState().updateProfile({ status });
    } catch (err) {
      useUIStore.getState().addToast(describeError(err), 'warning');
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t('spaces:sidebar.userArea.statusMenu.title')}
      className="absolute bottom-[56px] left-2 z-50 w-[240px] rounded-xl glass-modal border border-white/[0.08] p-1.5 shadow-2xl animate-fade-in"
    >
      <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-txt-tertiary">
        {t('spaces:sidebar.userArea.statusMenu.title')}
      </div>
      {CHOSEN_USER_STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          role="menuitemradio"
          aria-checked={status === chosen}
          onClick={() => void pick(status)}
          className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-interactive-hover"
        >
          <span className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT[status]}`} aria-hidden />
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] text-txt-primary font-medium">{t(presenceKey(status))}</span>
            <span className="block text-[11px] text-txt-tertiary leading-snug">{t(HINT[status])}</span>
          </span>
          {status === chosen && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mt-0.5 text-accent-primary flex-shrink-0" aria-hidden>
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}
