import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GAMES, GAME_IDS, type GameId, type GameMove, type GameOptions, type GameSessionView } from '@backspace/shared/src/games';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { GameArt } from './GameArt';
import { GAME_NAME_KEYS, GAME_RULES_KEYS } from './gameCatalog';
import { GameOptionsForm } from './GameOptionsForm';
import { InvitePicker } from './InvitePicker';
import { CallMiniControls, Countdown, GameButton, PlayerChip, PlayerName } from './gameUi';
import { TicTacToeBoard, ConnectFourBoard, RpsBoard, MemoryBoard } from './boards/ClassicBoards';
import { ChessBoard } from './boards/ChessBoard';
import { CheckersBoard } from './boards/CheckersBoard';
import { BattleshipBoard } from './boards/BattleshipBoard';
import { WordRaceBoard, HangmanBoard, WordDuelBoard } from './boards/WordBoards';
import { TriviaBoard, DrawingBoard } from './boards/PartyBoards';

const REASON_KEYS = {
  normal: null, resigned: 'games:result.reasons.resigned', timeout: 'games:result.reasons.timeout', abandoned: 'games:result.reasons.abandoned',
  agreed: 'games:result.reasons.agreed', stalemate: 'games:result.reasons.stalemate', repetition: 'games:result.reasons.repetition',
  fifty: 'games:result.reasons.fifty', material: 'games:result.reasons.material', flag: 'games:result.reasons.flag',
} as const;

function Board({ session }: { session: GameSessionView }) {
  const move = useGameStore((s) => s.move);
  const send = (m: GameMove, withSeq?: boolean) => move(session.id, m, withSeq);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = { session, view: session.view as any, move: send };
  switch (session.gameId) {
    case 'tictactoe': return <TicTacToeBoard {...props} />;
    case 'connect4': return <ConnectFourBoard {...props} />;
    case 'rps': return <RpsBoard {...props} />;
    case 'chess': return <ChessBoard {...props} />;
    case 'checkers': return <CheckersBoard {...props} />;
    case 'battleship': return <BattleshipBoard {...props} />;
    case 'memory': return <MemoryBoard {...props} />;
    case 'wordrace': return <WordRaceBoard {...props} />;
    case 'hangman': return <HangmanBoard {...props} />;
    case 'wordduel': return <WordDuelBoard {...props} />;
    case 'trivia': return <TriviaBoard {...props} />;
    case 'drawing': return <DrawingBoard {...props} />;
  }
}

function ResultBanner({ session, me }: { session: GameSessionView; me: string }) {
  const { t } = useTranslation(['games']);
  const r = session.result;
  if (!r) return null;
  const won = r.winners.includes(me) && !r.draw;
  const tiedTop = r.draw && r.winners.includes(me);
  const title = r.draw && r.winners.length === 0 ? t('games:result.draw')
    : tiedTop ? t('games:result.tied')
      : won ? t('games:result.youWin')
        : session.seats.includes(me) ? t('games:result.youLose') : '';
  const reason = REASON_KEYS[r.reason];
  return (
    <div className={`rounded-xl px-4 py-3 text-center animate-fade-in ${won ? 'bg-status-online/15 ring-1 ring-status-online/40' : r.draw ? 'bg-white/[0.06]' : 'bg-accent-rose/10 ring-1 ring-accent-rose/30'}`} role="status">
      <div className="text-[18px] font-bold">{title}</div>
      {!won && r.winners.length > 0 && !r.draw && (
        <div className="text-[13px] text-txt-secondary">{t('games:result.winner')} <span className="font-semibold text-txt-primary">{r.winners.map((w) => <PlayerName key={w} id={w} />)}</span></div>
      )}
      {r.draw && r.winners.length > 1 && (
        <div className="text-[13px] text-txt-secondary">{t('games:result.sharedBy')} {r.winners.map((w, i) => <span key={w} className="font-semibold text-txt-primary">{i > 0 ? ', ' : ''}<PlayerName id={w} /></span>)}</div>
      )}
      {reason && <div className="text-[12px] text-txt-tertiary mt-0.5">{t(reason)}</div>}
    </div>
  );
}

