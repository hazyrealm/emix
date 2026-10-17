import type { RingtoneRef } from '@backspace/shared/src/ringtones';
import { api } from '../api/client';
import { AudioManager } from '../audio/AudioManager';
import { useRingtoneStore } from '../stores/ringtoneStore';
import { useSpaceStore } from '../stores/spaceStore';
import { useAuthStore } from '../stores/authStore';

export type RingDirection = 'incoming' | 'outgoing';

/** How long a caller waits for the other person's shared ringtone before falling back to their own. */
const SHARED_LOOKUP_TIMEOUT_MS = 1500;

/**
 * The sound-cache key for a ringtone, loading it first when needed; null for
 * silent, or when an upload cannot be loaded (the caller falls back).
 */
async function soundKey(ref: RingtoneRef, direction: RingDirection): Promise<string | null> {
  switch (ref.kind) {
    case 'silent': return null;
    case 'default': return direction === 'incoming' ? 'call_ringing' : 'call_calling';
    case 'builtin': return `ringtones/${ref.id}`;
    case 'custom': {
      const key = `ringtone:${ref.id}`;
      const ok = await AudioManager.getInstance().cacheSound(key, () => api.ringtones.audio(ref.id));
      return ok ? key : null;
    }
  }
}

/**
 * Plays a ringtone in a loop on this device only: through the speakers'
 * output graph, never into the microphone pipeline, so it can never reach a
 * call. Resolves to the playing source (the caller stops it) or null.
 */
export async function playRingtone(ref: RingtoneRef, direction: RingDirection, volume: number, loop = true): Promise<AudioBufferSourceNode | null> {
  let key = await soundKey(ref, direction);
  // An upload that is gone or unreadable rings the default instead of nothing.
  if (!key && ref.kind === 'custom') key = await soundKey({ kind: 'default' }, direction);
  if (!key) return null;
  return AudioManager.getInstance().playSound(key, { loop, volume: Math.max(0, Math.min(1, volume / 100)) });
}

/** What rings when `callerId` calls me: their per-friend sound, else my incoming ringtone. */
export function incomingRingtoneFor(callerId: string | null | undefined): RingtoneRef {
  const { settings } = useRingtoneStore.getState();
  return (callerId && settings.friends[callerId]?.incoming) || settings.incoming;
}

/** The one other person in a 1:1 conversation, or null for a group. */
function otherMemberOf(dmChannelId: string): string | null {
  const dm = useSpaceStore.getState().dmChannels.find((d) => d.id === dmChannelId);
  const me = useAuthStore.getState().user?.id;
  const others = (dm?.members ?? []).filter((m) => m.id !== me);
  return others.length === 1 ? others[0]!.id : null;
}

async function sharedRingtoneOf(userId: string): Promise<RingtoneRef | null> {
  const lookup = api.ringtones.sharedBy(userId).then(({ ringtone }) => ringtone).catch(() => null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), SHARED_LOOKUP_TIMEOUT_MS));
  const shared = await Promise.race([lookup, timeout]);
  if (!shared) return null;
  return shared.kind === 'builtin' ? { kind: 'builtin', id: shared.id } : { kind: 'custom', id: shared.id };
}

/**
 * What I hear while my call to `dmChannelId` rings out: my outgoing ringtone,
 * the other person's shared one (falling back to mine when they share none),
 * or nothing. A per-friend choice wins over the general one.
 */
export async function outgoingRingtoneFor(dmChannelId: string): Promise<RingtoneRef> {
  const { settings } = useRingtoneStore.getState();
  const callee = otherMemberOf(dmChannelId);
  const plays = (callee && settings.friends[callee]?.callerPlays) || settings.callerPlays;
  if (plays === 'none') return { kind: 'silent' };
  if (plays === 'theirs' && callee) {
    const shared = await sharedRingtoneOf(callee);
    if (shared) return shared;
  }
  return settings.outgoing;
}

// ── Settings preview ───────────────────────────────────────────────────────

let preview: { source: AudioBufferSourceNode; timer: ReturnType<typeof setTimeout> } | null = null;

export function stopRingtonePreview(): void {
  if (!preview) return;
  clearTimeout(preview.timer);
  try { preview.source.stop(); } catch { /* already stopped */ }
  preview = null;
}

/** One preview at a time, at most 8 seconds. */
export async function previewRingtone(ref: RingtoneRef, direction: RingDirection, volume: number): Promise<boolean> {
  stopRingtonePreview();
  await AudioManager.getInstance().resumeContext();
  const source = await playRingtone(ref, direction, volume, true);
  if (!source) return false;
  stopRingtonePreview();
  preview = { source, timer: setTimeout(stopRingtonePreview, 8000) };
  return true;
}
