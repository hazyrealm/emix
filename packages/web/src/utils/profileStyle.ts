import type React from 'react';
import {
  normalizeProfileStyle,
  type BackgroundPresetId,
  type ProfileBackground,
  type ProfileNameStyle,
  type ProfileStyle,
} from '@backspace/shared/src/profileStyle';

const normalized = new WeakMap<object, ProfileStyle | null>();

/**
 * A user's profile style, validated. The server already stores it
 * normalized; this guards against a value from another build (or a peer)
 * without re-validating the same object on every render.
 */
export function profileStyleOf(user: { profileStyle?: unknown } | null | undefined): ProfileStyle | null {
  const raw = user?.profileStyle;
  if (!raw || typeof raw !== 'object') return null;
  let style = normalized.get(raw);
  if (style === undefined) {
    style = normalizeProfileStyle(raw);
    normalized.set(raw, style);
  }
  return style;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** True when `hex` is too dark to read on Emix's dark surfaces. */
export function isLowContrastColor(hex: string): boolean {
  return luminance(channels(hex)) < 0.12;
}

/**
 * `hex` lifted toward white until it reads on a dark surface (about 4.5:1
 * against #15131f). Names stay legible whatever colour was picked.
 */
export function readableColor(hex: string): string {
  let [r, g, b] = channels(hex);
  for (let i = 0; i < 12 && luminance([r, g, b]) < 0.12; i++) {
    r = Math.round(r + (255 - r) * 0.18);
    g = Math.round(g + (255 - g) * 0.18);
    b = Math.round(b + (255 - b) * 0.18);
  }
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export interface NameRender {
  className: string;
  style: React.CSSProperties;
}

/**
 * Class and style for a styled display name. `undefined` name style renders
 * plainly (the caller's own colour applies).
 */
export function nameRender(name: ProfileNameStyle | undefined): NameRender | null {
  if (!name) return null;
  const cs = name.colors.map(readableColor);
  const vars: Record<string, string> = {};
  cs.forEach((c, i) => { vars[`--n${i + 1}`] = c; });
  const [c1, c2] = cs;
  if (c1 && cs.length === 1) { vars['--n2'] = c1; vars['--n3'] = c1; }
  if (c2 && cs.length === 2) vars['--n3'] = c2;
  if (c1) vars['--glow'] = c1;
  const glow = name.glow ? ' emx-name-glow' : '';
  switch (name.effect) {
    case 'solid':
      return { className: `emx-name${glow}`, style: { ...vars, color: cs[0] } as React.CSSProperties };
    case 'neon':
      return { className: 'emx-name emx-name-neon', style: vars as React.CSSProperties };
    case 'rainbow':
      return { className: `emx-name emx-name-fill emx-name-rainbow${glow}`, style: { ...vars, '--glow': '#a78bfa' } as React.CSSProperties };
    case 'gradient':
    case 'animated':
    case 'shimmer':
      return { className: `emx-name emx-name-fill emx-name-${name.effect}${glow}`, style: vars as React.CSSProperties };
  }
}

/** Gradients behind each background preset. */
export const BACKGROUND_PRESET_CSS: Record<BackgroundPresetId, string> = {
  midnight: 'linear-gradient(160deg, #15122a 0%, #0b0a16 100%)',
  emix: 'linear-gradient(140deg, #5b1240 0%, #3a1670 50%, #0f3a73 100%)',
  nebula: 'radial-gradient(120% 90% at 20% 10%, #6d28d9 0%, transparent 55%), radial-gradient(120% 90% at 90% 90%, #be185d 0%, transparent 55%), #120a24',
  sunset: 'linear-gradient(160deg, #7c2d12 0%, #9d174d 55%, #312e81 100%)',
  ocean: 'linear-gradient(160deg, #0c4a6e 0%, #134e4a 60%, #0b1324 100%)',
  forest: 'linear-gradient(160deg, #14532d 0%, #1a2e05 60%, #0a120a 100%)',
  ember: 'radial-gradient(110% 80% at 50% 110%, #b45309 0%, transparent 60%), linear-gradient(180deg, #1c0a05 0%, #3b0d0d 100%)',
  mono: 'linear-gradient(160deg, #2a2a33 0%, #101014 100%)',
  'aurora-flow': 'linear-gradient(120deg, #064e3b, #1e3a8a, #6b21a8, #0f766e, #064e3b)',
  synthwave: 'repeating-linear-gradient(0deg, rgb(255 62 165 / 0.18) 0 1px, transparent 1px 22px), linear-gradient(180deg, #1e0b3a 0%, #4a0e4e 70%, #f97316 140%)',
};

/** Animated presets: a slow drift across a larger gradient. */
const ANIMATED_PRESETS = new Set<BackgroundPresetId>(['aurora-flow']);

/** The CSS for a background's colour layer, or null for none. */
export function backgroundFill(bg: ProfileBackground | undefined): { background: string; animated: boolean } | null {
  if (!bg) return null;
  if (bg.colors && bg.colors.length >= 2) {
    const list = bg.animate ? [...bg.colors, bg.colors[0]] : bg.colors;
    return { background: `linear-gradient(150deg, ${list.join(', ')})`, animated: !!bg.animate };
  }
  if (bg.preset) return { background: BACKGROUND_PRESET_CSS[bg.preset], animated: ANIMATED_PRESETS.has(bg.preset) || !!bg.animate };
  return null;
}

/** An upload's URL (bare filename) or an absolute one, as Avatar resolves them. */
export function uploadSrc(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.startsWith('http') || name.startsWith('/') || name.startsWith('blob:') || name.startsWith('data:')
    ? name
    : `/api/uploads/${name}`;
}
