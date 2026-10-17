import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BUILTIN_RINGTONE_IDS, DEFAULT_RINGTONE_SETTINGS, RINGTONE_MAX_PER_USER, RINGTONE_MAX_SECONDS, RINGTONE_MAX_UPLOAD_BYTES,
  type BuiltinRingtoneId, type CallerPlays, type FriendRingtone, type RingtoneRef, type RingtoneSettings,
} from '@backspace/shared/src/ringtones';
import { useRingtoneStore } from '../../../stores/ringtoneStore';
import { useSocialStore } from '../../../stores/socialStore';
import { useUIStore } from '../../../stores/uiStore';
import { describeError } from '../../../i18n/errors';
import { Toggle } from '../../ui/Toggle';
import { previewRingtone, stopRingtonePreview, type RingDirection } from '../../../utils/ringtonePlayback';
import { AUTO_AWAY_CHOICES, usePresencePrefs, type AutoAwayMinutes } from '../../../utils/autoAway';

const BUILTIN_LABEL = {
  aurora: 'settings:notifications.builtin.aurora',
  marimba: 'settings:notifications.builtin.marimba',
  pulse: 'settings:notifications.builtin.pulse',
  retro: 'settings:notifications.builtin.retro',
  bells: 'settings:notifications.builtin.bells',
} as const satisfies Record<BuiltinRingtoneId, string>;

const CALLER_PLAYS_LABEL = {
  mine: 'settings:notifications.callerPlays.mine',
  theirs: 'settings:notifications.callerPlays.theirs',
  none: 'settings:notifications.callerPlays.none',
} as const satisfies Record<CallerPlays, string>;

const encode = (ref: RingtoneRef | null): string => (!ref ? 'none' : ref.kind === 'builtin' || ref.kind === 'custom' ? `${ref.kind}:${ref.id}` : ref.kind);
function decode(value: string): RingtoneRef | null {
  if (value === 'none') return null;
  if (value === 'default' || value === 'silent') return { kind: value };
  const [kind, id = ''] = value.split(':');
  if (kind === 'builtin') return { kind: 'builtin', id: id as BuiltinRingtoneId };
  return { kind: 'custom', id };
}

const sectionTitle = 'text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-1.5';
const card = 'rounded-lg bg-white/[0.03] border border-white/[0.04] p-3.5';
const selectClass = 'input-standard w-full appearance-none';
const smallButton = 'px-3 py-1.5 rounded-md text-xs bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary disabled:opacity-50 whitespace-nowrap';

function RingtoneSelect({ value, onChange, mode, label }: {
  value: RingtoneRef | null;
  onChange: (ref: RingtoneRef | null) => void;
  /** 'ring': default + silent offered; 'share': only real sounds, or none. */
  mode: 'ring' | 'share' | 'inherit';
  label: string;
}) {
  const { t } = useTranslation(['settings']);
  const mine = useRingtoneStore((s) => s.mine);
  return (
    <select aria-label={label} value={encode(value)} onChange={(e) => onChange(decode(e.target.value))} className={selectClass}>
      {mode === 'share' && <option value="none">{t('settings:notifications.shared.none')}</option>}
      {mode === 'inherit' && <option value="none">{t('settings:notifications.friends.useGeneral')}</option>}
      {mode !== 'share' && <option value="default">{t('settings:notifications.defaultRingtone')}</option>}
      <optgroup label={t('settings:notifications.builtinGroup')}>
        {BUILTIN_RINGTONE_IDS.map((id) => <option key={id} value={`builtin:${id}`}>{t(BUILTIN_LABEL[id])}</option>)}
      </optgroup>
      {mine.length > 0 && (
        <optgroup label={t('settings:notifications.uploadsGroup')}>
          {mine.map((r) => <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>)}
        </optgroup>
      )}
      {mode !== 'share' && <option value="silent">{t('settings:notifications.silent')}</option>}
    </select>
  );
}

