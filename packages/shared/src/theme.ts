/**
 * Emix app themes: the colours and appearance of the whole interface, separate
 * from profile customization (profileStyle.ts), which is about how a person
 * looks to others.
 *
 * A theme is structured data only: hex colours, numbers in range and ids from
 * fixed lists. There is no CSS, markup or script anywhere in it, and the only
 * image it can name is an upload on this instance. {@link normalizeTheme}
 * runs on the server before anything is stored or shared and on every client
 * before anything is drawn. Danger, warning, success and presence colours are
 * deliberately not part of a theme, so no theme can hide a warning.
 */

export const THEME_COLOR_KEYS = [
  'bg', 'sidebar', 'chat', 'elevated', 'input', 'border',
  'text', 'textMuted', 'textFaint', 'message', 'link',
  'accent', 'accent2', 'hover', 'notification',
] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
export type ThemeColors = Record<ThemeColorKey, string>;

export const THEME_FONTS = ['dm-sans', 'inter', 'system', 'serif', 'mono'] as const;
export type ThemeFont = (typeof THEME_FONTS)[number];

export const THEME_RADII = ['sharp', 'default', 'rounded'] as const;
export type ThemeRadius = (typeof THEME_RADII)[number];

export const THEME_CATEGORIES = ['dark', 'light', 'colorful', 'minimal', 'neon', 'nature', 'seasonal', 'other'] as const;
export type ThemeCategory = (typeof THEME_CATEGORIES)[number];

export interface ThemeBackground {
  /** 2 or 3 colours, painted behind the whole app. */
  gradient?: string[];
  /** Gradient angle in degrees, 0 to 360. */
  angle?: number;
  /** An upload on this instance (bare filename), drawn over the gradient. */
  image?: string;
  /** How much the background shows through the panels, 0 to 45 (percent). */
  showThrough?: number;
  /** Image blur, 0 to 30 (px). */
  blur?: number;
  /** Image dimming, 0 to 80 (percent). */
  dim?: number;
  /** Slowly drift the gradient. */
  animate?: boolean;
}

export interface ThemeData {
  mode: 'dark' | 'light';
  colors: ThemeColors;
  background?: ThemeBackground;
  /** Frosted-glass transparency of menus and popups, 0 (solid) to 100. */
  glass?: number;
  radius?: ThemeRadius;
  font?: ThemeFont;
  /** Accent glow around focused and selected controls, 0 to 100. */
  glow?: number;
}

/** A theme as the server returns it. `data` is always normalized. */
export interface ThemeRecord {
  id: string;
  name: string;
  description: string | null;
  category: ThemeCategory;
  visibility: 'private' | 'public';
  /** Opens the theme for anyone signed in to this instance (share links). */
  shareCode: string;
  data: ThemeData;
  creator: { id: string; username: string; displayName: string | null } | null;
  /** Credit kept when a theme is saved from someone else's. */
  basedOn: { name: string; creatorName: string } | null;
  likes: number;
  installs: number;
  likedByMe?: boolean;
  isMine?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** The theme an account uses: a built-in id or a snapshot of a custom theme. */
export type AppThemeSelection =
  | { kind: 'builtin'; id: string }
  | { kind: 'custom'; themeId: string | null; name: string; data: ThemeData };

export const THEME_NAME_MAX = 40;
export const THEME_DESCRIPTION_MAX = 160;
/** Largest theme document, in characters of JSON. */
export const THEME_JSON_MAX = 8192;
/** File format marker for exported themes. */
export const THEME_FILE_FORMAT = 'emix-theme';

const HEX = /^#[0-9a-f]{6}$/i;
const UPLOAD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function hex(value: unknown): string | undefined {
  return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : undefined;
}

function num(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(Math.min(max, Math.max(min, value)));
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Plain text for names and descriptions: no control or direction-override characters. */
export function themeText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

/**
 * The valid theme in `input`, or null. Every colour must be present and a
 * `#rrggbb` hex; everything else is optional and clamped to range.
 */
export function normalizeTheme(input: unknown): ThemeData | null {
  let value = input;
  if (typeof value === 'string') {
    if (value.length > THEME_JSON_MAX) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const mode = v.mode === 'light' ? 'light' : v.mode === 'dark' ? 'dark' : null;
  if (!mode || !v.colors || typeof v.colors !== 'object') return null;
  const c = v.colors as Record<string, unknown>;
  const colors = {} as ThemeColors;
  for (const key of THEME_COLOR_KEYS) {
    const color = hex(c[key]);
    if (!color) return null;
    colors[key] = color;
  }

  let background: ThemeBackground | undefined;
  if (v.background && typeof v.background === 'object') {
    const b = v.background as Record<string, unknown>;
    const gradient = Array.isArray(b.gradient)
      ? b.gradient.map(hex).filter((x): x is string => !!x).slice(0, 3)
      : [];
    const image = typeof b.image === 'string' && UPLOAD_NAME.test(b.image) ? b.image : undefined;
    if (gradient.length >= 2 || image) {
      background = {
        ...(gradient.length >= 2 ? { gradient } : {}),
        ...(gradient.length >= 2 && num(b.angle, 0, 360) !== undefined ? { angle: num(b.angle, 0, 360) } : {}),
        ...(image ? { image } : {}),
        showThrough: num(b.showThrough, 0, 45) ?? 20,
        ...(image && num(b.blur, 0, 30) ? { blur: num(b.blur, 0, 30) } : {}),
        ...(image && num(b.dim, 0, 80) ? { dim: num(b.dim, 0, 80) } : {}),
        ...(b.animate === true && gradient.length >= 2 ? { animate: true } : {}),
      };
    }
  }

  const theme: ThemeData = { mode, colors };
  if (background) theme.background = background;
  const glass = num(v.glass, 0, 100);
  if (glass !== undefined) theme.glass = glass;
  const radius = oneOf(THEME_RADII, v.radius);
  if (radius && radius !== 'default') theme.radius = radius;
  const font = oneOf(THEME_FONTS, v.font);
  if (font && font !== 'dm-sans') theme.font = font;
  const glow = num(v.glow, 0, 100);
  if (glow) theme.glow = glow;
  return theme;
}

/** The background image a theme uses, if any (for upload bookkeeping). */
export function themeImage(theme: ThemeData | null | undefined): string | null {
  return theme?.background?.image ?? null;
}

/** A selection as stored on an account, validated; null falls back to the default theme. */
export function normalizeThemeSelection(input: unknown): AppThemeSelection | null {
  let value = input;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.kind === 'builtin' && typeof v.id === 'string' && /^[a-z0-9-]{1,32}$/.test(v.id)) return { kind: 'builtin', id: v.id };
  if (v.kind === 'custom') {
    const data = normalizeTheme(v.data);
    if (!data) return null;
    const themeId = typeof v.themeId === 'string' && /^[0-9]{1,24}$/.test(v.themeId) ? v.themeId : null;
    return { kind: 'custom', themeId, name: themeText(v.name, THEME_NAME_MAX) ?? 'Custom theme', data };
  }
  return null;
}
