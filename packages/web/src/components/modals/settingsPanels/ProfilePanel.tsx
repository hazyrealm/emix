import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AVATAR_DECORATIONS,
  BACKGROUND_PRESETS,
  NAMEPLATES,
  NAME_EFFECTS,
  PROFILE_EFFECTS,
  PROFILE_BACKGROUND_DARKNESS_DEFAULT,
  PROFILE_LINKS_MAX,
  PROFILE_LINK_LABEL_MAX,
  PROFILE_LINK_URL_MAX,
  PROFILE_PRONOUNS_MAX,
  normalizeProfileStyle,
  normalizeProfileLinkUrl,
  profileGlassOn,
  type NameEffect,
  type ProfileStyle,
} from '@backspace/shared/src/profileStyle';
import type { User } from '@backspace/shared';
import { useAuthStore } from '../../../stores/authStore';
import { useUIStore } from '../../../stores/uiStore';
import { useTransferStore } from '../../../stores/transferStore';
import { useProfileMotionStore } from '../../../stores/profileMotionStore';
import { waitForTransferAttachment } from '../../../utils/waitForTransfer';
import { BACKGROUND_PRESET_CSS, isLowContrastColor, profileStyleOf, uploadSrc } from '../../../utils/profileStyle';
import { describeError } from '../../../i18n/errors';
import { Avatar } from '../../ui/Avatar';
import { Toggle } from '../../ui/Toggle';
import { Nameplate, StyledName } from '../../ui/profile/ProfileVisuals';
import { MemberRowPreview, ProfileCardPreview } from '../../ui/profile/ProfileCardPreview';

/** Largest background image accepted, animated GIFs included. */
const BACKGROUND_MAX_BYTES = 8 * 1024 * 1024;
const LOOKS_KEY = 'emix-profile-looks';
const LOOKS_MAX = 6;

type PaletteId = 'emix' | 'sunset' | 'ocean' | 'aurora' | 'gold' | 'candy' | 'toxic' | 'ice';
const NAME_PALETTES: { id: PaletteId; colors: string[] }[] = [
  { id: 'emix', colors: ['#ff3ea5', '#9333ea', '#22a0ff'] },
  { id: 'sunset', colors: ['#ff7a59', '#ff3e7f', '#a855f7'] },
  { id: 'ocean', colors: ['#38bdf8', '#2dd4bf', '#818cf8'] },
  { id: 'aurora', colors: ['#34d399', '#22d3ee', '#a78bfa'] },
  { id: 'gold', colors: ['#fde68a', '#f59e0b', '#fbbf24'] },
  { id: 'candy', colors: ['#f9a8d4', '#c4b5fd', '#93c5fd'] },
  { id: 'toxic', colors: ['#a3e635', '#22c55e', '#facc15'] },
  { id: 'ice', colors: ['#e0f2fe', '#7dd3fc', '#c7d2fe'] },
];

/** Complete looks applied in one click. */
type LookId = 'neonNight' | 'galaxy' | 'cyber' | 'winter' | 'blaze' | 'minimal';
const LOOK_PRESETS: { id: LookId; style: ProfileStyle }[] = [
  { id: 'neonNight', style: { name: { effect: 'animated', colors: ['#ff3ea5', '#9333ea', '#22a0ff'], glow: true }, nameplate: 'neon-pulse', decoration: 'neon-ring', effect: 'neon-particles', background: { preset: 'synthwave' }, glass: true } },
  { id: 'galaxy', style: { name: { effect: 'shimmer', colors: ['#c4b5fd', '#f0abfc'] }, nameplate: 'galaxy', decoration: 'orbit', effect: 'galaxy', background: { preset: 'nebula' } } },
  { id: 'cyber', style: { name: { effect: 'neon', colors: ['#22d3ee'] }, nameplate: 'cyberpunk', decoration: 'cyber', effect: 'digital-rain', background: { preset: 'midnight' }, glass: true } },
  { id: 'winter', style: { name: { effect: 'gradient', colors: ['#e0f2fe', '#7dd3fc'] }, nameplate: 'winter', decoration: 'snowflakes', effect: 'snow', background: { preset: 'ocean' } } },
  { id: 'blaze', style: { name: { effect: 'animated', colors: ['#ffd36b', '#ff5e3a', '#ff3e7f'] }, nameplate: 'fire-ice', decoration: 'flames', effect: 'light-streaks', background: { preset: 'ember' } } },
  { id: 'minimal', style: { name: { effect: 'solid', colors: ['#f4f4f5'] }, nameplate: 'minimal', background: { preset: 'mono' }, glass: true } },
];

