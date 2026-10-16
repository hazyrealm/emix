import { useTranslation } from 'react-i18next';
import {
  CHANGELOG_SECTIONS,
  itemText,
  type ChangelogItem,
  type ChangelogRelease,
  type ChangelogSection,
} from '@backspace/shared/src/changelog';
import { useChangelogStore } from '../../stores/changelogStore';
import { useFormatters } from '../../i18n/formatters';

const SECTION_STYLE: Record<ChangelogSection, string> = {
  new: 'bg-[#ff3ea5]/15 text-[#ff7cc4] border-[#ff3ea5]/30',
  improved: 'bg-[#22a0ff]/15 text-[#7cc6ff] border-[#22a0ff]/30',
  fixed: 'bg-status-online/15 text-status-online border-status-online/30',
  performance: 'bg-accent-amber/15 text-accent-amber border-accent-amber/30',
  security: 'bg-[#a855f7]/15 text-[#c79bff] border-[#a855f7]/30',
};

export function SectionChip({ section }: { section: ChangelogSection }) {
  const { t } = useTranslation(['common']);
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SECTION_STYLE[section]}`}>
      {t(`common:changelog.sections.${section}`)}
    </span>
  );
}

export function ItemList({ items }: { items: ChangelogItem[] }) {
  return (
    <ul className="mt-1.5 space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="text-[13px] text-txt-secondary leading-snug pl-3.5 relative">
          <span aria-hidden className="absolute left-0 top-[0.55em] w-1.5 h-1.5 rounded-full bg-white/25" />
          {itemText(item)}
          {typeof item === 'object' && item.image && (
            <img src={item.image} alt="" loading="lazy" className="mt-2 rounded-lg border border-white/[0.08] w-full" />
          )}
        </li>
      ))}
    </ul>
  );
}

/** One release, as the full changelog lists it. */
export function ReleaseEntry({ release }: { release: ChangelogRelease }) {
  const { t } = useTranslation(['common']);
  const f = useFormatters();
  return (
    <article className="py-4 border-b border-white/[0.06] last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[15px] font-semibold text-txt-primary">{t('common:changelog.version', { version: release.version })}</h3>
        <span className="text-xs text-txt-tertiary">{f.formatMediumDate(Date.parse(`${release.date}T12:00:00Z`))}</span>
      </div>
      {release.title && <p className="text-sm text-txt-primary mt-1">{release.title}</p>}
      {release.summary && <p className="text-[13px] text-txt-tertiary mt-0.5">{release.summary}</p>}
      {CHANGELOG_SECTIONS.map((section) => {
        const items = release.sections[section];
        if (!items?.length) return null;
        return (
          <div key={section} className="mt-3">
            <SectionChip section={section} />
            <ItemList items={items} />
          </div>
        );
      })}
    </article>
  );
}

/** Every announced release, newest first. Used by the dialog and the settings tab. */
export function ChangelogList() {
  const { t } = useTranslation(['common']);
  const releases = useChangelogStore((s) => s.releases);
  const acknowledged = useChangelogStore((s) => s.acknowledged);
  if (acknowledged === undefined && releases.length === 0) {
    return <p className="text-sm text-txt-tertiary py-6">{t('common:changelog.unavailable')}</p>;
  }
  if (releases.length === 0) return <p className="text-sm text-txt-tertiary py-6">{t('common:changelog.empty')}</p>;
  return <div>{releases.map((r) => <ReleaseEntry key={r.version} release={r} />)}</div>;
}
