import type { FastifyInstance } from 'fastify';
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import {
  USERNAME_CHANGE_COOLDOWN_MS, nextUsernameChangeAt, normalizeUsername, usernameProblem,
  type UsernameCheck, type UsernameProblem, type UsernameStatus,
} from '@backspace/shared/src/username.js';
import { getDb, schema } from '../db/index.js';
import { authenticate, signJwt, verifyPassword } from '../utils/auth.js';
import { sanitizeUser } from '../utils/sanitize.js';
import { sendError } from '../utils/httpErrors.js';
import { connectionManager } from '../ws/handler.js';
import { collectProfileBroadcastTargetIds } from '../utils/userDeletion.js';
import { isFederationRelayEnabled } from '../utils/federationOutbox.js';
import { queueProfileRelay } from '../utils/profileRelay.js';

type UserRow = typeof schema.users.$inferSelect;

const PROBLEM_CODE = {
  too_short: 'username_length_invalid',
  too_long: 'username_length_invalid',
  characters: 'username_characters_invalid',
  reserved: 'username_reserved',
} as const satisfies Record<UsernameProblem, string>;

/**
 * Only native accounts own their name. A replicated or detached row carries
 * a `name@instance` handle that belongs to its home instance.
 */
function canChange(row: UserRow): boolean {
  return !row.homeInstance && row.federationHomeOrphaned !== 1 && row.isDeleted !== 1 && !row.username.includes('@');
}

function statusOf(row: UserRow): UsernameStatus {
  return {
    username: row.username,
    changedAt: row.usernameChangedAt ?? null,
    nextChangeAt: nextUsernameChangeAt(row.usernameChangedAt),
    canChange: canChange(row),
  };
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
}

/**
 * Username changes. The id never changes, and everything (friends, messages,
 * `<@id>` mentions, memberships, roles, settings) refers to the id, so a
 * rename moves nothing else. The unique index on `users.username` decides
 * races, and the 30-day rule is part of the same UPDATE, so two parallel
 * requests cannot both succeed.
 */
export async function usernameRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/users/@me/username', { preHandler: authenticate }, async (request, reply) => {
    const row = getDb().select().from(schema.users).where(eq(schema.users.id, request.userId)).get();
    if (!row) return sendError(reply, 404, 'user_not_found');
    return statusOf(row);
  });

  app.get<{ Querystring: { username?: string } }>('/api/users/@me/username/check', {
    preHandler: authenticate,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: { querystring: { type: 'object', properties: { username: { type: 'string', maxLength: 64 } } } },
  }, async (request) => {
    const name = normalizeUsername(request.query.username ?? '');
    const result = (available: boolean, reason: UsernameCheck['reason']): UsernameCheck => ({ username: name, available, reason });
    const problem = usernameProblem(name);
    if (problem) return result(false, problem);
    const holder = getDb().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, name)).get();
    if (holder?.id === request.userId) return result(false, 'current');
    return holder ? result(false, 'taken') : result(true, null);
  });

  app.post<{ Body: { username: string; password: string } }>('/api/users/@me/username', {
    preHandler: authenticate,
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    schema: { body: { type: 'object', required: ['username', 'password'], additionalProperties: false, properties: {
      username: { type: 'string', maxLength: 64 },
      password: { type: 'string', maxLength: 1024 },
    } } },
  }, async (request, reply) => {
    const db = getDb();
    const row = db.select().from(schema.users).where(eq(schema.users.id, request.userId)).get();
    if (!row) return sendError(reply, 404, 'user_not_found');
    if (!canChange(row)) return sendError(reply, 403, 'username_change_unavailable');

    const name = normalizeUsername(request.body.username);
    const problem = usernameProblem(name);
    if (problem) return sendError(reply, 400, PROBLEM_CODE[problem], { min: 3, max: 32 });
    if (name === row.username) return sendError(reply, 409, 'username_taken');

    // Re-authentication: a stolen session alone cannot rename the account.
    if (!(await verifyPassword(request.body.password, row.passwordHash))) {
      return sendError(reply, 403, 'current_password_incorrect');
    }

    const next = nextUsernameChangeAt(row.usernameChangedAt);
    if (next) return sendError(reply, 429, 'username_change_cooldown', { nextChangeAt: next });

    const now = Date.now();
    let changes = 0;
    try {
      changes = db.update(schema.users)
        .set({ username: name, usernameChangedAt: now, profileUpdatedAt: now })
        .where(and(
          eq(schema.users.id, request.userId),
          isNull(schema.users.homeInstance),
          or(isNull(schema.users.usernameChangedAt), lte(schema.users.usernameChangedAt, now - USERNAME_CHANGE_COOLDOWN_MS)),
        ))
        .run().changes;
    } catch (err) {
      if (isUniqueViolation(err)) return sendError(reply, 409, 'username_taken');
      throw err;
    }
    if (changes === 0) {
      // Another request changed it a moment ago.
      const fresh = db.select().from(schema.users).where(eq(schema.users.id, request.userId)).get();
      const after = nextUsernameChangeAt(fresh?.usernameChangedAt);
      return sendError(reply, 429, 'username_change_cooldown', after ? { nextChangeAt: after } : {});
    }

    const updated = db.select().from(schema.users).where(eq(schema.users.id, request.userId)).get()!;
    const user = sanitizeUser(updated, true);
    const event = { type: 'user_updated' as const, user: sanitizeUser(updated) };
    const targets = collectProfileBroadcastTargetIds(updated.id);
    for (const uid of targets) connectionManager.sendToUser(uid, event);
    connectionManager.sendToUser(updated.id, { type: 'user_updated' as const, user });
    if (isFederationRelayEnabled()) queueProfileRelay(updated);

    // The token names the user; hand back one with the new name.
    const token = signJwt({ userId: updated.id, username: updated.username });
    return { user, token, status: statusOf(updated) };
  });
}
