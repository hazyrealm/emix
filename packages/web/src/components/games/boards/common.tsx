import { useTranslation } from 'react-i18next';
import type { GameMove, GameSessionView } from '@backspace/shared/src/games';
import { PlayerName } from '../gameUi';

export interface BoardProps<V> {
  session: GameSessionView;
  view: V;
  /** Send a move; turn-based boards pass `true` to guard against a stale view. */
  move: (m: GameMove, withSeq?: boolean) => Promise<boolean>;
}

/** "Your turn" or "Waiting for Bob", for two-player turn-based games. */
export function TurnLine({ session, turn, me, extra }: { session: GameSessionView; turn: number; me: number; extra?: React.ReactNode }) {
  const { t } = useTranslation(['games']);
  if (session.status !== 'playing') return null;
  const other = session.seats[turn];
  return (
    <div className="flex items-center justify-center gap-2 text-[14px] min-h-[24px]" role="status" aria-live="polite">
      {turn === me ? (
        <span className="font-semibold text-accent-primary">{t('games:window.yourTurn')}</span>
      ) : (
        <span className="text-txt-secondary">{t('games:window.waitingFor')} <span className="font-medium text-txt-primary">{other ? <PlayerName id={other} /> : '…'}</span></span>
      )}
      {extra}
    </div>
  );
}

/** Seat → user id for the current (or last) match. */
export function seatUser(session: GameSessionView, seat: number): string | undefined {
  return session.seats[seat];
}
