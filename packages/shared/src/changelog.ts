/**
 * The Emix changelog: one reviewed list of releases (`packages/shared/changelog.json`)
 * that the server publishes at `/api/changelog`, getemix.com/changelog renders,
 * and the app shows in What's New. A release is public only when its status is
 * `published` and the running server is at least that version, so an entry
 * reaches users when the build carrying it is deployed, never before.
 */

export const CHANGELOG_SECTIONS = ['new', 'improved', 'fixed', 'performance', 'security'] as const;
export type ChangelogSection = (typeof CHANGELOG_SECTIONS)[number];

export interface ChangelogItemDetail {
  text: string;
  /** Optional screenshot, a path under the web app (e.g. `/changelog/1.12.0-profiles.webp`). */
  image?: string;
}
export type ChangelogItem = string | ChangelogItemDetail;

export interface ChangelogRelease {
  version: string;
  /** Release date, YYYY-MM-DD. */
  date: string;
  /** `draft` entries are written by the release script and never served. */
  status: 'draft' | 'published';
  title?: string;
  summary?: string;
  /** A major release is the one a brand-new account is shown. */
  major?: boolean;
  sections: Partial<Record<ChangelogSection, ChangelogItem[]>>;
}

export interface ChangelogResponse {
  releases: ChangelogRelease[];
}

export interface ChangelogStateResponse {
  /** The newest version this account acknowledged; null = never. */
  acknowledged: string | null;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** -1, 0 or 1. Versions that are not x.y.z sort before every real one. */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function isChangelogVersion(value: unknown): value is string {
  return typeof value === 'string' && SEMVER.test(value);
}

export function itemText(item: ChangelogItem): string {
  return typeof item === 'string' ? item : item.text;
}

/** Published releases no newer than `runningVersion`, newest first. */
export function publishedReleases(all: readonly ChangelogRelease[], runningVersion: string): ChangelogRelease[] {
  return all
    .filter((r) => r.status === 'published' && compareVersions(r.version, runningVersion) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * The releases What's New should show: everything newer than the
 * acknowledged version, or, for an account that never acknowledged one, just
 * the latest major release (or the latest release when none is major), so a
 * new account sees a welcome and not the whole history. `releases` is newest
 * first, as {@link publishedReleases} returns it.
 */
export function unseenReleases(releases: readonly ChangelogRelease[], acknowledged: string | null): ChangelogRelease[] {
  if (!releases.length) return [];
  if (acknowledged === null) {
    const major = releases.find((r) => r.major) ?? releases[0];
    return major ? [major] : [];
  }
  return releases.filter((r) => compareVersions(r.version, acknowledged) > 0);
}

/** Problems with a changelog document, empty when it is valid. Used by tests and the release script. */
export function validateChangelog(data: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(data)) return ['changelog must be an array of releases'];
  const seen = new Set<string>();
  data.forEach((r, i) => {
    const at = `release[${i}]`;
    if (!r || typeof r !== 'object') { errors.push(`${at}: not an object`); return; }
    const rel = r as Record<string, unknown>;
    if (!isChangelogVersion(rel.version)) errors.push(`${at}: version must be x.y.z`);
    else if (seen.has(rel.version)) errors.push(`${at}: duplicate version ${rel.version}`);
    else seen.add(rel.version);
    if (typeof rel.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rel.date)) errors.push(`${at}: date must be YYYY-MM-DD`);
    if (rel.status !== 'draft' && rel.status !== 'published') errors.push(`${at}: status must be draft or published`);
    if (!rel.sections || typeof rel.sections !== 'object') { errors.push(`${at}: sections missing`); return; }
    let count = 0;
    for (const [key, items] of Object.entries(rel.sections as Record<string, unknown>)) {
      if (!(CHANGELOG_SECTIONS as readonly string[]).includes(key)) errors.push(`${at}: unknown section ${key}`);
      if (!Array.isArray(items)) { errors.push(`${at}.${key}: must be an array`); continue; }
      for (const item of items) {
        const t = typeof item === 'string' ? item : (item as ChangelogItemDetail | null)?.text;
        if (typeof t !== 'string' || !t.trim()) errors.push(`${at}.${key}: empty item`);
        const img = typeof item === 'object' && item ? (item as ChangelogItemDetail).image : undefined;
        if (img !== undefined && (typeof img !== 'string' || !/^\/changelog\/[A-Za-z0-9._-]+$/.test(img))) {
          errors.push(`${at}.${key}: image must be /changelog/<file>`);
        }
        count++;
      }
    }
    if (rel.status === 'published' && count === 0) errors.push(`${at}: a published release needs at least one item`);
  });
  return errors;
}