function PreviewButton({ ringtone, direction, volume }: { ringtone: RingtoneRef | null; direction: RingDirection; volume: number }) {
  const { t } = useTranslation(['settings']);
  const disabled = !ringtone || ringtone.kind === 'silent';
  return (
    <button type="button" disabled={disabled} onClick={() => { if (ringtone) void previewRingtone(ringtone, direction, volume); }} className={smallButton}>
      {t('settings:notifications.preview')}
    </button>
  );
}

function VolumeSlider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const { t } = useTranslation(['common']);
  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-txt-secondary">{label}</span>
        <span className="text-xs text-txt-tertiary tabular-nums">{t('common:units.percent', { value })}</span>
      </div>
      <input
        type="range" min={0} max={100} value={value} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-surface-base [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        style={{ background: `linear-gradient(to right, rgb(var(--accent-primary)) ${value}%, rgb(var(--interactive-muted)) ${value}%)` }}
      />
    </div>
  );
}

function formatSeconds(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function UploadsSection() {
  const { t } = useTranslation(['settings', 'common']);
  const mine = useRingtoneStore((s) => s.mine);
  const addToast = useUIStore((s) => s.addToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const maxMb = RINGTONE_MAX_UPLOAD_BYTES / (1024 * 1024);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > RINGTONE_MAX_UPLOAD_BYTES) { addToast(t('settings:notifications.uploads.tooLarge', { max: maxMb }), 'warning'); return; }
    setBusy(true);
    try {
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || t('settings:notifications.uploads.untitled');
      await useRingtoneStore.getState().upload(file, name);
      addToast(t('settings:notifications.uploads.added'), 'success', 2000);
    } catch (err) {
      addToast(describeError(err), 'warning');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (id: string) => {
    try { await useRingtoneStore.getState().remove(id); } catch (err) { addToast(describeError(err), 'warning'); }
  };

  return (
    <div>
      <div className={sectionTitle}>{t('settings:notifications.uploads.title')}</div>
      <div className={card}>
        <p className="text-xs text-txt-tertiary">{t('settings:notifications.uploads.hint', { max: maxMb, seconds: RINGTONE_MAX_SECONDS, limit: RINGTONE_MAX_PER_USER })}</p>
        <div className="mt-3 space-y-1.5">
          {mine.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2.5 py-1.5">
              <span className="flex-1 min-w-0 truncate text-[13px] text-txt-primary">{r.name}</span>
              <span className="text-[11px] text-txt-tertiary tabular-nums">{formatSeconds(r.durationMs)}</span>
              <button type="button" className={smallButton} onClick={() => void previewRingtone({ kind: 'custom', id: r.id }, 'incoming', 80)}>{t('settings:notifications.preview')}</button>
              <button type="button" className="px-2 py-1.5 rounded-md text-xs text-txt-danger hover:bg-white/[0.06]" onClick={() => void remove(r.id)}>{t('common:actions.delete')}</button>
            </div>
          ))}
        </div>
        <input ref={fileRef} type="file" accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/ogg" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        <button type="button" disabled={busy || mine.length >= RINGTONE_MAX_PER_USER} onClick={() => fileRef.current?.click()} className="mt-3 px-3 py-2 rounded-md text-[13px] font-medium bg-accent-primary hover:bg-accent-primary-hover text-on-accent disabled:opacity-50">
          {busy ? t('settings:notifications.uploads.uploading') : t('settings:notifications.uploads.upload')}
        </button>
      </div>
    </div>
  );
}

