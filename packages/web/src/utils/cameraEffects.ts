import { Track, type LocalVideoTrack, type TrackProcessor, type VideoProcessorOptions } from 'livekit-client';
import { getActiveRoom, refreshVoiceParticipants } from '../hooks/useLiveKit';
import { useVoiceStore } from '../stores/voiceStore';
import { useEffect, useState } from 'react';
import {
  effectsActive,
  effectsColorFilter,
  softFocusLayer,
  useCameraEffectsStore,
  type CameraEffects,
} from '../stores/cameraEffectsStore';

/**
 * Camera effects, processed locally in the browser: brightness, contrast,
 * saturation, colour filters, soft focus, a centred digital zoom and the
 * optional outgoing mirror, drawn
 * frame by frame onto a canvas whose stream replaces the outgoing camera.
 * Nothing leaves the device except the resulting video.
 *
 * With every effect at its neutral value no processor runs and the camera's
 * own track is sent untouched, at full quality; turning effects back to
 * neutral (or Reset) removes the processor again. The output canvas keeps
 * the source's resolution and frame rate, so a 4K DSLR feed stays 4K.
 */
export class CameraEffectsProcessor implements TrackProcessor<Track.Kind.Video, VideoProcessorOptions> {
  name = 'emix-camera-effects';
  processedTrack?: MediaStreamTrack;
  private effects: CameraEffects;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private running = false;
  private frameHandle = 0;

  constructor(effects: CameraEffects) {
    this.effects = effects;
  }

  setEffects(effects: CameraEffects): void {
    this.effects = effects;
  }

  async init(opts: VideoProcessorOptions): Promise<void> {
    const settings = opts.track.getSettings();
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([opts.track]);
    await video.play().catch(() => {});
    const canvas = document.createElement('canvas');
    canvas.width = settings.width ?? (video.videoWidth || 1280);
    canvas.height = settings.height ?? (video.videoHeight || 720);
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.video = video;
    this.canvas = canvas;
    this.ctx = ctx;
    this.processedTrack = canvas.captureStream(settings.frameRate ?? 30).getVideoTracks()[0];
    this.running = true;
    this.schedule();
  }

  async restart(opts: VideoProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    this.running = false;
    if (this.video && 'cancelVideoFrameCallback' in this.video) this.video.cancelVideoFrameCallback(this.frameHandle);
    else cancelAnimationFrame(this.frameHandle);
    this.processedTrack?.stop();
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
  }

  private schedule(): void {
    const video = this.video;
    if (!this.running || !video) return;
    // Draw once per camera frame where the browser can say when one arrives.
    if ('requestVideoFrameCallback' in video) this.frameHandle = video.requestVideoFrameCallback(() => this.draw());
    else this.frameHandle = requestAnimationFrame(() => this.draw());
  }

  private draw(): void {
    const { video, canvas, ctx } = this;
    if (!this.running || !video || !canvas || !ctx) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw && vh) {
      if (canvas.width !== vw || canvas.height !== vh) { canvas.width = vw; canvas.height = vh; }
      const e = this.effects;
      const scale = e.zoom / 100;
      const sw = vw / scale;
      const sh = vh / scale;
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;
      const colour = effectsColorFilter(e);
      // What others receive is mirrored only when asked for explicitly.
      ctx.setTransform(e.mirrorOutgoing ? -1 : 1, 0, 0, 1, e.mirrorOutgoing ? vw : 0, 0);
      ctx.globalAlpha = 1;
      ctx.filter = colour;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, vw, vh);
      const soft = softFocusLayer(e.softFocus, vw);
      if (soft) {
        ctx.globalAlpha = soft.alpha;
        ctx.filter = `${colour === 'none' ? '' : `${colour} `}blur(${soft.radius.toFixed(1)}px)`;
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, vw, vh);
        ctx.globalAlpha = 1;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.schedule();
  }
}

function cameraTrack(): LocalVideoTrack | null {
  const room = getActiveRoom();
  const pub = room?.localParticipant.getTrackPublication(Track.Source.Camera);
  return (pub?.track as LocalVideoTrack | undefined) ?? null;
}

