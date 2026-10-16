import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Emix sign-in frame shared by the login and registration pages: a branded
 * panel on wide screens, the wordmark above the card on narrow ones, and a
 * slow ambient gradient that stops under prefers-reduced-motion. Pure CSS: no
 * canvas, no per-frame JavaScript.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation(['auth', 'common']);
  const features = [t('auth:shell.featureVoice'), t('auth:shell.featureVideo'), t('auth:shell.featureScreen'), t('auth:shell.featureMessages')];

  return (
    <div className="emix-auth h-full overflow-y-auto bg-surface-base relative">
      <div className="emix-auth-glow" aria-hidden="true">
        <span className="emix-auth-orb emix-auth-orb-pink" />
        <span className="emix-auth-orb emix-auth-orb-purple" />
        <span className="emix-auth-orb emix-auth-orb-blue" />
      </div>

      <div className="relative z-10 min-h-full flex items-center justify-center px-4 py-8 md:py-12">
        <div className="w-full max-w-[1040px] grid items-center gap-10 lg:grid-cols-[1fr_440px]">
          <section className="hidden lg:flex flex-col gap-6 pr-6">
            <img src="/icons/emix-wordmark.png" alt={t('common:appName')} className="w-[260px] h-auto -ml-2 select-none" draggable={false} />
            <h2 className="text-[40px] leading-[1.1] font-bold tracking-tight text-txt-primary">
              {t('auth:shell.headline')}
            </h2>
            <p className="text-lg text-txt-secondary max-w-[440px]">{t('auth:shell.tagline')}</p>
            <ul className="grid grid-cols-2 gap-3 max-w-[460px]">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-txt-secondary">
                  <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#ff3ea5] to-[#22d3ee] flex-shrink-0" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
          </section>

          <div className="w-full max-w-[440px] mx-auto">
            <img src="/icons/emix-wordmark.png" alt={t('common:appName')} className="lg:hidden w-[170px] h-auto mx-auto mb-6 select-none" draggable={false} />
            <div className="emix-auth-card rounded-2xl p-6 md:p-8">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Password field with a show/hide toggle; forwards every input prop. */
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useTranslation('auth');
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={`${props.className ?? ''} pr-11`} />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-txt-tertiary hover:text-txt-secondary transition-colors"
        aria-label={visible ? t('shell.hidePassword') : t('shell.showPassword')}
        aria-pressed={visible}
        tabIndex={0}
      >
        {visible ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.24A9.12 9.12 0 0112 4c5 0 9 4.5 10 8a11.8 11.8 0 01-2.2 3.6M6.6 6.6C4.2 8.1 2.6 10.3 2 12c1 3.5 5 8 10 8a9.7 9.7 0 005.4-1.6" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12c1-3.5 5-8 10-8s9 4.5 10 8c-1 3.5-5 8-10 8S3 15.5 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

/** Inline spinner for submit buttons while a request is in flight. */
export function ButtonSpinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
