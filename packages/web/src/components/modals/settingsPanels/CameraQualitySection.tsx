import { useEffect, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoiceStore } from '../../../stores/voiceStore';
import {
  CAMERA_FRAMERATES, CAMERA_HEIGHTS, CAMERA_QUALITIES, cameraBitrateKbps,
  DEFAULT_CAMERA_CONFIG, isCameraConfig, type CameraConfig,
} from '../../../utils/cameraQuality';
import { handleCameraAction } from '../../../utils/voiceActions';

interface TrackInfo {
  capW: number | null;
  capH: number | null;
  capFps: number | null;
  w: number | null;
  h: number | null;
  fps: number | null;
}

function readTrack(video: HTMLVideoElement | null): TrackInfo | null {
  const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') return null;
  const s = track.getSettings();
  const c = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
  const max = (r: unknown) => (r && typeof r === 'object' && 'max' in r ? Number((r as { max?: number }).max) || null : null);
  return {
    capW: max((c as MediaTrackCapabilities).width), capH: max((c as MediaTrackCapabilities).height),
    capFps: max((c as MediaTrackCapabilities).frameRate),
    w: s.width ?? null, h: s.height ?? null, fps: s.frameRate ? Math.round(s.frameRate) : null,
  };
}

const LABEL: Record<number, string> = { 720: '720p', 1080: '1080p', 1440: '1440p', 2160: '4K' };

/**
 * Emix webcam quality: preset resolution, frame rate and bitrate level, plus
 * what the selected camera reports it can deliver and what it is delivering.
 * The capability line is the honest answer to "is this camera really 4K":
 * a camera (or its USB/capture bridge) that exposes at most 1080p reports so
 * here, and the preset then falls back to it instead of upscaling.
 */
export function CameraQualitySection({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) {
  const { t } = useTranslation('settings');
  const stored = useVoiceStore((s) => s.cameraConfig);
  const setCameraConfig = useVoiceStore((s) => s.setCameraConfig);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const cfg: CameraConfig = isCameraConfig(stored) ? stored : DEFAULT_CAMERA_CONFIG;
  const [info, setInfo] = useState<TrackInfo | null>(null);
  const [applying, setApplying] = useState(false);
  const [dirtyInCall, setDirtyInCall] = useState(false);

  useEffect(() => {
    const tick = () => setInfo(readTrack(videoRef.current));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [videoRef]);

  const update = (patch: Partial<CameraConfig>) => {
    setCameraConfig(patch);
    if (isCameraOn) setDirtyInCall(true);
  };

  const applyNow = async () => {
    setApplying(true);
    try {
      await handleCameraAction(); // off
      await handleCameraAction(); // on, with the new preset
      setDirtyInCall(false);
    } finally {
      setApplying(false);
    }
  };

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
      active ? 'bg-accent-primary text-white' : 'bg-white/[0.04] text-txt-secondary hover:bg-white/[0.08] hover:text-txt-primary'
    }`;

  const cameraMax = info?.capW && info?.capH ? `${info.capW}×${info.capH}${info.capFps ? ` @ ${Math.round(info.capFps)} fps` : ''}` : null;
  const belowPreset = info?.capH != null && info.capH < cfg.height;

  return (
    <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-3">
      <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">{t('voice.video.quality.title')}</div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-xs text-txt-tertiary">{t('voice.video.quality.resolution')}</span>
        {CAMERA_HEIGHTS.map((h) => (
          <button key={h} type="button" className={pill(cfg.height === h)} aria-pressed={cfg.height === h} onClick={() => update({ height: h })}>
            {LABEL[h]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-xs text-txt-tertiary">{t('voice.video.quality.frameRate')}</span>
        {CAMERA_FRAMERATES.map((f) => (
          <button key={f} type="button" className={pill(cfg.fps === f)} aria-pressed={cfg.fps === f} onClick={() => update({ fps: f })}>
            {t('voice.video.quality.fps', { fps: f })}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-xs text-txt-tertiary">{t('voice.video.quality.level')}</span>
        {CAMERA_QUALITIES.map((q) => (
          <button key={q} type="button" className={pill(cfg.quality === q)} aria-pressed={cfg.quality === q} onClick={() => update({ quality: q })}>
            {t(`voice.video.quality.levels.${q}`)}
          </button>
        ))}
      </div>

      <div className="rounded-md bg-surface-base/60 border border-white/[0.04] px-3 py-2 text-xs text-txt-tertiary space-y-1">
        <div>{t('voice.video.quality.target', { res: LABEL[cfg.height], fps: cfg.fps, mbps: (cameraBitrateKbps(cfg) / 1000).toFixed(1) })}</div>
        {cameraMax && <div>{t('voice.video.quality.cameraMax', { value: cameraMax })}</div>}
        {info?.w && info?.h && (
          <div>{t('voice.video.quality.capturing', { value: `${info.w}×${info.h}${info.fps ? ` @ ${info.fps} fps` : ''}` })}</div>
        )}
        {belowPreset && <div className="text-txt-warning">{t('voice.video.quality.belowPreset')}</div>}
        {!info && <div>{t('voice.video.quality.startPreview')}</div>}
        <div>{t('voice.video.quality.adaptive')}</div>
      </div>

      {isCameraOn && dirtyInCall && (
        <button
          type="button"
          onClick={() => void applyNow()}
          disabled={applying}
          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-accent-primary text-white hover:bg-accent-primary-hover disabled:opacity-50"
        >
          {t('voice.video.quality.applyNow')}
        </button>
      )}
    </div>
  );
}
