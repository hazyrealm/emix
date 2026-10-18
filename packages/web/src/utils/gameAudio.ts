import type { GameSessionView } from '@backspace/shared/src/games';
import { AudioManager } from '../audio/AudioManager';
import { alertsAllowed, showAlertNotification } from './alerts';
import i18n from '../i18n';
import { GAME_NAME_KEYS } from '../components/games/gameCatalog';

/**
 * Game sound effects. They play through the speaker bus like every other
 * cue (AudioManager.playSound → master output), never into the microphone
 * pipeline, so the other people in a call never hear them through you, and
 * they have their own volume, separate from voice and participant volumes.
 * The invitation chime is an alert: Do Not Disturb silences it.
 */
export type GameSound = 'move' | 'turn' | 'tick' | 'win' | 'lose' | 'end' | 'invite';

/** Each sound at most this often, so rapid updates never stack into noise. */
const MIN_GAP_MS = 120;
const lastPlayed = new Map<GameSound, number>();

async function prefs(): Promise<{ volume: number; muted: boolean }> {
  const { useGameStore } = await import('../stores/gameStore');
  const { volume, muted } = useGameStore.getState();
  return { volume, muted };
}

export async function playGameSound(sound: GameSound): Promise<void> {
  const now = performance.now();
  if (now - (lastPlayed.get(sound) ?? -Infinity) < MIN_GAP_MS) return;
  lastPlayed.set(sound, now);
  if (sound === 'invite' && !alertsAllowed('game_invite')) return;
  const { volume, muted } = await prefs();
  if (muted || volume <= 0) return;
  // Games sit a little under the UI cues; 100 % here is about the message chime.
  await AudioManager.getInstance().playSound(`games/${sound}`, { volume: (volume / 100) * 0.7 });
}

/** Whose turn it is in a view, for the "your turn" cue (null: simultaneous or none). */
function turnSeat(view: unknown): number | null {
  if (!view || typeof view !== 'object') return null;
  const v = view as { turn?: unknown; colors?: ['w' | 'b', 'w' | 'b'] };
  if (v.colors && (v.turn === 'w' || v.turn === 'b')) return v.colors[0] === v.turn ? 0 : 1;
  return typeof v.turn === 'number' ? v.turn : null;
}

/**
 * Cues for a session update: a new invitation, the opponent's move, your
 * turn, and the end of a match (win, loss or draw for you).
 */
export function onSessionChanged(prev: GameSessionView | null, next: GameSessionView, me: string | null): void {
  if (!me) return;
  const invitedNow = next.invited.includes(me) && !(prev?.invited.includes(me));
  if (invitedNow && next.status !== 'closed') {
    void playGameSound('invite');
    if (document.hidden) showAlertNotification('game_invite', i18n.t('games:invite.notificationTitle'), i18n.t('games:invite.notificationBody', { game: i18n.t(GAME_NAME_KEYS[next.gameId]) }));
    return;
  }
  if (!prev || !next.players.includes(me)) return;
  if (prev.status === 'playing' && next.status === 'finished' && next.result) {
    const r = next.result;
    void playGameSound(r.draw ? (r.winners.includes(me) ? 'end' : r.winners.length ? 'lose' : 'end') : r.winners.includes(me) ? 'win' : 'lose');
    return;
  }
  if (next.status !== 'playing' || next.seq === prev.seq) return;
  const seat = (next.view as { me?: number } | null)?.me ?? -1;
  const before = turnSeat(prev.view);
  const after = turnSeat(next.view);
  if (after !== null && after === seat && before !== seat) void playGameSound('turn');
  else if (after !== null && before !== after) void playGameSound('move');
}
