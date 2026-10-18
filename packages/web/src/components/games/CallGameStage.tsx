import { useEffect, type ReactNode } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { GamePanel } from './GamePanel';

/**
 * The call view with a game in it: the game takes the main area and the
 * call's video tiles move to a column beside it (a strip above it on narrow
 * screens). The tiles (`children`, the VoiceGrid) keep their place in the
 * React tree whether or not a game is shown, so no video element is
 * recreated and no media track restarts when a game opens or closes.
 */
export function CallGameStage({ children }: { children: ReactNode }) {
  const me = useAuthStore((s) => s.user?.id ?? '');
  const session = useGameStore((s) => {
    const open = s.openId ? s.sessions[s.openId] : null;
    return open && !s.minimized && open.context.kind === 'voice' && open.players.includes(me) ? open : null;
  });
  const minimize = useGameStore((s) => s.minimize);
  const setStaged = useGameStore((s) => s.setStaged);
  const stagedId = session?.id ?? null;
  useEffect(() => {
    setStaged(stagedId);
    return () => setStaged(null);
  }, [stagedId, setStaged]);

  return (
    <div className={`flex-1 min-w-0 min-h-0 flex ${session ? 'flex-col-reverse desktop:flex-row gap-2 p-2' : ''}`}>
      {session ? (
        <div className="flex-1 min-h-0 min-w-0 rounded-2xl bg-surface-channel/95 ring-1 ring-white/[0.06] overflow-hidden flex flex-col">
          <GamePanel session={session} onMinimize={minimize} />
        </div>
      ) : null}
      <div className={session ? 'flex min-w-0 h-[132px] desktop:h-auto desktop:w-[280px] flex-shrink-0' : 'flex flex-1 min-w-0'}>
        {children}
      </div>
    </div>
  );
}
