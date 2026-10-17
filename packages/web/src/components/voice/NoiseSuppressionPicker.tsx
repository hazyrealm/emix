import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NOISE_SUPPRESSION_LEVELS, useVoiceStore, type NoiseSuppressionLevel } from '../../stores/voiceStore';
import { AudioManager } from '../../audio/AudioManager';

const LEVEL_LABEL = {
  off: 'voice:noise.levels.off',
  low: 'voice:noise.levels.low',
  medium: 'voice:noise.levels.medium',
  high: 'voice:noise.levels.high',
} as const satisfies Record<NoiseSuppressionLevel, string>;

const LEVEL_HINT = {
  off: 'voice:noise.hints.off',
  low: 'voice:noise.hints.low',
  medium: 'voice:noise.hints.medium',
  high: 'voice:noise.hints.high',
} as const satisfies Record<NoiseSuppressionLevel, string>;

/** Off / Low / Medium / High. Applies at once, in a call too. */
export function NoiseSuppressionPicker({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation(['voice']);
  const level = useVoiceStore((s) => s.noiseSuppressionLevel);
  const setLevel = useVoiceStore((s) => s.setNoiseSuppressionLevel);
  return (
    <div>
      <div role="radiogroup" aria-label={t('voice:noise.title')} className="grid grid-cols-4 gap-1 rounded-lg bg-surface-base p-1">
        {NOISE_SUPPRESSION_LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={level === l}
            onClick={() => setLevel(l)}
            className={`rounded-md py-1.5 ${compact ? 'text-[11px]' : 'text-xs'} font-medium transition-colors ${
              level === l ? 'bg-accent-primary text-on-accent' : 'text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover'
            }`}
          >
            {t(LEVEL_LABEL[l])}
          </button>
        ))}
      </div>
      <p className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-txt-tertiary mt-1.5 leading-snug`}>{t(LEVEL_HINT[level])}</p>
    </div>
  );
}

/** Apply the saved processing settings to the microphone pipeline (outside a call). */
async function applyProcessing(am: AudioManager): Promise<void> {
  const s = useVoiceStore.getState();
  am.setVoiceProcessing({
    echoCancellation: s.echoCancellation,
    noiseSuppression: s.noiseSuppressionLevel !== 'off',
    autoGainControl: s.autoGainControl,
  });
  await am.setRnnoiseEnabled(s.noiseSuppressionLevel === 'medium' || s.noiseSuppressionLevel === 'high');
  await am.setNoiseGate(s.noiseSuppressionLevel === 'high');
}

/**
 * Mic test: hear yourself through the same processing a call uses, switch
 * levels while listening to compare them. Nothing is recorded or sent.
 */
export function MicTest() {
  const { t } = useTranslation(['voice']);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [level, setLevel] = useState(0);
  const inCall = useVoiceStore((s) => !!s.currentVoiceChannelId);
  const settingsKey = useVoiceStore((s) => `${s.noiseSuppressionLevel}|${s.echoCancellation}|${s.autoGainControl}|${s.inputDeviceId}|${s.inputVolume}`);
  const frame = useRef(0);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const am = AudioManager.getInstance();
    (async () => {
      try {
        await am.resumeContext();
        // In a call the call's own pipeline is already configured; only listen.
        if (!useVoiceStore.getState().currentVoiceChannelId) {
          await applyProcessing(am);
          await am.setInputDevice(useVoiceStore.getState().inputDeviceId);
          am.setInputVolume(useVoiceStore.getState().inputVolume);
        }
        if (cancelled) return;
        am.setMonitor(true);
        const analyser = am.getAnalyserNode();
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 100));
          frame.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (!cancelled) { setFailed(true); setRunning(false); }
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame.current);
      am.setMonitor(false);
      if (!useVoiceStore.getState().currentVoiceChannelId) am.releaseInputStream();
      setLevel(0);
    };
  }, [running, settingsKey]);

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { setFailed(false); setRunning((v) => !v); }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium ${running ? 'bg-accent-rose text-on-accent' : 'bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary'}`}
        >
          {running ? t('voice:noise.test.stop') : t('voice:noise.test.start')}
        </button>
        <div className="flex-1 h-2 rounded-full bg-white/[0.08] overflow-hidden" aria-hidden>
          <div className="h-full bg-status-online transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
      </div>
      <p className="text-[11px] text-txt-tertiary mt-1.5">
        {failed ? t('voice:noise.test.failed') : inCall ? t('voice:noise.test.inCall') : t('voice:noise.test.hint')}
      </p>
    </div>
  );
}
