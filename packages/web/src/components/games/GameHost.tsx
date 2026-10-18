import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameSessionView } from '@backspace/shared/src/games';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { alertsAllowed } from '../../utils/alerts';
import { GameArt } from './GameArt';
import { GAME_NAME_KEYS } from './gameCatalog';
import { GamePanel } from './GamePanel';
import { NewGameDialog } from './NewGameDialog';
import { GameButton, GamepadIcon, PlayerName } from './gameUi';

/** Popups for new invitations. Do Not Disturb keeps them quiet: they wait in the Games hub. */
function InvitePopups({ invites }: { invites: GameSessionView[] }) {
  const { t } = useTranslation(['games']);
  const accept = useGameStore((s) => s.accept);
  const decline = useGameStore((s) => s.decline);
  const quiet = useGameStore((s) => s.quietInvite);
  const quietIds = useGameStore((s) => s.quietInvites);
  useAuthStore((s) => s.user?.status); // re-render when the status changes
  if (!alertsAllowed('game_invite')) return null;
  const shown = invites.filter((s) => !quietIds.includes(s.id)).slice(0, 3);
  if (!shown.length) return null;
  return (
    <div className="fixed top-3 right-3 left-3 desktop:left-auto z-[220] flex flex-col gap-2 desktop:w-[360px]" aria-live="polite">
      {shown.map((s) => (
        <div key={s.id} className="glass-modal rounded-xl p-3 flex gap-3 items-center animate-slide-up shadow-xl" role="alertdialog" aria-label={t('games:invite.title')}>
          <GameArt id={s.gameId} className="w-12 h-12 rounded-lg flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] leading-snug"><span className="font-semibold"><PlayerName id={s.hostId} /></span> {t('games:invite.invitedYou', { game: t(GAME_NAME_KEYS[s.gameId]) })}</div>
            <div className="flex gap-1.5 mt-2">
              <GameButton kind="primary" className="!py-1.5" onClick={() => void accept(s.id)}>{t('games:invite.accept')}</GameButton>
              <GameButton className="!py-1.5" onClick={() => void decline(s.id)}>{t('games:invite.decline')}</GameButton>
              <GameButton kind="ghost" className="!py-1.5 !px-2" onClick={() => quiet(s.id)}>{t('games:invite.later')}</GameButton>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A minimized game: a pill that brings it back. */
function Dock({ session, onRestore, extra }: { session: GameSessionView | null; onRestore: () => void; extra: number }) {
  const { t } = useTranslation(['games']);
  const me = useAuthStore((s) => s.user?.id ?? '');
  const isMobile = useUIStore((s) => s.isMobile);
  if (!session) return null;
  const turn = (session.view as { turn?: number | string; me?: number; colors?: string[] } | null);
  const myTurn = session.status === 'playing' && turn && typeof turn.me === 'number' && (
    turn.colors ? turn.colors[turn.me] === turn.turn : turn.turn === turn.me
  );
  return (
    <button
      type="button"
      onClick={onRestore}
      className={`fixed z-[205] right-3 ${isMobile ? 'bottom-[76px]' : 'bottom-4'} flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full glass-modal shadow-lg hover:brightness-110`}
      aria-label={t('games:window.restore')}
    >
      <GameArt id={session.gameId} className="w-8 h-8 rounded-full" />
      <span className="text-[13px] font-medium">{t(GAME_NAME_KEYS[session.gameId])}</span>
      {myTurn && <span className="text-[11px] font-semibold text-accent-primary">{t('games:window.yourTurn')}</span>}
      {session.status === 'finished' && session.result && <span className="text-[11px] text-txt-tertiary">{session.result.winners.includes(me) && !session.result.draw ? t('games:result.youWin') : t('games:result.over')}</span>}
      {extra > 0 && <span className="text-[11px] text-txt-tertiary">+{extra}</span>}
    </button>
  );
}

/**
 * Everything games puts on screen outside the hub page: the game window
 * (floating on desktop, full screen on phones), the minimized dock, the
 * invitation popups and the new-game dialog. Mounted once in AppLayout.
 */
export function GameHost() {
  const { t } = useTranslation(['games']);
  const sessions = useGameStore((s) => s.sessions);
  const openId = useGameStore((s) => s.openId);
  const minimized = useGameStore((s) => s.minimized);
  const stagedId = useGameStore((s) => s.stagedId);
  const picker = useGameStore((s) => s.picker);
  const open = useGameStore((s) => s.open);
  const minimize = useGameStore((s) => s.minimize);
  const restore = useGameStore((s) => s.restore);
  const isMobile = useUIStore((s) => s.isMobile);
  const me = useAuthStore((s) => s.user?.id ?? '');
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (!userId) { useGameStore.getState().reset(); return; }
    void useGameStore.getState().load();
  }, [userId]);

  const list = useMemo(() => Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt), [sessions]);
  const invites = list.filter((s) => s.invited.includes(me) && s.status !== 'closed');
  const mine = list.filter((s) => s.players.includes(me));
  const current = openId ? sessions[openId] ?? null : null;
  const docked = minimized ? current : !current ? mine.find((s) => s.status === 'playing') ?? null : null;

  return (
    <>
      <InvitePopups invites={invites} />
      {picker && <NewGameDialog request={picker} />}
      {current && !minimized && current.id !== stagedId && (
        isMobile ? (
          <div className="fixed inset-0 z-[200] bg-surface-base flex flex-col pt-[var(--safe-top)] pb-[var(--safe-bottom)]">
            <GamePanel session={current} onMinimize={minimize} compact />
          </div>
        ) : (
          <div className="fixed z-[200] right-4 bottom-4 top-16 w-[min(1000px,calc(100*var(--app-vw)-340px))] min-w-[560px] rounded-2xl glass-modal shadow-2xl overflow-hidden flex flex-col animate-slide-up" role="dialog" aria-label={t(GAME_NAME_KEYS[current.gameId])}>
            <GamePanel session={current} onMinimize={minimize} />
          </div>
        )
      )}
      {docked && <Dock session={docked} extra={mine.filter((s) => s.status === 'playing' && s.id !== docked.id).length} onRestore={() => (minimized ? restore() : open(docked.id))} />}
    </>
  );
}

/** Opens the Play Together dialog for the current call, or the call's game if one is already open. */
export function openPlayTogether(): void {
  const { sessions, openId, open, openPicker } = useGameStore.getState();
  const me = useAuthStore.getState().user?.id;
  const callGame = Object.values(sessions).find((s) => s.context.kind === 'voice' && me && s.players.includes(me) && s.status !== 'closed');
  if (callGame) { open(callGame.id); return; }
  if (openId) useGameStore.getState().restore();
  openPicker({ context: { kind: 'voice' } });
}

export { GamepadIcon };