function SwitchGame({ session, onDone }: { session: GameSessionView; onDone: () => void }) {
  const { t } = useTranslation(['games']);
  const changeGame = useGameStore((s) => s.changeGame);
  const [gameId, setGameId] = useState<GameId>(session.gameId);
  const [options, setOptions] = useState<GameOptions>(session.options);
  const fits = (id: GameId) => GAMES[id].maxPlayers >= session.players.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 desktop:grid-cols-4 gap-2">
        {GAME_IDS.filter(fits).map((id) => (
          <button key={id} type="button" onClick={() => { setGameId(id); setOptions({}); }} aria-pressed={gameId === id}
            className={`rounded-lg overflow-hidden text-left ring-2 ${gameId === id ? 'ring-accent-primary' : 'ring-transparent hover:ring-white/20'}`}>
            <GameArt id={id} className="h-12" />
            <div className="px-1.5 py-1 text-[11px] font-medium truncate bg-white/[0.05]">{t(GAME_NAME_KEYS[id])}</div>
          </button>
        ))}
      </div>
      <GameOptionsForm gameId={gameId} value={options} onChange={setOptions} />
      <div className="flex gap-2 justify-end">
        <GameButton kind="ghost" onClick={onDone}>{t('games:common.cancel')}</GameButton>
        <GameButton kind="primary" onClick={() => { void changeGame(session.id, gameId, options); onDone(); }}>{t('games:lobby.useGame')}</GameButton>
      </div>
    </div>
  );
}

