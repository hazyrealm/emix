import type { FederationProfileUpdatePayload } from '@backspace/shared';
import type { schema } from '../db/index.js';
import { getOurOrigin } from './federationAuth.js';
import { appendMutationLog, queueOutboxEvent } from './federationOutbox.js';

/**
 * Queue a native user's durable profile (username, display name, images,
 * colours, bio) to every peer. Callers check `isFederationRelayEnabled()` and
 * that the row is native; a newer edit replaces a queued one.
 */
export function queueProfileRelay(user: typeof schema.users.$inferSelect): void {
  const origin = getOurOrigin();
  const profilePayload: FederationProfileUpdatePayload = {
    homeUserId: user.id,
    homeInstance: origin,
    profileUpdatedAt: user.profileUpdatedAt ?? Date.now(),
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar && !user.avatar.startsWith('http')
      ? `${origin}/api/uploads/${user.avatar}`
      : user.avatar,
    banner: user.banner && !user.banner.startsWith('http')
      ? `${origin}/api/uploads/${user.banner}`
      : user.banner,
    accentColor: user.accentColor,
    avatarColor: user.avatarColor,
    bio: user.bio,
  };

  appendMutationLog(
    user.id,
    user.id,
    'profile_update',
    JSON.stringify({ profileUpdate: profilePayload }),
    'profile',
  );
  queueOutboxEvent(
    user.id,    // entityId — user's ID (queue `profile:<id>`: a newer edit replaces a queued one)
    user.id,    // contextId — user-scoped
    'profile_update',
    JSON.stringify({ profileUpdate: profilePayload }),
    undefined,  // targetPeerOrigins — broadcast to active and unreachable peers
    'profile',  // contextType
  );
}
