import { useTranslation } from 'react-i18next';
import type { ConnectFourView, MemoryView, RpsChoice, RpsView, TicTacToeView } from '@backspace/shared/src/games';
import { TurnLine, seatUser, type BoardProps } from './common';
import { PlayerName } from '../gameUi';

const X_COLOR = '#f472b6';
const O_COLOR = '#38bdf8';

function Mark({ seat }: { seat: 0 | 1 }) {
  return seat === 0 ? (
    <svg viewBox="0 0 40 40" className="w-[62%] h-[62%]" aria-hidden><path d="M8 8l24 24M32 8L8 32" stroke={X_COLOR} strokeWidth="6" strokeLinecap="round" /></svg>
  ) : (
    <svg viewBox="0 0 40 40" className="w-[62%] h-[62%]" aria-hidden><circle cx="20" cy="20" r="12" stroke={O_COLOR} strokeWidth="6" fill="none" /></svg>
  );
}

export function TicTacToeBoard({ session, view, move }: BoardProps<TicTacToeView>) {
  const { t } = useTranslation(['games']);
  const myTurn = session.status === 'playing' && view.turn === view.me;
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <TurnLine session={session} turn={view.turn} me={view.me} />
      <div className="grid grid-cols-3 gap-2 w-[min(100%,360px)] aspect-square" role="grid" aria-label={t('games:catalog.tictactoe.name')}>
        {view.board.map((cell, i) => {
          const win = view.line?.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={!myTurn || cell !== null}
              onClick={() => void move({ type: 'place', index: i }, true)}
              aria-label={t('games:board.cell', { row: Math.floor(i / 3) + 1, col: (i % 3) + 1, value: cell === null ? t('games:board.empty') : cell === 0 ? 'X' : 'O' })}
              className={`rounded-xl flex items-center justify-center transition-colors ${win ? 'bg-accent-primary/30' : 'bg-white/[0.06]'} ${myTurn && cell === null ? 'hover:bg-white/[0.12] cursor-pointer' : 'cursor-default'}`}
            >
              {cell !== null && <Mark seat={cell} />}
            </button>
          );
        })}
      </div>
      <Legend left={<><Mark seat={0} /> </>} right={<Mark seat={1} />} session={session} />
    </div>
  );
}

function Legend({ left, right, session }: { left: React.ReactNode; right: React.ReactNode; session: BoardProps<unknown>['session'] }) {
  const a = seatUser(session, 0);
  const b = seatUser(session, 1);
  return (
    <div className="flex items-center gap-6 text-[13px] text-txt-secondary">
      <span className="flex items-center gap-1.5"><span className="w-5 h-5 flex items-center justify-center">{left}</span>{a && <PlayerName id={a} />}</span>
      <span className="flex items-center gap-1.5"><span className="w-5 h-5 flex items-center justify-center">{right}</span>{b && <PlayerName id={b} />}</span>
    </div>
  );
}

const DISC = ['#fde047', '#f472b6'];

export function ConnectFourBoard({ session, view, move }: BoardProps<ConnectFourView>) {
  const { t } = useTranslation(['games']);
  const myTurn = session.status === 'playing' && view.turn === view.me;
  const full = (c: number) => view.board[0]![c] !== null;
  const inLine = (r: number, c: number) => view.line?.some(([lr, lc]) => lr === r && lc === c);
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <TurnLine session={session} turn={view.turn} me={view.me} />
      <div className="w-[min(100%,460px)] rounded-2xl p-2 desktop:p-3 bg-[#1d3fbf] shadow-inner" style={{ aspectRatio: '7 / 6.2' }}>
        <div className="grid grid-cols-7 gap-1.5 desktop:gap-2 h-full">
          {Array.from({ length: 7 }, (_, c) => (
            <button
              key={c}
              type="button"
              disabled={!myTurn || full(c)}
              onClick={() => void move({ type: 'drop', column: c }, true)}
              aria-label={t('games:board.dropColumn', { col: c + 1 })}
              className={`grid grid-rows-6 gap-1.5 desktop:gap-2 rounded-lg ${myTurn && !full(c) ? 'hover:bg-white/10 cursor-pointer' : 'cursor-default'}`}
            >
              {view.board.map((row, r) => {
                const cell = row[c];
                const last = view.last && view.last[0] === r && view.last[1] === c;
                return (
                  <span
                    key={r}
                    className={`rounded-full aspect-square w-full ${last ? 'animate-[emx-drop_260ms_ease-out]' : ''} ${inLine(r, c) ? 'ring-4 ring-white' : ''}`}
                    style={{ background: cell == null ? 'rgb(0 0 0 / 0.35)' : DISC[cell], boxShadow: cell == null ? 'inset 0 2px 4px rgb(0 0 0 / 0.5)' : 'inset 0 -3px 0 rgb(0 0 0 / 0.2)' }}
                  />
                );
              })}
            </button>
          ))}
        </div>
      </div>
      <Legend left={<span className="w-4 h-4 rounded-full" style={{ background: DISC[0] }} />} right={<span className="w-4 h-4 rounded-full" style={{ background: DISC[1] }} />} session={session} />
    </div>
  );
}

const RPS_LABEL = { rock: 'games:board.rps.rock', paper: 'games:board.rps.paper', scissors: 'games:board.rps.scissors' } as const;

