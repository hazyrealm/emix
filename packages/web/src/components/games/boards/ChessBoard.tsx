import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChessView } from '@backspace/shared/src/games';
import { TurnLine, seatUser, type BoardProps } from './common';
import { GameButton, PlayerName } from '../gameUi';

const FILES = 'abcdefgh';
/** Filled glyphs for both sides, forced to text (not emoji) presentation. */
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

function parseFen(fen: string): Record<string, string> {
  const out: Record<string, string> = {};
  const rows = fen.split(' ')[0]!.split('/');
  rows.forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { file += Number(ch); continue; }
      out[`${FILES[file]}${8 - i}`] = ch;
      file += 1;
    }
  });
  return out;
}

function Piece({ code }: { code: string }) {
  const white = code === code.toUpperCase();
  return (
    <span
      aria-hidden
      className="select-none leading-none"
      style={{
        fontSize: 'min(calc(9 * var(--app-vw)), 46px)',
        color: white ? '#fafafa' : '#18181b',
        textShadow: white ? '0 0 1px #000, 0 1px 2px rgb(0 0 0 / 0.7)' : '0 0 1px #fff, 0 1px 1px rgb(255 255 255 / 0.35)',
        fontFamily: '"Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", system-ui, sans-serif',
      }}
    >
      {GLYPH[code.toLowerCase()]}{'︎'}
    </span>
  );
}

