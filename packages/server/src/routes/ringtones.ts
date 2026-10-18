import type { FastifyInstance } from 'fastify';
import { and, asc, count, eq } from 'drizzle-orm';
import { execFile as execFileCb } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import {
  RINGTONE_ID_PATTERN, RINGTONE_MAX_PER_USER, RINGTONE_MAX_SECONDS, RINGTONE_MAX_UPLOAD_BYTES, RINGTONE_NAME_MAX,
  customRingtoneIds, normalizeRingtoneSettings, withoutRingtone,
  type RingtoneRecord, type RingtoneSettings, type SharedRingtoneInfo,
} from '@backspace/shared/src/ringtones.js';
import { getDb, schema } from '../db/index.js';
import { authenticate } from '../utils/auth.js';
import { sendError } from '../utils/httpErrors.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { createFixedWindowLimit } from '../utils/fixedWindowLimit.js';
import { ringtoneDir, ringtoneFile } from '../utils/ringtoneStorage.js';
import { canReach } from '../utils/reachability.js';

const execFile = promisify(execFileCb);

const MAX_MB = RINGTONE_MAX_UPLOAD_BYTES / (1024 * 1024);
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const uploadLimit = createFixedWindowLimit({ max: 10, windowMs: 10 * 60_000 });

export function _resetRingtoneUploadLimit(): void {
  uploadLimit.reset();
}

class RingtoneAudioError extends Error {}

/** The container, from the first bytes. Only these three are handed to ffmpeg, each with its own demuxer. */
export function sniffAudio(bytes: Buffer): 'mp3' | 'wav' | 'ogg' | null {
  if (bytes.length < 12) return null;
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WAVE') return 'wav';
  if (bytes.toString('latin1', 0, 4) === 'OggS') return 'ogg';
  if (bytes.toString('latin1', 0, 3) === 'ID3') return 'mp3';
  if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) return 'mp3';
  return null;
}

/**
 * Re-encode to Ogg Vorbis (the format of the built-in sounds): cut to
 * RINGTONE_MAX_SECONDS, metadata and any non-audio streams dropped, loudness
 * levelled so a custom ringtone is not much louder than the others. What is
 * stored is always ffmpeg's own output, never the uploaded bytes.
 */
async function transcode(input: Buffer, format: 'mp3' | 'wav' | 'ogg', outPath: string): Promise<number> {
  const tmpIn = `${outPath}.${randomUUID()}.in`;
  const tmpOut = `${outPath}.${randomUUID()}.tmp.ogg`;
  await writeFile(tmpIn, input);
  try {
    await execFile('ffmpeg', [
      '-hide_banner', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file',
      '-f', format, '-i', tmpIn,
      '-t', String(RINGTONE_MAX_SECONDS), '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ac', '2', '-ar', '44100',
      '-c:a', 'libvorbis', '-q:a', '4', '-f', 'ogg', tmpOut,
    ], { timeout: 30_000 });
    const { stdout } = await execFile('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', tmpOut,
    ], { timeout: 10_000 });
    const seconds = Number.parseFloat(stdout.trim());
    const { size } = await stat(tmpOut);
    if (!Number.isFinite(seconds) || seconds < 0.3 || size > MAX_OUTPUT_BYTES) throw new RingtoneAudioError();
    await rename(tmpOut, outPath);
    return Math.round(Math.min(seconds, RINGTONE_MAX_SECONDS) * 1000);
  } catch (err) {
    if (err instanceof RingtoneAudioError) throw err;
    // ffmpeg refusing the file is the file's fault; its message names decoder internals.
    throw new RingtoneAudioError();
  } finally {
    await rm(tmpIn, { force: true });
    await rm(tmpOut, { force: true });
  }
}

function toRecord(row: typeof schema.ringtones.$inferSelect): RingtoneRecord {
  return { id: row.id, name: row.name, durationMs: row.durationMs, size: row.size, createdAt: row.createdAt };
}

function settingsOf(userId: string): RingtoneSettings {
  const row = getDb().select({ s: schema.users.ringtoneSettings }).from(schema.users).where(eq(schema.users.id, userId)).get();
  return normalizeRingtoneSettings(row?.s ?? null);
}

function saveSettings(userId: string, settings: RingtoneSettings): void {
  getDb().update(schema.users).set({ ringtoneSettings: JSON.stringify(settings) }).where(eq(schema.users.id, userId)).run();
}

function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, RINGTONE_NAME_MAX);
  return name || null;
}

/** The ringtone `ownerId` shares, if sharing is on and the viewer may hear it. */
function sharedFor(viewerId: string, ownerId: string): SharedRingtoneInfo['ringtone'] {
  const settings = settingsOf(ownerId);
  if (!settings.shareEnabled || !settings.shared || !canReach(viewerId, ownerId)) return null;
  if (settings.shared.kind === 'builtin') return { kind: 'builtin', id: settings.shared.id };
  const sharedId = settings.shared.id;
  const row = getDb().select().from(schema.ringtones)
    .where(and(eq(schema.ringtones.id, sharedId), eq(schema.ringtones.ownerId, ownerId))).get();
  return row ? { kind: 'custom', id: row.id, name: row.name } : null;
}

