import type { ThemeData, ThemeFont } from '@backspace/shared/src/theme';
import { BUILTIN_THEMES, DEFAULT_THEME_ID, builtinTheme } from '@backspace/shared/src/builtinThemes';
import type { AppThemeSelection } from '@backspace/shared/src/theme';

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: RGB): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function channels(c: RGB): string {
  return `${c[0]} ${c[1]} ${c[2]}`;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as RGB;
}

function luminance(c: RGB): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

export function contrastRatio(a: string | RGB, b: string | RGB): number {
  const la = luminance(typeof a === 'string' ? hexToRgb(a) : a);
  const lb = luminance(typeof b === 'string' ? hexToRgb(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * `fg` moved toward white (dark backgrounds) or black (light ones) until it
 * reaches `min` contrast against `bg`. A theme can never make text unreadable.
 */
export function ensureContrast(fg: RGB, bg: RGB, min: number): RGB {
  if (contrastRatio(fg, bg) >= min) return fg;
  const target: RGB = luminance(bg) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  let out = fg;
  for (let i = 1; i <= 20 && contrastRatio(out, bg) < min; i++) out = mix(fg, target, i / 20);
  return out;
}

const FONT_STACK: Record<ThemeFont, string> = {
  'dm-sans': "'DM Sans'",
  inter: "'Inter'",
  system: "system-ui, -apple-system, 'Segoe UI'",
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  mono: "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
};

const RADIUS_SCALE = { sharp: 0.35, default: 1, rounded: 1.6 } as const;

// Danger, warning, success and presence are not themeable (theme.ts), but
// each mode gets values that read well on its surfaces.
const STATUS = {
  dark: { danger: '252 165 165', warning: '252 211 77', positive: '134 239 172', online: '134 239 172', idle: '252 211 77', dnd: '252 165 165' },
  light: { danger: '185 28 28', warning: '161 98 7', positive: '21 128 61', online: '22 163 74', idle: '202 138 4', dnd: '220 38 38' },
} as const;

/** The CSS variables that draw `theme` (applied on <html> or on a preview container). */
export function themeVariables(theme: ThemeData): Record<string, string> {
  const c = theme.colors;
  const bg = hexToRgb(c.bg);
  const sidebar = hexToRgb(c.sidebar);
  const chat = hexToRgb(c.chat);
  const elevated = hexToRgb(c.elevated);
  const input = hexToRgb(c.input);
  const border = hexToRgb(c.border);
  const accent = hexToRgb(c.accent);
  const hover = hexToRgb(c.hover);
  const light = theme.mode === 'light';
  // Text is checked against the panel it mostly sits on, and the sidebar.
  const darkest = luminance(chat) < luminance(sidebar) ? sidebar : chat;
  const surfaceFor = light ? darkest : (luminance(chat) > luminance(sidebar) ? chat : sidebar);
  const text = ensureContrast(hexToRgb(c.text), surfaceFor, 7);
  const message = ensureContrast(hexToRgb(c.message), chat, 4.5);
  const muted = ensureContrast(hexToRgb(c.textMuted), surfaceFor, 4.5);
  const faint = ensureContrast(hexToRgb(c.textFaint), surfaceFor, 2.6);
  const link = ensureContrast(hexToRgb(c.link), chat, 3.5);
  // White text must read on the accent; deepen the accent until it does.
  const onAccent: RGB = [255, 255, 255];
  let button = accent;
  for (let i = 1; i <= 10 && contrastRatio(onAccent, button) < 3.2; i++) button = mix(accent, [0, 0, 0], i / 20);
  const glassAlpha = 0.9 - ((theme.glass ?? 40) / 100) * 0.55;
  const surfaceAlpha = theme.background ? 1 - (theme.background.showThrough ?? 20) / 100 : 1;
  const status = STATUS[theme.mode];

  return {
    '--bg-base': channels(bg),
    '--bg-channel': channels(sidebar),
    '--bg-members': channels(sidebar),
    '--bg-chat': channels(chat),
    '--bg-elevated': channels(elevated),
    '--bg-input': channels(input),
    '--bg-overlay': light ? 'rgba(15, 23, 42, 0.45)' : 'rgba(0, 0, 0, 0.85)',
    '--border-hard': channels(border),
    '--border-soft': channels(mix(border, hover, light ? 0.06 : 0.05)),
    '--accent-primary': channels(button),
    '--accent-primary-hover': channels(mix(button, light ? [0, 0, 0] : [0, 0, 0], 0.14)),
    '--accent-primary-active': channels(mix(button, [0, 0, 0], 0.27)),
    '--accent-secondary': channels(ensureContrast(hexToRgb(c.accent2), chat, 3)),
    '--text-primary': channels(text),
    '--text-secondary': channels(muted),
    '--text-tertiary': channels(faint),
    '--text-category': channels(mix(faint, surfaceFor, 0.15)),
    '--text-message': channels(message),
    '--text-link': channels(link),
    '--text-positive': status.positive,
    '--text-warning': status.warning,
    '--text-danger': status.danger,
    '--status-online': status.online,
    '--status-idle': status.idle,
    '--status-dnd': status.dnd,
    '--status-offline': channels(mix(surfaceFor, text, 0.3)),
    '--interactive-hover': `rgb(${channels(hover)} / ${light ? 0.06 : 0.06})`,
    '--interactive-active': `rgb(${channels(hover)} / ${light ? 0.1 : 0.12})`,
    '--interactive-selected': `rgb(${channels(hover)} / ${light ? 0.12 : 0.16})`,
    '--interactive-muted': channels(mix(surfaceFor, text, light ? 0.25 : 0.2)),
    '--glass-bg': `rgb(${channels(elevated)} / ${glassAlpha.toFixed(2)})`,
    '--glass-modal-bg': `rgb(${channels(elevated)} / ${Math.max(glassAlpha, 0.82).toFixed(2)})`,
    '--glass-border': `rgb(${channels(hover)} / ${light ? 0.1 : 0.07})`,
    '--glass-highlight': `rgb(${channels(hover)} / ${light ? 0.04 : 0.05})`,
    '--notification': channels(hexToRgb(c.notification)),
    '--overlay': channels(hover),
    '--on-accent': '255 255 255',
    '--surface-alpha': surfaceAlpha.toFixed(2),
    '--app-font': FONT_STACK[theme.font ?? 'dm-sans'],
    '--radius-scale': String(RADIUS_SCALE[theme.radius ?? 'default']),
    '--theme-glow': ((theme.glow ?? 0) / 100).toFixed(2),
    // The emoji picker's own variables.
    '--em-rgb-background': channels(elevated).replace(/ /g, ', '),
    '--em-rgb-input': channels(input).replace(/ /g, ', '),
    '--em-rgb-color': channels(message).replace(/ /g, ', '),
    '--em-color-border': `rgb(${channels(hover)} / 0.07)`,
    '--em-color-border-over': `rgb(${channels(hover)} / 0.12)`,
  };
}

export function themeBackgroundCss(theme: ThemeData): { gradient: string | null; image: string | null } {
  const b = theme.background;
  const gradient = b?.gradient && b.gradient.length >= 2 ? `linear-gradient(${b.angle ?? 160}deg, ${(b.animate ? [...b.gradient, b.gradient[0]] : b.gradient).join(', ')})` : null;
  const image = b?.image ? `/api/uploads/${encodeURIComponent(b.image)}` : null;
  return { gradient, image };
}

export function defaultTheme(): ThemeData {
  return builtinTheme(DEFAULT_THEME_ID)!.data;
}

/** The theme a selection draws; unknown built-ins fall back to the default. */
export function resolveSelection(selection: AppThemeSelection | null | undefined): ThemeData {
  if (!selection) return defaultTheme();
  if (selection.kind === 'builtin') return builtinTheme(selection.id)?.data ?? defaultTheme();
  return selection.data;
}

let appliedKeys: string[] = [];

/**
 * Draw `theme` across the whole app. Instant: only CSS variables change.
 * `null` is Emix Default, which is the stylesheet's own values exactly.
 */
export function applyTheme(theme: ThemeData | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!theme) {
    for (const key of appliedKeys) root.style.removeProperty(key);
    appliedKeys = [];
    root.dataset.themeMode = 'dark';
    delete root.dataset.themeGlow;
    document.getElementById('emx-theme-bg')?.remove();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', defaultTheme().colors.bg);
    return;
  }
  const vars = themeVariables(theme);
  for (const key of appliedKeys) if (!(key in vars)) root.style.removeProperty(key);
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  appliedKeys = Object.keys(vars);
  root.dataset.themeMode = theme.mode;
  if (theme.glow) root.dataset.themeGlow = '1';
  else delete root.dataset.themeGlow;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.colors.bg);

  const { gradient, image } = themeBackgroundCss(theme);
  let layer = document.getElementById('emx-theme-bg');
  if (!gradient && !image) { layer?.remove(); return; }
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'emx-theme-bg';
    layer.setAttribute('aria-hidden', 'true');
    document.body.prepend(layer);
  }
  layer.replaceChildren();
  layer.style.background = `rgb(${themeVariables(theme)['--bg-base']})`;
  if (gradient) {
    const g = document.createElement('div');
    g.style.backgroundImage = gradient;
    if (theme.background?.animate) g.className = 'emx-bg-animated';
    layer.append(g);
  }
  if (image) {
    const img = document.createElement('div');
    img.style.backgroundImage = `url("${image}")`;
    if (theme.background?.blur) img.style.filter = `blur(${theme.background.blur}px)`;
    layer.append(img);
    if (theme.background?.dim) {
      const dim = document.createElement('div');
      dim.style.background = `rgb(0 0 0 / ${theme.background.dim / 100})`;
      layer.append(dim);
    }
  }
}

