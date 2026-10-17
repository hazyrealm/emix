import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  USERNAME_MAX, USERNAME_MIN, normalizeUsername, usernameProblem,
  type UsernameCheck, type UsernameStatus,
} from '@backspace/shared/src/username';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { useUIStore } from '../../../stores/uiStore';
import { describeError } from '../../../i18n/errors';
import { useFormatters } from '../../../i18n/formatters';

const REASON = {
  too_short: 'settings:account.username.reason.tooShort',
  too_long: 'settings:account.username.reason.tooLong',
  characters: 'settings:account.username.reason.characters',
  reserved: 'settings:account.username.reason.reserved',
  taken: 'settings:account.username.reason.taken',
  current: 'settings:account.username.reason.current',
} as const satisfies Record<NonNullable<UsernameCheck['reason']>, string>;

/** Change the username: availability as you type, password to confirm, once per 30 days. */
export function UsernameSection() {
  const { t } = useTranslation(['settings', 'common']);
  const f = useFormatters();
  const user = useAuthStore((s) => s.user);
  const addToast = useUIStore((s) => s.addToast);
  const [status, setStatus] = useState<UsernameStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [password, setPassword] = useState('');
  const [check, setCheck] = useState<UsernameCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.username.status().then(setStatus).catch(() => {});
  }, [user?.username]);

  // Availability, checked a moment after typing stops; rules are checked at once.
  const name = normalizeUsername(draft);
  const localProblem = draft ? usernameProblem(name) : null;
  useEffect(() => {
    setCheck(null);
    if (!draft || localProblem) return;
    setChecking(true);
    const timer = setTimeout(() => {
      api.username.check(name).then(setCheck).catch(() => setCheck(null)).finally(() => setChecking(false));
    }, 400);
    return () => { clearTimeout(timer); setChecking(false); };
  }, [draft, name, localProblem]);

  if (!user) return null;
  const blocked = status?.nextChangeAt ?? null;
  const reason = localProblem ?? check?.reason ?? null;
  const canSave = !!draft && !reason && check?.available === true && !!password && !saving;

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const next = await useAuthStore.getState().changeUsername(name, password);
      setStatus(next);
      setEditing(false);
      setDraft('');
      setPassword('');
      addToast(t('settings:account.username.changed', { username: name }), 'success', 2500);
    } catch (err) {
      setError(describeError(err));
      api.username.status().then(setStatus).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-1.5">{t('settings:account.username.title')}</div>
      <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] text-txt-primary truncate">@{user.username}</div>
            <div className="text-[11px] text-txt-tertiary">
              {status && !status.canChange
                ? t('settings:account.username.notHere')
                : blocked
                  ? t('settings:account.username.nextChange', { date: f.formatDateTime(blocked) })
                  : t('settings:account.username.canChange')}
            </div>
          </div>
          {status?.canChange && !blocked && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-md text-xs bg-white/[0.08] hover:bg-white/[0.14] text-txt-primary">
              {t('settings:account.username.change')}
            </button>
          )}
        </div>

        {editing && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (canSave) void save(); }}>
            <div>
              <label className="block text-xs text-txt-secondary mb-1.5" htmlFor="new-username">{t('settings:account.username.newLabel')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary text-sm">@</span>
                <input
                  id="new-username"
                  value={draft}
                  maxLength={USERNAME_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setDraft(e.target.value)}
                  className="input-standard w-full pl-7"
                  placeholder={user.username}
                />
              </div>
              <p className={`text-[11px] mt-1 ${reason ? 'text-txt-danger' : check?.available ? 'text-status-online' : 'text-txt-tertiary'}`} aria-live="polite">
                {!draft
                  ? t('settings:account.username.rules', { min: USERNAME_MIN, max: USERNAME_MAX })
                  : reason
                    ? t(REASON[reason], { min: USERNAME_MIN, max: USERNAME_MAX })
                    : checking || !check
                      ? t('settings:account.username.checking')
                      : t('settings:account.username.available', { username: name })}
              </p>
            </div>
            <div>
              <label className="block text-xs text-txt-secondary mb-1.5" htmlFor="username-password">{t('settings:account.username.password')}</label>
              <input id="username-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-standard w-full" />
            </div>
            <p className="text-[11px] text-txt-tertiary">{t('settings:account.username.cooldownNote')}</p>
            {error && <p className="text-xs text-txt-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setEditing(false); setDraft(''); setPassword(''); setError(''); }} className="px-3 py-1.5 rounded-md text-xs text-txt-secondary hover:text-txt-primary">
                {t('common:actions.cancel')}
              </button>
              <button type="submit" disabled={!canSave} className="px-3 py-1.5 rounded-md text-xs font-medium bg-accent-primary hover:bg-accent-primary-hover text-on-accent disabled:opacity-50">
                {saving ? t('settings:account.username.saving') : t('settings:account.username.save')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
