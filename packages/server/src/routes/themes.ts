import type { FastifyInstance, FastifyReply } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { authenticate } from '../utils/auth.js';
import { config } from '../config.js';
import { sendError } from '../utils/httpErrors.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { deleteAttachmentByFilename } from '../utils/fileCleanup.js';
import { resizeProfileImage } from '../utils/thumbnail.js';
import {
  THEME_CATEGORIES,
  THEME_DESCRIPTION_MAX,
  THEME_JSON_MAX,
  THEME_NAME_MAX,
  normalizeTheme,
  normalizeThemeSelection,
  themeImage,
  themeText,
  type AppThemeSelection,
  type ThemeCategory,
  type ThemeData,
  type ThemeRecord,
} from '@backspace/shared/src/theme.js';
import { builtinTheme } from '@backspace/shared/src/builtinThemes.js';

/** Saved themes per account. Generous, but bounded. */
export const THEMES_PER_USER = 50;
const GALLERY_PAGE = 30;

type ThemeRow = typeof schema.themes.$inferSelect;

function newShareCode(): string {
  return randomBytes(9).toString('base64url');
}

function category(value: unknown): ThemeCategory {
  return typeof value === 'string' && (THEME_CATEGORIES as readonly string[]).includes(value) ? (value as ThemeCategory) : 'other';
}

/**
 * A theme as clients see it. Only the theme itself and its creator's public
 * names leave the server: nothing else about the creator or the viewer.
 */