/** Every built-in theme, in display order. */
export { BUILTIN_THEMES, DEFAULT_THEME_ID };

/** A theme as an exportable file. */
export function exportThemeFile(name: string, data: ThemeData, creator?: string): string {
  return JSON.stringify({ format: 'emix-theme', version: 1, name, creator: creator ?? null, theme: data }, null, 2);
}

export { toHex };

/**
 * A complete palette from three choices: the editor's quick start, so a
 * theme takes seconds to make. Every colour can be fine-tuned afterwards.
 */
export function generatePalette(mode: 'dark' | 'light', background: string, accent: string, text: string): ThemeData['colors'] {
  const b = hexToRgb(background);
  const a = hexToRgb(accent);
  const t = hexToRgb(text);
  const W: RGB = [255, 255, 255];
  const K: RGB = [0, 0, 0];
  if (mode === 'dark') {
    const sidebar = b;
    return {
      bg: toHex(mix(b, K, 0.45)), sidebar: toHex(sidebar), chat: toHex(mix(b, K, 0.22)),
      elevated: toHex(mix(b, W, 0.08)), input: toHex(mix(b, K, 0.35)), border: toHex(mix(b, W, 0.1)),
      text: toHex(t), textMuted: toHex(mix(t, sidebar, 0.38)), textFaint: toHex(mix(t, sidebar, 0.6)),
      message: toHex(mix(t, sidebar, 0.1)), link: toHex(mix(a, W, 0.35)),
      accent: toHex(a), accent2: toHex(mix(a, W, 0.3)), hover: '#ffffff', notification: toHex(mix(a, W, 0.25)),
    };
  }
  const chat = mix(b, W, 0.75);
  return {
    bg: toHex(mix(b, K, 0.08)), sidebar: toHex(mix(b, W, 0.4)), chat: toHex(chat),
    elevated: '#ffffff', input: toHex(mix(b, K, 0.04)), border: toHex(mix(b, K, 0.14)),
    text: toHex(t), textMuted: toHex(mix(t, chat, 0.35)), textFaint: toHex(mix(t, chat, 0.5)),
    message: toHex(mix(t, chat, 0.08)), link: toHex(mix(a, K, 0.2)),
    accent: toHex(a), accent2: toHex(mix(a, K, 0.15)), hover: toHex(t), notification: toHex(a),
  };
}
