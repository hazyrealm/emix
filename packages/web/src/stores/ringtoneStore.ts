import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_RINGTONE_SETTINGS, normalizeRingtoneSettings,
  type RingtoneRecord, type RingtoneSettings,
} from '@backspace/shared/src/ringtones';
import { api } from '../api/client';

interface RingtoneState {
  /** Synced with the account; cached here so a ring right after start-up uses it. */
  settings: RingtoneSettings;
  mine: RingtoneRecord[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Changes the local copy at once and saves it to the account shortly after; a failed save reloads. */
  update: (patch: Partial<RingtoneSettings>) => Promise<void>;
  upload: (file: File, name: string) => Promise<RingtoneRecord>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reset: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export const useRingtoneStore = create<RingtoneState>()(persist(
  (set, get) => ({
    settings: { ...DEFAULT_RINGTONE_SETTINGS },
    mine: [],
    loaded: false,

    load: async () => {
      const [{ settings }, { ringtones }] = await Promise.all([api.ringtones.settings(), api.ringtones.list()]);
      set({ settings: normalizeRingtoneSettings(settings), mine: ringtones, loaded: true });
    },

    update: (patch) => {
      const next = normalizeRingtoneSettings({ ...get().settings, ...patch });
      set({ settings: next });
      // Sliders change on every step: the account gets the last value once.
      if (saveTimer) clearTimeout(saveTimer);
      return new Promise<void>((resolve, reject) => {
        saveTimer = setTimeout(() => {
          saveTimer = null;
          api.ringtones.saveSettings(get().settings)
            .then(({ settings }) => { set({ settings: normalizeRingtoneSettings(settings) }); resolve(); })
            .catch((err: unknown) => { void get().load().catch(() => {}); reject(err); });
        }, 400);
      });
    },

    upload: async (file, name) => {
      const { ringtone } = await api.ringtones.upload(name, toBase64(await file.arrayBuffer()));
      set({ mine: [...get().mine, ringtone] });
      return ringtone;
    },

    rename: async (id, name) => {
      const { ringtone } = await api.ringtones.rename(id, name);
      set({ mine: get().mine.map((r) => (r.id === id ? ringtone : r)) });
    },

    remove: async (id) => {
      const { settings } = await api.ringtones.remove(id);
      set({ mine: get().mine.filter((r) => r.id !== id), settings: normalizeRingtoneSettings(settings) });
    },

    reset: () => set({ settings: { ...DEFAULT_RINGTONE_SETTINGS }, mine: [], loaded: false }),
  }),
  { name: 'emix-ringtones', partialize: (s) => ({ settings: s.settings }) },
));
