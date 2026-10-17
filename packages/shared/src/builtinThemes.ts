import type { ThemeColors, ThemeData } from './theme.js';

/** A theme that ships with Emix. Names are translated in the app (`settings:themes.builtin.<id>`). */
export interface BuiltinTheme {
  id: string;
  data: ThemeData;
}

function dark(colors: ThemeColors, extra: Partial<ThemeData> = {}): ThemeData {
  return { mode: 'dark', colors, ...extra };
}
function light(colors: ThemeColors, extra: Partial<ThemeData> = {}): ThemeData {
  return { mode: 'light', colors, ...extra };
}

/** The id of the theme every account starts with, and the emergency reset target. */
export const DEFAULT_THEME_ID = 'emix';

export const BUILTIN_THEMES: readonly BuiltinTheme[] = [
  { id: 'emix', data: dark({
    bg: '#0a0912', sidebar: '#181526', chat: '#110f1c', elevated: '#231f36', input: '#0f0d19', border: '#241f38',
    text: '#efefef', textMuted: '#a0a0aa', textFaint: '#5c5c68', message: '#d8d8de', link: '#38c8ff',
    accent: '#9333ea', accent2: '#ff3ea5', hover: '#ffffff', notification: '#fda4af',
  }) },
  { id: 'midnight', data: dark({
    bg: '#050506', sidebar: '#121214', chat: '#0b0b0d', elevated: '#1c1c20', input: '#08080a', border: '#232328',
    text: '#ececf1', textMuted: '#9a9aa6', textFaint: '#5f5f6a', message: '#d6d6dc', link: '#7cb8ff',
    accent: '#6366f1', accent2: '#a5b4fc', hover: '#ffffff', notification: '#f87171',
  }) },
  { id: 'amoled', data: dark({
    bg: '#000000', sidebar: '#000000', chat: '#000000', elevated: '#0e0e0e', input: '#060606', border: '#1c1c1c',
    text: '#f5f5f5', textMuted: '#a3a3a3', textFaint: '#5e5e5e', message: '#e5e5e5', link: '#60a5fa',
    accent: '#8b5cf6', accent2: '#ec4899', hover: '#ffffff', notification: '#f472b6',
  }, { glass: 0 }) },
  { id: 'neon-nights', data: dark({
    bg: '#0b0414', sidebar: '#1a0a2b', chat: '#12061f', elevated: '#2a1043', input: '#0e0418', border: '#3a1559',
    text: '#fdf2ff', textMuted: '#c9a7e0', textFaint: '#80609a', message: '#f0dcff', link: '#ff6ee0',
    accent: '#e11dbb', accent2: '#8b5cff', hover: '#ffd6fb', notification: '#ff2bd6',
  }, { glow: 60, background: { gradient: ['#1a0533', '#0b0414', '#2a0a3f'], angle: 160, showThrough: 18 } }) },
  { id: 'cyberpunk', data: dark({
    bg: '#05060f', sidebar: '#0c0f24', chat: '#080a1a', elevated: '#161a3a', input: '#060716', border: '#1f2a5a',
    text: '#e8fbff', textMuted: '#8fb7d6', textFaint: '#55708f', message: '#d4f3ff', link: '#00e5ff',
    accent: '#d6008f', accent2: '#00e5ff', hover: '#bdf6ff', notification: '#fcee0a',
  }, { glow: 70, radius: 'sharp' }) },
  { id: 'ocean', data: dark({
    bg: '#04121c', sidebar: '#0a2232', chat: '#071a27', elevated: '#0f3047', input: '#05141f', border: '#13405c',
    text: '#e6f6ff', textMuted: '#8fb8cc', textFaint: '#56798c', message: '#d2ecf7', link: '#5eead4',
    accent: '#0e7490', accent2: '#2dd4bf', hover: '#d5f3ff', notification: '#38bdf8',
  }) },
  { id: 'emerald', data: dark({
    bg: '#030d08', sidebar: '#0a1f15', chat: '#06150e', elevated: '#10301f', input: '#04100a', border: '#164029',
    text: '#ecfdf3', textMuted: '#93c4a8', textFaint: '#567f68', message: '#d6f5e2', link: '#6ee7b7',
    accent: '#047857', accent2: '#34d399', hover: '#d9ffe9', notification: '#34d399',
  }) },
  { id: 'crimson', data: dark({
    bg: '#0d0405', sidebar: '#1f0a0d', chat: '#160608', elevated: '#2e0f14', input: '#100405', border: '#42141b',
    text: '#fff0f1', textMuted: '#d1a1a7', textFaint: '#8f6066', message: '#fadadd', link: '#fb7185',
    accent: '#b91c1c', accent2: '#f43f5e', hover: '#ffe1e4', notification: '#f43f5e',
  }) },
  { id: 'sunset', data: dark({
    bg: '#120711', sidebar: '#26101f', chat: '#1b0a17', elevated: '#38172c', input: '#14070f', border: '#4a1f38',
    text: '#fff3ec', textMuted: '#e0b2a8', textFaint: '#98706d', message: '#fde3d8', link: '#fdba74',
    accent: '#c2410c', accent2: '#ec4899', hover: '#ffe6d6', notification: '#fb923c',
  }, { background: { gradient: ['#3b0d24', '#120711', '#40160a'], angle: 145, showThrough: 16 } }) },
  { id: 'lavender', data: dark({
    bg: '#120f1d', sidebar: '#221c35', chat: '#1a152a', elevated: '#2f2748', input: '#140f22', border: '#3a3157',
    text: '#f5f0ff', textMuted: '#c3b5e3', textFaint: '#8576a8', message: '#e9e0ff', link: '#c4b5fd',
    accent: '#7c3aed', accent2: '#c084fc', hover: '#efe6ff', notification: '#c084fc',
  }, { radius: 'rounded' }) },
  { id: 'arctic', data: light({
    bg: '#dce4ec', sidebar: '#edf2f7', chat: '#f8fafc', elevated: '#ffffff', input: '#e8eef4', border: '#cbd5e1',
    text: '#0f172a', textMuted: '#475569', textFaint: '#64748b', message: '#1e293b', link: '#0369a1',
    accent: '#0369a1', accent2: '#6366f1', hover: '#0f172a', notification: '#0284c7',
  }, { glass: 10 }) },
  { id: 'pastel', data: light({
    bg: '#ece2f4', sidebar: '#f6eefb', chat: '#fdf8ff', elevated: '#ffffff', input: '#f1e8f8', border: '#e0cdee',
    text: '#2b1d3a', textMuted: '#6b5a80', textFaint: '#857598', message: '#3a2a4c', link: '#7c3aed',
    accent: '#a21caf', accent2: '#3b82f6', hover: '#2b1d3a', notification: '#db2777',
  }, { radius: 'rounded', glass: 10 }) },
];

export function builtinTheme(id: string): BuiltinTheme | undefined {
  return BUILTIN_THEMES.find((t) => t.id === id);
}
