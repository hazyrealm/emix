/**
 * Emix profile customization: name colours and effects, nameplates, avatar
 * decorations, profile backgrounds and effects, banner framing, pronouns and
 * links. Free for everyone.
 *
 * Stored as one JSON document per user (`users.profile_style`) and sent on
 * every `User` as `profileStyle`. The server stores only what
 * {@link normalizeProfileStyle} returns, and clients read it through the same
 * function, so a value from an older or newer build degrades to "not set"
 * instead of breaking a render. Every visual is drawn by the client from an
 * id in the catalogues below: there is no user-supplied CSS or markup, and the
 * only user-supplied image is a file uploaded to this instance.
 */

export const NAME_EFFECTS = ['solid', 'gradient', 'animated', 'rainbow', 'neon', 'shimmer'] as const;
export type NameEffect = (typeof NAME_EFFECTS)[number];

export const NAMEPLATES = [
  'neon-pulse', 'galaxy', 'cyberpunk', 'fire-ice', 'starfield', 'holographic',
  'aurora', 'glow-border', 'glass', 'digital', 'minimal', 'winter', 'sakura', 'spooky',
] as const;
export type NameplateId = (typeof NAMEPLATES)[number];

export const AVATAR_DECORATIONS = [
  'neon-ring', 'glow-pulse', 'flames', 'hearts', 'stars', 'snowflakes',
  'cyber', 'sparkle', 'holo', 'orbit', 'leaves', 'pumpkin',
] as const;
export type AvatarDecorationId = (typeof AVATAR_DECORATIONS)[number];

export const PROFILE_EFFECTS = [
  'falling-stars', 'sparkles', 'hearts', 'snow', 'neon-particles', 'galaxy',
  'light-streaks', 'glow', 'confetti', 'digital-rain',
] as const;
export type ProfileEffectId = (typeof PROFILE_EFFECTS)[number];

export const BACKGROUND_PRESETS = [
  'midnight', 'emix', 'nebula', 'sunset', 'ocean', 'forest', 'ember', 'mono', 'aurora-flow', 'synthwave',
] as const;
export type BackgroundPresetId = (typeof BACKGROUND_PRESETS)[number];

export interface ProfileNameStyle {
  effect: NameEffect;
  /** 1 to 4 colours, `#rrggbb`. `rainbow` ignores them. */
  colors: string[];
  /** A soft glow around any effect (`neon` always glows). */
  glow?: boolean;
}

export interface ProfileBackground {
  /** A preset (drawn by the client) or custom colours; an image layers over either. */
  preset?: BackgroundPresetId;
  /** 2 or 3 colours for a custom gradient, `#rrggbb`. */
  colors?: string[];
  /** Animate the gradient slowly. */
  animate?: boolean;
  /** An upload on this instance (bare filename). */
  image?: string;
  /** Image focus point, 0 to 100 (percent). */
  x?: number;
  y?: number;
  /** Image zoom, 100 to 300 (percent). */
  zoom?: number;
  /** Image opacity, 10 to 100 (percent). */
  opacity?: number;
  /** Image blur, 0 to 20 (px). */
  blur?: number;
  /**
   * How much the whole background is darkened, 0 (none) to 100 (black), so
   * the owner chooses between a vivid picture and calmer text contrast.
   * Unset means {@link PROFILE_BACKGROUND_DARKNESS_DEFAULT}.
   */
  darkness?: number;
}

/** Darkening for a background that has never set its own. Low, so images stay vivid. */
export const PROFILE_BACKGROUND_DARKNESS_DEFAULT = 15;

export interface ProfileBannerFrame {
  /** Focus point, 0 to 100 (percent). */
  x?: number;
  y?: number;
  /** Zoom, 100 to 300 (percent). */
  zoom?: number;
}

export interface ProfileLink {
  label: string;
  url: string;
}

export interface ProfileStyle {
  name?: ProfileNameStyle;
  nameplate?: NameplateId;
  decoration?: AvatarDecorationId;
  effect?: ProfileEffectId;
  background?: ProfileBackground;
  banner?: ProfileBannerFrame;
  /**
   * Frosted-glass panel behind the profile text. Unset means on when there is
   * a background and off otherwise; see {@link profileGlassOn}.
   */
  glass?: boolean;
  pronouns?: string;
  links?: ProfileLink[];
}

export const PROFILE_PRONOUNS_MAX = 40;
export const PROFILE_LINKS_MAX = 5;
export const PROFILE_LINK_LABEL_MAX = 32;
export const PROFILE_LINK_URL_MAX = 200;
/** Largest stored document, in characters of JSON. */
export const PROFILE_STYLE_MAX_JSON = 4096;

