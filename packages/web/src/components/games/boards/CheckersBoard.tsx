import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CheckersView } from '@backspace/shared/src/games';
import { TurnLine, type BoardProps } from './common';
import { GameButton } from '../gameUi';

type Cell = [number, number];
const same = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];
const COLORS = ['#ef4444', '#1f2937'] as const;

/** A move is built square by square; only paths the server lists as legal can be completed. */
export function CheckersBoard({ session, view, move }: BoardProps<CheckersView>) {
  const { t } = useTranslation(['games']);
  const [partial, setPartial] = useState<Cell[]>([]);
  useEffect(() => setPartial([]), [view.board, view.turn]);
  const playing = session.status === 'playing';
  const candidates = useMemo(
    () => view.legal.filter((path) => partial.every((c, i) => path[i] && same(path[i]!, c))),
    [view.legal, partial],
  );
  const nextSquares = partial.length ? candidates.map((p) => p[partial.length]).filter((c): c is Cell => !!c) : [];
  const starts = partial.length ? [] : view.legal.map((p) => p[0]!);
  const flip = view.me === 1;
  const order = Array.from({ length: 8 }, (_, i) => (flip ? 7 - i : i));
  const mustCapture = view.legal.some((p) => Math.abs(p[1]![0] - p[0]![0]) === 2);
  const opp = view.me === 0 ? 1 : 0;
  const offerFromOpponent = view.drawOffer !== null && view.drawOffer !== view.me;

  const click = (cell: Cell) => {
    if (!playing || view.me !== view.turn) return;
    if (partial.length && nextSquares.some((c) => same(c, cell))) {
      const next = [...partial, cell];
      const done = candidates.find((p) => p.length === next.length && p.every((c, i) => same(c, next[i]!)));
      if (done) { void move({ type: 'path', path: done }, true); setPartial([]); }
      else setPartial(next);
      return;
    }
    setPartial(starts.some((c) => same(c, cell)) || view.legal.some((p) => same(p[0]!, cell)) ? [cell] : []);
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <TurnLine session={session} turn={view.turn} me={view.me} extra={mustCapture && view.me === view.turn && playing ? <span className="text-accent-amber text-[13px]">{t('games:board.checkers.mustCapture')}</span> : null} />
      <div className="grid grid-cols-8 aspect-square w-[min(100%,460px)] rounded-lg overflow-hidden ring-1 ring-black/40 shadow-lg" role="grid" aria-label={t('games:catalog.checkers.name')}>
        {order.map((r) => order.map((c) => {
          const dark = (r + c) % 2 === 1;
          const piece = view.board[r]![c];
          const cell: Cell = [r, c];
          const inPartial = partial.some((p) => same(p, cell));
          const isNext = nextSquares.some((p) => same(p, cell));
          const isLast = view.last?.some((p) => same(p as Cell, cell));
          return (
            <button
              key={`${r}${c}`}
              type="button"
              disabled={!dark}
              onClick={() => click(cell)}
              aria-label={`${String.fromCharCode(97 + c)}${8 - r}${piece ? ` ${piece.seat === view.me ? t('games:board.checkers.yours') : t('games:board.checkers.theirs')}${piece.king ? ` ${t('games:board.checkers.king')}` : ''}` : ''}`}
              className="relative flex items-center justify-center"
              style={{ background: !dark ? '#f1e6d4' : inPartial ? '#7c3aed' : isLast ? '#7a6a3a' : '#5b4636' }}
            >
              {piece && (
                <span className="w-[76%] h-[76%] rounded-full flex items-center justify-center shadow-[inset_0_-3px_0_rgb(0_0_0/0.35),0_2px_4px_rgb(0_0_0/0.4)]" style={{ background: COLORS[piece.seat], border: '2px solid rgb(255 255 255 / 0.55)' }}>
                  {piece.king && <svg viewBox="0 0 24 24" className="w-1/2 h-1/2" aria-hidden><path d="M3 18h18l-2-10-5 4-2-6-2 6-5-4z" fill="#fde047" /></svg>}
                </span>
              )}
              {isNext && <span className="absolute w-[30%] h-[30%] rounded-full bg-accent-primary/80 ring-2 ring-white/70" />}
            </button>
          );
        }))}
      </div>
      <div className="flex items-center gap-4 text-[13px] text-txt-secondary">
        <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full" style={{ background: COLORS[view.me >= 0 ? view.me : 0] }} />{t('games:board.checkers.yours')}</span>
        <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full border border-white/40" style={{ background: COLORS[opp] }} />{t('games:board.checkers.theirs')}</span>
        <span className="tabular-nums">{t('games:board.checkers.quiet', { count: Math.floor(view.quietPlies / 2) })}</span>
      </div>
      {playing && view.me >= 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {offerFromOpponent ? (
            <>
              <GameButton kind="primary" onClick={() => void move({ type: 'answer_draw', accept: true })}>{t('games:board.acceptDraw')}</GameButton>
              <GameButton onClick={() => void move({ type: 'answer_draw', accept: false })}>{t('games:board.declineDraw')}</GameButton>
            </>
          ) : (
            <GameButton disabled={view.drawOffer !== null} onClick={() => void move({ type: 'offer_draw' })}>{view.drawOffer === view.me ? t('games:board.drawOffered') : t('games:board.offerDraw')}</GameButton>
          )}
          <GameButton kind="danger" onClick={() => void move({ type: 'resign' })}>{t('games:board.resign')}</GameButton>
        </div>
      )}
    </div>
  );
}
