import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { wsSend } from '../hooks/useWebSocket';
import { useVoiceStore } from '../stores/voiceStore';

/** Minutes of no input before this device reports idle; 0 = never. */
export const AUTO_AWAY_CHOICES = [0, 5, 10, 15, 30] as const;
export type AutoAwayMinutes = (typeof AUTO_AWAY_CHOICES)[number];

interface PresencePrefs {
  autoAwayMinutes: AutoAwayMinutes;
  setAutoAwayMinutes: (m: AutoAwayMinutes) => void;
}

/** Per device: an office PC and a phone can idle differently. */
export const usePresencePrefs = create<PresencePrefs>()(persist(
  (set) => ({
    autoAwayMinutes: 10,
    setAutoAwayMinutes: (autoAwayMinutes) => { set({ autoAwayMinutes }); restartIdleTimer(); },
  }),
  { name: 'emix-presence', partialize: (s) => ({ autoAwayMinutes: s.autoAwayMinutes }) },
));

let idle = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastInput = 0;

function report(next: boolean): void {
  if (idle === next) return;
  idle = next;
  wsSend({ type: 'activity_state', idle });
}

function restartIdleTimer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const minutes = usePresencePrefs.getState().autoAwayMinutes;
  if (!minutes) { report(false); return; }
  timer = setTimeout(() => {
    timer = null;
    // Someone in a call is around even without touching the mouse.
    if (useVoiceStore.getState().currentVoiceChannelId) { restartIdleTimer(); return; }
    report(true);
  }, minutes * 60_000);
}

function onInput(): void {
  const now = Date.now();
  // Pointer moves fire constantly; re-arming once a second is plenty.
  if (!idle && now - lastInput < 1000) return;
  lastInput = now;
  report(false);
  restartIdleTimer();
}

/**
 * Automatic Away. This device tells the server when its input has been idle
 * for the chosen time and when it is back. The server shows Away only while
 * every device is idle and the chosen status is Online (ws/presence.ts), so a
 * chosen Away or Do Not Disturb is never touched, and nothing about what the
 * user does is sent beyond that one bit.
 */
export function installAutoAway(): () => void {
  const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'] as const;
  for (const e of events) window.addEventListener(e, onInput, { passive: true, capture: true });
  restartIdleTimer();
  return () => {
    for (const e of events) window.removeEventListener(e, onInput, { capture: true });
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

/** A new home socket starts out active on the server; repeat the idle state if it still holds. */
export function reportActivityStateAfterReconnect(): void {
  if (idle) wsSend({ type: 'activity_state', idle: true });
}
