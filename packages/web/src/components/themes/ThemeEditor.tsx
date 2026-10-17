import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  THEME_CATEGORIES,
  THEME_DESCRIPTION_MAX,
  THEME_FONTS,
  THEME_NAME_MAX,
  THEME_RADII,
  normalizeTheme,
  type ThemeCategory,
  type ThemeColorKey,
  type ThemeData,
  type ThemeRecord,
} from '@backspace/shared/src/theme';
import { api } from '../../api/client';
import { useThemeStore } from '../../stores/themeStore';
import { useUIStore } from '../../stores/uiStore';
import { useTransferStore } from '../../stores/transferStore';
import { waitForTransferAttachment } from '../../utils/waitForTransfer';
import { contrastRatio, generatePalette } from '../../utils/appTheme';
import { describeError } from '../../i18n/errors';
import { Toggle } from '../ui/Toggle';
import { ThemePreview } from './ThemePreview';

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const HEX = /^#[0-9a-f]{6}$/i;

const GROUPS: { id: 'surfaces' | 'text' | 'accents'; keys: ThemeColorKey[] }[] = [
  { id: 'surfaces', keys: ['bg', 'sidebar', 'chat', 'elevated', 'input', 'border'] },
  { id: 'text', keys: ['text', 'textMuted', 'textFaint', 'message', 'link'] },
  { id: 'accents', keys: ['accent', 'accent2', 'hover', 'notification'] },
];

export interface ThemeDraft {
  id: string | null;
  name: string;
  description: string;
  category: ThemeCategory;
  visibility: 'private' | 'public';
  data: ThemeData;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="flex items-center gap-2 py-1">
      <span className="relative w-8 h-8 rounded-md border border-white/15 overflow-hidden flex-shrink-0" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 opacity-0 cursor-pointer" />
      </span>
      <span className="flex-1 text-xs text-txt-secondary truncate">{label}</span>
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase()); }}
        onBlur={() => setText(value)}
        maxLength={7}
        spellCheck={false}
        aria-label={label}
        className="input-search w-[84px] px-2 py-1 rounded text-xs font-mono"
      />
    </label>
  );
}

function Slider({ label, value, min, max, onChange, unit = '' }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-txt-secondary mb-1"><span>{label}</span><span className="tabular-nums text-txt-tertiary">{value}{unit}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[rgb(var(--accent-primary))]" />
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-4">
      <h4 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">{title}</h4>
      {children}
    </section>
  );
}

/**
 * Create or edit a theme. The preview on the right always follows the draft;
 * "Preview on the whole app" tries it everywhere, and leaving the editor
 * without saving restores the theme in use.
 */
