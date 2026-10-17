import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useThemeUiStore } from './themeShareCore';

/**
 * `/theme/<code>`: a shared theme link. Signed in, it opens the theme preview
 * over the app (nothing is applied until the user chooses); signed out, it
 * comes back here after sign-in.
 */
export function ThemeLinkRoute() {
  const { code } = useParams();
  const token = useAuthStore((s) => s.token);
  const valid = !!code && /^[A-Za-z0-9_-]{8,32}$/.test(code);
  useEffect(() => {
    if (token && valid && code) useThemeUiStore.getState().openShared(code);
  }, [token, valid, code]);
  if (!token) return <Navigate to={valid ? `/login?redirect=${encodeURIComponent(`/theme/${code}`)}` : '/login'} replace />;
  return <Navigate to="/channels/@me" replace />;
}
