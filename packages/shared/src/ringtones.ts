/**
 * Call sounds: which ringtone plays for incoming and outgoing calls, the
 * ringtone a user shares with callers, and per-friend overrides. Everything
 * plays locally on the listener's device; nothing here touches call audio.
 */

export const BUILTIN_RINGTONE_IDS = ['aurora', 'marimba', 'pulse', 'retro', 'bells'] as const;
export type BuiltinRingtoneId = (typeof BUILTIN_RINGTONE_IDS)[number];

export type RingtoneRef =
  | { kind: 'default' }
  | { kind: 'silent' }
  | { kind: 'builtin'; id: BuiltinRingtoneId }
  | { kind: 'custom'; id: string };

/** A ringtone that can be shared: a real sound, never default or silent. */
export type ShareableRingtoneRef = Extract<RingtoneRef, { kind: 'builtin' | 'custom' }>;

/** What the caller hears while a call rings out. */
export type CallerPlays = 'mine' | 'theirs' | 'none';
export const CALLER_PLAYS: readonly CallerPlays[] = ['mine', 'theirs', 'none'];

export interface FriendRingtone {
  /** Played when this person calls me. */
  incoming?: RingtoneRef;
  /** What I hear when I call this person. */
  callerPlays?: CallerPlays;
}

export interface RingtoneSettings {
  incoming: RingtoneRef;
  outgoing: RingtoneRef;
  /** 0–100. */
  incomingVolume: number;
  outgoingVolume: number;
  callerPlays: CallerPlays;
  /** My shared ringtone; private unless `shareEnabled`. */
  shared: ShareableRingtoneRef | null;
  shareEnabled: boolean;
  friends: Record<string, FriendRingtone>;
}

export const DEFAULT_RINGTONE_SETTINGS: RingtoneSettings = {
  incoming: { kind: 'default' },
  outgoing: { kind: 'default' },
  incomingVolume: 80,
  outgoingVolume: 60,
  callerPlays: 'mine',
  shared: null,
  shareEnabled: false,
  friends: {},
};

/** Upload limits. Longer files are cut to RINGTONE_MAX_SECONDS. */
export const RINGTONE_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const RINGTONE_MAX_SECONDS = 30;
export const RINGTONE_MAX_PER_USER = 10;
export const RINGTONE_NAME_MAX = 40;
export const RINGTONE_FRIENDS_MAX = 200;
export const RINGTONE_ID_PATTERN = /^[0-9]{1,20}$/;

export interface RingtoneRecord {
  id: string;
  name: string;
  durationMs: number;
  size: number;
  createdAt: number;
}

/** GET /api/users/:id/shared-ringtone. Null when the person shares nothing with you. */
export interface SharedRingtoneInfo {
  ringtone: { kind: 'builtin'; id: BuiltinRingtoneId } | { kind: 'custom'; id: string; name: string } | null;
}

function isBuiltin(id: unknown): id is BuiltinRingtoneId {
  return typeof id === 'string' && (BUILTIN_RINGTONE_IDS as readonly string[]).includes(id);
}

export function normalizeRingtoneRef(raw: unknown): RingtoneRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { kind?: unknown; id?: unknown };
  switch (r.kind) {
    case 'default': return { kind: 'default' };
    case 'silent': return { kind: 'silent' };
    case 'builtin': return isBuiltin(r.id) ? { kind: 'builtin', id: r.id } : null;
    case 'custom': return typeof r.id === 'string' && RINGTONE_ID_PATTERN.test(r.id) ? { kind: 'custom', id: r.id } : null;
    default: return null;
  }
}

function volume(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : fallback;
}

function callerPlays(raw: unknown): CallerPlays | undefined {
  return typeof raw === 'string' && (CALLER_PLAYS as readonly string[]).includes(raw) ? raw as CallerPlays : undefined;
}

/** Accepts anything; returns valid settings, dropping what does not fit. */
export function normalizeRingtoneSettings(raw: unknown): RingtoneSettings {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  const d = DEFAULT_RINGTONE_SETTINGS;
  if (!value || typeof value !== 'object') return { ...d, friends: {} };
  const s = value as Record<string, unknown>;
  const shared = normalizeRingtoneRef(s.shared);
  const friends: Record<string, FriendRingtone> = {};
  if (s.friends && typeof s.friends === 'object') {
    for (const [userId, entry] of Object.entries(s.friends as Record<string, unknown>).slice(0, RINGTONE_FRIENDS_MAX)) {
      if (!RINGTONE_ID_PATTERN.test(userId) || !entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const out: FriendRingtone = {};
      const incoming = normalizeRingtoneRef(e.incoming);
      if (incoming) out.incoming = incoming;
      const plays = callerPlays(e.callerPlays);
      if (plays) out.callerPlays = plays;
      if (out.incoming || out.callerPlays) friends[userId] = out;
    }
  }
  return {
    incoming: normalizeRingtoneRef(s.incoming) ?? d.incoming,
    outgoing: normalizeRingtoneRef(s.outgoing) ?? d.outgoing,
    incomingVolume: volume(s.incomingVolume, d.incomingVolume),
    outgoingVolume: volume(s.outgoingVolume, d.outgoingVolume),
    callerPlays: callerPlays(s.callerPlays) ?? d.callerPlays,
    shared: shared && (shared.kind === 'builtin' || shared.kind === 'custom') ? shared : null,
    shareEnabled: s.shareEnabled === true,
    friends,
  };
}

/** Every uploaded ringtone the settings point at. */
export function customRingtoneIds(settings: RingtoneSettings): Set<string> {
  const ids = new Set<string>();
  const add = (r: RingtoneRef | null | undefined) => { if (r?.kind === 'custom') ids.add(r.id); };
  add(settings.incoming);
  add(settings.outgoing);
  add(settings.shared);
  for (const f of Object.values(settings.friends)) add(f.incoming);
  return ids;
}

/** The settings with every reference to `id` put back to the default (or removed). */
export function withoutRingtone(settings: RingtoneSettings, id: string): RingtoneSettings {
  const keep = (r: RingtoneRef): RingtoneRef => (r.kind === 'custom' && r.id === id ? { kind: 'default' } : r);
  const friends: Record<string, FriendRingtone> = {};
  for (const [userId, f] of Object.entries(settings.friends)) {
    const next: FriendRingtone = { ...f };
    if (f.incoming?.kind === 'custom' && f.incoming.id === id) delete next.incoming;
    if (next.incoming || next.callerPlays) friends[userId] = next;
  }
  return {
    ...settings,
    incoming: keep(settings.incoming),
    outgoing: keep(settings.outgoing),
    shared: settings.shared?.kind === 'custom' && settings.shared.id === id ? null : settings.shared,
    friends,
  };
}
