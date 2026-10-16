import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { api, RateLimitError } from '../../api/client';
import type { InstanceInfoResponse } from '@backspace/shared';
import { SourceCodeLink } from '../ui/SourceCodeLink';
import { describeError } from '../../i18n/errors';
import { AuthShell, ButtonSpinner, PasswordInput } from './AuthShell';

export function LoginPage() {
  const { t } = useTranslation(['auth', 'common']);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [retryAfter, setRetryAfter] = useState(0);
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');

  // AGPL § 13: anonymous users must be able to reach the source of the running
  // version. Fetched from the unauthenticated public info endpoint.
  const [instanceInfo, setInstanceInfo] = useState<InstanceInfoResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.instance.info()
      .then((info) => { if (!cancelled) setInstanceInfo(info); })
      .catch(() => { /* Non-critical — link is simply omitted if unreachable. */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setInterval(() => {
      setRetryAfter((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError(t('auth:validation.usernameRequired'));
      return;
    }
    if (!password) {
      setError(t('auth:validation.passwordRequired'));
      return;
    }

    try {
      await login(username.trim(), password);
      if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
        navigate(redirect);
      } else {
        navigate('/channels/@me');
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        setRetryAfter(err.retryAfter);
        setError('');
      } else {
        setError(err instanceof Error ? describeError(err) : t('auth:login.failed'));
      }
    }
  };

  const isDisabled = isLoading || retryAfter > 0;

  return (
    <AuthShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-txt-primary">{t('auth:login.title')}</h1>
        <p className="text-txt-tertiary mt-1">{t('auth:login.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {retryAfter > 0 && (
          <div role="alert" className="mb-4 p-3 bg-accent-amber/10 border border-accent-amber/30 rounded-lg text-sm">
            <p className="font-medium text-accent-amber">{t('auth:login.rateLimited.title')}</p>
            <p className="text-txt-secondary mt-0.5">{t('auth:login.rateLimited.retryIn', { seconds: retryAfter })}</p>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 p-3 bg-accent-rose/10 border border-accent-rose/30 rounded-lg text-txt-danger text-sm">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="login-username" className="block text-xs font-bold text-txt-secondary uppercase mb-2">
            {t('common:labels.username')} <span className="text-txt-danger">*</span>
          </label>
          <input
            id="login-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input-standard w-full py-2.5"
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>

        <div className="mb-2">
          <label htmlFor="login-password" className="block text-xs font-bold text-txt-secondary uppercase mb-2">
            {t('common:labels.password')} <span className="text-txt-danger">*</span>
          </label>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-standard w-full py-2.5"
            autoComplete="current-password"
          />
        </div>
        <p className="mb-5 text-xs text-txt-tertiary">{t('auth:shell.recovery')}</p>

        <button
          type="submit"
          disabled={isDisabled}
          aria-busy={isLoading}
          className="emix-gradient-button w-full py-2.5 text-white font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading && <ButtonSpinner />}
          {retryAfter > 0
            ? t('auth:login.rateLimited.retryIn', { seconds: retryAfter })
            : isLoading
              ? t('auth:login.submitting')
              : t('common:actions.logIn')}
        </button>

        <p className="mt-4 text-sm text-txt-tertiary">
          <Trans
            t={t}
            i18nKey="auth:login.registerPrompt"
            components={{
              actionLink: <Link to={`/register${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`} className="text-txt-link hover:underline" />,
            }}
          />
        </p>
      </form>

      {instanceInfo && (
        <div className="mt-6 pt-4 border-t border-white/[0.06] flex justify-center text-center">
          <SourceCodeLink sourceCodeUrl={instanceInfo.sourceCodeUrl} version={instanceInfo.version} commit={instanceInfo.commit} />
        </div>
      )}
    </AuthShell>
  );
}