function toRecord(row: ThemeRow, viewerId: string, likedIds: Set<string>): ThemeRecord | null {
  const data = normalizeTheme(row.data);
  if (!data) return null;
  const owner = getDb().select({ id: schema.users.id, username: schema.users.username, displayName: schema.users.displayName, isDeleted: schema.users.isDeleted })
    .from(schema.users).where(eq(schema.users.id, row.ownerId)).get();
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: category(row.category),
    visibility: row.visibility === 'public' ? 'public' : 'private',
    // A share code is only handed to the owner and to people who opened a share.
    shareCode: row.shareCode,
    data,
    creator: owner && owner.isDeleted !== 1 ? { id: owner.id, username: owner.username, displayName: owner.displayName } : null,
    basedOn: row.basedOnName ? { name: row.basedOnName, creatorName: row.basedOnCreator ?? '' } : null,
    likes: row.likes,
    installs: row.installs,
    likedByMe: likedIds.has(row.id),
    isMine: row.ownerId === viewerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function likedBy(userId: string, themeIds: string[]): Set<string> {
  if (!themeIds.length) return new Set();
  return new Set(getDb().select({ id: schema.themeLikes.themeId }).from(schema.themeLikes)
    .where(and(eq(schema.themeLikes.userId, userId), inArray(schema.themeLikes.themeId, themeIds)))
    .all().map((r) => r.id));
}

function records(rows: ThemeRow[], viewerId: string): ThemeRecord[] {
  const liked = likedBy(viewerId, rows.map((r) => r.id));
  return rows.map((r) => toRecord(r, viewerId, liked)).filter((r): r is ThemeRecord => r !== null);
}

/**
 * Validate theme data from a request: normalized, size-bounded, and any
 * background image an upload on this instance. Sends the error and returns
 * null when it is not acceptable.
 */
async function acceptThemeData(raw: unknown, reply: FastifyReply): Promise<ThemeData | null> {
  const data = normalizeTheme(raw);
  if (!data) {
    sendError(reply, 400, 'validation_failed', { field: 'data', reason: 'not a valid theme' });
    return null;
  }
  if (JSON.stringify(data).length > THEME_JSON_MAX) {
    sendError(reply, 400, 'validation_failed', { field: 'data', reason: 'too large' });
    return null;
  }
  const image = themeImage(data);
  if (image) {
    const file = path.join(config.uploadDir, path.basename(image));
    if (!fs.existsSync(file)) {
      sendError(reply, 400, 'validation_failed', { field: 'data.background.image', reason: 'not an upload on this instance' });
      return null;
    }
    // The image now belongs to the theme, not to a message; keep it at a sensible size.
    deleteAttachmentByFilename(image);
    await resizeProfileImage(file, 'banner');
  }
  return data;
}

export async function themeRoutes(app: FastifyInstance): Promise<void> {
  // ── The account's selected theme (synced across devices) ──
  app.get('/api/users/@me/app-theme', { preHandler: authenticate }, async (request, reply) => {
    const row = getDb().select({ theme: schema.users.appTheme }).from(schema.users).where(eq(schema.users.id, request.userId)).get();
    if (!row) return sendError(reply, 404, 'user_not_found');
    return reply.header('Cache-Control', 'no-store').send({ selection: normalizeThemeSelection(row.theme) });
  });

  app.put<{ Body: { selection?: unknown } }>('/api/users/@me/app-theme', { preHandler: authenticate }, async (request, reply) => {
    const raw = request.body?.selection;
    let selection: AppThemeSelection | null = null;
    if (raw !== null && raw !== undefined) {
      selection = normalizeThemeSelection(raw);
      if (!selection || (selection.kind === 'builtin' && !builtinTheme(selection.id))) {
        return sendError(reply, 400, 'validation_failed', { field: 'selection', reason: 'not a valid theme selection' });
      }
      if (selection.kind === 'custom' && !(await acceptThemeData(selection.data, reply))) return reply;
    }
    // The default theme is stored as "nothing", so a reset leaves no trace.
    const stored = selection && !(selection.kind === 'builtin' && selection.id === 'emix') ? JSON.stringify(selection) : null;
    getDb().update(schema.users).set({ appTheme: stored }).where(eq(schema.users.id, request.userId)).run();
    return reply.send({ selection });
  });

  // ── Your own themes ──
  app.get('/api/themes/mine', { preHandler: authenticate }, async (request, reply) => {
    const rows = getDb().select().from(schema.themes).where(eq(schema.themes.ownerId, request.userId))
      .orderBy(desc(schema.themes.updatedAt)).all();
    return reply.header('Cache-Control', 'no-store').send({ themes: records(rows, request.userId) });
  });

  app.post<{ Body: { name?: unknown; description?: unknown; category?: unknown; visibility?: unknown; data?: unknown; basedOnCode?: unknown } }>(
    '/api/themes', { preHandler: authenticate }, async (request, reply) => {
      const db = getDb();
      const body = request.body ?? {};
      const name = themeText(body.name, THEME_NAME_MAX);
      if (!name) return sendError(reply, 400, 'validation_failed', { field: 'name', reason: 'required' });
      const count = db.select({ n: sql<number>`count(*)` }).from(schema.themes).where(eq(schema.themes.ownerId, request.userId)).get()?.n ?? 0;
      if (count >= THEMES_PER_USER) return sendError(reply, 400, 'validation_failed', { field: 'themes', reason: `at most ${THEMES_PER_USER} saved themes` });

      // Saving someone else's theme keeps their credit and counts as an install.
      let basedOnName: string | null = null;
      let basedOnCreator: string | null = null;
      if (typeof body.basedOnCode === 'string') {
        const source = db.select().from(schema.themes).where(eq(schema.themes.shareCode, body.basedOnCode)).get();
        if (source) {
          const creator = db.select({ username: schema.users.username, displayName: schema.users.displayName })
            .from(schema.users).where(eq(schema.users.id, source.ownerId)).get();
          basedOnName = source.basedOnName ?? source.name;
          basedOnCreator = source.basedOnCreator ?? (creator ? creator.displayName ?? creator.username : null);
          if (source.ownerId !== request.userId) {
            db.update(schema.themes).set({ installs: sql`${schema.themes.installs} + 1` }).where(eq(schema.themes.id, source.id)).run();
          }
        }
      }
      const data = await acceptThemeData(body.data, reply);
      if (!data) return reply;
      const now = Date.now();
      const row: ThemeRow = {
        id: generateSnowflake(),
        ownerId: request.userId,
        name,
        description: themeText(body.description, THEME_DESCRIPTION_MAX) ?? null,
        category: category(body.category),
        visibility: body.visibility === 'public' ? 'public' : 'private',
        shareCode: newShareCode(),
        data: JSON.stringify(data),
        basedOnName,
        basedOnCreator,
        likes: 0,
        installs: 0,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(schema.themes).values(row).run();
      return reply.code(201).send({ theme: records([row], request.userId)[0] });
    });

  app.patch<{ Params: { id: string }; Body: { name?: unknown; description?: unknown; category?: unknown; visibility?: unknown; data?: unknown } }>(
    '/api/themes/:id', { preHandler: authenticate }, async (request, reply) => {
      const db = getDb();
      const row = db.select().from(schema.themes).where(eq(schema.themes.id, request.params.id)).get();
      if (!row || row.ownerId !== request.userId) return sendError(reply, 404, 'not_found');
      const body = request.body ?? {};
      const update: Partial<ThemeRow> = { updatedAt: Date.now() };
      if (body.name !== undefined) {
        const name = themeText(body.name, THEME_NAME_MAX);
        if (!name) return sendError(reply, 400, 'validation_failed', { field: 'name', reason: 'required' });
        update.name = name;
      }
      if (body.description !== undefined) update.description = themeText(body.description, THEME_DESCRIPTION_MAX) ?? null;
      if (body.category !== undefined) update.category = category(body.category);
      if (body.visibility !== undefined) update.visibility = body.visibility === 'public' ? 'public' : 'private';
      if (body.data !== undefined) {
        const data = await acceptThemeData(body.data, reply);
        if (!data) return reply;
        update.data = JSON.stringify(data);
      }
      db.update(schema.themes).set(update).where(eq(schema.themes.id, row.id)).run();
      const fresh = db.select().from(schema.themes).where(eq(schema.themes.id, row.id)).get()!;
      return reply.send({ theme: records([fresh], request.userId)[0] });
    });

  app.delete<{ Params: { id: string } }>('/api/themes/:id', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    const row = db.select({ ownerId: schema.themes.ownerId }).from(schema.themes).where(eq(schema.themes.id, request.params.id)).get();
    if (!row || row.ownerId !== request.userId) return sendError(reply, 404, 'not_found');
    // The background image stays: copies others saved may still use it, and
    // the storage janitor removes it once nothing references it.
    db.delete(schema.themes).where(eq(schema.themes.id, request.params.id)).run();
    return reply.send({ success: true });
  });

  // ── Shared themes ──
  // A share code opens one theme for anyone signed in to this instance; it
  // reveals the theme and its creator's public names, nothing else.
  app.get<{ Params: { code: string } }>('/api/themes/share/:code', { preHandler: authenticate }, async (request, reply) => {
    if (!/^[A-Za-z0-9_-]{8,32}$/.test(request.params.code)) return sendError(reply, 404, 'not_found');
    const row = getDb().select().from(schema.themes).where(eq(schema.themes.shareCode, request.params.code)).get();
    const record = row ? records([row], request.userId)[0] : undefined;
    if (!record) return sendError(reply, 404, 'not_found');
    return reply.send({ theme: record });
  });

  // ── Gallery: public themes ──
  app.get<{ Querystring: { sort?: string; q?: string; category?: string; page?: string } }>(
    '/api/themes/gallery', { preHandler: authenticate }, async (request, reply) => {
      const db = getDb();
      const { sort = 'popular', q, category: cat, page } = request.query;
      const conditions = [eq(schema.themes.visibility, 'public')];
      if (cat && (THEME_CATEGORIES as readonly string[]).includes(cat)) conditions.push(eq(schema.themes.category, cat));
      const search = typeof q === 'string' ? q.trim().slice(0, 40).replace(/[%_\\]/g, '') : '';
      if (search) {
        const pattern = `%${search}%`;
        const creators = db.select({ id: schema.users.id }).from(schema.users)
          .where(or(like(schema.users.username, pattern), like(schema.users.displayName, pattern))).limit(50).all().map((u) => u.id);
        conditions.push(or(like(schema.themes.name, pattern), like(schema.themes.description, pattern),
          ...(creators.length ? [inArray(schema.themes.ownerId, creators)] : []))!);
      }
      const order = sort === 'recent'
        ? [desc(schema.themes.createdAt)]
        : [desc(sql`${schema.themes.likes} * 2 + ${schema.themes.installs}`), desc(schema.themes.createdAt)];
      if (sort === 'liked') {
        const mine = db.select({ id: schema.themeLikes.themeId }).from(schema.themeLikes).where(eq(schema.themeLikes.userId, request.userId)).all().map((r) => r.id);
        if (!mine.length) return reply.header('Cache-Control', 'no-store').send({ themes: [], more: false });
        conditions.push(inArray(schema.themes.id, mine));
      }
      const offset = Math.max(0, Math.min(1000, Number(page) || 0)) * GALLERY_PAGE;
      const rows = db.select().from(schema.themes).where(and(...conditions)).orderBy(...order).limit(GALLERY_PAGE + 1).offset(offset).all();
      const more = rows.length > GALLERY_PAGE;
      return reply.header('Cache-Control', 'no-store').send({ themes: records(rows.slice(0, GALLERY_PAGE), request.userId), more });
    });

  const setLike = async (userId: string, themeId: string, liked: boolean, reply: FastifyReply) => {
    const db = getDb();
    const row = db.select().from(schema.themes).where(eq(schema.themes.id, themeId)).get();
    if (!row || (row.visibility !== 'public' && row.ownerId !== userId)) return sendError(reply, 404, 'not_found');
    const existing = db.select().from(schema.themeLikes).where(and(eq(schema.themeLikes.themeId, themeId), eq(schema.themeLikes.userId, userId))).get();
    if (liked && !existing) {
      db.insert(schema.themeLikes).values({ themeId, userId, createdAt: Date.now() }).run();
      db.update(schema.themes).set({ likes: sql`${schema.themes.likes} + 1` }).where(eq(schema.themes.id, themeId)).run();
    } else if (!liked && existing) {
      db.delete(schema.themeLikes).where(and(eq(schema.themeLikes.themeId, themeId), eq(schema.themeLikes.userId, userId))).run();
      db.update(schema.themes).set({ likes: sql`max(0, ${schema.themes.likes} - 1)` }).where(eq(schema.themes.id, themeId)).run();
    }
    const fresh = db.select().from(schema.themes).where(eq(schema.themes.id, themeId)).get()!;
    return reply.send({ theme: records([fresh], userId)[0] });
  };
  app.post<{ Params: { id: string } }>('/api/themes/:id/like', { preHandler: authenticate }, (request, reply) => setLike(request.userId, request.params.id, true, reply));
  app.delete<{ Params: { id: string } }>('/api/themes/:id/like', { preHandler: authenticate }, (request, reply) => setLike(request.userId, request.params.id, false, reply));
}
