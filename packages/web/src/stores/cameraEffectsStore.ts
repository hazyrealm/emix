import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const CAMERA_FILTERS = ['none', 'warm', 'cool', 'mono', 'vivid', 'soft', 'noir'] as const;
export type CameraFilter = (typeof CAMERA_FILTERS)[number];

export interface CameraEffects {
  /** Percent, 50 to 150; 100 = unchanged. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** Soft focus, 0 to 10 (tenths of a pixel of blur): a gentle smoothing. */
  softFocus: number;
  /** Digital zoom, 100 to 200 percent, centred. */
  zoom: number;
  filter: CameraFilter;
  /** The operating system's own background blur, where the camera offers it (Chrome `backgroundBlur`). */
  systemBlur: boolean;
  /** Flip the video other people receive (the self-view mirror is `mirrorPreview`). Off by default. */
  mirrorOutgoing: boolean;
}

export const NEUTRAL_EFFECTS: CameraEffects = {
  brightness: 100, contrast: 100, saturation: 100, softFocus: 0, zoom: 100, filter: 'none', systemBlur: false, mirrorOutgoing: false,
};

/** True when processing would change the picture: anything but the original feed. */
export function effectsActive(e: CameraEffects): boolean {
  return e.brightness !== 100 || e.contrast !== 100 || e.saturation !== 100 || e.softFocus !== 0 || e.zoom !== 100
    || e.filter !== 'none' || e.mirrorOutgoing;
}

interface CameraEffectsState {
  effects: CameraEffects;
  /** Show the preview dialog before the camera goes live. */
  alwaysPreview: boolean;
  /** Mirror your own camera wherever you see yourself (previews and your call tile). Others are unaffected. */
  mirrorPreview: boolean;
  setEffects: (patch: Partial<CameraEffects>) => void;
  resetEffects: () => void;
  setAlwaysPreview: (v: boolean) => void;
  setMirrorPreview: (v: boolean) => void;
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
}

export function normalizeEffects(raw: Partial<CameraEffects> | undefined): CameraEffects {
  const e = raw ?? {};
  return {
    brightness: clamp(e.brightness, 50, 150, 100),
    contrast: clamp(e.contrast, 50, 150, 100),
    saturation: clamp(e.saturation, 0, 200, 100),
    softFocus: clamp(e.softFocus, 0, 10, 0),
    zoom: clamp(e.zoom, 100, 200, 100),
    filter: (CAMERA_FILTERS as readonly string[]).includes(e.filter as string) ? (e.filter as CameraFilter) : 'none',
    systemBlur: e.systemBlur === true,
    mirrorOutgoing: e.mirrorOutgoing === true,
  };
}

/** Camera effects and preview preferences, kept on this device. */
export const useCameraEffectsStore = create<CameraEffectsState>()(persist(
  (set) => ({
    effects: NEUTRAL_EFFECTS,
    alwaysPreview: true,
    mirrorPreview: true,
    setEffects: (patch) => set((s) => ({ effects: normalizeEffects({ ...s.effects, ...patch }) })),
    resetEffects: () => set((s) => ({ effects: { ...NEUTRAL_EFFECTS, systemBlur: s.effects.systemBlur } })),
    setAlwaysPreview: (alwaysPreview) => set({ alwaysPreview }),
    setMirrorPreview: (mirrorPreview) => set({ mirrorPreview }),
  }),
  {
    name: 'emix-camera-effects',
    partialize: (s) => ({ effects: s.effects, alwaysPreview: s.alwaysPreview, mirrorPreview: s.mirrorPreview }),
    merge: (stored, current) => {
      const s = (stored ?? {}) as Partial<CameraEffectsState>;
      return {
        ...current,
        effects: normalizeEffects(s.effects),
        alwaysPreview: s.alwaysPreview !== false,
        mirrorPreview: s.mirrorPreview !== false,
      };
    },
  },
));

const FILTER_CSS: Record<CameraFilter, string> = {
  none: '',
  warm: 'sepia(0.18) saturate(1.12) hue-rotate(-8deg)',
  cool: 'saturate(1.05) hue-rotate(12deg) brightness(1.02)',
  mono: 'grayscale(1)',
  vivid: 'saturate(1.35) contrast(1.06)',
  soft: 'brightness(1.06) contrast(0.92) saturate(1.04)',
  noir: 'grayscale(1) contrast(1.35) brightness(0.95)',
};

/** The colour adjustments of `e` as a CSS/canvas filter string ('none' when neutral). */
export function effectsColorFilter(e: CameraEffects): string {
  const parts = [
    e.brightness !== 100 ? `brightness(${e.brightness / 100})` : '',
    e.contrast !== 100 ? `contrast(${e.contrast / 100})` : '',
    e.saturation !== 100 ? `saturate(${e.saturation / 100})` : '',
    FILTER_CSS[e.filter],
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : 'none';
}

/**
 * Soft focus as a glow: a blurred copy laid over the sharp frame. The blur
 * radius scales with the frame width, so it looks the same at 360p and 4K
 * (a fixed pixel blur vanishes on a large frame).
 */
export function softFocusLayer(softFocus: number, frameWidth: number): { radius: number; alpha: number } | null {
  if (!softFocus) return null;
  return { radius: Math.max(1, (frameWidth / 640) * softFocus * 0.45), alpha: Math.min(0.55, softFocus * 0.055) };
}