function RpsIcon({ choice, size = 44 }: { choice: RpsChoice; size?: number }) {
  if (choice === 'rock') return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden><path d="M10 26c0-9 6-16 15-16 8 0 14 6 14 14 0 9-6 15-15 15-8 0-14-5-14-13z" fill="#a8a29e" /><path d="M16 22c3-3 7-4 11-3M20 30c4 2 8 1 11-2" stroke="#57534e" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>;
  if (choice === 'paper') return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden><rect x="11" y="7" width="26" height="34" rx="3" fill="#f8fafc" /><path d="M16 15h16M16 21h16M16 27h12" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" /></svg>;
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden><circle cx="15" cy="35" r="6" stroke="#f472b6" strokeWidth="3.5" fill="none" /><circle cx="33" cy="35" r="6" stroke="#f472b6" strokeWidth="3.5" fill="none" /><path d="M18 30L34 8M30 30L14 8" stroke="#e2e8f0" strokeWidth="3.5" strokeLinecap="round" /></svg>;
}

export function RpsBoard({ session, view, move }: BoardProps<RpsView>) {
  const { t } = useTranslation(['games']);
  const opp = view.me === 0 ? 1 : 0;
  const last = view.history[view.history.length - 1];
  const playing = session.status === 'playing';
  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <div className="text-[13px] text-txt-secondary">{t('games:board.rps.round', { round: view.round, bestOf: view.bestOf })}</div>
      <div className="flex items-center gap-6 text-3xl font-bold tabular-nums">
        <span className="text-accent-primary">{view.wins[view.me] ?? 0}</span>
        <span className="text-txt-tertiary text-lg">:</span>
        <span>{view.wins[opp] ?? 0}</span>
      </div>
      {last && (
        <div className="flex items-center gap-4 rounded-xl bg-white/[0.05] px-4 py-2 animate-fade-in" aria-live="polite">
          {last.choices[view.me] ? <RpsIcon choice={last.choices[view.me]!} size={36} /> : <span className="text-txt-tertiary text-sm">{t('games:board.rps.noChoice')}</span>}
          <span className="text-[13px] font-semibold">{last.winner === null ? t('games:board.rps.tie') : last.winner === view.me ? t('games:board.rps.roundWon') : t('games:board.rps.roundLost')}</span>
          {last.choices[opp] ? <RpsIcon choice={last.choices[opp]!} size={36} /> : <span className="text-txt-tertiary text-sm">{t('games:board.rps.noChoice')}</span>}
        </div>
      )}
      {playing && (
        <>
          <div className="text-[14px] min-h-[22px]" role="status" aria-live="polite">
            {view.mine
              ? (view.opponentChose ? t('games:board.rps.revealing') : t('games:board.rps.waiting'))
              : view.opponentChose ? t('games:board.rps.opponentReady') : t('games:board.rps.choose')}
          </div>
          <div className="flex gap-3">
            {(['rock', 'paper', 'scissors'] as const).map((c) => (
              <button
                key={c}
                type="button"
                disabled={!!view.mine}
                onClick={() => void move({ type: 'choose', choice: c })}
                className={`flex flex-col items-center gap-1 w-24 desktop:w-28 py-3 rounded-2xl transition-all ${view.mine === c ? 'bg-accent-primary/30 ring-2 ring-accent-primary' : 'bg-white/[0.06] hover:bg-white/[0.12]'} disabled:cursor-default`}
              >
                <RpsIcon choice={c} />
                <span className="text-[13px] font-medium">{t(RPS_LABEL[c])}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Memory card faces: original simple shapes, told apart by shape and colour. */
const FACE_COLORS = ['#f472b6', '#38bdf8', '#facc15', '#4ade80', '#a78bfa', '#fb923c'];
function Face({ id }: { id: number }) {
  const color = FACE_COLORS[id % FACE_COLORS.length];
  const shape = Math.floor(id / FACE_COLORS.length) % 3;
  return (
    <svg viewBox="0 0 40 40" className="w-[60%] h-[60%]" aria-hidden>
      {shape === 0 && <circle cx="20" cy="20" r="13" fill={color} />}
      {shape === 1 && <rect x="8" y="8" width="24" height="24" rx="4" fill={color} />}
      {shape === 2 && <path d="M20 5l15 28H5z" fill={color} />}
      <text x="20" y="25" textAnchor="middle" fontSize="12" fontWeight="800" fill="#111827" fontFamily="system-ui, sans-serif">{id + 1}</text>
    </svg>
  );
}

export function MemoryBoard({ session, view, move }: BoardProps<MemoryView>) {
  const { t } = useTranslation(['games']);
  const cols = view.size === 16 ? 4 : 6;
  const myTurn = session.status === 'playing' && view.turn === view.me && view.revealUntil === null;
  const opp = view.me === 0 ? 1 : 0;
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <TurnLine session={session} turn={view.turn} me={view.me} extra={<span className="text-txt-tertiary tabular-nums">{view.scores[view.me]} – {view.scores[opp]}</span>} />
      <div className="grid gap-1.5 desktop:gap-2 w-[min(100%,440px)]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {view.faces.map((face, i) => {
          const owner = view.owner[i];
          return (
            <button
              key={i}
              type="button"
              disabled={!myTurn || face !== null}
              onClick={() => void move({ type: 'flip', index: i }, true)}
              aria-label={face === null ? t('games:board.memory.hidden', { n: i + 1 }) : t('games:board.memory.shown', { n: i + 1, face: face + 1 })}
              className={`aspect-[3/4] rounded-lg flex items-center justify-center transition-all duration-200 ${
                face === null
                  ? `bg-gradient-to-br from-[#6d28d9] to-[#0891b2] ${myTurn ? 'hover:brightness-125 cursor-pointer' : ''}`
                  : owner === null ? 'bg-white ring-2 ring-accent-primary' : owner === view.me ? 'bg-white/90 opacity-80' : 'bg-white/70 opacity-60'
              }`}
            >
              {face !== null && <Face id={face} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