function Lobby({ session, me }: { session: GameSessionView; me: string }) {
  const { t } = useTranslation(['games']);
  const start = useGameStore((s) => s.start);
  const invite = useGameStore((s) => s.invite);
  const changeGame = useGameStore((s) => s.changeGame);
  const [inviting, setInviting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [switching, setSwitching] = useState(false);
  const meta = GAMES[session.gameId];
  const host = session.hostId === me;
  const enough = session.players.length >= meta.minPlayers;
  const room = meta.maxPlayers - session.players.length - session.invited.length;
  return (
    <div className="flex flex-col gap-5 w-full max-w-xl mx-auto">
      <div className="flex gap-4 items-start">
        <GameArt id={session.gameId} className="w-28 h-20 rounded-xl flex-shrink-0" />
        <div className="min-w-0">
          <h3 className="text-[18px] font-bold">{t(GAME_NAME_KEYS[session.gameId])}</h3>
          <p className="text-[13px] text-txt-secondary whitespace-pre-line">{t(GAME_RULES_KEYS[session.gameId])}</p>
        </div>
      </div>
      <section>
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-txt-tertiary mb-2">{t('games:lobby.players', { count: session.players.length, max: meta.maxPlayers })}</h4>
        <div className="flex flex-wrap gap-2">
          {session.players.map((id) => <PlayerChip key={id} id={id} away={session.away.includes(id)} badge={id === session.hostId ? <span className="text-[11px] text-accent-primary">{t('games:lobby.host')}</span> : null} />)}
          {session.invited.map((id) => <div key={id} className="opacity-60"><PlayerChip id={id} badge={<span className="text-[11px] text-txt-tertiary">{t('games:lobby.invited')}</span>} /></div>)}
        </div>
      </section>
      {(host ? true : Object.keys(session.options).length > 0) && (
        switching ? <SwitchGame session={session} onDone={() => setSwitching(false)} /> : (
          <section className="flex flex-col gap-3">
            <GameOptionsForm gameId={session.gameId} value={session.options} disabled={!host} onChange={(o) => void changeGame(session.id, session.gameId, o)} />
            {host && <button type="button" onClick={() => setSwitching(true)} className="self-start text-[13px] text-accent-primary hover:underline">{t('games:lobby.changeGame')}</button>}
          </section>
        )
      )}
      {room > 0 && (
        inviting ? (
          <section className="flex flex-col gap-2 rounded-xl bg-white/[0.04] p-3">
            <InvitePicker selected={picked} onChange={setPicked} exclude={[...session.players, ...session.invited]} max={room} />
            <div className="flex gap-2 justify-end">
              <GameButton kind="ghost" onClick={() => { setInviting(false); setPicked([]); }}>{t('games:common.cancel')}</GameButton>
              <GameButton kind="primary" disabled={!picked.length} onClick={() => { void invite(session.id, picked); setInviting(false); setPicked([]); }}>{t('games:lobby.sendInvites')}</GameButton>
            </div>
          </section>
        ) : <GameButton onClick={() => setInviting(true)} className="self-start">{t('games:lobby.inviteMore')}</GameButton>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        <span className="text-[13px] text-txt-secondary">
          {!enough ? t('games:lobby.needPlayers', { count: meta.minPlayers - session.players.length }) : host ? t('games:lobby.ready') : <>{t('games:lobby.waitingHost')} <PlayerName id={session.hostId} /></>}
        </span>
        {host && <GameButton kind="primary" disabled={!enough} onClick={() => void start(session.id)}>{t('games:lobby.start')}</GameButton>}
      </div>
    </div>
  );
}

/**
 * One session: lobby, the board while playing, and the result with rematch
 * and "another game" when a match ends. `onMinimize` hides it without
 * leaving (the game keeps running and the dock shows it).
 */
export function GamePanel({ session, onMinimize, compact = false }: { session: GameSessionView; onMinimize: () => void; compact?: boolean }) {
  const { t } = useTranslation(['games']);
  const me = useAuthStore((s) => s.user?.id ?? '');
  const leave = useGameStore((s) => s.leave);
  const rematch = useGameStore((s) => s.rematch);
  const muted = useGameStore((s) => s.muted);
  const setMuted = useGameStore((s) => s.setMuted);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [help, setHelp] = useState(false);
  const host = session.hostId === me;
  const iAsked = session.rematch.includes(me);
  const players = session.seats.length ? session.seats : session.players;

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center gap-2 px-3 desktop:px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
        <GameArt id={session.gameId} className="w-9 h-9 rounded-lg flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold truncate">{t(GAME_NAME_KEYS[session.gameId])}</div>
          {!compact && players.length > 0 && (
            <div className="flex items-center gap-1.5 text-[12px] text-txt-tertiary truncate">
              {players.map((id, i) => <span key={id}>{i > 0 && ' · '}<PlayerName id={id} /> <span className="tabular-nums text-txt-secondary">{session.series[id] ?? 0}</span></span>)}
              {session.draws > 0 && <span> · {t('games:window.draws', { count: session.draws })}</span>}
            </div>
          )}
        </div>
        {session.status === 'playing' && session.deadline && !compact && <Countdown deadline={session.deadline} className="text-[13px] hidden desktop:inline" />}
        <CallMiniControls />
        <button type="button" onClick={() => setHelp(!help)} aria-pressed={help} title={t('games:window.howToPlay')} className="w-8 h-8 rounded-full flex items-center justify-center text-txt-secondary hover:text-txt-primary hover:bg-white/[0.08]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" /></svg>
        </button>
        <button type="button" onClick={() => setMuted(!muted)} aria-pressed={muted} title={muted ? t('games:audio.unmute') : t('games:audio.mute')} className="w-8 h-8 rounded-full flex items-center justify-center text-txt-secondary hover:text-txt-primary hover:bg-white/[0.08]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            {muted ? <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
              : <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />}
          </svg>
        </button>
        <button type="button" onClick={onMinimize} title={t('games:window.minimize')} className="w-8 h-8 rounded-full flex items-center justify-center text-txt-secondary hover:text-txt-primary hover:bg-white/[0.08]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6 19h12v2H6z" /></svg>
        </button>
        <button type="button" onClick={() => setConfirmLeave(true)} title={t('games:window.leave')} className="w-8 h-8 rounded-full flex items-center justify-center text-txt-secondary hover:text-txt-danger hover:bg-white/[0.08]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
        </button>
      </header>

      {confirmLeave && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-accent-rose/10 border-b border-accent-rose/20 text-[13px]" role="alertdialog">
          <span className="flex-1">{session.status === 'playing' && session.seats.includes(me) ? t('games:window.leaveForfeit') : t('games:window.leaveConfirm')}</span>
          <GameButton kind="ghost" onClick={() => setConfirmLeave(false)}>{t('games:common.cancel')}</GameButton>
          <GameButton kind="danger" onClick={() => void leave(session.id)}>{t('games:window.leave')}</GameButton>
        </div>
      )}
      {help && <div className="px-4 py-3 text-[13px] text-txt-secondary bg-white/[0.03] border-b border-white/[0.06] whitespace-pre-line">{t(GAME_RULES_KEYS[session.gameId])}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto px-3 desktop:px-5 py-4">
        {session.status === 'lobby' ? <Lobby session={session} me={me} /> : (
          <div className="flex flex-col gap-4 items-center">
            {session.status === 'finished' && <div className="w-full max-w-xl"><ResultBanner session={session} me={me} /></div>}
            {session.view !== null && <Board session={session} />}
          </div>
        )}
      </div>

      {session.status === 'finished' && (
        <footer className="flex flex-col gap-3 px-4 py-3 border-t border-white/[0.06] flex-shrink-0">
          {switching ? <SwitchGame session={session} onDone={() => setSwitching(false)} /> : (
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <span className="flex-1 text-[13px] text-txt-secondary min-w-[10rem]">
                {session.rematch.length > 0 && t('games:result.rematchVotes', { count: session.rematch.length, total: session.players.length })}
              </span>
              {host && <GameButton onClick={() => setSwitching(true)}>{t('games:result.anotherGame')}</GameButton>}
              <GameButton kind="primary" disabled={iAsked || session.players.length < GAMES[session.gameId].minPlayers} onClick={() => void rematch(session.id)}>
                {iAsked ? t('games:result.rematchWaiting') : t('games:result.rematch')}
              </GameButton>
            </div>
          )}
        </footer>
      )}
    </div>
  );
}
