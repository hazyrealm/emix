import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { DmChannel } from '@backspace/shared';
import type { ThemeRecord } from '@backspace/shared/src/theme';
import { api } from '../../api/client';
import { useThemeStore } from '../../stores/themeStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { useDmViewer } from '../../hooks/useDmViewer';
import { formatDmHeaderName } from '../../utils/dmFormatters';
import { describeError } from '../../i18n/errors';
import { ThemePreview } from './ThemePreview';
import { creditOf, downloadThemeFile, themeCodesIn, themeShareUrl, useSharedThemeActions, useThemeUiStore } from './themeShareCore';

function Dialog({ label, onClose, children, wide = false }: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[360] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={label} className={`relative w-full ${wide ? 'max-w-[620px]' : 'max-w-[460px]'} max-h-[calc(calc(100*var(--app-vh))-2rem)] overflow-y-auto scrollbar-thin glass-modal rounded-2xl border border-white/[0.08] p-5 shadow-2xl`}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function DmTarget({ dm, onSend }: { dm: DmChannel; onSend: (id: string) => void }) {
  const viewer = useDmViewer(dm.id);
  return (
    <button type="button" onClick={() => onSend(dm.id)} className="w-full text-left px-3 py-2 rounded-md text-sm text-txt-secondary hover:bg-interactive-hover hover:text-txt-primary truncate">
      {formatDmHeaderName(dm, viewer)}
    </button>
  );
}

/** Share a theme: copy its link, send it to a conversation or channel, or export it. */
function ShareThemeDialog({ theme }: { theme: ThemeRecord }) {
  const { t } = useTranslation(['settings', 'common']);
  const close = () => useThemeUiStore.getState().share(null);
  const addToast = useUIStore((s) => s.addToast);
  const dms = useSpaceStore((s) => s.dmChannels);
  const channels = useSpaceStore((s) => s.channels);
  const [query, setQuery] = useState('');
  const link = themeShareUrl(theme.shareCode);
  const textChannels = channels.filter((c) => c.type === 'text');
  const q = query.trim().toLowerCase();

  const send = async (channelId: string) => {
    try {
      await useChatStore.getState().sendMessage(channelId, t('settings:themes.share.message', { name: theme.name, link }));
      addToast(t('settings:themes.share.sent'), 'success', 2000);
      close();
    } catch (err) {
      addToast(describeError(err), 'warning');
    }
  };

  return (
    <Dialog label={t('settings:themes.share.title')} onClose={close}>
      <h2 className="text-lg font-semibold text-txt-primary">{t('settings:themes.share.title')}</h2>
      <p className="text-xs text-txt-tertiary mt-1">{t('settings:themes.share.hint')}</p>
      <ThemePreview theme={theme.data} className="aspect-[16/9] w-full mt-4" />
      <div className="mt-4 flex gap-2">
        <input readOnly value={link} className="input-search flex-1 min-w-0 px-3 py-2 rounded-md text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(link); addToast(t('settings:themes.share.copied'), 'success', 1500); }} className="px-3 py-2 rounded-md bg-accent-primary text-on-accent text-xs font-medium">
          {t('settings:themes.share.copy')}
        </button>
        <button type="button" onClick={() => downloadThemeFile(theme)} className="px-3 py-2 rounded-md bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary text-xs">
          {t('settings:themes.actions.export')}
        </button>
      </div>
      <div className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-txt-tertiary">{t('settings:themes.share.sendTo')}</div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('settings:themes.share.search')} className="input-search w-full mt-2 px-3 py-2 rounded-md text-sm" />
      <div className="mt-2 max-h-56 overflow-y-auto scrollbar-thin">
        {textChannels.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 20).map((c) => (
          <button key={c.id} type="button" onClick={() => void send(c.id)} className="w-full text-left px-3 py-2 rounded-md text-sm text-txt-secondary hover:bg-interactive-hover hover:text-txt-primary truncate">
            <span className="text-txt-tertiary mr-1">#</span>{c.name}
          </button>
        ))}
        {dms.slice(0, 40).map((dm) => <DmFilter key={dm.id} dm={dm} query={q} onSend={(id) => void send(id)} />)}
      </div>
    </Dialog>
  );
}

function DmFilter({ dm, query, onSend }: { dm: DmChannel; query: string; onSend: (id: string) => void }) {
  const viewer = useDmViewer(dm.id);
  if (query && !formatDmHeaderName(dm, viewer).toLowerCase().includes(query)) return null;
  return <DmTarget dm={dm} onSend={onSend} />;
}

