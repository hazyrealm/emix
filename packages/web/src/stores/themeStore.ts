import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { normalizeThemeSelection, type AppThemeSelection, type ThemeData, type ThemeRecord } from '@backspace/shared/src/theme';
import { DEFAULT_THEME_ID } from '@backspace/shared/src/builtinThemes';
import { api } from '../api/client';
import { applyTheme, resolveSelection } from '../utils/appTheme';

const DEFAULT_SELECTION: AppThemeSelection = { kind: 'builtin', id: DEFAULT_THEME_ID };

interface ThemeState {
  /** The account's theme. Cached on this device so the first paint is already themed. */
  selection: AppThemeSelection;
  /** A theme being tried on (editor, gallery, a shared theme). Never saved. */
  preview: ThemeData | null;
  /** This account's saved themes. */
  mine: ThemeRecord[];
  mineLoaded: boolean;
  syncedFor: string | null;
  /** Use a theme: applied at once, saved to the account (all devices). */
  select: (selection: AppThemeSelection) => Promise<void>;
  setPreview: (theme: ThemeData | null) => void;
  /** Read the account's theme after sign-in; the server copy wins. */
  syncFromServer: (userId: string) => Promise<void>;
  loadMine: (force?: boolean) => Promise<void>;
  upsertMine: (theme: ThemeRecord) => void;
  removeMine: (id: string) => void;
  /** Back to Emix Default, locally at once and on the account. */
  reset: () => Promise<void>;
}

/** Set by the emergency reset before sign-in: the account is reset when it next syncs. */
let resetPending = false;

function isDefault(selection: AppThemeSelection): boolean {
  return selection.kind === 'builtin' && selection.id === DEFAULT_THEME_ID;
}

function draw(selection: AppThemeSelection, preview: ThemeData | null): void {
  applyTheme(preview ?? (isDefault(selection) ? null : resolveSelection(selection)));
}

export const useThemeStore = create<ThemeState>()(persist(
  (set, get) => ({
    selection: DEFAULT_SELECTION,
    preview: null,
    mine: [],
    mineLoaded: false,
    syncedFor: null,
    select: async (selection) => {
      set({ selection, preview: null });
      try { await api.themes.setSelection(isDefault(selection) ? null : selection); } catch { /* kept on this device; saved next time */ }
    },
    setPreview: (preview) => set({ preview }),
    syncFromServer: async (userId) => {
      if (get().syncedFor === userId) return;
      set({ syncedFor: userId, mine: [], mineLoaded: false });
      if (resetPending) {
        resetPending = false;
        void api.themes.setSelection(null).catch(() => {});
        return;
      }
      try {
        const { selection } = await api.themes.selection();
        set({ selection: selection ?? DEFAULT_SELECTION });
      } catch { /* offline: the cached theme stays */ }
    },
    loadMine: async (force) => {
      if (get().mineLoaded && !force) return;
      try {
        const { themes } = await api.themes.mine();
        set({ mine: themes, mineLoaded: true });
      } catch { /* shown as empty */ }
    },
    upsertMine: (theme) => set((s) => ({ mine: [theme, ...s.mine.filter((t) => t.id !== theme.id)] })),
    removeMine: (id) => set((s) => ({ mine: s.mine.filter((t) => t.id !== id) })),
    reset: async () => {
      await get().select(DEFAULT_SELECTION);
    },
  }),
  {
    name: 'emix-app-theme',
    partialize: (s) => ({ selection: s.selection }),
    merge: (stored, current) => ({
      ...current,
      selection: normalizeThemeSelection((stored as { selection?: unknown } | undefined)?.selection) ?? DEFAULT_SELECTION,
    }),
  },
));

// Draw whatever is selected or being previewed, now and on every change.
draw(useThemeStore.getState().selection, null);
useThemeStore.subscribe((s, prev) => {
  if (s.selection !== prev.selection || s.preview !== prev.preview) draw(s.selection, s.preview);
});

/**
 * Emergency reset for a theme that made the app unreadable: open the app
 * with `?resetTheme` in the address, or press Ctrl+Shift+Alt+T anywhere.
 */
if (typeof window !== 'undefined') {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('resetTheme')) {
      useThemeStore.setState({ selection: DEFAULT_SELECTION, preview: null });
      url.searchParams.delete('resetTheme');
      window.history.replaceState(null, '', url.toString());
      // Saved to the account at the next sync (signed in now or later).
      resetPending = true;
    }
  } catch { /* no URL API */ }
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'T' || e.key === 't')) {
      e.preventDefault();
      void useThemeStore.getState().reset();
    }
  });
}
