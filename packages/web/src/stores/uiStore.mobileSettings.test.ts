import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../audio/AudioManager', () => ({
  AudioManager: { getInstance: vi.fn().mockReturnValue({ setOutputDevice: vi.fn(), setVolume: vi.fn() }) },
}));

import { useUIStore } from './uiStore';
import { mobileScreenMap } from '../components/layout/MobileShell';
import { MOBILE_SETTINGS_PANELS } from '../components/layout/MobileSettingsScreen';

beforeEach(() => {
  useUIStore.setState({ isMobile: true, mobileStack: [], activeModal: null, modalData: {} });
});

describe('settings links on mobile', () => {
  it('open the tab as a pushed screen instead of the (unmounted) settings modal', () => {
    useUIStore.getState().openModal('userSettings', { tab: 'profile' });
    const s = useUIStore.getState();
    expect(s.activeModal).toBeNull();
    expect(s.mobileStack.at(-1)?.screen).toBe('settings-profile');
  });

  it('open the settings list when no tab is named', () => {
    useUIStore.getState().openModal('userSettings');
    expect(useUIStore.getState().mobileStack.at(-1)?.screen).toBe('settings');
  });

  it('still open the modal on desktop', () => {
    useUIStore.setState({ isMobile: false });
    useUIStore.getState().openModal('userSettings', { tab: 'profile' });
    expect(useUIStore.getState().activeModal).toBe('userSettings');
  });

  it('every settings panel, Profile and Notifications included, has a screen', () => {
    expect(MOBILE_SETTINGS_PANELS).toEqual(expect.arrayContaining(['profile', 'notifications', 'whatsNew', 'account']));
    for (const id of MOBILE_SETTINGS_PANELS) expect(mobileScreenMap[`settings-${id}`]).toBeTypeOf('function');
  });
});
