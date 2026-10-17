import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  THEME_CATEGORIES,
  THEME_FILE_FORMAT,
  normalizeTheme,
  themeText,
  THEME_NAME_MAX,
  type ThemeCategory,
  type ThemeData,
  type ThemeRecord,
} from '@backspace/shared/src/theme';
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from '@backspace/shared/src/builtinThemes';
import { api } from '../../api/client';
import { useThemeStore } from '../../stores/themeStore';
import { useUIStore } from '../../stores/uiStore';
import { describeError } from '../../i18n/errors';
import { resolveSelection } from '../../utils/appTheme';
import { ThemePreview } from './ThemePreview';
import { ThemeEditor, type ThemeDraft } from './ThemeEditor';
import { creditOf, downloadThemeFile, useSharedThemeActions, useThemeUiStore } from './themeShareCore';

type Tab = 'emix' | 'mine' | 'community';
/** Largest theme file accepted for import. */
const IMPORT_MAX_BYTES = 64 * 1024;

function ThemeCard({ name, data, active, credit, onApply, children }: {
  name: string;
  data: ThemeData;
  active: boolean;
  credit?: string | null;
  onApply: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation(['settings']);
  return (
    <div className={`rounded-xl border p-2 transition-colors ${active ? 'border-accent-primary bg-accent-primary/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'}`}>
      <button type="button" onClick={onApply} aria-pressed={active} className="block w-full text-left">
        <ThemePreview theme={data} className="aspect-[16/10] w-full" />
        <div className="mt-2 flex items-center gap-2 px-0.5">
          <span className="flex-1 min-w-0 text-[13px] font-medium text-txt-primary truncate">{name}</span>
          {active && <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-primary">{t('settings:themes.active')}</span>}
        </div>
        {credit && <div className="px-0.5 text-[11px] text-txt-tertiary truncate">{t('settings:themes.by', { name: credit })}</div>}
      </button>
      {children && <div className="mt-1.5 flex flex-wrap gap-1 px-0.5">{children}</div>}
    </div>
  );
}

function SmallButton({ onClick, children, danger = false }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`px-2 py-1 rounded text-[11px] ${danger ? 'text-txt-danger hover:bg-txt-danger/10' : 'text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover'}`}>
      {children}
    </button>
  );
}

function CommunityCard({ theme, active }: { theme: ThemeRecord; active: boolean }) {
  const { t } = useTranslation(['settings']);
  const [record, setRecord] = useState(theme);
  const { apply, save } = useSharedThemeActions(record);
  const toggleLike = async () => {
    try { setRecord((await api.themes.like(record.id, !record.likedByMe)).theme); } catch { /* unchanged */ }
  };
  return (
    <ThemeCard name={record.name} data={record.data} active={active} credit={creditOf(record)} onApply={() => void apply()}>
      <button type="button" onClick={() => void toggleLike()} aria-pressed={!!record.likedByMe} className={`px-2 py-1 rounded text-[11px] hover:bg-interactive-hover ${record.likedByMe ? 'text-[rgb(var(--accent-secondary))]' : 'text-txt-secondary'}`}>
        {record.likedByMe ? '♥' : '♡'} {record.likes}
      </button>
      {!record.isMine && <SmallButton onClick={() => void save()}>{t('settings:themes.actions.saveToMine')}</SmallButton>}
      <SmallButton onClick={() => useThemeUiStore.getState().openShared(record.shareCode)}>{t('settings:themes.actions.preview')}</SmallButton>
    </ThemeCard>
  );
}

