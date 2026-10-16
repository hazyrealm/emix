import { create } from 'zustand';
import { unseenReleases, type ChangelogRelease } from '@backspace/shared/src/changelog';
import { api } from '../api/client';

/** Remembered for this tab when the server could not record an acknowledgment. */
const SESSION_ACK_KEY = 'emix-changelog-ack';

interface ChangelogState {
  releases: ChangelogRelease[];
  /** The newest version this account acknowledged; undefined until loaded. */
  acknowledged: string | null | undefined;
  loadedFor: string | null;
  /** The full changelog dialog. */
  viewerOpen: boolean;
  load: (userId: string) => Promise<void>;
  acknowledgeLatest: () => void;
  setViewerOpen: (open: boolean) => void;
}

function sessionAck(): string | null {
  try { return sessionStorage.getItem(SESSION_ACK_KEY); } catch { return null; }
}

/**
 * The changelog the server announces and how far this account has read it.
 * Loading never blocks anything: a failure leaves nothing to show.
 */
export const useChangelogStore = create<ChangelogState>((set, get) => ({
  releases: [],
  acknowledged: undefined,
  loadedFor: null,
  viewerOpen: false,
  load: async (userId) => {
    if (get().loadedFor === userId) return;
    set({ loadedFor: userId });
    try {
      const [{ releases }, state] = await Promise.all([api.changelog.list(), api.changelog.state()]);
      // An acknowledgment the server missed (offline at the time) still counts in this tab.
      const local = sessionAck();
      const localValid = local !== null && releases.some((r) => r.version === local);
      set({ releases, acknowledged: state.acknowledged ?? (localValid ? local : null) });
    } catch {
      set({ releases: [], acknowledged: undefined });
    }
  },
  acknowledgeLatest: () => {
    const latest = get().releases[0]?.version;
    if (!latest) return;
    set({ acknowledged: latest });
    try { sessionStorage.setItem(SESSION_ACK_KEY, latest); } catch { /* not available */ }
    api.changelog.acknowledge(latest).catch(() => { /* kept for this session; retried next time */ });
  },
  setViewerOpen: (viewerOpen) => set({ viewerOpen }),
}));

/** True while a release this account has not acknowledged is available. */
export function useWhatsNewUnread(): boolean {
  return useChangelogStore((s) => s.acknowledged !== undefined && unseenReleases(s.releases, s.acknowledged).length > 0);
}
