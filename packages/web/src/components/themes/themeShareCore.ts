import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import type { ThemeRecord } from '@backspace/shared/src/theme';
import { api } from '../../api/client';
import { useThemeStore } from '../../stores/themeStore';
import { useUIStore } from '../../stores/uiStore';
import { describeError } from '../../i18n/errors';
import { exportThemeFile } from '../../utils/appTheme';

/** A link that opens a theme for anyone signed in to this instance. */
export function themeShareUrl(code: string): string {
  return `${window.location.origin}/theme/${code}`;
}

/** Theme share codes in a message's text (links to this instance only). */
export function themeCodesIn(content: string | null | undefined): string[] {
  if (!content) return [];
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const re = /https?:\/\/[^\s/]+\/theme\/([A-Za-z0-9_-]{8,32})\b/g;
  const out: string[] = [];
  for (const m of content.matchAll(re)) {
    if (m[0].startsWith(origin) && m[1] && !out.includes(m[1])) out.push(m[1]);
  }
  return out.slice(0, 3);
}

export function creditOf(theme: ThemeRecord): string | null {
  return theme.creator ? theme.creator.displayName ?? theme.creator.username : null;
}

/** Download a theme as an .emixtheme file (plain JSON; nothing in it runs). */
export function downloadThemeFile(theme: ThemeRecord): void {
  const blob = new Blob([exportThemeFile(theme.name, theme.data, creditOf(theme) ?? undefined)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${theme.name.replace(/[^\w\- ]+/g, '').trim() || 'theme'}.emixtheme`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

interface ThemeUiState {
  /** A shared theme opened from a link or a message card. */
  sharedCode: string | null;
  /** A theme being shared (the share dialog). */
  sharing: ThemeRecord | null;
  openShared: (code: string | null) => void;
  share: (theme: ThemeRecord | null) => void;
}

export const useThemeUiStore = create<ThemeUiState>((set) => ({
  sharedCode: null,
  sharing: null,
  openShared: (sharedCode) => set({ sharedCode }),
  share: (sharing) => set({ sharing }),
}));

/**
 * Apply or save a theme someone shared. Nothing changes until the user
 * chooses: Try it previews (and Cancel restores their own theme), Apply
 * switches to it, Save keeps a copy in their themes with the creator credited.
 */
export function useSharedThemeActions(theme: ThemeRecord | null) {
  const { t } = useTranslation(['settings']);
  const addToast = useUIStore((s) => s.addToast);
  const apply = async () => {
    if (!theme) return;
    useThemeStore.getState().setPreview(null);
    await useThemeStore.getState().select({ kind: 'custom', themeId: theme.isMine ? theme.id : null, name: theme.name, data: theme.data });
    addToast(t('settings:themes.applied', { name: theme.name }), 'success', 2000);
  };
  const save = async () => {
    if (!theme) return;
    try {
      const { theme: copy } = await api.themes.create({ name: theme.name, data: theme.data, category: theme.category, basedOnCode: theme.shareCode });
      useThemeStore.getState().upsertMine(copy);
      addToast(t('settings:themes.saved', { name: theme.name }), 'success', 2000);
    } catch (err) {
      addToast(describeError(err), 'warning');
    }
  };
  return { apply, save };
}