function Community({ activeName }: { activeName: string | null }) {
  const { t } = useTranslation(['settings']);
  const [sort, setSort] = useState<'popular' | 'recent' | 'liked'>('popular');
  const [category, setCategory] = useState<ThemeCategory | ''>('');
  const [query, setQuery] = useState('');
  const [themes, setThemes] = useState<ThemeRecord[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api.themes.gallery({ sort, q: query || undefined, category: category || undefined })
        .then((r) => { if (!cancelled) { setThemes(r.themes); setFailed(false); } })
        .catch(() => { if (!cancelled) setFailed(true); });
    }, query ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sort, category, query]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('settings:themes.gallery.search')} className="input-search flex-1 min-w-[160px] px-3 py-1.5 rounded-md text-sm" />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="input-search px-2 py-1.5 rounded-md text-sm bg-surface-input">
          <option value="popular">{t('settings:themes.gallery.popular')}</option>
          <option value="recent">{t('settings:themes.gallery.recent')}</option>
          <option value="liked">{t('settings:themes.gallery.liked')}</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value as ThemeCategory | '')} className="input-search px-2 py-1.5 rounded-md text-sm bg-surface-input">
          <option value="">{t('settings:themes.gallery.allCategories')}</option>
          {THEME_CATEGORIES.map((c) => <option key={c} value={c}>{t(`settings:themes.categories.${c}`)}</option>)}
        </select>
      </div>
      {failed ? (
        <p className="text-sm text-txt-tertiary mt-6">{t('settings:themes.gallery.unavailable')}</p>
      ) : themes === null ? (
        <p className="text-sm text-txt-tertiary mt-6">{t('settings:themes.loading')}</p>
      ) : themes.length === 0 ? (
        <p className="text-sm text-txt-tertiary mt-6">{t('settings:themes.gallery.empty')}</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 desktop:grid-cols-3 gap-3">
          {themes.map((theme) => <CommunityCard key={theme.id} theme={theme} active={activeName === theme.name} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Settings → Appearance → Themes: switch themes instantly, make and edit
 * your own, import and export them, and browse what others published. Free
 * for everyone; profile customization (Profile tab) is a separate system.
 */
export function ThemesSection() {
  const { t } = useTranslation(['settings', 'common']);
  const addToast = useUIStore((s) => s.addToast);
  const selection = useThemeStore((s) => s.selection);
  const mine = useThemeStore((s) => s.mine);
  const loadMine = useThemeStore((s) => s.loadMine);
  const select = useThemeStore((s) => s.select);
  const [tab, setTab] = useState<Tab>('emix');
  const [editing, setEditing] = useState<ThemeDraft | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void loadMine(); }, [loadMine]);

  const builtinName = (id: string) => t(`settings:themes.builtin.${id}` as 'settings:themes.builtin.emix');
  const activeBuiltin = selection.kind === 'builtin' ? selection.id : null;
  const activeCustomId = selection.kind === 'custom' ? selection.themeId : null;
  const activeName = selection.kind === 'custom' ? selection.name : null;

  const startNew = useCallback((data?: ThemeData, name?: string) => {
    setEditing({
      id: null,
      name: name ?? t('settings:themes.editor.defaultName'),
      description: '',
      category: 'other',
      visibility: 'private',
      data: data ?? resolveSelection(selection),
    });
  }, [selection, t]);

  const edit = (theme: ThemeRecord) => setEditing({
    id: theme.id, name: theme.name, description: theme.description ?? '', category: theme.category, visibility: theme.visibility, data: theme.data,
  });

  const duplicate = async (theme: ThemeRecord) => {
    try {
      const { theme: copy } = await api.themes.create({
        name: t('settings:themes.copyName', { name: theme.name }).slice(0, THEME_NAME_MAX),
        data: theme.data, category: theme.category, description: theme.description ?? undefined,
      });
      useThemeStore.getState().upsertMine(copy);
    } catch (err) { addToast(describeError(err), 'warning'); }
  };

  const remove = async (theme: ThemeRecord) => {
    if (!window.confirm(t('settings:themes.confirmDelete', { name: theme.name }))) return;
    try {
      await api.themes.remove(theme.id);
      useThemeStore.getState().removeMine(theme.id);
    } catch (err) { addToast(describeError(err), 'warning'); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (importRef.current) importRef.current.value = '';
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) { addToast(t('settings:themes.import.invalid'), 'warning'); return; }
    try {
      // A theme file is read as data only: nothing in it is run or injected.
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      const data = normalizeTheme(parsed.format === THEME_FILE_FORMAT ? parsed.theme : parsed);
      if (!data) throw new Error('invalid');
      // A background image from another instance is not carried over.
      if (data.background?.image) {
        delete data.background.image;
        if (!data.background.gradient) delete data.background;
      }
      startNew(data, themeText(parsed.name, THEME_NAME_MAX) ?? file.name.replace(/\.[^.]+$/, ''));
      setTab('mine');
    } catch {
      addToast(t('settings:themes.import.invalid'), 'warning');
    }
  };

  const importLink = () => {
    const raw = window.prompt(t('settings:themes.import.linkPrompt'));
    const code = raw?.match(/\/theme\/([A-Za-z0-9_-]{8,32})/)?.[1] ?? raw?.trim().match(/^[A-Za-z0-9_-]{8,32}$/)?.[0];
    if (code) useThemeUiStore.getState().openShared(code);
    else if (raw) addToast(t('settings:themes.import.invalidLink'), 'warning');
  };

  if (editing) {
    return (
      <div>
        <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-3">{t('settings:themes.title')}</h3>
        <ThemeEditor initial={editing} onClose={(saved) => { setEditing(null); if (saved) setTab('mine'); }} />
      </div>
    );
  }

  const tabClass = (id: Tab) => `px-3 py-1.5 rounded-full text-sm ${tab === id ? 'bg-interactive-selected text-txt-primary font-medium' : 'text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover'}`;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">{t('settings:themes.title')}</h3>
          <p className="text-xs text-txt-tertiary mt-1">{t('settings:themes.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => startNew()} className="px-3 py-1.5 rounded-md bg-accent-primary hover:bg-accent-primary-hover text-on-accent text-xs font-medium">{t('settings:themes.actions.create')}</button>
          <button type="button" onClick={() => importRef.current?.click()} className="px-3 py-1.5 rounded-md bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary text-xs">{t('settings:themes.actions.importFile')}</button>
          <button type="button" onClick={importLink} className="px-3 py-1.5 rounded-md bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary text-xs">{t('settings:themes.actions.importLink')}</button>
          <input ref={importRef} type="file" accept=".emixtheme,.json,application/json" className="hidden" onChange={handleImport} />
        </div>
      </div>

      <div className="mt-4 flex gap-1">
        <button type="button" className={tabClass('emix')} onClick={() => setTab('emix')}>{t('settings:themes.tabs.emix')}</button>
        <button type="button" className={tabClass('mine')} onClick={() => setTab('mine')}>{t('settings:themes.tabs.mine')}</button>
        <button type="button" className={tabClass('community')} onClick={() => setTab('community')}>{t('settings:themes.tabs.community')}</button>
      </div>

      <div className="mt-4">
        {tab === 'emix' && (
          <div className="grid grid-cols-2 desktop:grid-cols-3 gap-3">
            {BUILTIN_THEMES.map((b) => (
              <ThemeCard key={b.id} name={builtinName(b.id)} data={b.data} active={activeBuiltin === b.id} onApply={() => void select({ kind: 'builtin', id: b.id })}>
                <SmallButton onClick={() => startNew(b.data, t('settings:themes.copyName', { name: builtinName(b.id) }))}>{t('settings:themes.actions.customize')}</SmallButton>
              </ThemeCard>
            ))}
          </div>
        )}
        {tab === 'mine' && (
          mine.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/[0.12] p-6 text-center">
              <p className="text-sm text-txt-secondary">{t('settings:themes.mineEmpty')}</p>
              <button type="button" onClick={() => startNew()} className="mt-3 px-3 py-1.5 rounded-md bg-accent-primary hover:bg-accent-primary-hover text-on-accent text-xs font-medium">{t('settings:themes.actions.create')}</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 desktop:grid-cols-3 gap-3">
              {mine.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  name={theme.name}
                  data={theme.data}
                  active={activeCustomId === theme.id}
                  credit={theme.basedOn ? theme.basedOn.creatorName : null}
                  onApply={() => void select({ kind: 'custom', themeId: theme.id, name: theme.name, data: theme.data })}
                >
                  <SmallButton onClick={() => edit(theme)}>{t('settings:themes.actions.edit')}</SmallButton>
                  <SmallButton onClick={() => void duplicate(theme)}>{t('settings:themes.actions.duplicate')}</SmallButton>
                  <SmallButton onClick={() => useThemeUiStore.getState().share(theme)}>{t('settings:themes.actions.share')}</SmallButton>
                  <SmallButton onClick={() => downloadThemeFile(theme)}>{t('settings:themes.actions.export')}</SmallButton>
                  <SmallButton danger onClick={() => void remove(theme)}>{t('common:actions.delete')}</SmallButton>
                </ThemeCard>
              ))}
            </div>
          )
        )}
        {tab === 'community' && <Community activeName={activeName} />}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/[0.03] border border-white/[0.05] px-4 py-3">
        <div className="text-xs text-txt-tertiary">{t('settings:themes.resetHint')}</div>
        <button type="button" disabled={activeBuiltin === DEFAULT_THEME_ID} onClick={() => void select({ kind: 'builtin', id: DEFAULT_THEME_ID })} className="px-3 py-1.5 rounded-md bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary text-xs disabled:opacity-40">
          {t('settings:themes.actions.reset')}
        </button>
      </div>
    </section>
  );
}
