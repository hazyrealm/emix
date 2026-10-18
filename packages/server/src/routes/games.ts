import type { FastifyInstance, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { isGameId, type GameContext, type GameMove } from '@backspace/shared/src/games.js';
import { getDb, schema } from '../db/index.js';
import { authenticate } from '../utils/auth.js';
import { sendError } from '../utils/httpErrors.js';
import {
  GameError,
  acceptInvite,
  canvasOf,
  changeGame,
  createSession,
  declineInvite,
  inviteToSession,
  leaveSession,
  makeMove,
  sessionFor,
  sessionsOf,
  startMatch,
  viewFor,
  voteRematch,
  type Session,
} from '../games/sessions.js';
import { dailyGuess, dailyState } from '../games/daily.js';
import { gameStats } from '../games/stats.js';

const ID = /^[0-9]{1,20}$/;

function fail(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof GameError) return sendError(reply, err.status, err.code);
  throw err;
}

function ids(raw: unknown): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 8 || !raw.every((v) => typeof v === 'string' && ID.test(v))) return null;
  return raw as string[];
}

function context(raw: unknown): GameContext | null {
  if (raw === undefined) return { kind: 'direct' };
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (c.kind === 'direct') return { kind: 'direct' };
  if (c.kind === 'voice') return { kind: 'voice', roomId: '' };
  if (c.kind === 'dm' && typeof c.dmChannelId === 'string' && ID.test(c.dmChannelId)) return { kind: 'dm', dmChannelId: c.dmChannelId };
  return null;
}

export async function gameRoutes(app: FastifyInstance): Promise<void> {
  const view = (s: Session, userId: string) => ({ session: viewFor(s, userId) });
  const sid = (params: unknown) => {
    const id = (params as { id?: string }).id ?? '';
    return ID.test(id) ? id : null;
  };

  app.get('/api/games/sessions', { preHandler: authenticate }, async (request) => ({ sessions: sessionsOf(request.userId) }));

  app.post<{ Body: { gameId?: unknown; options?: unknown; context?: unknown; invite?: unknown } }>('/api/games/sessions', {
    preHandler: authenticate,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = request.body ?? {};
    const invite = ids(body.invite);
    const ctx = context(body.context);
    if (!isGameId(body.gameId) || !invite || !ctx) return sendError(reply, 400, 'validation_failed');
    try {
      return reply.code(201).send(view(createSession(request.userId, { gameId: body.gameId, options: body.options, context: ctx, invite }), request.userId));
    } catch (err) { return fail(reply, err); }
  });

  app.get('/api/games/sessions/:id', { preHandler: authenticate }, async (request, reply) => {
    const id = sid(request.params);
    if (!id) return sendError(reply, 404, 'game_not_found');
    try { return view(sessionFor(id, request.userId), request.userId); } catch (err) { return fail(reply, err); }
  });

  app.get('/api/games/sessions/:id/canvas', { preHandler: authenticate }, async (request, reply) => {
    const id = sid(request.params);
    if (!id) return sendError(reply, 404, 'game_not_found');
    try { return { strokes: canvasOf(id, request.userId) }; } catch (err) { return fail(reply, err); }
  });

  const action = (path: string, run: (id: string, userId: string, body: Record<string, unknown>) => Session | void, limit = 60) => {
    app.post<{ Body: Record<string, unknown> }>(`/api/games/sessions/:id/${path}`, {
      preHandler: authenticate,
      config: { rateLimit: { max: limit, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      const id = sid(request.params);
      if (!id) return sendError(reply, 404, 'game_not_found');
      try {
        const s = run(id, request.userId, request.body ?? {});
        return s && s.status !== 'closed' && (s.players.includes(request.userId) || request.userId in s.invited)
          ? view(s, request.userId)
          : { session: null };
      } catch (err) { return fail(reply, err); }
    });
  };

  action('invite', (id, userId, body) => {
    const list = ids(body.userIds);
    if (!list || list.length === 0) throw new GameError(400, 'validation_failed');
    return inviteToSession(id, userId, list);
  }, 30);
  action('accept', (id, userId) => acceptInvite(id, userId));
  action('decline', (id, userId) => declineInvite(id, userId));
  action('leave', (id, userId) => leaveSession(id, userId));
  action('start', (id, userId) => startMatch(id, userId));
  action('rematch', (id, userId) => voteRematch(id, userId));
  action('game', (id, userId, body) => {
    if (!isGameId(body.gameId)) throw new GameError(400, 'validation_failed');
    return changeGame(id, userId, body.gameId, body.options);
  });
  action('move', (id, userId, body) => {
    const seq = body.seq;
    if (seq !== undefined && (typeof seq !== 'number' || !Number.isInteger(seq))) throw new GameError(400, 'validation_failed');
    return makeMove(id, userId, body.move as GameMove, seq as number | undefined);
  }, 600);

  app.get('/api/games/daily', { preHandler: authenticate }, async (request) => ({ daily: dailyState(request.userId, Date.now()) }));

  app.post<{ Body: { word?: unknown } }>('/api/games/daily/guess', {
    preHandler: authenticate,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try { return { daily: dailyGuess(request.userId, request.body?.word, Date.now()) }; } catch (err) { return fail(reply, err); }
  });

  app.get('/api/games/stats/:userId', { preHandler: authenticate }, async (request, reply) => {
    const userId = (request.params as { userId?: string }).userId ?? '';
    const target = userId === '@me' ? request.userId : userId;
    if (!ID.test(target)) return sendError(reply, 404, 'not_found');
    const stats = gameStats(target, Date.now());
    if (target !== request.userId && !stats.visible) return { stats: null };
    return { stats };
  });

  app.put<{ Body: { visible?: unknown } }>('/api/games/stats/visibility', { preHandler: authenticate }, async (request, reply) => {
    if (typeof request.body?.visible !== 'boolean') return sendError(reply, 400, 'validation_failed');
    getDb().update(schema.users).set({ showGameStats: request.body.visible ? 1 : 0 }).where(eq(schema.users.id, request.userId)).run();
    return { visible: request.body.visible };
  });
}
