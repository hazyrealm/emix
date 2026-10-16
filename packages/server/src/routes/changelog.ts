import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { authenticate } from '../utils/auth.js';
import { config } from '../config.js';
import { sendError } from '../utils/httpErrors.js';
import {
  compareVersions,
  isChangelogVersion,
  publishedReleases,
  validateChangelog,
  type ChangelogRelease,
  type ChangelogResponse,
  type ChangelogStateResponse,
} from '@backspace/shared/src/changelog.js';

/** The reviewed changelog shipped with this build (packages/shared/changelog.json). */
export const CHANGELOG_PATH = new URL('../../../shared/changelog.json', import.meta.url);

let cached: ChangelogRelease[] | null = null;

/**
 * The releases this server may announce: published, and no newer than the
 * running version. A missing or invalid file announces nothing rather than
 * failing a request; the changelog test keeps the shipped file valid.
 */
export function loadPublishedChangelog(): ChangelogRelease[] {
  if (cached) return cached;
  try {
    const data: unknown = JSON.parse(fs.readFileSync(CHANGELOG_PATH, 'utf8'));
    const errors = validateChangelog(data);
    if (errors.length) {
      console.warn('[changelog] changelog.json is invalid, announcing nothing:', errors.join('; '));
      cached = [];
    } else {
      cached = publishedReleases(data as ChangelogRelease[], config.version);
    }
  } catch (err) {
    console.warn('[changelog] could not read changelog.json:', err);
    cached = [];
  }
  return cached;
}

export async function changelogRoutes(app: FastifyInstance): Promise<void> {
  // Public: getemix.com/changelog reads this (proxied same-origin by the edge).
  app.get('/api/changelog', async (_request, reply) => {
    const body: ChangelogResponse = { releases: loadPublishedChangelog() };
    return reply.header('Cache-Control', 'public, max-age=300').send(body);
  });

  app.get('/api/changelog/state', { preHandler: authenticate }, async (request, reply) => {
    const row = getDb().select({ ack: schema.users.changelogAck }).from(schema.users)
      .where(eq(schema.users.id, request.userId)).get();
    if (!row) return sendError(reply, 404, 'user_not_found');
    const body: ChangelogStateResponse = { acknowledged: row.ack ?? null };
    return reply.header('Cache-Control', 'no-store').send(body);
  });

  // Acknowledge everything up to `version`. Only moves forward, and only to a
  // version this server has announced, so a stale tab cannot un-read a newer one.
  app.post<{ Body: { version?: unknown } }>('/api/changelog/ack', { preHandler: authenticate }, async (request, reply) => {
    const version = request.body?.version;
    if (!isChangelogVersion(version) || !loadPublishedChangelog().some((r) => r.version === version)) {
      return sendError(reply, 400, 'validation_failed', { field: 'version', reason: 'not an announced release' });
    }
    const db = getDb();
    const row = db.select({ ack: schema.users.changelogAck }).from(schema.users)
      .where(eq(schema.users.id, request.userId)).get();
    if (!row) return sendError(reply, 404, 'user_not_found');
    const next = row.ack && isChangelogVersion(row.ack) && compareVersions(row.ack, version) >= 0 ? row.ack : version;
    if (next !== row.ack) {
      db.update(schema.users).set({ changelogAck: next }).where(eq(schema.users.id, request.userId)).run();
    }
    const body: ChangelogStateResponse = { acknowledged: next };
    return reply.send(body);
  });
}
