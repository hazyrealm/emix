import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemeData } from '@backspace/shared/src/theme';
import { themeBackgroundCss, themeVariables } from '../../utils/appTheme';

/**
 * A miniature Emix drawn in `theme`: server rail, channel list, chat with a
 * mention and a link, the call bar and a profile card. The theme's variables
 * are scoped to this element, so nothing else on screen changes.
 * `detailed` adds readable sample text (the editor); cards use the outline.
 */
export function ThemePreview({ theme, detailed = false, className = '' }: { theme: ThemeData; detailed?: boolean; className?: string }) {
  const { t } = useTranslation(['settings']);
  const vars = useMemo(() => themeVariables(theme) as React.CSSProperties, [theme]);
  const bg = useMemo(() => themeBackgroundCss(theme), [theme]);
  const line = (w: string, cls = 'bg-txt-message/70') => <span className={`block h-[5px] rounded-full ${cls}`} style={{ width: w }} />;
  const text = (s: string, cls: string) => (detailed ? <span className={`block truncate ${cls}`}>{s}</span> : null);

  return (
    <div
      aria-hidden
      className={`relative overflow-hidden rounded-lg border border-white/[0.08] isolate ${className}`}
      style={{ ...vars, fontFamily: 'var(--app-font), DM Sans, system-ui, sans-serif', background: `rgb(${vars['--bg-base' as keyof React.CSSProperties] as string})` }}
    >
      {(bg.gradient || bg.image) && (
        <div className="absolute inset-0 -z-10">
          {bg.gradient && <div className="absolute inset-0" style={{ backgroundImage: bg.gradient }} />}
          {bg.image && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${bg.image}")`, filter: theme.background?.blur ? `blur(${theme.background.blur / 3}px)` : undefined }} />}
          {bg.image && theme.background?.dim ? <div className="absolute inset-0" style={{ background: `rgb(0 0 0 / ${theme.background.dim / 100})` }} /> : null}
        </div>
      )}
      <div className="flex h-full w-full text-[10px] leading-tight">
        {/* Server rail */}
        <div className="w-[11%] bg-surface-base flex flex-col items-center gap-[6%] pt-[5%]">
          <span className="w-[62%] aspect-square rounded-xl bg-accent-primary" />
          <span className="w-[62%] aspect-square rounded-full bg-gradient-to-br from-[rgb(var(--accent-secondary))] to-accent-primary" />
          <span className="w-[62%] aspect-square rounded-full bg-white/[0.1]" />
        </div>
        {/* Channels */}
        <div className="w-[25%] bg-surface-channel flex flex-col gap-[4%] p-[3%] border-r border-white/[0.05]">
          {text(t('settings:themes.preview.space'), 'font-semibold text-txt-primary mb-1')}
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`flex items-center gap-1 rounded px-1 py-[3%] ${i === 1 ? 'bg-interactive-selected' : ''}`}>
              <span className="text-txt-tertiary">#</span>
              {detailed
                ? <span className={i === 1 ? 'text-txt-primary' : 'text-txt-secondary'}>{t(`settings:themes.preview.channels.${i}` as 'settings:themes.preview.channels.0')}</span>
                : line(`${55 - i * 7}%`, i === 1 ? 'bg-txt-primary/80' : 'bg-txt-secondary/60')}
            </div>
          ))}
          <div className="mt-auto flex items-center gap-1 rounded-md bg-white/[0.04] p-[4%]">
            <span className="w-3 h-3 rounded-full bg-accent-primary flex-shrink-0" />
            {detailed ? <span className="text-txt-primary truncate">{t('settings:themes.preview.you')}</span> : line('50%', 'bg-txt-primary/70')}
          </div>
        </div>
        {/* Chat */}
        <div className="flex-1 bg-surface-chat flex flex-col relative">
          <div className="h-[11%] border-b border-white/[0.06] flex items-center px-[3%] gap-1">
            <span className="text-txt-tertiary">#</span>{detailed ? <span className="text-txt-primary font-semibold">{t('settings:themes.preview.channels.1')}</span> : line('22%', 'bg-txt-primary/80')}
          </div>
          <div className="flex-1 flex flex-col gap-[5%] p-[3%]">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`flex gap-1.5 rounded ${i === 1 ? 'bg-accent-amber/10 border-l-2 border-accent-amber pl-1' : ''}`}>
                <span className={`w-4 h-4 rounded-full flex-shrink-0 ${i === 0 ? 'bg-accent-primary' : i === 1 ? 'bg-[rgb(var(--accent-secondary))]' : 'bg-status-online'}`} />
                <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                  {detailed ? (
                    <>
                      <span className="text-txt-primary font-semibold">{t(`settings:themes.preview.names.${i}` as 'settings:themes.preview.names.0')} <span className="text-txt-tertiary font-normal">{t('settings:themes.preview.time')}</span></span>
                      <span className="text-txt-message">{t(`settings:themes.preview.messages.${i}` as 'settings:themes.preview.messages.0')}{i === 2 && <span className="text-txt-link underline"> {t('settings:themes.preview.link')}</span>}</span>
                    </>
                  ) : (
                    <>{line('30%', 'bg-txt-primary/80')}{line(`${80 - i * 15}%`)}{i === 2 && line('35%', 'bg-txt-link/80')}</>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Call bar */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[17%] flex gap-1 rounded-full glass-bubble px-1.5 py-1">
            <span className="w-3 h-3 rounded-full bg-white/[0.12]" />
            <span className="w-3 h-3 rounded-full bg-status-online/30" />
            <span className="w-3 h-3 rounded-full bg-white/[0.12]" />
            <span className="w-3 h-3 rounded-full bg-accent-rose" />
          </div>
          <div className="m-[3%] mt-0 rounded-lg bg-surface-input border border-white/[0.06] px-[3%] py-[2.5%] flex items-center">
            {detailed ? <span className="text-txt-tertiary">{t('settings:themes.preview.composer')}</span> : line('40%', 'bg-txt-tertiary/60')}
          </div>
          {/* Profile card */}
          <div className="absolute right-[3%] top-[15%] w-[34%] rounded-lg glass-modal overflow-hidden border border-white/[0.08]">
            <div className="h-5 bg-gradient-to-r from-accent-primary to-[rgb(var(--accent-secondary))]" />
            <div className="p-1.5 -mt-2.5">
              <span className="block w-5 h-5 rounded-full bg-[rgb(var(--accent-secondary))] ring-2 ring-[rgb(var(--bg-elevated))]" />
              {detailed ? <span className="block text-txt-primary font-semibold mt-0.5 truncate">{t('settings:themes.preview.names.1')}</span> : <span className="block mt-1">{line('60%', 'bg-txt-primary/80')}</span>}
              <span className="mt-1 block rounded bg-accent-primary text-on-accent text-center py-[2px]">{detailed ? t('settings:themes.preview.button') : ' '}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
