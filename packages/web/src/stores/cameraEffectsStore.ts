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
}

export const NEUTRAL_EFFECTS: CameraEffects = {
  brightness: 100, contrast: 100, saturation: 100, softFocus: 0, zoom: 100, filter: 'none', systemBlur: false,
};

/** True when processing would change the picture: anything but the original feed. */
export function effectsActive(e: CameraEffects): boolean {
  return e.brightness !== 100 || e.contrast !== 100 || e.saturation !== 100 || e.softFocus !== 0 || e.zoom !== 100 || e.filter !== 'none';
}

interface CameraEffectsState {
  effects: CameraEffects;
  /** Show the preview dialog before the camera goes live. */
  alwaysPreview: boolean;
  /** Mirror your own camera in previews (what others receive is never mirrored). */
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

/** The CSS filter string that draws `e` (canvas `ctx.filter` and preview `<video>` alike). */
export function effectsFilter(e: CameraEffects): string {
  const parts = [
    e.brightness !== 100 ? `brightness(${e.brightness / 100})` : '',
    e.contrast !== 100 ? `contrast(${e.contrast / 100})` : '',
    e.saturation !== 100 ? `saturate(${e.saturation / 100})` : '',
    FILTER_CSS[e.filter],
    e.softFocus ? `blur(${e.softFocus / 10}px)` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : 'none';
}