export async function ringtoneRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/ringtones', { preHandler: authenticate }, async (request) => {
    const rows = getDb().select().from(schema.ringtones)
      .where(eq(schema.ringtones.ownerId, request.userId)).orderBy(asc(schema.ringtones.createdAt)).all();
    return { ringtones: rows.map(toRecord) };
  });

  app.post<{ Body: { name: string; data: string } }>('/api/ringtones', {
    preHandler: authenticate,
    bodyLimit: Math.ceil(RINGTONE_MAX_UPLOAD_BYTES / 3) * 4 + 4096,
    schema: { body: { type: 'object', required: ['name', 'data'], additionalProperties: false, properties: {
      name: { type: 'string', maxLength: 200 },
      data: { type: 'string', minLength: 16 },
    } } },
  }, async (request, reply) => {
    const name = normalizeName(request.body.name);
    if (!name) return sendError(reply, 400, 'validation_failed');
    if (!uploadLimit.consume(request.userId)) return sendError(reply, 429, 'rate_limited');
    const db = getDb();
    const owned = db.select({ n: count() }).from(schema.ringtones).where(eq(schema.ringtones.ownerId, request.userId)).get()?.n ?? 0;
    if (owned >= RINGTONE_MAX_PER_USER) return sendError(reply, 409, 'ringtone_limit_reached', { max: RINGTONE_MAX_PER_USER });

    const { data } = request.body;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return sendError(reply, 400, 'ringtone_invalid_audio', { max: MAX_MB });
    const bytes = Buffer.from(data, 'base64');
    const format = sniffAudio(bytes);
    if (!format || bytes.length > RINGTONE_MAX_UPLOAD_BYTES) return sendError(reply, 400, 'ringtone_invalid_audio', { max: MAX_MB });

    const id = generateSnowflake();
    await mkdir(ringtoneDir(), { recursive: true });
    let durationMs: number;
    try {
      durationMs = await transcode(bytes, format, ringtoneFile(id));
    } catch (err) {
      if (err instanceof RingtoneAudioError) return sendError(reply, 400, 'ringtone_invalid_audio', { max: MAX_MB });
      throw err;
    }
    const { size } = await stat(ringtoneFile(id));
    const row = { id, ownerId: request.userId, name, durationMs, size, createdAt: Date.now() };
    db.insert(schema.ringtones).values(row).run();
    return reply.code(201).send({ ringtone: toRecord(row) });
  });

  app.patch<{ Params: { id: string }; Body: { name: string } }>('/api/ringtones/:id', {
    preHandler: authenticate,
    schema: { body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: { type: 'string', maxLength: 200 } } } },
  }, async (request, reply) => {
    const name = normalizeName(request.body.name);
    if (!name) return sendError(reply, 400, 'validation_failed');
    const db = getDb();
    const where = and(eq(schema.ringtones.id, request.params.id), eq(schema.ringtones.ownerId, request.userId));
    if (!db.update(schema.ringtones).set({ name }).where(where).run().changes) return sendError(reply, 404, 'ringtone_not_found');
    return { ringtone: toRecord(db.select().from(schema.ringtones).where(where).get()!) };
  });

  app.delete<{ Params: { id: string } }>('/api/ringtones/:id', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params;
    const removed = db.delete(schema.ringtones)
      .where(and(eq(schema.ringtones.id, id), eq(schema.ringtones.ownerId, request.userId))).run().changes;
    if (!removed) return sendError(reply, 404, 'ringtone_not_found');
    const settings = settingsOf(request.userId);
    if (customRingtoneIds(settings).has(id)) saveSettings(request.userId, withoutRingtone(settings, id));
    await rm(ringtoneFile(id), { force: true });
    return { success: true, settings: settingsOf(request.userId) };
  });

  // The audio itself. Your own ringtones, or a ringtone someone shares with
  // people who can call them. Private: never cached by shared caches.
  app.get<{ Params: { id: string } }>('/api/ringtones/:id/audio', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params;
    if (!RINGTONE_ID_PATTERN.test(id)) return sendError(reply, 404, 'ringtone_not_found');
    const row = getDb().select().from(schema.ringtones).where(eq(schema.ringtones.id, id)).get();
    if (!row) return sendError(reply, 404, 'ringtone_not_found');
    if (row.ownerId !== request.userId) {
      const shared = sharedFor(request.userId, row.ownerId);
      if (shared?.kind !== 'custom' || shared.id !== id) return sendError(reply, 404, 'ringtone_not_found');
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(ringtoneFile(row.id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return sendError(reply, 404, 'ringtone_not_found');
      throw error;
    }
    return reply.type('audio/ogg')
      .header('Cache-Control', 'private, max-age=86400')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .send(bytes);
  });

  app.get('/api/users/@me/ringtone-settings', { preHandler: authenticate }, async (request) => {
    return { settings: settingsOf(request.userId) };
  });

  app.put<{ Body: { settings: unknown } }>('/api/users/@me/ringtone-settings', {
    preHandler: authenticate,
    bodyLimit: 64 * 1024,
    schema: { body: { type: 'object', required: ['settings'], properties: { settings: { type: 'object' } } } },
  }, async (request, reply) => {
    const settings = normalizeRingtoneSettings(request.body.settings);
    // A custom ringtone must be one of your own uploads.
    const ids = [...customRingtoneIds(settings)];
    if (ids.length) {
      const own = new Set(getDb().select({ id: schema.ringtones.id }).from(schema.ringtones)
        .where(eq(schema.ringtones.ownerId, request.userId)).all().map((r) => r.id));
      if (ids.some((id) => !own.has(id))) return sendError(reply, 400, 'ringtone_not_found');
    }
    saveSettings(request.userId, settings);
    return { settings };
  });

  app.get<{ Params: { id: string } }>('/api/users/:id/shared-ringtone', { preHandler: authenticate }, async (request): Promise<SharedRingtoneInfo> => {
    if (!RINGTONE_ID_PATTERN.test(request.params.id)) return { ringtone: null };
    return { ringtone: sharedFor(request.userId, request.params.id) };
  });
}