/** Whether the camera offers the operating system's background blur (Chrome `backgroundBlur`). */
export function systemBlurSupported(track: MediaStreamTrack | null | undefined): boolean {
  const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { backgroundBlur?: boolean[] }) | undefined;
  return !!caps?.backgroundBlur?.includes(true);
}

/** Apply (or clear) the system background blur on `track` where it is offered. */
export async function applySystemBlur(track: MediaStreamTrack | null | undefined, on: boolean): Promise<void> {
  if (!track || !systemBlurSupported(track)) return;
  try {
    await track.applyConstraints({ advanced: [{ backgroundBlur: on } as MediaTrackConstraintSet] });
  } catch (err) {
    console.warn('[cameraEffects] background blur not applied:', err);
  }
}

/**
 * A processor for a camera that is about to be created, or undefined when
 * every effect is neutral. Passed as the capture `processor`, so the very
 * first frame others receive already carries the effects; LiveKit keeps it
 * across camera switches (`restartTrack` restarts the processor).
 */
export function cameraProcessorForCapture(): CameraEffectsProcessor | undefined {
  const { effects } = useCameraEffectsStore.getState();
  return effectsActive(effects) ? new CameraEffectsProcessor(effects) : undefined;
}

/**
 * `track` as it will look with the current effects, drawn by the same
 * processor the call uses, so a preview shows exactly what will be sent.
 * Returns `track` itself while every effect is neutral.
 */
export function useEffectsPreview(track: MediaStreamTrack | null): MediaStreamTrack | null {
  const effects = useCameraEffectsStore((s) => s.effects);
  const active = effectsActive(effects);
  const [processor, setProcessor] = useState<CameraEffectsProcessor | null>(null);

  useEffect(() => {
    if (!track || !active) { setProcessor(null); return; }
    const proc = new CameraEffectsProcessor(useCameraEffectsStore.getState().effects);
    let cancelled = false;
    proc.init({ kind: Track.Kind.Video, track })
      .then(() => { if (cancelled) void proc.destroy(); else setProcessor(proc); })
      .catch(() => { void proc.destroy(); });
    return () => { cancelled = true; setProcessor(null); void proc.destroy(); };
  }, [track, active]);

  useEffect(() => { processor?.setEffects(effects); }, [processor, effects]);

  return active ? processor?.processedTrack ?? null : track;
}

let syncing: Promise<void> = Promise.resolve();

/**
 * Bring the live camera track in line with the current effects: start the
 * processor, update it in place, or stop it when everything is neutral.
 * Serialized, so rapid slider moves never race two processors.
 */
export function syncCameraEffects(): Promise<void> {
  syncing = syncing.then(async () => {
    const track = cameraTrack();
    if (!track || !useVoiceStore.getState().isCameraOn) return;
    const { effects } = useCameraEffectsStore.getState();
    await applySystemBlur(track.mediaStreamTrack, effects.systemBlur);
    const current = track.getProcessor() as CameraEffectsProcessor | undefined;
    try {
      if (!effectsActive(effects)) {
        if (current) { await track.stopProcessor(); refreshVoiceParticipants(); }
      } else if (current instanceof CameraEffectsProcessor) {
        current.setEffects(effects);
      } else {
        await track.setProcessor(new CameraEffectsProcessor(effects), true);
        refreshVoiceParticipants();
      }
    } catch (err) {
      // The original feed keeps going: effects are optional.
      console.error('[cameraEffects] could not apply camera effects:', err);
      await track.stopProcessor().catch(() => {});
      refreshVoiceParticipants();
    }
  });
  return syncing;
}

let installed = false;

/** Keep the live camera in sync with the effects and the camera's on/off state. Called once at startup. */
export function installCameraEffectsSync(): void {
  if (installed) return;
  installed = true;
  useCameraEffectsStore.subscribe((s, prev) => { if (s.effects !== prev.effects) void syncCameraEffects(); });
  useVoiceStore.subscribe((s, prev) => {
    // A camera turned on (its processor came with it; this covers the system
    // blur) or switched to another device (the blur constraint belongs to the
    // old device's track).
    const turnedOn = s.isCameraOn && !prev.isCameraOn;
    const switched = s.isCameraOn && s.cameraDeviceId !== prev.cameraDeviceId;
    if (turnedOn || switched) setTimeout(() => void syncCameraEffects(), turnedOn ? 300 : 1200);
  });
}