interface SavedLook { name: string; style: ProfileStyle }

function readLooks(): SavedLook[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOOKS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((l) => ({ name: typeof l?.name === 'string' ? l.name.slice(0, 24) : '', style: normalizeProfileStyle(l?.style) }))
      .filter((l): l is SavedLook => !!l.name && !!l.style)
      .slice(0, LOOKS_MAX);
  } catch {
    return [];
  }
}

function writeLooks(looks: SavedLook[]): void {
  try { localStorage.setItem(LOOKS_KEY, JSON.stringify(looks)); } catch { /* storage unavailable: looks stay for this session */ }
}

function sameStyle(a: ProfileStyle | null, b: ProfileStyle | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Looks keep the user's own pronouns, links and background image. */
function applyLook(current: ProfileStyle | null, look: ProfileStyle): ProfileStyle {
  const image = current?.background?.image;
  const background = look.background || image
    ? { ...look.background, ...(image ? { image, x: current?.background?.x, y: current?.background?.y, zoom: current?.background?.zoom, opacity: current?.background?.opacity, blur: current?.background?.blur, darkness: current?.background?.darkness } : {}) }
    : undefined;
  return { ...look, background, banner: current?.banner, pronouns: current?.pronouns, links: current?.links };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-4">
      <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">{title}</h3>
      {hint && <p className="text-xs text-txt-tertiary mt-1">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Tile({ selected, onClick, label, children, className = '' }: { selected: boolean; onClick: () => void; label: string; children?: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={label}
      className={`group flex flex-col items-center gap-1.5 rounded-lg p-2 border transition-colors ${selected ? 'border-accent-primary bg-accent-primary/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06]'} ${className}`}
    >
      {children}
      <span className="text-[11px] text-txt-secondary truncate max-w-full">{label}</span>
    </button>
  );
}

function Slider({ label, value, min, max, onChange, unit = '%' }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-txt-secondary mb-1">
        <span>{label}</span><span className="tabular-nums text-txt-tertiary">{value}{unit}</span>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[rgb(var(--accent-primary))]" />
    </label>
  );
}

function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative w-9 h-9 rounded-full overflow-hidden border border-white/15 cursor-pointer flex-shrink-0" style={{ background: value }} title={label}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 opacity-0 cursor-pointer" />
    </label>
  );
}

/**
 * The profile editor: name style, nameplate, avatar decoration, banner
 * framing, background, profile effect, pronouns and links, with a live
 * preview. Everything here is free. The avatar, banner image, display name
 * and bio stay in My Account, which this panel links to.
 */