function ClockFace({ ms, running }: { ms: number; running: boolean }) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return (
    <span className={`tabular-nums font-mono text-[15px] px-2 py-0.5 rounded-md ${running ? 'bg-accent-primary/25 text-txt-primary' : 'bg-white/[0.06] text-txt-secondary'} ${s <= 20 && running ? 'text-txt-danger' : ''}`}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function ChessBoard({ session, view, move }: BoardProps<ChessView>) {
  const { t } = useTranslation(['games']);
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const board = useMemo(() => parseFen(view.fen), [view.fen]);
  const myColor = view.me >= 0 ? view.colors[view.me] : 'w';
  const turnSeat = view.colors[0] === view.turn ? 0 : 1;
  const playing = session.status === 'playing';
  const now = useNow(playing && !!view.clocks);
  const targets = useMemo(() => new Set(view.legal.filter((m) => m.from === selected).map((m) => m.to)), [view.legal, selected]);
  const movable = useMemo(() => new Set(view.legal.map((m) => m.from)), [view.legal]);
  useEffect(() => { setSelected(null); setPromo(null); }, [view.fen]);

  const ranks = myColor === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = myColor === 'w' ? [...FILES] : [...FILES].reverse();

  const click = (sq: string) => {
    if (!playing) return;
    if (selected && targets.has(sq)) {
      const options = view.legal.filter((m) => m.from === selected && m.to === sq);
      if (options.some((m) => m.promotion)) { setPromo({ from: selected, to: sq }); return; }
      void move({ type: 'move', from: selected, to: sq }, true);
      setSelected(null);
      return;
    }
    setSelected(movable.has(sq) ? sq : null);
  };

  const clockFor = (seat: number) => {
    if (!view.clocks) return null;
    const running = playing && view.clockRunningSince !== null && seat === turnSeat;
    return <ClockFace ms={view.clocks[seat]! - (running ? now - view.clockRunningSince! : 0)} running={running} />;
  };
  const opp = view.me === 0 ? 1 : 0;
  const top = view.me >= 0 ? opp : 1;
  const bottom = view.me >= 0 ? view.me : 0;
  const offerFromOpponent = view.drawOffer !== null && view.drawOffer !== view.me;

  return (
    <div className="flex flex-col desktop:flex-row items-center desktop:items-start gap-4 w-full justify-center">
      <div className="flex flex-col gap-2 w-[min(100%,480px)]">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium">{seatUser(session, top) && <PlayerName id={seatUser(session, top)!} />} <span className="text-txt-tertiary">({view.colors[top] === 'w' ? t('games:board.chess.white') : t('games:board.chess.black')})</span></span>
          {clockFor(top)}
        </div>
        <div className="grid grid-cols-8 aspect-square rounded-lg overflow-hidden shadow-lg ring-1 ring-black/40" role="grid" aria-label={t('games:catalog.chess.name')}>
          {ranks.map((rank) => files.map((file) => {
            const sq = `${file}${rank}`;
            const dark = (FILES.indexOf(file) + rank) % 2 === 0;
            const piece = board[sq];
            const isLast = view.last && (view.last.from === sq || view.last.to === sq);
            const isTarget = targets.has(sq);
            const inCheck = view.check && piece && piece.toLowerCase() === 'k' && (piece === piece.toUpperCase() ? 'w' : 'b') === view.turn;
            return (
              <button
                key={sq}
                type="button"
                onClick={() => click(sq)}
                aria-label={`${sq}${piece ? ` ${piece === piece.toUpperCase() ? t('games:board.chess.white') : t('games:board.chess.black')} ${t(`games:board.chess.pieces.${piece.toLowerCase() as 'k' | 'q' | 'r' | 'b' | 'n' | 'p'}`)}` : ''}`}
                className="relative flex items-center justify-center"
                style={{ background: inCheck ? '#dc2626' : selected === sq ? '#a78bfa' : isLast ? (dark ? '#a8a24f' : '#d6d27a') : dark ? '#7a5c8f' : '#e9e1f2' }}
              >
                {piece && <Piece code={piece} />}
                {isTarget && (
                  <span className={`absolute rounded-full ${piece ? 'inset-[6%] ring-4 ring-black/30' : 'w-[28%] h-[28%] bg-black/30'}`} />
                )}
                {file === files[0] && <span className={`absolute left-0.5 top-0 text-[9px] font-semibold ${dark ? 'text-[#e9e1f2]' : 'text-[#7a5c8f]'}`}>{rank}</span>}
                {rank === ranks[7] && <span className={`absolute right-0.5 bottom-0 text-[9px] font-semibold ${dark ? 'text-[#e9e1f2]' : 'text-[#7a5c8f]'}`}>{file}</span>}
              </button>
            );
          }))}
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium">{seatUser(session, bottom) && <PlayerName id={seatUser(session, bottom)!} />} <span className="text-txt-tertiary">({view.colors[bottom] === 'w' ? t('games:board.chess.white') : t('games:board.chess.black')})</span></span>
          {clockFor(bottom)}
        </div>
        {promo && (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-white/[0.06] p-2" role="dialog" aria-label={t('games:board.chess.promote')}>
            <span className="text-[13px] text-txt-secondary mr-1">{t('games:board.chess.promote')}</span>
            {(['q', 'r', 'b', 'n'] as const).map((p) => (
              <button key={p} type="button" className="w-11 h-11 rounded-md bg-white/[0.1] hover:bg-white/[0.2] flex items-center justify-center" aria-label={t(`games:board.chess.pieces.${p}`)}
                onClick={() => { void move({ type: 'move', from: promo.from, to: promo.to, promotion: p }, true); setPromo(null); setSelected(null); }}>
                <Piece code={myColor === 'w' ? p.toUpperCase() : p} />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 w-[min(100%,480px)] desktop:w-56">
        <TurnLine session={session} turn={turnSeat} me={view.me} extra={view.check && playing ? <span className="text-txt-danger font-semibold">{t('games:board.chess.check')}</span> : null} />
        {playing && view.me >= 0 && (
          <div className="flex flex-wrap gap-2 justify-center desktop:justify-start">
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
        <div className="rounded-lg bg-white/[0.04] p-2 max-h-48 desktop:max-h-80 overflow-y-auto text-[13px] font-mono" aria-label={t('games:board.chess.moves')}>
          {view.san.length === 0 ? <span className="text-txt-tertiary font-sans">{t('games:board.chess.noMoves')}</span> : (
            <ol className="grid grid-cols-[2rem_1fr_1fr] gap-x-2">
              {Array.from({ length: Math.ceil(view.san.length / 2) }, (_, i) => (
                <li key={i} className="contents">
                  <span className="text-txt-tertiary">{i + 1}.</span>
                  <span>{view.san[i * 2]}</span>
                  <span>{view.san[i * 2 + 1] ?? ''}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
