import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NoiseSuppressionPicker } from './NoiseSuppressionPicker';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Track, type LocalVideoTrack } from 'livekit-client';
import { useVoiceStore } from '../../stores/voiceStore';
import { useUIStore } from '../../stores/uiStore';
import { useAudioDevices } from '../../hooks/useAudioDevices';
import { getActiveRoom } from '../../hooks/useLiveKit';
import { AudioManager } from '../../audio/AudioManager';
import { buildCameraOptions, DEFAULT_CAMERA_CONFIG, isCameraConfig } from '../../utils/cameraQuality';
import { handleCameraAction } from '../../utils/voiceActions';
import { applySystemBlur, cameraSourceTrack, systemBlurSupported, useEffectsPreview } from '../../utils/cameraEffects';
import {
  CAMERA_FILTERS,
  effectsActive,
  useCameraEffectsStore,
} from '../../stores/cameraEffectsStore';
import { Toggle } from '../ui/Toggle';
import { useCameraPreviewStore } from '../../stores/cameraPreviewStore';

// ── Shared device helpers ──────────────────────────────────────────────────

/** Video inputs, re-read when devices change. Labels appear once camera access was granted. */
export function useVideoInputs(): MediaDeviceInfo[] {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const refresh = useCallback(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then((all) => setInputs(all.filter((d) => d.kind === 'videoinput' && d.deviceId)))
      .catch(() => setInputs([]));
  }, []);
  useEffect(() => {
    refresh();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refresh);
  }, [refresh]);
  return inputs;
}

/** The live (outgoing) camera track, processed when effects run; null when the camera is off. */
function liveCameraTrack(): MediaStreamTrack | null {
  const track = getActiveRoom()?.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
  if (!track) return null;
  const processed = (track as unknown as { getProcessor?: () => { processedTrack?: MediaStreamTrack } | undefined }).getProcessor?.()?.processedTrack;
  return processed?.readyState === 'live' ? processed : track.mediaStreamTrack ?? null;
}

/** The device track behind the live camera (a processed track carries no device id or capabilities). */
function liveSourceTrack(): MediaStreamTrack | null {
  return cameraSourceTrack(getActiveRoom()?.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined);
}

function liveMicTrack(): MediaStreamTrack | null {
  const track = getActiveRoom()?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
  const mt = track?.mediaStreamTrack;
  return mt?.readyState === 'live' ? mt : null;
}

/**
 * A local camera preview. Shows the live outgoing camera when it is on (no
 * second capture); otherwise opens the chosen device for this preview only
 * and releases it on unmount. Effects are drawn by the same processor the
 * call uses (`useEffectsPreview`), so the preview is what others will see.
 * "Mirror my self-view" flips only this element. Nothing here is sent anywhere.
 */