function FriendOverrides({ settings, save }: { settings: RingtoneSettings; save: (patch: Partial<RingtoneSettings>) => void }) {
  const { t } = useTranslation(['settings', 'common']);
  const friends = useSocialStore((s) => s.friends);
  const [adding, setAdding] = useState('');
  const people = useMemo(() => friends.map((f) => ({ id: f.id, name: f.displayName || f.username })).sort((a, b) => a.name.localeCompare(b.name)), [friends]);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const ids = Object.keys(settings.friends);

  const setFriend = (id: string, entry: FriendRingtone | null) => {
    const next = { ...settings.friends };
    if (entry && (entry.incoming || entry.callerPlays)) next[id] = entry;
    else delete next[id];
    save({ friends: next });
  };

  return (
    <div>
      <div className={sectionTitle}>{t('settings:notifications.friends.title')}</div>
      <div className={card}>
        <p className="text-xs text-txt-tertiary">{t('settings:notifications.friends.hint')}</p>
        <div className="mt-3 space-y-3">
          {ids.map((id) => {
            const entry = settings.friends[id] ?? {};
            return (
              <div key={id} className="rounded-md bg-white/[0.03] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-txt-primary truncate">{nameOf(id)}</span>
                  <button type="button" className="text-xs text-txt-tertiary hover:text-txt-primary" onClick={() => setFriend(id, null)}>{t('settings:notifications.friends.remove')}</button>
                </div>
                <div className="mt-2 grid desktop:grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[11px] text-txt-secondary mb-1">{t('settings:notifications.friends.whenTheyCall')}</span>
                    <RingtoneSelect mode="inherit" label={t('settings:notifications.friends.whenTheyCall')} value={entry.incoming ?? null} onChange={(ref) => setFriend(id, { ...entry, incoming: ref ?? undefined })} />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-txt-secondary mb-1">{t('settings:notifications.friends.whenICall')}</span>
                    <select className={selectClass} value={entry.callerPlays ?? ''} onChange={(e) => setFriend(id, { ...entry, callerPlays: (e.target.value || undefined) as CallerPlays | undefined })}>
                      <option value="">{t('settings:notifications.friends.useGeneral')}</option>
                      {(['mine', 'theirs', 'none'] as const).map((p) => <option key={p} value={p}>{t(CALLER_PLAYS_LABEL[p])}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <select aria-label={t('settings:notifications.friends.add')} value={adding} onChange={(e) => setAdding(e.target.value)} className={`${selectClass} flex-1 min-w-0`}>
            <option value="">{t('settings:notifications.friends.pick')}</option>
            {people.filter((p) => !settings.friends[p.id]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" className={smallButton} disabled={!adding} onClick={() => { setFriend(adding, { callerPlays: 'theirs' }); setAdding(''); }}>
            {t('settings:notifications.friends.add')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotificationsPanel() {
  const { t } = useTranslation(['settings', 'common']);
  const settings = useRingtoneStore((s) => s.settings);
  const addToast = useUIStore((s) => s.addToast);
  const autoAway = usePresencePrefs((s) => s.autoAwayMinutes);
  const setAutoAway = usePresencePrefs((s) => s.setAutoAwayMinutes);

  useEffect(() => {
    useRingtoneStore.getState().load().catch(() => {});
    return () => stopRingtonePreview();
  }, []);

  // Sliders save on every step; only the last write matters.
  const save = (patch: Partial<RingtoneSettings>) => {
    useRingtoneStore.getState().update(patch).catch((err: unknown) => addToast(describeError(err), 'warning'));
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-txt-primary mb-6">{t('settings:notifications.title')}</h2>

      <div>
        <div className={sectionTitle}>{t('settings:notifications.callSounds')}</div>
        <div className={`${card} space-y-4`}>
          <div>
            <label className="block text-[13px] font-medium text-txt-primary mb-1.5">{t('settings:notifications.incoming.label')}</label>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <RingtoneSelect mode="ring" label={t('settings:notifications.incoming.label')} value={settings.incoming} onChange={(ref) => save({ incoming: ref ?? { kind: 'default' } })} />
              </div>
              <PreviewButton ringtone={settings.incoming} direction="incoming" volume={settings.incomingVolume} />
            </div>
            <p className="text-[11px] text-txt-tertiary mt-1">{t('settings:notifications.incoming.hint')}</p>
            <VolumeSlider label={t('settings:notifications.incoming.volume')} value={settings.incomingVolume} onChange={(v) => save({ incomingVolume: v })} />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-txt-primary mb-1.5">{t('settings:notifications.outgoing.label')}</label>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <RingtoneSelect mode="ring" label={t('settings:notifications.outgoing.label')} value={settings.outgoing} onChange={(ref) => save({ outgoing: ref ?? { kind: 'default' } })} />
              </div>
              <PreviewButton ringtone={settings.outgoing} direction="outgoing" volume={settings.outgoingVolume} />
            </div>
            <VolumeSlider label={t('settings:notifications.outgoing.volume')} value={settings.outgoingVolume} onChange={(v) => save({ outgoingVolume: v })} />
          </div>

          <fieldset>
            <legend className="text-[13px] font-medium text-txt-primary mb-1.5">{t('settings:notifications.callerPlays.label')}</legend>
            <div className="space-y-1">
              {(['mine', 'theirs', 'none'] as const).map((p) => (
                <label key={p} className="flex items-center gap-2 text-[13px] text-txt-secondary cursor-pointer">
                  <input type="radio" name="callerPlays" checked={settings.callerPlays === p} onChange={() => save({ callerPlays: p })} className="accent-accent-primary" />
                  {t(CALLER_PLAYS_LABEL[p])}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-txt-tertiary mt-1">{t('settings:notifications.callerPlays.hint')}</p>
          </fieldset>

          <button
            type="button"
            className="text-xs text-txt-tertiary hover:text-txt-primary"
            onClick={() => save({
              incoming: DEFAULT_RINGTONE_SETTINGS.incoming, outgoing: DEFAULT_RINGTONE_SETTINGS.outgoing,
              incomingVolume: DEFAULT_RINGTONE_SETTINGS.incomingVolume, outgoingVolume: DEFAULT_RINGTONE_SETTINGS.outgoingVolume,
              callerPlays: DEFAULT_RINGTONE_SETTINGS.callerPlays,
            })}
          >
            {t('settings:notifications.restoreDefaults')}
          </button>
        </div>
      </div>

      <div>
        <div className={sectionTitle}>{t('settings:notifications.shared.title')}</div>
        <div className={`${card} space-y-3`}>
          <p className="text-xs text-txt-tertiary">{t('settings:notifications.shared.hint')}</p>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <RingtoneSelect mode="share" label={t('settings:notifications.shared.title')} value={settings.shared} onChange={(ref) => save({ shared: ref && (ref.kind === 'builtin' || ref.kind === 'custom') ? ref : null })} />
            </div>
            <PreviewButton ringtone={settings.shared} direction="incoming" volume={settings.incomingVolume} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] text-txt-primary">{t('settings:notifications.shared.allow')}</span>
            <Toggle enabled={settings.shareEnabled} onChange={(v) => save({ shareEnabled: v })} ariaLabel={t('settings:notifications.shared.allow')} />
          </div>
          {settings.shareEnabled && !settings.shared && <p className="text-[11px] text-accent-amber">{t('settings:notifications.shared.pickOne')}</p>}
        </div>
      </div>

      <UploadsSection />
      <FriendOverrides settings={settings} save={save} />

      <div>
        <div className={sectionTitle}>{t('settings:notifications.availability.title')}</div>
        <div className={`${card} space-y-3`}>
          <label className="block">
            <span className="block text-[13px] font-medium text-txt-primary mb-1.5">{t('settings:notifications.availability.autoAway')}</span>
            <select className={selectClass} value={autoAway} onChange={(e) => setAutoAway(Number(e.target.value) as AutoAwayMinutes)}>
              {AUTO_AWAY_CHOICES.map((m) => (
                <option key={m} value={m}>{m === 0 ? t('settings:notifications.availability.never') : t('settings:notifications.availability.minutes', { n: m })}</option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-txt-tertiary">{t('settings:notifications.availability.autoAwayHint')}</p>
          <p className="text-[11px] text-txt-tertiary">{t('settings:notifications.availability.dndHint')}</p>
        </div>
      </div>
    </div>
  );
}
