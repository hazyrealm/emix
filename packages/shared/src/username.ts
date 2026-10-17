/**
 * Username rules shared by registration, the rename endpoint and the Account
 * settings form. Usernames are stored lowercased, so the unique index on
 * `users.username` is case-insensitive in effect.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

/** One successful change per 30 days. */
export const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Names nobody can take: they would read as staff, the system or a mention.
 * Existing accounts keep their name; this applies to new names only.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin', 'administrator', 'root', 'system', 'sysadmin', 'emix', 'emixapp', 'backspace',
  'support', 'help', 'helpdesk', 'moderator', 'mod', 'mods', 'staff', 'official', 'team',
  'security', 'safety', 'trust', 'abuse', 'billing', 'owner', 'everyone', 'here', 'me',
  'null', 'undefined', 'nobody', 'deleted', 'deleted_user', 'unknown', 'api', 'www', 'mail',
  'noreply', 'no_reply', 'info', 'status', 'settings', 'login', 'logout', 'register', 'signup',
  'changelog', 'download', 'theme', 'themes', 'invite', 'invites',
]);

export type UsernameProblem = 'too_short' | 'too_long' | 'characters' | 'reserved';

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Why a (normalized) name cannot be used, or null when it is well formed. Availability is separate. */
export function usernameProblem(name: string): UsernameProblem | null {
  if (name.length < USERNAME_MIN) return 'too_short';
  if (name.length > USERNAME_MAX) return 'too_long';
  if (!USERNAME_PATTERN.test(name)) return 'characters';
  if (RESERVED_USERNAMES.has(name)) return 'reserved';
  return null;
}

/** When the next change is allowed; null = now. */
export function nextUsernameChangeAt(changedAt: number | null | undefined, now = Date.now()): number | null {
  if (!changedAt) return null;
  const next = changedAt + USERNAME_CHANGE_COOLDOWN_MS;
  return next > now ? next : null;
}

export interface UsernameStatus {
  username: string;
  changedAt: number | null;
  /** Epoch ms of the next allowed change, or null when a change is allowed now. */
  nextChangeAt: number | null;
  /** False for accounts whose name belongs to another instance. */
  canChange: boolean;
}

export interface UsernameCheck {
  username: string;
  available: boolean;
  /** Why not: a rule problem, 'taken', or 'current' (it is already yours). */
  reason: UsernameProblem | 'taken' | 'current' | null;
}