export function CameraPreview({ deviceId, className = '', onTrack }: {
  deviceId: string | null;
  className?: string;
  /** The camera's own (unprocessed) track, for its device id and capabilities. */
  onTrack?: (track: MediaStreamTrack | null) => void;
}) {
  const { t } = useTranslation(['voice']);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  // The local tile's track: the processed one while effects run.
  const localVideo = useVoiceStore((s) => s.participants.find((p) => p.isLocal)?.videoTrack ?? null);
  const cameraConfig = useVoiceStore((s) => s.cameraConfig);
  const mirror = useCameraEffectsStore((s) => s.mirrorPreview);
  const [ownTrack, setOwnTrack] = useState<MediaStreamTrack | null>(null);
  const [failed, setFailed] = useState(false);
  const onTrackRef = useRef(onTrack);
  onTrackRef.current = onTrack;

  // The call's own camera, when one is really live. A flag alone is not
  // enough: without a live track the device is opened for the preview.
  const liveCandidate = isCameraOn ? (localVideo ?? liveCameraTrack()) : null;
  const live = liveCandidate?.readyState === 'live' ? liveCandidate : null;

  useEffect(() => {
    if (live) {
      onTrackRef.current?.(liveSourceTrack());
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    setFailed(false);
    const camera = buildCameraOptions(isCameraConfig(cameraConfig) ? cameraConfig : DEFAULT_CAMERA_CONFIG);
    const { width, height, frameRate } = camera.capture.resolution ?? {};
    navigator.mediaDevices.getUserMedia({
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        ...(width ? { width: { ideal: width } } : {}),
        ...(height ? { height: { ideal: height } } : {}),
        ...(frameRate ? { frameRate: { ideal: frameRate } } : {}),
      },
      audio: false,
    }).then((s) => {
      if (cancelled) { s.getTracks().forEach((tr) => tr.stop()); return; }
      stream = s;
      const track = s.getVideoTracks()[0] ?? null;
      setOwnTrack(track);
      onTrackRef.current?.(track);
    }).catch(() => { if (!cancelled) { setFailed(true); onTrackRef.current?.(null); } });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
      setOwnTrack(null);
      onTrackRef.current?.(null);
    };
  }, [deviceId, live, cameraConfig]);

  const processed = useEffectsPreview(live ? null : ownTrack);
  const shown = live ?? processed;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = shown ? new MediaStream([shown]) : null;
    return () => { video.srcObject = null; };
  }, [shown]);

  const state: 'loading' | 'ready' | 'error' = shown ? 'ready' : failed ? 'error' : 'loading';

  return (
    <div className={`relative overflow-hidden rounded-lg bg-black ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
      />
      {state !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-txt-tertiary text-center px-4">
          {state === 'loading' ? t('voice:devices.cameraStarting') : t('voice:devices.cameraUnavailable')}
        </div>
      )}
    </div>
  );
}

/**
 * A live input level for the chosen microphone. Uses the call's own
 * microphone track when it is live; otherwise opens the device for this
 * meter only, while it is shown.
 */
export function MicLevelMeter({ deviceId }: { deviceId: string }) {
  const barRef = useRef<HTMLDivElement>(null);
  const isLiveKitConnected = useVoiceStore((s) => s.isLiveKitConnected);
  const isMuted = useVoiceStore((s) => s.isMuted);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let cancelled = false;
    const start = (track: MediaStreamTrack) => {
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        if (barRef.current) barRef.current.style.width = `${Math.min(100, (peak / 128) * 160)}%`;
        raf = requestAnimationFrame(tick);
      };
      tick();
    };
    const live = isLiveKitConnected && !isMuted ? liveMicTrack() : null;
    if (live) start(live);
    else {
      navigator.mediaDevices.getUserMedia({ audio: deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true })
        .then((s) => {
          if (cancelled) { s.getTracks().forEach((tr) => tr.stop()); return; }
          stream = s;
          const tr = s.getAudioTracks()[0];
          if (tr) start(tr);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
      void ctx?.close().catch(() => {});
    };
  }, [deviceId, isLiveKitConnected, isMuted]);

  return (
    <div className="h-2 w-full rounded-full bg-white/[0.08] overflow-hidden" aria-hidden>
      <div ref={barRef} className="h-full w-0 rounded-full bg-gradient-to-r from-status-online via-accent-amber to-accent-rose transition-[width] duration-75" />
    </div>
  );
}

/** Sliders and filters for the camera effects. Changes reach the outgoing video live. */
export function CameraEffectsControls({ track }: { track?: MediaStreamTrack | null }) {
  const { t } = useTranslation(['voice']);
  const effects = useCameraEffectsStore((s) => s.effects);
  const setEffects = useCameraEffectsStore((s) => s.setEffects);
  const resetEffects = useCameraEffectsStore((s) => s.resetEffects);
  const mirror = useCameraEffectsStore((s) => s.mirrorPreview);
  const setMirror = useCameraEffectsStore((s) => s.setMirrorPreview);
  const blurSupported = systemBlurSupported(track);

  const slider = (key: 'brightness' | 'contrast' | 'saturation' | 'softFocus' | 'zoom', min: number, max: number) => (
    <label className="block">
      <span className="flex justify-between text-[11px] text-txt-secondary mb-0.5">
        <span>{t(`voice:effects.${key}`)}</span>
        <span className="tabular-nums text-txt-tertiary">{effects[key]}{key === 'softFocus' ? '' : '%'}</span>
      </span>
      <input type="range" min={min} max={max} value={effects[key]} onChange={(e) => setEffects({ [key]: Number(e.target.value) })} className="w-full accent-[rgb(var(--accent-primary))]" />
    </label>
  );

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1">
        {CAMERA_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setEffects({ filter: f })}
            aria-pressed={effects.filter === f}
            className={`px-2.5 py-1 rounded-full text-[11px] border ${effects.filter === f ? 'border-accent-primary bg-accent-primary/15 text-txt-primary' : 'border-white/[0.08] text-txt-secondary hover:bg-white/[0.06]'}`}
          >
            {t(`voice:effects.filters.${f}`)}
          </button>
        ))}
      </div>
      {slider('brightness', 50, 150)}
      {slider('contrast', 50, 150)}
      {slider('saturation', 0, 200)}
      {slider('softFocus', 0, 10)}
      {slider('zoom', 100, 200)}
      <div className="flex items-center justify-between text-[11px] text-txt-secondary">
        <span>{t('voice:effects.mirror')}</span>
        <Toggle enabled={mirror} onChange={setMirror} ariaLabel={t('voice:effects.mirror')} />
      </div>
      <div>
        <div className="flex items-center justify-between text-[11px] text-txt-secondary">
          <span>{t('voice:effects.mirrorOutgoing')}</span>
          <Toggle enabled={effects.mirrorOutgoing} onChange={(v) => setEffects({ mirrorOutgoing: v })} ariaLabel={t('voice:effects.mirrorOutgoing')} />
        </div>
        {effects.mirrorOutgoing && <p className="text-[10px] text-accent-amber mt-0.5">{t('voice:effects.mirrorOutgoingNote')}</p>}
      </div>
      {blurSupported && (
        <div className="flex items-center justify-between text-[11px] text-txt-secondary">
          <span>{t('voice:effects.systemBlur')}</span>
          <Toggle
            enabled={effects.systemBlur}
            onChange={(v) => { setEffects({ systemBlur: v }); void applySystemBlur(track, v); }}
            ariaLabel={t('voice:effects.systemBlur')}
          />
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-txt-tertiary">{t('voice:effects.localNote')}</span>
        <button type="button" onClick={resetEffects} disabled={!effectsActive(effects)} className="text-[11px] text-accent-primary hover:underline disabled:opacity-40 disabled:no-underline">
          {t('voice:effects.reset')}
        </button>
      </div>
    </div>
  );
}

// ── Popover shell ──────────────────────────────────────────────────────────

/**
 * A menu anchored above its trigger, rendered in a portal so no clipping
 * container cuts it off. Closes on outside click and Escape.
 */
function AnchoredMenu({ anchorRef, onClose, children, label, pinned }: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
  label: string;
  /** Stays in view above the scrolling content (the camera preview). */
  pinned?: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const width = menuRef.current?.offsetWidth ?? 320;
      if (!anchor) return;
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchor.left + anchor.width / 2 - width / 2));
      setPos({ left, bottom: window.innerHeight - anchor.top + 8 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="dialog"
      aria-label={label}
      className="fixed z-[300] w-[320px] max-h-[min(560px,calc(calc(100*var(--app-vh))-96px))] flex flex-col overflow-hidden rounded-xl glass-modal border border-white/[0.08] shadow-2xl animate-fade-in"
      style={pos ? { left: pos.left, bottom: pos.bottom } : { left: -9999, bottom: 0 }}
    >
      {/* The menu itself never scrolls: its glass layer covers only its own
          box, so a scrolling menu showed through once scrolled. Only the
          inner list scrolls, under the pinned part. */}
      {pinned && <div className="shrink-0 px-3 pt-3">{pinned}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-3">{children}</div>
    </div>,
    document.body,
  );
}

function MenuHeading({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-txt-tertiary mb-1.5">{children}</div>;
}

function DeviceOption({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[13px] ${selected ? 'bg-accent-primary/15 text-txt-primary' : 'text-txt-secondary hover:bg-white/[0.06] hover:text-txt-primary'}`}
    >
      <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 ${selected ? 'border-accent-primary bg-accent-primary shadow-[inset_0_0_0_2px_rgb(var(--bg-elevated) / 0.9)]' : 'border-white/30'}`} />
      <span className="truncate">{label}</span>
    </button>
  );
}

const outputSupported = typeof window !== 'undefined'
  && ('setSinkId' in HTMLMediaElement.prototype || (typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype));

function openVoiceSettings() {
  useUIStore.getState().openModal('userSettings', { tab: 'voice' });
}

// ── Microphone + speaker menu ──────────────────────────────────────────────

export function AudioDeviceMenu({ anchorRef, onClose }: { anchorRef: React.RefObject<HTMLElement | null>; onClose: () => void }) {
  const { t } = useTranslation(['voice', 'common']);
  const { permState, inputs, outputs, inputLabels, outputLabels, requestPermission } = useAudioDevices();
  const inputDeviceId = useVoiceStore((s) => s.inputDeviceId);
  const outputDeviceId = useVoiceStore((s) => s.outputDeviceId);
  const setInputDevice = useVoiceStore((s) => s.setInputDevice);
  const setOutputDevice = useVoiceStore((s) => s.setOutputDevice);

  return (
    <AnchoredMenu anchorRef={anchorRef} onClose={onClose} label={t('voice:devices.audioMenu')}>
      {permState !== 'granted' ? (
        <div className="text-xs text-txt-secondary space-y-2">
          <p>{permState === 'denied' ? t('voice:devices.micDenied') : t('voice:devices.micPrompt')}</p>
          {permState !== 'denied' && (
            <button type="button" onClick={() => void requestPermission()} className="px-3 py-1.5 rounded-md bg-accent-primary text-on-accent text-xs font-medium">
              {t('voice:devices.allow')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <MenuHeading>{t('voice:devices.microphone')}</MenuHeading>
            <div role="menu">
              {inputs.map((d) => (
                <DeviceOption key={d.deviceId} selected={inputDeviceId === d.deviceId} label={inputLabels.get(d.deviceId) ?? d.label} onClick={() => setInputDevice(d.deviceId)} />
              ))}
            </div>
            <div className="mt-2">
              <div className="text-[11px] text-txt-tertiary mb-1">{t('voice:devices.inputLevel')}</div>
              <MicLevelMeter deviceId={inputDeviceId} />
            </div>
          </div>
          <div>
            <MenuHeading>{t('voice:noise.title')}</MenuHeading>
            <NoiseSuppressionPicker compact />
          </div>
          <div>
            <MenuHeading>{t('voice:devices.speakers')}</MenuHeading>
            {outputSupported ? (
              <div role="menu">
                {outputs.map((d) => (
                  <DeviceOption key={d.deviceId} selected={outputDeviceId === d.deviceId} label={outputLabels.get(d.deviceId) ?? d.label} onClick={() => setOutputDevice(d.deviceId)} />
                ))}
                <button type="button" onClick={() => void AudioManager.getInstance().playTestTone()} className="mt-1.5 text-[11px] text-accent-primary hover:underline">
                  {t('voice:devices.testSpeakers')}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-txt-tertiary">{t('voice:devices.outputUnsupported')}</p>
            )}
          </div>
        </div>
      )}
      <button type="button" onClick={() => { onClose(); openVoiceSettings(); }} className="mt-3 w-full text-left text-[12px] text-txt-secondary hover:text-txt-primary border-t border-white/[0.06] pt-2">
        {t('voice:devices.audioSettings')}
      </button>
    </AnchoredMenu>
  );
}

// ── Camera menu ────────────────────────────────────────────────────────────

export function CameraDeviceMenu({ anchorRef, onClose }: { anchorRef: React.RefObject<HTMLElement | null>; onClose: () => void }) {
  const { t } = useTranslation(['voice', 'common']);
  const cameras = useVideoInputs();
  const cameraDeviceId = useVoiceStore((s) => s.cameraDeviceId);
  const setCameraDeviceId = useVoiceStore((s) => s.setCameraDeviceId);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const [showEffects, setShowEffects] = useState(false);
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  // The device behind the live camera (a processed track carries no device id).
  const sourceId = isCameraOn
    ? liveSourceTrack()?.getSettings().deviceId
    : track?.getSettings().deviceId;
  const activeId = cameraDeviceId ?? (sourceId || null);

  return (
    <AnchoredMenu
      anchorRef={anchorRef}
      onClose={onClose}
      label={t('voice:devices.cameraMenu')}
      pinned={<CameraPreview deviceId={cameraDeviceId} className="aspect-video w-full" onTrack={setTrack} />}
    >
      <MenuHeading>{t('voice:devices.camera')}</MenuHeading>
      <div role="menu">
        {cameras.length === 0 && <p className="text-[11px] text-txt-tertiary">{t('voice:devices.noCameras')}</p>}
        {cameras.map((d, i) => (
          <DeviceOption
            key={d.deviceId}
            selected={activeId === d.deviceId || (!activeId && i === 0)}
            label={d.label || t('voice:devices.cameraN', { n: i + 1 })}
            onClick={() => setCameraDeviceId(d.deviceId)}
          />
        ))}
      </div>
      {isCameraOn && <p className="text-[10px] text-txt-tertiary mt-1">{t('voice:devices.switchLive')}</p>}
      <button type="button" onClick={() => setShowEffects((v) => !v)} aria-expanded={showEffects} className="mt-3 w-full flex items-center justify-between text-[12px] text-txt-secondary hover:text-txt-primary">
        <span>{t('voice:effects.title')}</span>
        <span aria-hidden>{showEffects ? '▴' : '▾'}</span>
      </button>
      {showEffects && <div className="mt-2"><CameraEffectsControls track={track} /></div>}
      <button type="button" onClick={() => { onClose(); openVoiceSettings(); }} className="mt-3 w-full text-left text-[12px] text-txt-secondary hover:text-txt-primary border-t border-white/[0.06] pt-2">
        {t('voice:devices.cameraSettings')}
      </button>
    </AnchoredMenu>
  );
}

/** The small arrow beside a call button that opens its device menu. */
export const MenuArrowButton = React.forwardRef<HTMLButtonElement, { open: boolean; onClick: () => void; label: string; className?: string }>(
  function MenuArrowButton({ open, onClick, label, className = '' }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`flex items-center justify-center rounded-full transition-colors text-txt-tertiary hover:text-txt-primary hover:bg-surface-elevated ${open ? 'text-txt-primary bg-surface-elevated' : ''} ${className}`}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined }}>
          <path d="M7 14l5-5 5 5z" />
        </svg>
      </button>
    );
  },
);

// ── Camera preview before going live ───────────────────────────────────────

/**
 * Turn the camera on or off from a call button. Turning it on shows the
 * local preview first (unless the user switched that off); off is immediate.
 * Keybinds call `handleCameraAction` directly and skip the preview.
 */
export function requestCameraToggle(): void {
  if (useVoiceStore.getState().isCameraOn || !useCameraEffectsStore.getState().alwaysPreview) {
    void handleCameraAction();
    return;
  }
  useCameraPreviewStore.getState().open('camera', () => void handleCameraAction());
}

/**
 * The pre-broadcast check: camera preview with device choice and effects,
 * microphone level, speakers. Everything stays on this device until Start.
 */
export function CameraPreviewDialog() {
  const { t } = useTranslation(['voice', 'common']);
  const onConfirm = useCameraPreviewStore((s) => s.onConfirm);
  const mode = useCameraPreviewStore((s) => s.mode);
  const close = useCameraPreviewStore((s) => s.close);
  const cameras = useVideoInputs();
  const cameraDeviceId = useVoiceStore((s) => s.cameraDeviceId);
  const setCameraDeviceId = useVoiceStore((s) => s.setCameraDeviceId);
  const inputDeviceId = useVoiceStore((s) => s.inputDeviceId);
  const setInputDevice = useVoiceStore((s) => s.setInputDevice);
  const outputDeviceId = useVoiceStore((s) => s.outputDeviceId);
  const setOutputDevice = useVoiceStore((s) => s.setOutputDevice);
  const alwaysPreview = useCameraEffectsStore((s) => s.alwaysPreview);
  const setAlwaysPreview = useCameraEffectsStore((s) => s.setAlwaysPreview);
  const { permState, inputs, outputs, inputLabels, outputLabels } = useAudioDevices();
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [starting, setStarting] = useState(false);
  const isOpen = onConfirm !== null;

  useEffect(() => { if (!isOpen) setStarting(false); }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const handleStart = () => {
    const confirm = onConfirm;
    // Release the preview's camera before the call opens it: many capture
    // devices (DSLR capture cards among them) allow one reader at a time.
    setStarting(true);
    close();
    setTimeout(() => confirm?.(), 50);
  };

  const selectedCamera = cameraDeviceId ?? track?.getSettings().deviceId ?? cameras[0]?.deviceId ?? '';
  const selectClass = 'w-full input-search px-2.5 py-1.5 rounded-md text-[13px] bg-surface-input';

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      {/* Only the controls column scrolls; the preview stays in view (and the
          dialog's glass layer, which covers only the dialog's own box, never
          scrolls away behind it). */}
      <div role="dialog" aria-modal="true" aria-label={t('voice:preview.title')} className="relative w-full max-w-[760px] max-h-[calc(calc(100*var(--app-vh))-2rem)] flex flex-col overflow-hidden glass-modal rounded-2xl border border-white/[0.08] p-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-txt-primary shrink-0">{mode === 'call' ? t('voice:preview.callTitle') : t('voice:preview.title')}</h2>
        <p className="text-xs text-txt-tertiary mt-0.5 shrink-0">{t('voice:preview.privateNote')}</p>
        <div className="mt-4 min-h-0 flex-1 flex flex-col desktop:grid desktop:grid-cols-[1fr_260px] gap-4">
          <div className="shrink-0">
            {!starting && <CameraPreview deviceId={cameraDeviceId} className="aspect-video w-full" onTrack={setTrack} />}
            <label className="block mt-3">
              <span className="text-[11px] text-txt-secondary">{t('voice:devices.camera')}</span>
              <select value={selectedCamera} onChange={(e) => setCameraDeviceId(e.target.value || null)} className={selectClass}>
                {cameras.length === 0 && <option value="">{t('voice:devices.noCameras')}</option>}
                {cameras.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || t('voice:devices.cameraN', { n: i + 1 })}</option>)}
              </select>
            </label>
          </div>
          <div className="min-h-0 overflow-y-auto scrollbar-thin space-y-4 desktop:pr-1">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-txt-tertiary mb-2">{t('voice:effects.title')}</div>
              <CameraEffectsControls track={track} />
            </div>
            {permState === 'granted' && (
              <>
                <label className="block">
                  <span className="text-[11px] text-txt-secondary">{t('voice:devices.microphone')}</span>
                  <select value={inputDeviceId} onChange={(e) => setInputDevice(e.target.value)} className={selectClass}>
                    {inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{inputLabels.get(d.deviceId) ?? d.label}</option>)}
                  </select>
                  <div className="mt-1.5"><MicLevelMeter deviceId={inputDeviceId} /></div>
                </label>
                {outputSupported && (
                  <label className="block">
                    <span className="text-[11px] text-txt-secondary">{t('voice:devices.speakers')}</span>
                    <select value={outputDeviceId} onChange={(e) => setOutputDevice(e.target.value)} className={selectClass}>
                      {outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{outputLabels.get(d.deviceId) ?? d.label}</option>)}
                    </select>
                  </label>
                )}
              </>
            )}
          </div>
        </div>
        <div className="mt-5 shrink-0 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-txt-secondary">
            <Toggle enabled={alwaysPreview} onChange={setAlwaysPreview} ariaLabel={t('voice:preview.always')} />
            {t('voice:preview.always')}
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={close} className="px-4 py-2 rounded-full text-sm text-txt-secondary hover:text-txt-primary">{t('common:actions.cancel')}</button>
            <button type="button" onClick={handleStart} className="px-5 py-2 rounded-full text-sm font-medium text-on-accent emix-gradient-button">
              {mode === 'call' ? t('voice:preview.startCall') : t('voice:preview.start')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
