import { VideoPreset, type TrackPublishOptions, type VideoCaptureOptions } from 'livekit-client';
import type { OverdriveOptions } from './screenShare';

/**
 * Emix webcam quality presets. Upstream published every camera at a fixed
 * 1280x720 30 fps H.264 capped at 2 Mbps, which downscaled any better camera.
 *
 * The capture request is an `ideal` constraint (livekit-client), so a camera
 * that cannot deliver the chosen size falls back to the closest it offers
 * rather than failing; nothing is ever upscaled to reach the preset.
 *
 * H.264 is kept: it is the codec Windows GPUs encode in hardware (NVENC,
 * Quick Sync, AMF via Media Foundation) at every preset including 2160p.
 * Simulcast is kept so a receiver on a weaker link or a small tile gets a
 * lower layer instead of stalling the call.
 */
export type CameraHeight = 720 | 1080 | 1440 | 2160;
export type CameraFps = 30 | 60;
export type CameraQuality = 'balanced' | 'high' | 'max';

export interface CameraConfig {
  height: CameraHeight;
  fps: CameraFps;
  quality: CameraQuality;
}

export const CAMERA_HEIGHTS: readonly CameraHeight[] = [720, 1080, 1440, 2160];
export const CAMERA_FRAMERATES: readonly CameraFps[] = [30, 60];
export const CAMERA_QUALITIES: readonly CameraQuality[] = ['balanced', 'high', 'max'];

export const DEFAULT_CAMERA_CONFIG: CameraConfig = { height: 1080, fps: 30, quality: 'high' };

const WIDTH: Record<CameraHeight, number> = { 720: 1280, 1080: 1920, 1440: 2560, 2160: 3840 };

/** Top-layer H.264 bitrate in kbps at the "high" level. */
const BASE_KBPS: Record<CameraHeight, Record<CameraFps, number>> = {
  720: { 30: 2_500, 60: 4_000 },
  1080: { 30: 5_000, 60: 8_000 },
  1440: { 30: 9_000, 60: 14_000 },
  2160: { 30: 16_000, 60: 25_000 },
};

const QUALITY_FACTOR: Record<CameraQuality, number> = { balanced: 0.6, high: 1, max: 1.6 };

export function cameraBitrateKbps(cfg: CameraConfig): number {
  return Math.round(BASE_KBPS[cfg.height][cfg.fps] * QUALITY_FACTOR[cfg.quality]);
}

/** Lower simulcast layers (lowest first); the preset itself is the top layer. */
function simulcastLayers(cfg: CameraConfig): VideoPreset[] {
  const fps = cfg.fps;
  const layer = (w: number, h: number, kbps: number) => new VideoPreset(w, h, kbps * 1000, fps);
  switch (cfg.height) {
    case 720: return [layer(320, 180, 200), layer(640, 360, 600)];
    case 1080: return [layer(640, 360, 600), layer(1280, 720, 1_800)];
    case 1440: return [layer(640, 360, 600), layer(1280, 720, 2_000)];
    case 2160: return [layer(960, 540, 1_000), layer(1920, 1080, 4_500)];
  }
}

export function isCameraConfig(v: unknown): v is CameraConfig {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return CAMERA_HEIGHTS.includes(c.height as CameraHeight)
    && CAMERA_FRAMERATES.includes(c.fps as CameraFps)
    && CAMERA_QUALITIES.includes(c.quality as CameraQuality);
}

export function buildCameraOptions(cfg: CameraConfig): {
  capture: VideoCaptureOptions;
  publish: TrackPublishOptions;
  overdrive: OverdriveOptions;
} {
  const maxBitrate = cameraBitrateKbps(cfg) * 1000;
  return {
    capture: { resolution: { width: WIDTH[cfg.height], height: cfg.height, frameRate: cfg.fps } },
    publish: {
      videoCodec: 'h264',
      videoEncoding: { maxBitrate, maxFramerate: cfg.fps },
      simulcast: true,
      videoSimulcastLayers: simulcastLayers(cfg),
      degradationPreference: 'balanced',
    },
    overdrive: { maxBitrate, maxFramerate: cfg.fps, degradationPreference: 'balanced' },
  };
}