export function ThemeEditor({ initial, onClose }: { initial: ThemeDraft; onClose: (saved?: ThemeRecord) => void }) {
  const { t } = useTranslation(['settings', 'common']);
  const addToast = useUIStore((s) => s.addToast);
  const [draft, setDraft] = useState<ThemeDraft>(initial);
  const [quick, setQuick] = useState({ background: initial.data.colors.sidebar, accent: initial.data.colors.accent, text: initial.data.colors.text });
  const [wholeApp, setWholeApp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const data = draft.data;

  // Leaving the editor (save, cancel, closing settings) restores the theme in use.
  useEffect(() => () => useThemeStore.getState().setPreview(null), []);
  useEffect(() => { if (wholeApp) useThemeStore.getState().setPreview(normalizeTheme(data)); }, [wholeApp, data]);

  const setData = (patch: Partial<ThemeData>) => setDraft((d) => ({ ...d, data: { ...d.data, ...patch } }));
  const setColor = (key: ThemeColorKey, value: string) => setData({ colors: { ...data.colors, [key]: value } });
  const bg = data.background;
  const setBg = (patch: Partial<NonNullable<ThemeData['background']>> | null) =>
    setData({ background: patch === null ? undefined : { showThrough: 20, ...bg, ...patch } });

  const lowContrast = useMemo(() => {
    const c = data.colors;
    return contrastRatio(c.text, c.chat) < 7 || contrastRatio(c.message, c.chat) < 4.5 || contrastRatio(c.textMuted, c.sidebar) < 4.5;
  }, [data.colors]);

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') { addToast(t('settings:profileStudio.background.notImage'), 'warning'); return; }
    if (file.size > IMAGE_MAX_BYTES) { addToast(t('settings:profileStudio.background.tooLarge', { max: 8 }), 'warning'); return; }
    setUploading(true);
    try {
      const tid = await useTransferStore.getState().startUpload(file, { tray: false });
      const { filename } = await waitForTransferAttachment(tid);
      setBg({ image: filename, showThrough: bg?.showThrough ?? 25, dim: bg?.dim ?? 30 });
    } catch {
      addToast(t('settings:profileStudio.background.uploadFailed'), 'warning');
    } finally {
      setUploading(false);
    }
  };

  const save = async (opts: { apply?: boolean; asCopy?: boolean } = {}) => {
    const normalized = normalizeTheme(data);
    const name = draft.name.trim();
    if (!normalized || !name) { addToast(t('settings:themes.editor.needName'), 'warning'); return; }
    setSaving(true);
    try {
      const body = { name, description: draft.description.trim() || undefined, category: draft.category, visibility: draft.visibility, data: normalized };
      const { theme } = draft.id && !opts.asCopy ? await api.themes.update(draft.id, body) : await api.themes.create(body);
      useThemeStore.getState().upsertMine(theme);
      const sel = useThemeStore.getState().selection;
      // Editing the theme in use keeps it in use with the new colours.
      if (opts.apply || (sel.kind === 'custom' && sel.themeId === theme.id)) {
        await useThemeStore.getState().select({ kind: 'custom', themeId: theme.id, name: theme.name, data: theme.data });
      }
      addToast(t('settings:themes.saved', { name: theme.name }), 'success', 2000);
      onClose(theme);
    } catch (err) {
      addToast(describeError(err), 'warning');
    } finally {
      setSaving(false);
    }
  };

  const seg = (active: boolean) => `px-3 py-1.5 rounded-full text-xs border ${active ? 'border-accent-primary bg-accent-primary/15 text-txt-primary' : 'border-white/[0.08] text-txt-secondary hover:bg-white/[0.06]'}`;

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-txt-primary">{draft.id ? t('settings:themes.editor.editTitle') : t('settings:themes.editor.createTitle')}</h3>
        <button type="button" onClick={() => onClose()} className="text-xs text-txt-secondary hover:text-txt-primary">{t('common:actions.cancel')}</button>
      </div>

      <div className="flex flex-col-reverse desktop:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 w-full space-y-4">
          <Card title={t('settings:themes.editor.basics')}>
            <label className="block text-xs text-txt-secondary mb-1.5">{t('settings:themes.editor.name')}</label>
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} maxLength={THEME_NAME_MAX} className="input-search w-full px-3 py-2 rounded-md text-sm" />
            <div className="mt-3 flex gap-2">
              {(['dark', 'light'] as const).map((m) => (
                <button key={m} type="button" className={seg(data.mode === m)} onClick={() => setData({ mode: m })}>{t(`settings:themes.editor.mode.${m}`)}</button>
              ))}
            </div>
          </Card>

          <Card title={t('settings:themes.editor.quick')}>
            <p className="text-xs text-txt-tertiary mb-2">{t('settings:themes.editor.quickHint')}</p>
            <ColorField label={t('settings:themes.editor.quickBackground')} value={quick.background} onChange={(v) => setQuick((q) => ({ ...q, background: v }))} />
            <ColorField label={t('settings:themes.editor.quickAccent')} value={quick.accent} onChange={(v) => setQuick((q) => ({ ...q, accent: v }))} />
            <ColorField label={t('settings:themes.editor.quickText')} value={quick.text} onChange={(v) => setQuick((q) => ({ ...q, text: v }))} />
            <button type="button" onClick={() => setData({ colors: generatePalette(data.mode, quick.background, quick.accent, quick.text) })} className="mt-2 px-3 py-1.5 rounded-md bg-accent-primary hover:bg-accent-primary-hover text-on-accent text-xs font-medium">
              {t('settings:themes.editor.build')}
            </button>
          </Card>

          <Card title={t('settings:themes.editor.colors')}>
            <button type="button" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced} className="text-xs text-accent-primary hover:underline">
              {showAdvanced ? t('settings:themes.editor.hideColors') : t('settings:themes.editor.showColors')}
            </button>
            {showAdvanced && GROUPS.map((g) => (
              <div key={g.id} className="mt-3">
                <div className="text-[11px] text-txt-tertiary mb-1">{t(`settings:themes.editor.groups.${g.id}`)}</div>
                {g.keys.map((key) => <ColorField key={key} label={t(`settings:themes.editor.keys.${key}`)} value={data.colors[key]} onChange={(v) => setColor(key, v)} />)}
              </div>
            ))}
            {lowContrast && <p className="text-[11px] text-txt-warning mt-2">{t('settings:themes.editor.contrast')}</p>}
          </Card>

          <Card title={t('settings:themes.editor.background')}>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={seg(!bg)} onClick={() => setBg(null)}>{t('settings:profileStudio.none')}</button>
              <button type="button" className={seg(!!bg?.gradient)} onClick={() => setBg({ gradient: bg?.gradient ?? [data.colors.sidebar, data.colors.accent], angle: bg?.angle ?? 160 })}>{t('settings:themes.editor.gradient')}</button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={seg(!!bg?.image)}>
                {uploading ? t('settings:profileStudio.background.uploading') : bg?.image ? t('settings:profileStudio.background.changeImage') : t('settings:profileStudio.background.uploadImage')}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="hidden" onChange={handleImage} />
            </div>
            {bg?.gradient && (
              <div className="mt-3 space-y-2">
                {bg.gradient.map((c, i) => (
                  <ColorField key={i} label={t('settings:profileStudio.name.color', { n: i + 1 })} value={c} onChange={(v) => { const g = [...bg.gradient!]; g[i] = v; setBg({ gradient: g }); }} />
                ))}
                <div className="flex gap-2">
                  {bg.gradient.length < 3 && <button type="button" onClick={() => setBg({ gradient: [...bg.gradient!, data.colors.accent2] })} className="text-xs text-accent-primary hover:underline">{t('settings:profileStudio.name.addColor')}</button>}
                  {bg.gradient.length > 2 && <button type="button" onClick={() => setBg({ gradient: bg.gradient!.slice(0, 2) })} className="text-xs text-txt-secondary hover:underline">{t('settings:profileStudio.name.removeColor')}</button>}
                  {bg.image && <button type="button" onClick={() => setBg({ gradient: undefined })} className="text-xs text-txt-danger hover:underline">{t('settings:themes.editor.removeGradient')}</button>}
                </div>
                <Slider label={t('settings:themes.editor.angle')} value={bg.angle ?? 160} min={0} max={360} unit="°" onChange={(angle) => setBg({ angle })} />
                <div className="flex items-center justify-between text-xs text-txt-secondary">
                  <span>{t('settings:themes.editor.animate')}</span>
                  <Toggle enabled={!!bg.animate} onChange={(v) => setBg({ animate: v || undefined })} ariaLabel={t('settings:themes.editor.animate')} />
                </div>
              </div>
            )}
            {bg?.image && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-3">
                  <img src={`/api/uploads/${encodeURIComponent(bg.image)}`} alt="" className="h-12 rounded object-cover" />
                  <button type="button" onClick={() => setBg(bg.gradient ? { image: undefined } : null)} className="text-xs text-txt-danger hover:underline">{t('common:actions.remove')}</button>
                </div>
                <Slider label={t('settings:profileStudio.background.blur')} value={bg.blur ?? 0} min={0} max={30} unit="px" onChange={(blur) => setBg({ blur })} />
                <Slider label={t('settings:themes.editor.dim')} value={bg.dim ?? 0} min={0} max={80} unit="%" onChange={(dim) => setBg({ dim })} />
              </div>
            )}
            {bg && <div className="mt-3"><Slider label={t('settings:themes.editor.showThrough')} value={bg.showThrough ?? 20} min={0} max={45} unit="%" onChange={(showThrough) => setBg({ showThrough })} /></div>}
            <p className="text-[11px] text-txt-tertiary mt-2">{t('settings:profileStudio.background.imageHint', { max: 8 })}</p>
          </Card>

          <Card title={t('settings:themes.editor.style')}>
            <Slider label={t('settings:themes.editor.glass')} value={data.glass ?? 40} min={0} max={100} unit="%" onChange={(glass) => setData({ glass })} />
            <div className="mt-3 text-xs text-txt-secondary mb-1.5">{t('settings:themes.editor.corners')}</div>
            <div className="flex gap-2">
              {THEME_RADII.map((r) => <button key={r} type="button" className={seg((data.radius ?? 'default') === r)} onClick={() => setData({ radius: r })}>{t(`settings:themes.editor.radius.${r}`)}</button>)}
            </div>
            <div className="mt-3 text-xs text-txt-secondary mb-1.5">{t('settings:themes.editor.font')}</div>
            <div className="flex flex-wrap gap-2">
              {THEME_FONTS.map((f) => <button key={f} type="button" className={seg((data.font ?? 'dm-sans') === f)} onClick={() => setData({ font: f })}>{t(`settings:themes.editor.fonts.${f}`)}</button>)}
            </div>
            <div className="mt-3"><Slider label={t('settings:themes.editor.glow')} value={data.glow ?? 0} min={0} max={100} unit="%" onChange={(glow) => setData({ glow })} /></div>
          </Card>

          <Card title={t('settings:themes.editor.publishing')}>
            <div className="flex gap-2">
              {(['private', 'public'] as const).map((v) => <button key={v} type="button" className={seg(draft.visibility === v)} onClick={() => setDraft((d) => ({ ...d, visibility: v }))}>{t(`settings:themes.editor.visibility.${v}`)}</button>)}
            </div>
            <p className="text-[11px] text-txt-tertiary mt-1.5">{draft.visibility === 'public' ? t('settings:themes.editor.publicHint') : t('settings:themes.editor.privateHint')}</p>
            <label className="block text-xs text-txt-secondary mt-3 mb-1.5">{t('settings:themes.editor.category')}</label>
            <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as ThemeCategory }))} className="input-search w-full px-3 py-2 rounded-md text-sm bg-surface-input">
              {THEME_CATEGORIES.map((c) => <option key={c} value={c}>{t(`settings:themes.categories.${c}`)}</option>)}
            </select>
            <label className="block text-xs text-txt-secondary mt-3 mb-1.5">{t('settings:themes.editor.description')}</label>
            <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} maxLength={THEME_DESCRIPTION_MAX} rows={2} className="input-search w-full px-3 py-2 rounded-md text-sm resize-none" />
          </Card>
        </div>

        <div className="w-full desktop:w-[380px] desktop:sticky desktop:top-0 flex-shrink-0 space-y-3">
          <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">{t('settings:profileStudio.preview')}</div>
          <ThemePreview theme={data} detailed className="aspect-[16/11] w-full" />
          <label className="flex items-center justify-between gap-3 text-xs text-txt-secondary">
            <span>{t('settings:themes.editor.wholeApp')}</span>
            <Toggle enabled={wholeApp} onChange={(v) => { setWholeApp(v); if (!v) useThemeStore.getState().setPreview(null); }} ariaLabel={t('settings:themes.editor.wholeApp')} />
          </label>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-lg glass-modal px-4 py-3 border border-white/[0.06]">
        <button type="button" onClick={() => onClose()} className="px-3 py-1.5 text-sm text-txt-secondary hover:text-txt-primary">{t('common:actions.cancel')}</button>
        {draft.id && <button type="button" disabled={saving} onClick={() => void save({ asCopy: true })} className="px-3 py-1.5 text-sm text-txt-secondary hover:text-txt-primary disabled:opacity-50">{t('settings:themes.actions.saveCopy')}</button>}
        <button type="button" disabled={saving || uploading} onClick={() => void save()} className="px-4 py-1.5 rounded-full text-sm bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary disabled:opacity-50">{t('settings:themes.actions.save')}</button>
        <button type="button" disabled={saving || uploading} onClick={() => void save({ apply: true })} className="px-4 py-1.5 rounded-full text-sm font-medium bg-accent-primary hover:bg-accent-primary-hover text-on-accent disabled:opacity-50">{t('settings:themes.actions.saveApply')}</button>
      </div>
    </div>
  );
}
