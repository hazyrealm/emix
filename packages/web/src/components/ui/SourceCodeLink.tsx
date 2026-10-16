import { useTranslation } from 'react-i18next';

/** Emix: license, NOTICE and upstream attribution, kept with the source offer. */
const LICENSES_URL = 'https://github.com/hazyrealm/emix/blob/main/EMIX.md';

interface SourceCodeLinkProps {
  /** URL to the Corresponding Source of the running version (AGPL § 13). */
  sourceCodeUrl: string;
  /** Running version string, e.g. "1.0.0". Omitted from the label when unknown. */
  version?: string;
  /** Short git commit/tag of the running build; appended to pin the exact version. */
  commit?: string | null;
  /** Extra classes for layout composition (alignment, spacing) at the call site. */
  className?: string;
}

/**
 * AGPL-3.0 § 13 "network-use source offer".
 *
 * Renders an accessible external link to the Corresponding Source of the version
 * the instance is actually running. The URL is operator-configurable server-side
 * (BACKSPACE_SOURCE_URL) and surfaced via GET /api/instance/info, so a modified
 * self-hosted fork points humans at its own source.
 *
 * Rendered on every network-facing surface (settings sidebars, pre-auth pages)
 * so any network user — authenticated or anonymous — can reach the source.
 */
export function SourceCodeLink({ sourceCodeUrl, version, commit, className }: SourceCodeLinkProps) {
  const { t } = useTranslation('common');
  const build = version ? `v${version}${commit ? ` (${commit})` : ''}` : '';
  const label = build ? t('sourceCode.labelWithBuild', { build }) : t('sourceCode.label');

  return (
    <span className={`inline-flex flex-col gap-0.5${className ? ` ${className}` : ''}`}>
      <a
        href={sourceCodeUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 text-xs text-txt-tertiary hover:text-txt-secondary transition-colors"
        title={t('sourceCode.title')}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="flex-shrink-0"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
        <span>{label}</span>
      </a>
      {/* Emix: upstream attribution and license notices (AGPL-3.0, NOTICE). */}
      <span className="text-[11px] text-txt-tertiary/80">
        {t('sourceCode.attribution')} ·{' '}
        <a href={LICENSES_URL} target="_blank" rel="noreferrer noopener" className="underline hover:text-txt-secondary">
          {t('sourceCode.licenses')}
        </a>
      </span>
    </span>
  );
}