const HEX = /^#[0-9a-f]{6}$/i;
/** An upload's stored name: no path, no traversal. */
const UPLOAD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function oneOf<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : undefined;
}

function colors(value: unknown, min: number, max: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, max).map((c) => c.toLowerCase());
  return out.length >= min ? out : undefined;
}

function pct(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(Math.min(max, Math.max(min, value)));
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Control characters and bidi overrides would let a short label disguise itself.
  const cleaned = value.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

/** An https link, or undefined. Only http(s) is ever rendered as a link. */
export function normalizeProfileLinkUrl(value: unknown): string | undefined {
  const raw = text(value, PROFILE_LINK_URL_MAX);
  if (!raw) return undefined;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (!url.hostname.includes('.') || url.username || url.password) return undefined;
    return url.toString().slice(0, PROFILE_LINK_URL_MAX);
  } catch {
    return undefined;
  }
}

function strip<T extends object>(obj: T): T | undefined {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

/**
 * The valid part of `input` as a {@link ProfileStyle}, or null when nothing
 * valid is left. Unknown ids, malformed colours and out-of-range numbers are
 * dropped (numbers are clamped), so this never throws.
 */
export function normalizeProfileStyle(input: unknown): ProfileStyle | null {
  let value = input;
  if (typeof value === 'string') {
    if (value.length > PROFILE_STYLE_MAX_JSON) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;

  let name: ProfileNameStyle | undefined;
  if (v.name && typeof v.name === 'object') {
    const n = v.name as Record<string, unknown>;
    const effect = oneOf(NAME_EFFECTS, n.effect);
    const min = effect === 'gradient' || effect === 'animated' || effect === 'shimmer' ? 2 : 1;
    const cs = colors(n.colors, effect === 'rainbow' ? 0 : min, 4);
    if (effect && (cs || effect === 'rainbow')) {
      name = { effect, colors: cs ?? [], ...(n.glow === true ? { glow: true } : {}) };
    }
  }

  let background: ProfileBackground | undefined;
  if (v.background && typeof v.background === 'object') {
    const b = v.background as Record<string, unknown>;
    const image = typeof b.image === 'string' && UPLOAD_NAME.test(b.image) ? b.image : undefined;
    background = strip<ProfileBackground>({
      preset: oneOf(BACKGROUND_PRESETS, b.preset),
      colors: colors(b.colors, 2, 3),
      animate: b.animate === true ? true : undefined,
      image,
      x: image ? pct(b.x, 0, 100) : undefined,
      y: image ? pct(b.y, 0, 100) : undefined,
      zoom: image ? pct(b.zoom, 100, 300) : undefined,
      opacity: image ? pct(b.opacity, 10, 100) : undefined,
      blur: image ? pct(b.blur, 0, 20) : undefined,
      darkness: pct(b.darkness, 0, 100),
    });
    // Framing alone, with nothing to frame, is not a background.
    if (background && !background.preset && !background.colors && !background.image) background = undefined;
  }

  let banner: ProfileBannerFrame | undefined;
  if (v.banner && typeof v.banner === 'object') {
    const b = v.banner as Record<string, unknown>;
    banner = strip<ProfileBannerFrame>({ x: pct(b.x, 0, 100), y: pct(b.y, 0, 100), zoom: pct(b.zoom, 100, 300) });
  }

  let links: ProfileLink[] | undefined;
  if (Array.isArray(v.links)) {
    links = v.links
      .map((l): ProfileLink | null => {
        if (!l || typeof l !== 'object') return null;
        const url = normalizeProfileLinkUrl((l as Record<string, unknown>).url);
        if (!url) return null;
        const label = text((l as Record<string, unknown>).label, PROFILE_LINK_LABEL_MAX) ?? new URL(url).hostname.replace(/^www\./, '');
        return { label, url };
      })
      .filter((l): l is ProfileLink => l !== null)
      .slice(0, PROFILE_LINKS_MAX);
    if (!links.length) links = undefined;
  }

  const style = strip<ProfileStyle>({
    name,
    nameplate: oneOf(NAMEPLATES, v.nameplate),
    decoration: oneOf(AVATAR_DECORATIONS, v.decoration),
    effect: oneOf(PROFILE_EFFECTS, v.effect),
    background,
    banner,
    glass: typeof v.glass === 'boolean' ? v.glass : undefined,
    pronouns: text(v.pronouns, PROFILE_PRONOUNS_MAX),
    links,
  });
  return style ?? null;
}

/** Whether a profile's text sits on the frosted-glass panel. */
export function profileGlassOn(style: ProfileStyle | null | undefined): boolean {
  return style?.glass ?? !!style?.background;
}
