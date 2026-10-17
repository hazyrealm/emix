import { useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';

/** Loads the signed-in account's theme, so every device shows the same one. */
export function ThemeSync() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  useEffect(() => {
    if (userId) void useThemeStore.getState().syncFromServer(userId);
  }, [userId]);
  return null;
}