function SharedThemeDialog({ code }: { code: string }) {
  const { t } = useTranslation(['settings', 'common']);
  const [theme, setTheme] = useState<ThemeRecord | null>(null);
  const [failed, setFailed] = useState(false);
  const [trying, setTrying] = useState(false);
  const { apply, save } = useSharedThemeActions(theme);
  const close = () => {
    if (trying) useThemeStore.getState().setPreview(null);
    useThemeUiStore.getState().openShared(null);
  };

  useEffect(() => {
    let cancelled = false;
    api.themes.byShareCode(code).then((r) => { if (!cancelled) setTheme(r.theme); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [code]);

  const credit = theme ? creditOf(theme) : null;
  return (
    <Dialog label={t('settings:themes.shared.title')} onClose={close} wide>
      {failed ? (
        <p className="text-sm text-txt-secondary">{t('settings:themes.shared.notFound')}</p>
      ) : !theme ? (
        <p className="text-sm text-txt-tertiary">{t('settings:themes.loading')}</p>
      ) : (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent-primary">{t('settings:themes.shared.title')}</div>
          <h2 className="text-xl font-bold text-txt-primary mt-1">{theme.name}</h2>
          <p className="text-xs text-txt-tertiary mt-0.5">
            {credit ? t('settings:themes.by', { name: credit }) : null}
            {theme.basedOn ? ` · ${t('settings:themes.basedOn', { name: theme.basedOn.name, creator: theme.basedOn.creatorName })}` : null}
          </p>
          {theme.description && <p className="text-sm text-txt-secondary mt-2">{theme.description}</p>}
          <ThemePreview theme={theme.data} detailed className="aspect-[16/9] w-full mt-4" />
          <p className="text-[11px] text-txt-tertiary mt-3">{t('settings:themes.shared.safe')}</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={close} className="px-4 py-2 rounded-full text-sm text-txt-secondary hover:text-txt-primary">{t('common:actions.close')}</button>
            <button type="button" onClick={() => { setTrying((v) => !v); useThemeStore.getState().setPreview(trying ? null : theme.data); }} className="px-4 py-2 rounded-full text-sm bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary">
              {trying ? t('settings:themes.shared.stopTrying') : t('settings:themes.shared.try')}
            </button>
            {!theme.isMine && (
              <button type="button" onClick={() => void save()} className="px-4 py-2 rounded-full text-sm bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary">{t('settings:themes.actions.saveToMine')}</button>
            )}
            <button type="button" onClick={() => { void apply(); useThemeUiStore.getState().openShared(null); }} className="px-5 py-2 rounded-full text-sm font-medium text-on-accent emix-gradient-button">
              {t('settings:themes.actions.apply')}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** Mounted once in the app shell: the share dialog and shared-theme previews. */
export function ThemeDialogs() {
  const sharedCode = useThemeUiStore((s) => s.sharedCode);
  const sharing = useThemeUiStore((s) => s.sharing);
  return (
    <>
      {sharing && <ShareThemeDialog theme={sharing} />}
      {sharedCode && <SharedThemeDialog key={sharedCode} code={sharedCode} />}
    </>
  );
}

/** A theme card under a message that contains a theme link. */
function ThemeLinkCard({ code }: { code: string }) {
  const { t } = useTranslation(['settings']);
  const [theme, setTheme] = useState<ThemeRecord | null>(null);
  const [failed, setFailed] = useState(false);
  const { apply } = useSharedThemeActions(theme);
  useEffect(() => {
    let cancelled = false;
    api.themes.byShareCode(code).then((r) => { if (!cancelled) setTheme(r.theme); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [code]);
  if (failed) return null;
  const credit = theme ? creditOf(theme) : null;
  return (
    <div className="mt-1 w-full max-w-[360px] rounded-xl border border-white/[0.08] bg-surface-elevated/80 overflow-hidden">
      {theme ? <ThemePreview theme={theme.data} className="aspect-[16/8] w-full rounded-none border-0" /> : <div className="aspect-[16/8] w-full bg-white/[0.04] animate-pulse" />}
      <div className="p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-accent-primary">{t('settings:themes.card.label')}</div>
        <div className="text-sm font-semibold text-txt-primary truncate">{theme?.name ?? ' '}</div>
        {credit && <div className="text-xs text-txt-tertiary truncate">{t('settings:themes.by', { name: credit })}</div>}
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={!theme} onClick={() => useThemeUiStore.getState().openShared(code)} className="flex-1 py-1.5 rounded-md text-xs bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary disabled:opacity-50">
            {t('settings:themes.actions.preview')}
          </button>
          <button type="button" disabled={!theme} onClick={() => void apply()} className="flex-1 py-1.5 rounded-md text-xs font-medium bg-accent-primary hover:bg-accent-primary-hover text-on-accent disabled:opacity-50">
            {t('settings:themes.actions.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Theme cards for the theme links in a message. */
export function ThemeLinkCards({ content }: { content: string | null | undefined }) {
  const codes = useMemo(() => themeCodesIn(content), [content]);
  if (!codes.length) return null;
  return <div className="flex flex-col gap-2">{codes.map((c) => <ThemeLinkCard key={c} code={c} />)}</div>;
}

export { creditOf, downloadThemeFile, themeCodesIn, themeShareUrl, useSharedThemeActions, useThemeUiStore };