export function ProfilePanel() {
  const { t } = useTranslation(['settings', 'common']);
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const addToast = useUIStore((s) => s.addToast);
  const openModal = useUIStore((s) => s.openModal);
  const motionEnabled = useProfileMotionStore((s) => s.enabled);
  const setMotionEnabled = useProfileMotionStore((s) => s.setEnabled);

  const saved = profileStyleOf(user);
  const [draft, setDraft] = useState<ProfileStyle | null>(saved);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [playKey, setPlayKey] = useState(0);
  const [looks, setLooks] = useState<SavedLook[]>(() => readLooks());
  const [lookName, setLookName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // A save elsewhere (another tab, another device) resets an untouched editor.
  const savedJson = JSON.stringify(saved);
  const lastSaved = useRef(savedJson);
  useEffect(() => {
    if (lastSaved.current !== savedJson) {
      setDraft((d) => (sameStyle(d, normalizeProfileStyle(JSON.parse(lastSaved.current))) ? saved : d));
      lastSaved.current = savedJson;
    }
  }, [savedJson, saved]);

  const normalizedDraft = useMemo(() => normalizeProfileStyle(draft ?? {}), [draft]);
  const dirty = !sameStyle(normalizedDraft, saved);

  if (!user) return null;
  const previewUser: User = user;
  const isReplica = !!user.homeInstance && !user.federationHomeOrphaned;

  const update = (patch: Partial<ProfileStyle>) => setDraft((d) => ({ ...(d ?? {}), ...patch }));
  const name = draft?.name;
  const nameColors = name?.colors?.length ? name.colors : ['#ff3ea5', '#9333ea', '#22a0ff'];
  const colorCount = name?.effect === 'solid' || name?.effect === 'neon' ? 1 : Math.max(2, name?.colors?.length ?? 2);
  const setName = (effect: NameEffect | null, colors = nameColors, glow = name?.glow) => {
    if (!effect) { update({ name: undefined }); return; }
    const needed = effect === 'solid' || effect === 'neon' ? 1 : Math.max(2, colors.length);
    const filled = Array.from({ length: needed }, (_, i) => colors[i] ?? colors[colors.length - 1] ?? '#ff3ea5');
    update({ name: { effect, colors: effect === 'rainbow' ? [] : filled, ...(glow ? { glow: true } : {}) } });
  };
  const bg = draft?.background;
  const setBg = (patch: Partial<NonNullable<ProfileStyle['background']>> | null) =>
    update({ background: patch === null ? undefined : { ...(bg ?? {}), ...patch } });
  const banner = draft?.banner;
  const links = draft?.links ?? [];

  const handleBackgroundFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') { setError(t('settings:profileStudio.background.notImage')); return; }
    if (file.size > BACKGROUND_MAX_BYTES) { setError(t('settings:profileStudio.background.tooLarge', { max: 8 })); return; }
    setError('');
    setUploading(true);
    try {
      const tid = await useTransferStore.getState().startUpload(file, { tray: false });
      const { filename } = await waitForTransferAttachment(tid);
      setBg({ image: filename, x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 });
    } catch {
      setError(t('settings:profileStudio.background.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updateProfile({ profileStyle: normalizedDraft });
      addToast(t('settings:account.save.updated'), 'success', 2000);
    } catch (err) {
      setError(err instanceof Error ? describeError(err) : t('settings:account.save.failed'));
    } finally {
      setSaving(false);
    }
  };

  const saveLook = () => {
    const nameText = lookName.trim().slice(0, 24);
    if (!nameText || !normalizedDraft) return;
    const next = [{ name: nameText, style: normalizedDraft }, ...looks.filter((l) => l.name !== nameText)].slice(0, LOOKS_MAX);
    setLooks(next);
    writeLooks(next);
    setLookName('');
  };
  const deleteLook = (lookToDelete: string) => {
    const next = looks.filter((l) => l.name !== lookToDelete);
    setLooks(next);
    writeLooks(next);
  };

  const lowContrast = name && name.effect !== 'rainbow' && name.colors.some(isLowContrastColor);

  return (
    <div className="space-y-5 pb-20">
      <div>
        <h2 className="text-lg font-semibold text-txt-primary">{t('settings:profileStudio.title')}</h2>
        <p className="text-sm text-txt-tertiary mt-1">{t('settings:profileStudio.subtitle')}</p>
      </div>

      {isReplica && (
        <div className="rounded-lg bg-accent-amber/10 border border-accent-amber/25 px-3.5 py-3 text-xs text-txt-secondary">
          {t('settings:profileStudio.replica')}
        </div>
      )}

      <div className="flex flex-col-reverse desktop:flex-row gap-5 items-start">
        {/* ── Controls ── */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          <Section title={t('settings:profileStudio.looks.title')} hint={t('settings:profileStudio.looks.hint')}>
            <div className="grid grid-cols-3 desktop:grid-cols-6 gap-2">
              {LOOK_PRESETS.map((look) => (
                <Tile key={look.id} selected={false} onClick={() => setDraft(applyLook(draft, look.style))} label={t(`settings:profileStudio.looks.presets.${look.id}`)}>
                  <span className="w-full h-9 rounded-md flex items-center justify-center" style={{ background: look.style.background?.preset ? BACKGROUND_PRESET_CSS[look.style.background.preset] : undefined }}>
                    <StyledName name="Aa" style={look.style} className="text-sm font-bold" />
                  </span>
                </Tile>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {looks.map((look) => (
                <span key={look.name} className="inline-flex items-center rounded-full bg-white/[0.06] border border-white/[0.08] text-xs">
                  <button type="button" className="pl-3 pr-1.5 py-1 text-txt-secondary hover:text-txt-primary" onClick={() => setDraft(look.style)}>{look.name}</button>
                  <button type="button" className="pr-2.5 pl-1 py-1 text-txt-tertiary hover:text-txt-danger" onClick={() => deleteLook(look.name)} aria-label={t('settings:profileStudio.looks.delete', { name: look.name })}>×</button>
                </span>
              ))}
              <input
                value={lookName}
                onChange={(e) => setLookName(e.target.value)}
                maxLength={24}
                placeholder={t('settings:profileStudio.looks.namePlaceholder')}
                className="input-search px-3 py-1 rounded-full text-xs w-36"
              />
              <button type="button" onClick={saveLook} disabled={!lookName.trim() || !normalizedDraft} className="px-3 py-1 rounded-full text-xs bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary disabled:opacity-40">
                {t('settings:profileStudio.looks.save')}
              </button>
            </div>
            <p className="text-[11px] text-txt-tertiary mt-2">{t('settings:profileStudio.looks.local')}</p>
          </Section>

          <Section title={t('settings:profileStudio.name.title')} hint={t('settings:profileStudio.name.hint')}>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setName(null)} aria-pressed={!name} className={`px-3 py-1.5 rounded-full text-xs border ${!name ? 'border-accent-primary bg-accent-primary/15 text-txt-primary' : 'border-white/[0.08] text-txt-secondary hover:bg-white/[0.06]'}`}>
                {t('settings:profileStudio.none')}
              </button>
              {NAME_EFFECTS.map((effect) => (
                <button key={effect} type="button" onClick={() => setName(effect)} aria-pressed={name?.effect === effect} className={`px-3 py-1.5 rounded-full text-xs border ${name?.effect === effect ? 'border-accent-primary bg-accent-primary/15 text-txt-primary' : 'border-white/[0.08] text-txt-secondary hover:bg-white/[0.06]'}`}>
                  {t(`settings:profileStudio.name.effects.${effect}`)}
                </button>
              ))}
            </div>
            {name && name.effect !== 'rainbow' && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2">
                  {Array.from({ length: colorCount }, (_, i) => (
                    <ColorInput
                      key={i}
                      value={nameColors[i] ?? nameColors[nameColors.length - 1] ?? '#ff3ea5'}
                      label={t('settings:profileStudio.name.color', { n: i + 1 })}
                      onChange={(c) => { const next = [...nameColors.slice(0, colorCount)]; next[i] = c; setName(name.effect, next); }}
                    />
                  ))}
                  {colorCount > 1 && colorCount < 4 && (
                    <button type="button" onClick={() => setName(name.effect, [...nameColors.slice(0, colorCount), nameColors[colorCount - 1] ?? '#ff3ea5'])} className="w-9 h-9 rounded-full border border-dashed border-white/20 text-txt-tertiary hover:text-txt-primary" aria-label={t('settings:profileStudio.name.addColor')}>+</button>
                  )}
                  {colorCount > 2 && (
                    <button type="button" onClick={() => setName(name.effect, nameColors.slice(0, colorCount - 1))} className="w-9 h-9 rounded-full border border-dashed border-white/20 text-txt-tertiary hover:text-txt-primary" aria-label={t('settings:profileStudio.name.removeColor')}>−</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {NAME_PALETTES.map((p) => (
                    <button key={p.id} type="button" onClick={() => setName(name.effect, p.colors)} className="px-2.5 py-1 rounded-full text-[11px] border border-white/[0.08] hover:bg-white/[0.06]">
                      <StyledName name={t(`settings:profileStudio.name.palettes.${p.id}`)} style={{ name: { effect: 'gradient', colors: p.colors } }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {name && name.effect !== 'neon' && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-txt-secondary">{t('settings:profileStudio.name.glow')}</span>
                <Toggle enabled={!!name.glow} onChange={(v: boolean) => setName(name.effect, nameColors, v)} />
              </div>
            )}
            {lowContrast && <p className="text-[11px] text-accent-amber mt-2">{t('settings:profileStudio.name.lowContrast')}</p>}
          </Section>

          <Section title={t('settings:profileStudio.nameplate.title')} hint={t('settings:profileStudio.nameplate.hint')}>
            <div className="grid grid-cols-2 desktop:grid-cols-3 gap-2">
              <Tile selected={!draft?.nameplate} onClick={() => update({ nameplate: undefined })} label={t('settings:profileStudio.none')}>
                <span className="w-full h-8 rounded-[6px] bg-surface-channel/60" />
              </Tile>
              {NAMEPLATES.map((id) => (
                <Tile key={id} selected={draft?.nameplate === id} onClick={() => update({ nameplate: id })} label={t(`settings:profileStudio.nameplate.items.${id}`)}>
                  <span className="emx-plate-host w-full h-8 rounded-[6px] bg-surface-channel/60 flex items-center px-2">
                    <Nameplate id={id} />
                    <StyledName name={user.displayName || user.username} style={draft} className="text-[12px] font-medium truncate text-txt-primary" />
                  </span>
                </Tile>
              ))}
            </div>
          </Section>

          <Section title={t('settings:profileStudio.decoration.title')} hint={t('settings:profileStudio.decoration.hint')}>
            <div className="grid grid-cols-4 desktop:grid-cols-7 gap-2">
              <Tile selected={!draft?.decoration} onClick={() => update({ decoration: undefined })} label={t('settings:profileStudio.none')}>
                <span className="p-2"><Avatar src={user.avatar} name={user.displayName || user.username} size={40} user={user} decoration={null} /></span>
              </Tile>
              {AVATAR_DECORATIONS.map((id) => (
                <Tile key={id} selected={draft?.decoration === id} onClick={() => update({ decoration: id })} label={t(`settings:profileStudio.decoration.items.${id}`)}>
                  <span className="p-2"><Avatar src={user.avatar} name={user.displayName || user.username} size={40} user={user} decoration={id} /></span>
                </Tile>
              ))}
            </div>
          </Section>

          <Section title={t('settings:profileStudio.banner.title')} hint={user.banner ? t('settings:profileStudio.banner.hint') : t('settings:profileStudio.banner.noBanner')}>
            {user.banner ? (
              <div className="space-y-3">
                <Slider label={t('settings:profileStudio.position.x')} value={banner?.x ?? 50} min={0} max={100} onChange={(x) => update({ banner: { ...banner, x } })} />
                <Slider label={t('settings:profileStudio.position.y')} value={banner?.y ?? 50} min={0} max={100} onChange={(y) => update({ banner: { ...banner, y } })} />
                <Slider label={t('settings:profileStudio.position.zoom')} value={banner?.zoom ?? 100} min={100} max={300} onChange={(zoom) => update({ banner: { ...banner, zoom } })} />
              </div>
            ) : null}
            <button type="button" onClick={() => openModal('userSettings', { tab: 'account' })} className="mt-3 text-xs text-accent-primary hover:underline">
              {t('settings:profileStudio.banner.openAccount')}
            </button>
          </Section>

          <Section title={t('settings:profileStudio.background.title')} hint={t('settings:profileStudio.background.hint')}>
            <div className="grid grid-cols-4 desktop:grid-cols-6 gap-2">
              <Tile selected={!bg?.preset && !bg?.colors} onClick={() => setBg(bg?.image ? { preset: undefined, colors: undefined } : null)} label={t('settings:profileStudio.none')}>
                <span className="w-full h-10 rounded-md bg-surface-channel/60" />
              </Tile>
              {BACKGROUND_PRESETS.map((id) => (
                <Tile key={id} selected={bg?.preset === id && !bg?.colors} onClick={() => setBg({ preset: id, colors: undefined })} label={t(`settings:profileStudio.background.presets.${id}`)}>
                  <span className="w-full h-10 rounded-md" style={{ background: BACKGROUND_PRESET_CSS[id] }} />
                </Tile>
              ))}
              <Tile selected={!!bg?.colors} onClick={() => setBg({ colors: bg?.colors ?? ['#3a1670', '#0f3a73'], preset: undefined })} label={t('settings:profileStudio.background.custom')}>
                <span className="w-full h-10 rounded-md" style={{ background: `linear-gradient(150deg, ${(bg?.colors ?? ['#3a1670', '#0f3a73']).join(', ')})` }} />
              </Tile>
            </div>
            {bg?.colors && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {bg.colors.map((c, i) => (
                  <ColorInput key={i} value={c} label={t('settings:profileStudio.name.color', { n: i + 1 })} onChange={(v) => { const next = [...bg.colors!]; next[i] = v; setBg({ colors: next }); }} />
                ))}
                {bg.colors.length < 3 && (
                  <button type="button" onClick={() => setBg({ colors: [...bg.colors!, bg.colors![bg.colors!.length - 1] ?? '#0f3a73'] })} className="w-9 h-9 rounded-full border border-dashed border-white/20 text-txt-tertiary hover:text-txt-primary" aria-label={t('settings:profileStudio.name.addColor')}>+</button>
                )}
                {bg.colors.length > 2 && (
                  <button type="button" onClick={() => setBg({ colors: bg.colors!.slice(0, -1) })} className="w-9 h-9 rounded-full border border-dashed border-white/20 text-txt-tertiary hover:text-txt-primary" aria-label={t('settings:profileStudio.name.removeColor')}>−</button>
                )}
                <span className="flex items-center gap-2 ml-auto text-xs text-txt-secondary">
                  {t('settings:profileStudio.background.animate')}
                  <Toggle enabled={!!bg.animate} onChange={(v: boolean) => setBg({ animate: v || undefined })} />
                </span>
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="px-3 py-1.5 rounded-md text-xs bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary disabled:opacity-50">
                {uploading ? t('settings:profileStudio.background.uploading') : bg?.image ? t('settings:profileStudio.background.changeImage') : t('settings:profileStudio.background.uploadImage')}
              </button>
              {bg?.image && (
                <button type="button" onClick={() => setBg({ image: undefined })} className="text-xs text-txt-danger hover:underline">{t('common:actions.remove')}</button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="hidden" onChange={handleBackgroundFile} />
            </div>
            <p className="text-[11px] text-txt-tertiary mt-1.5">{t('settings:profileStudio.background.imageHint', { max: 8 })}</p>
            {bg?.image && (
              <div className="mt-3 space-y-3">
                <img src={uploadSrc(bg.image) ?? undefined} alt="" className="h-16 rounded-md object-cover" />
                <Slider label={t('settings:profileStudio.position.x')} value={bg.x ?? 50} min={0} max={100} onChange={(x) => setBg({ x })} />
                <Slider label={t('settings:profileStudio.position.y')} value={bg.y ?? 50} min={0} max={100} onChange={(y) => setBg({ y })} />
                <Slider label={t('settings:profileStudio.position.zoom')} value={bg.zoom ?? 100} min={100} max={300} onChange={(zoom) => setBg({ zoom })} />
                <Slider label={t('settings:profileStudio.background.opacity')} value={bg.opacity ?? 100} min={10} max={100} onChange={(opacity) => setBg({ opacity })} />
                <Slider label={t('settings:profileStudio.background.blur')} value={bg.blur ?? 0} min={0} max={20} unit="px" onChange={(blur) => setBg({ blur })} />
              </div>
            )}
            {bg && (
              <div className="mt-4">
                <Slider label={t('settings:profileStudio.background.darkness')} value={bg.darkness ?? PROFILE_BACKGROUND_DARKNESS_DEFAULT} min={0} max={100} onChange={(darkness) => setBg({ darkness })} />
                <p className="text-[11px] text-txt-tertiary mt-1">{t('settings:profileStudio.background.darknessHint')}</p>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-txt-secondary">{t('settings:profileStudio.background.glass')}</span>
              <Toggle enabled={profileGlassOn(draft)} onChange={(v: boolean) => update({ glass: v === !!bg ? undefined : v })} />
            </div>
          </Section>

          <Section title={t('settings:profileStudio.effect.title')} hint={t('settings:profileStudio.effect.hint')}>
            <div className="grid grid-cols-3 desktop:grid-cols-4 gap-2">
              <Tile selected={!draft?.effect} onClick={() => update({ effect: undefined })} label={t('settings:profileStudio.none')} className="py-3" />
              {PROFILE_EFFECTS.map((id) => (
                <Tile key={id} selected={draft?.effect === id} onClick={() => { update({ effect: id }); setPlayKey((k) => k + 1); }} label={t(`settings:profileStudio.effect.items.${id}`)} className="py-3" />
              ))}
            </div>
            <button type="button" onClick={() => setPlayKey((k) => k + 1)} disabled={!draft?.effect} className="mt-3 text-xs text-accent-primary hover:underline disabled:opacity-40 disabled:no-underline">
              {t('settings:profileStudio.effect.replay')}
            </button>
          </Section>

          <Section title={t('settings:profileStudio.about.title')} hint={t('settings:profileStudio.about.hint')}>
            <label className="block text-xs text-txt-secondary mb-1.5">{t('settings:profileStudio.about.pronouns')}</label>
            <input
              value={draft?.pronouns ?? ''}
              onChange={(e) => update({ pronouns: e.target.value || undefined })}
              maxLength={PROFILE_PRONOUNS_MAX}
              placeholder={t('settings:profileStudio.about.pronounsPlaceholder')}
              className="input-search w-full px-3 py-2 rounded-md text-sm"
            />
            <label className="block text-xs text-txt-secondary mt-4 mb-1.5">{t('settings:profileStudio.about.links', { max: PROFILE_LINKS_MAX })}</label>
            <div className="space-y-2">
              {links.map((link, i) => {
                const invalid = !!link.url && !normalizeProfileLinkUrl(link.url);
                return (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      value={link.label}
                      onChange={(e) => { const next = [...links]; next[i] = { ...link, label: e.target.value }; update({ links: next }); }}
                      maxLength={PROFILE_LINK_LABEL_MAX}
                      placeholder={t('settings:profileStudio.about.linkLabel')}
                      className="input-search w-32 px-3 py-2 rounded-md text-sm"
                    />
                    <input
                      value={link.url}
                      onChange={(e) => { const next = [...links]; next[i] = { ...link, url: e.target.value }; update({ links: next }); }}
                      maxLength={PROFILE_LINK_URL_MAX}
                      placeholder={t('settings:profileStudio.about.urlPlaceholder')}
                      aria-invalid={invalid}
                      className={`input-search flex-1 min-w-0 px-3 py-2 rounded-md text-sm ${invalid ? 'ring-1 ring-accent-rose' : ''}`}
                    />
                    <button type="button" onClick={() => update({ links: links.filter((_, j) => j !== i) })} className="text-xs text-txt-danger hover:underline">{t('common:actions.remove')}</button>
                  </div>
                );
              })}
              {links.length < PROFILE_LINKS_MAX && (
                <button type="button" onClick={() => update({ links: [...links, { label: '', url: '' }] })} className="text-xs text-accent-primary hover:underline">
                  {t('settings:profileStudio.about.addLink')}
                </button>
              )}
            </div>
            <button type="button" onClick={() => openModal('userSettings', { tab: 'account' })} className="mt-4 block text-xs text-accent-primary hover:underline">
              {t('settings:profileStudio.about.editBio')}
            </button>
          </Section>

          <Section title={t('settings:profileStudio.motion.title')}>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-txt-secondary">{t('settings:profileStudio.motion.label')}</span>
              <Toggle enabled={motionEnabled} onChange={(v: boolean) => setMotionEnabled(v)} />
            </div>
            <p className="text-[11px] text-txt-tertiary mt-1.5">{t('settings:profileStudio.motion.hint')}</p>
          </Section>
        </div>

        {/* ── Live preview ── */}
        <div className="w-full desktop:w-[340px] desktop:sticky desktop:top-0 flex-shrink-0 space-y-3">
          <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">{t('settings:profileStudio.preview')}</div>
          <ProfileCardPreview user={previewUser} style={normalizedDraft} playKey={playKey} />
          <MemberRowPreview user={previewUser} style={normalizedDraft} />
        </div>
      </div>

      {error && <div className="text-sm text-txt-danger">{error}</div>}

      {/* Save bar */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg glass-modal px-4 py-3 border border-white/[0.06]">
        <span className="text-sm text-txt-secondary">{dirty ? t('settings:profileStudio.unsaved') : t('settings:profileStudio.free')}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(null)} disabled={!normalizedDraft} className="px-3 py-1.5 text-sm text-txt-tertiary hover:text-txt-primary disabled:opacity-40">
            {t('settings:profileStudio.resetDefault')}
          </button>
          <button type="button" onClick={() => setDraft(saved)} disabled={!dirty} className="px-3 py-1.5 text-sm text-txt-secondary hover:text-txt-primary disabled:opacity-40">
            {t('common:actions.cancel')}
          </button>
          <button type="button" onClick={handleSave} disabled={!dirty || saving || uploading || isReplica} className="px-4 py-1.5 bg-accent-primary hover:bg-accent-primary/80 text-on-accent text-sm font-medium rounded-full disabled:opacity-50">
            {saving ? t('common:states.saving') : t('common:actions.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
