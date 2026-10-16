import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProfileMotionState {
  /** Animated names, nameplates, decorations and profile effects. Per device. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

function apply(enabled: boolean): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.emxMotion = enabled ? 'on' : 'off';
}

/**
 * The "Profile animations" preference. Off pins every profile animation to
 * its still frame (styles/profileStyle.css); prefers-reduced-motion does the
 * same whatever this says.
 */
export const useProfileMotionStore = create<ProfileMotionState>()(persist(
  (set) => ({ enabled: true, setEnabled: (enabled) => { apply(enabled); set({ enabled }); } }),
  {
    name: 'emix-profile-motion',
    partialize: (state) => ({ enabled: state.enabled }),
    onRehydrateStorage: () => (state) => apply(state?.enabled !== false),
  },
));

apply(useProfileMotionStore.getState().enabled);
