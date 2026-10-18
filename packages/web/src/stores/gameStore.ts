import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DrawingCanvasOp, GameContext, GameId, GameMove, GameOptions, GameSessionView } from '@backspace/shared/src/games';
import { api, HttpError } from '../api/client';
import { describeError } from '../i18n/errors';
import { useUIStore } from './uiStore';
import { useAuthStore } from './authStore';
import { onSessionChanged } from '../utils/gameAudio';

/**
 * Emix games on the client: the sessions this user is in or invited to (the
 * server pushes every change as `game_session`), which one is open, and the
 * game window's state. The client never decides an outcome; it shows the
 * server's view and sends moves.
 */
interface GameState {
  sessions: Record<string, GameSessionView>;
  /** The session shown in the game window. */
  openId: string | null;
  minimized: boolean;
  /** Sessions whose invitation popup was dismissed (shown again only in the hub). */
  quietInvites: string[];
  loaded: boolean;
  /** The "start a game" dialog, with where it was opened from. */
  picker: GamePickerRequest | null;
  /** The session the call view is showing on its stage (so the window does not show it twice). */
  stagedId: string | null;

  /** Per-device preferences. */
  volume: number;
  muted: boolean;
  colorblind: boolean;

  load: () => Promise<void>;
  upsert: (session: GameSessionView) => void;
  remove: (id: string) => void;
  open: (id: string) => void;
  minimize: () => void;
  restore: () => void;
  closeWindow: () => void;
  quietInvite: (id: string) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  setColorblind: (c: boolean) => void;
  reset: () => void;
  openPicker: (request?: GamePickerRequest) => void;
  closePicker: () => void;
  setStaged: (id: string | null) => void;

  create: (input: { gameId: GameId; options?: GameOptions; context?: GameContext | { kind: 'voice' }; invite: string[] }) => Promise<GameSessionView | null>;
  accept: (id: string) => Promise<void>;
  decline: (id: string) => Promise<void>;
  leave: (id: string) => Promise<void>;
  start: (id: string) => Promise<void>;
  rematch: (id: string) => Promise<void>;
  changeGame: (id: string, gameId: GameId, options?: GameOptions) => Promise<void>;
  invite: (id: string, userIds: string[]) => Promise<void>;
  /** Send a move. Turn-based games pass the version they saw (`withSeq`). */
  move: (id: string, move: GameMove, withSeq?: boolean) => Promise<boolean>;
}

export interface GamePickerRequest {
  context?: GameContext | { kind: 'voice' };
  gameId?: GameId;
  invite?: string[];
}

const drawListeners = new Map<string, Set<(op: DrawingCanvasOp) => void>>();

/** Live drawing changes for one session (Sketch & Guess). */
export function onDrawing(sessionId: string, listener: (op: DrawingCanvasOp) => void): () => void {
  const set = drawListeners.get(sessionId) ?? new Set();
  set.add(listener);
  drawListeners.set(sessionId, set);
  return () => { set.delete(listener); };
}

export function emitDrawing(sessionId: string, op: DrawingCanvasOp): void {
  for (const l of drawListeners.get(sessionId) ?? []) l(op);
}

function warn(err: unknown): void {
  useUIStore.getState().addToast(describeError(err), 'warning');
}

export const myId = (): string | null => useAuthStore.getState().user?.id ?? null;

export const useGameStore = create<GameState>()(persist(
  (set, get) => {
    /** Run a session action; the pushed update usually lands first, the response confirms it. */
    const act = async (id: string, run: () => Promise<{ session: GameSessionView | null }>): Promise<boolean> => {
      try {
        const { session } = await run();
        if (session) get().upsert(session);
        else get().remove(id);
        return true;
      } catch (err) {
        if (err instanceof HttpError && err.code === 'game_stale') {
          // Someone moved first: show the current position, no error.
          try { get().upsert((await api.games.get(id)).session); } catch { /* the push will follow */ }
          return false;
        }
        if (err instanceof HttpError && (err.code === 'game_not_found' || err.code === 'game_forbidden')) get().remove(id);
        warn(err);
        return false;
      }
    };

    return {
      sessions: {},
      openId: null,
      minimized: false,
      quietInvites: [],
      loaded: false,
      picker: null,
      stagedId: null,
      volume: 70,
      muted: false,
      colorblind: false,

      load: async () => {
        try {
          const { sessions } = await api.games.sessions();
          set({ sessions: Object.fromEntries(sessions.map((s) => [s.id, s])), loaded: true });
        } catch { set({ loaded: true }); }
      },
      upsert: (session) => {
        const prev = get().sessions[session.id];
        // Out-of-order pushes: never go back to an older version.
        if (prev && prev.seq > session.seq) return;
        set((s) => ({ sessions: { ...s.sessions, [session.id]: session } }));
        onSessionChanged(prev ?? null, session, myId());
      },
      remove: (id) => set((s) => {
        const sessions = { ...s.sessions };
        delete sessions[id];
        return { sessions, openId: s.openId === id ? null : s.openId, minimized: s.openId === id ? false : s.minimized };
      }),
      open: (id) => set({ openId: id, minimized: false }),
      minimize: () => set({ minimized: true }),
      restore: () => set({ minimized: false }),
      closeWindow: () => set({ openId: null, minimized: false }),
      quietInvite: (id) => set((s) => ({ quietInvites: [...s.quietInvites.filter((x) => x !== id), id].slice(-50) })),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(100, Math.round(volume))) }),
      setMuted: (muted) => set({ muted }),
      setColorblind: (colorblind) => set({ colorblind }),
      reset: () => set({ sessions: {}, openId: null, minimized: false, loaded: false, picker: null }),
      openPicker: (request = {}) => set({ picker: request }),
      closePicker: () => set({ picker: null }),
      setStaged: (stagedId) => set({ stagedId }),

      create: async (input) => {
        try {
          const { session } = await api.games.create(input);
          get().upsert(session);
          get().open(session.id);
          return session;
        } catch (err) {
          warn(err);
          return null;
        }
      },
      accept: async (id) => {
        if (await act(id, () => api.games.accept(id))) get().open(id);
      },
      decline: async (id) => { await act(id, () => api.games.decline(id)); },
      leave: async (id) => {
        await act(id, () => api.games.leave(id));
        get().remove(id);
      },
      start: async (id) => { await act(id, () => api.games.start(id)); },
      rematch: async (id) => { await act(id, () => api.games.rematch(id)); },
      changeGame: async (id, gameId, options) => { await act(id, () => api.games.changeGame(id, gameId, options)); },
      invite: async (id, userIds) => { await act(id, () => api.games.invite(id, userIds)); },
      move: (id, move, withSeq = false) => {
        const seq = withSeq ? get().sessions[id]?.seq : undefined;
        return act(id, () => api.games.move(id, move, seq));
      },
    };
  },
  {
    name: 'emix-games',
    partialize: (s) => ({ volume: s.volume, muted: s.muted, colorblind: s.colorblind, quietInvites: s.quietInvites }),
  },
));
