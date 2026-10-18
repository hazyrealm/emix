import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import type { User } from '@backspace/shared';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { Avatar } from '../ui/Avatar';
import { toggleMuteFromControl, handleDisconnectAction } from '../../utils/voiceActions';
import { requestCameraToggle } from '../voice/DeviceControls';

const fetched = create<{ users: Record<string, User | null> }>(() => ({ users: {} }));
const inflight = new Set<string>();

/** A player for display: from what the app already knows, else fetched once. */
export function useGameUser(id: string): User | null {
  const me = useAuthStore((s) => (s.user?.id === id ? s.user : null));
  const known = useSpaceStore((s) => {
    for (const entry of s.userViews.values()) if (entry.user.id === id && entry.isHome) return entry.user;
    return null;
  });
  const cached = fetched((s) => s.users[id]);
  useEffect(() => {
    if (me || known || cached !== undefined || inflight.has(id)) return;
    inflight.add(id);
    api.users.get(id)
      .then((u) => fetched.setState((s) => ({ users: { ...s.users, [id]: u } })))
      .catch(() => fetched.setState((s) => ({ users: { ...s.users, [id]: null } })))
      .finally(() => inflight.delete(id));
  }, [id, me, known, cached]);
  return me ?? known ?? cached ?? null;
}

export function displayNameOf(user: User | null): string {
  return user ? user.displayName || user.username : '…';
}

export function PlayerName({ id }: { id: string }) {
  return <>{displayNameOf(useGameUser(id))}</>;
}

/** Avatar, name and an optional badge (score, "your turn", colour). */
export function PlayerChip({ id, active = false, badge, away = false, size = 28 }: { id: string; active?: boolean; badge?: ReactNode; away?: boolean; size?: number }) {
  const { t } = useTranslation(['games']);
  const user = useGameUser(id);
  return (
    <div className={`flex items-center gap-2 min-w-0 rounded-full pl-1 pr-2.5 py-1 transition-colors ${active ? 'bg-accent-primary/20 ring-1 ring-accent-primary/50' : 'bg-white/[0.05]'}`}>
      <Avatar src={user?.avatar ?? null} name={displayNameOf(user)} size={size} userId={id} user={user ?? undefined} avatarColor={user?.avatarColor} />
      <span className="truncate text-[13px] font-medium text-txt-primary">{displayNameOf(user)}</span>
      {away && <span className="text-[11px] text-accent-amber">{t('games:window.away')}</span>}
      {badge}
    </div>
  );
}

/** Seconds left until `deadline`, updated every quarter second. */
export function useCountdown(deadline: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function Countdown({ deadline, className = '' }: { deadline: number | null; className?: string }) {
  const { t } = useTranslation(['games']);
  const left = useCountdown(deadline);
  if (left === null) return null;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <span className={`tabular-nums font-semibold ${left <= 5 ? 'text-txt-danger' : 'text-txt-secondary'} ${className}`} aria-label={t('games:window.timeLeft', { seconds: left })}>
      {m > 0 ? `${m}:${String(s).padStart(2, '0')}` : t('games:window.secondsShort', { seconds: s })}
    </span>
  );
}

export function GameButton({ children, onClick, kind = 'secondary', disabled = false, className = '', title }: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const styles = {
    primary: 'bg-accent-primary hover:bg-accent-primary-hover text-on-accent',
    secondary: 'bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary',
    danger: 'bg-accent-rose/15 hover:bg-accent-rose/25 text-txt-danger',
    ghost: 'hover:bg-white/[0.08] text-txt-secondary hover:text-txt-primary',
  }[kind];
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} className={`px-3.5 py-2 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function GamepadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7.5 7h9A5.5 5.5 0 0 1 22 12.5v1.1a3.9 3.9 0 0 1-6.9 2.5l-.9-1.1H9.8l-.9 1.1A3.9 3.9 0 0 1 2 13.6v-1.1A5.5 5.5 0 0 1 7.5 7zm-.5 3v1.25H5.75v1.5H7V14h1.5v-1.25h1.25v-1.5H8.5V10H7zm8.75.25a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" />
    </svg>
  );
}

/**
 * Mute, camera and hang up, for when a game covers the call: the call keeps
 * running underneath and stays one tap away.
 */
export function CallMiniControls() {
  const { t } = useTranslation(['voice']);
  const inCall = useVoiceStore((s) => !!s.currentVoiceChannelId || !!s.activeDmCall);
  const isMuted = useVoiceStore((s) => s.isMuted || s.isDeafened);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  if (!inCall) return null;
  const btn = 'w-8 h-8 rounded-full flex items-center justify-center transition-colors';
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={toggleMuteFromControl} title={isMuted ? t('voice:controls.unmuteShortcut') : t('voice:controls.muteShortcut')} aria-pressed={isMuted}
        className={`${btn} ${isMuted ? 'bg-accent-rose/20 text-txt-danger' : 'bg-white/[0.06] text-txt-secondary hover:text-txt-primary'}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          {isMuted && <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
        </svg>
      </button>
      <button type="button" onClick={() => requestCameraToggle()} title={isCameraOn ? t('voice:controls.cameraOff') : t('voice:controls.cameraOn')} aria-pressed={isCameraOn}
        className={`${btn} ${isCameraOn ? 'bg-status-online/20 text-status-online' : 'bg-white/[0.06] text-txt-secondary hover:text-txt-primary'}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17 10.5V7C17 6.45 16.55 6 16 6H4C3.45 6 3 6.45 3 7V17C3 17.55 3.45 18 4 18H16C16.55 18 17 17.55 17 17V13.5L21 17.5V6.5L17 10.5Z" />
          {!isCameraOn && <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
        </svg>
      </button>
      <button type="button" onClick={handleDisconnectAction} title={t('voice:controls.disconnect')} className={`${btn} bg-accent-rose text-on-accent hover:bg-accent-rose/80`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 9C10.4 9 8.85 9.25 7.4 9.72V12.82C7.4 13.22 7.17 13.56 6.84 13.72C5.86 14.21 4.97 14.84 4.18 15.57C4 15.75 3.75 15.85 3.48 15.85C3.2 15.85 2.95 15.74 2.77 15.56L0.29 13.08C0.11 12.9 0 12.65 0 12.38C0 12.1 0.11 11.85 0.29 11.67C3.34 8.78 7.46 7 12 7S20.66 8.78 23.71 11.67C23.89 11.85 24 12.1 24 12.38C24 12.65 23.89 12.9 23.71 13.08L21.23 15.56C21.05 15.74 20.8 15.85 20.52 15.85C20.25 15.85 20 15.75 19.82 15.57C19.03 14.84 18.14 14.21 17.16 13.72C16.83 13.56 16.6 13.22 16.6 12.82V9.72C15.15 9.25 13.6 9 12 9Z" />
        </svg>
      </button>
    </div>
  );
}
