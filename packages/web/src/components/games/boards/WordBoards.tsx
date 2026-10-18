import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HangmanView, WordDuelView, WordRaceView } from '@backspace/shared/src/games';
import { TurnLine, seatUser, type BoardProps } from './common';
import { LetterRow, WordKeyboard, keyMarks } from './wordUi';
import { Countdown, GameButton, PlayerName } from '../gameUi';

export function WordRaceBoard({ session, view, move }: BoardProps<WordRaceView>) {
  const { t } = useTranslation(['games']);
  const [draft, setDraftState] = useState('');
  const draftRef = useRef('');
  const setDraft = (d: string) => { draftRef.current = d; setDraftState(d); };
  const [shake, setShake] = useState(false);
  const opp = view.me === 0 ? 1 : 0;
  const done = view.solved[view.me] || view.guesses.length >= view.maxGuesses || session.status !== 'playing';
  useEffect(() => { draftRef.current = ''; setDraftState(''); }, [view.guesses.length]);
  const nudge = () => { setShake(true); window.setTimeout(() => setShake(false), 320); };
  const onKey = useCallback((k: string) => {
    if (done) return;
    const d = draftRef.current;
    if (k === 'back') setDraft(d.slice(0, -1));
    else if (k === 'enter') {
      if (d.length !== 5) { nudge(); return; }
      void move({ type: 'guess', word: d }).then((ok) => { if (!ok) nudge(); });
    } else if (d.length < 5) setDraft(d + k);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, move]);
  const rows = Array.from({ length: view.maxGuesses }, (_, i) => i);
  const other = seatUser(session, opp);
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex items-center gap-3 text-[13px] text-txt-secondary">
        {other && <span><PlayerName id={other} />: {view.solved[opp] ? t('games:board.word.solved') : t('games:board.word.guessesMade', { count: view.counts[opp] })}</span>}
        <Countdown deadline={session.deadline} />
      </div>
      <div className="flex flex-col gap-1.5 w-[min(100%,300px)]">
        {rows.map((i) => (
          <LetterRow key={i} length={5} guess={view.guesses[i]} pending={i === view.guesses.length ? draft : ''} shake={shake && i === view.guesses.length} />
        ))}
      </div>
      {view.answer && <div className="text-[14px]">{t('games:board.word.answerWas')} <span className="font-bold uppercase tracking-wider">{view.answer}</span></div>}
      {view.all && other && (
        <div className="w-[min(100%,300px)]">
          <div className="text-[12px] text-txt-tertiary mb-1"><PlayerName id={other} /></div>
          <div className="flex flex-col gap-1 opacity-80">{view.all[opp].map((g, i) => <LetterRow key={i} length={5} guess={g} />)}</div>
        </div>
      )}
      {!done && <WordKeyboard onKey={onKey} marks={keyMarks(view.guesses)} />}
      {done && session.status === 'playing' && <div className="text-[14px] text-txt-secondary">{view.solved[view.me] ? t('games:board.word.solved') : t('games:board.word.outOfGuesses')}</div>}
    </div>
  );
}

function Gallows({ wrong, max }: { wrong: number; max: number }) {
  const parts = [
    <circle key="h" cx="70" cy="34" r="9" />,
    <path key="b" d="M70 43v24" />,
    <path key="la" d="M70 50l-11 9" />,
    <path key="ra" d="M70 50l11 9" />,
    <path key="ll" d="M70 67l-10 14" />,
    <path key="rl" d="M70 67l10 14" />,
  ];
  const shown = Math.round((wrong / max) * parts.length);
  return (
    <svg viewBox="0 0 110 100" className="w-40 h-36" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" aria-hidden>
      <path d="M12 94h50M30 94V8h40v16" className="text-txt-tertiary" />
      <g className="text-accent-rose">{parts.slice(0, shown)}</g>
    </svg>
  );
}

export function HangmanBoard({ session, view, move }: BoardProps<HangmanView>) {
  const { t } = useTranslation(['games']);
  const [word, setWord] = useState('');
  const [solve, setSolve] = useState('');
  const setter = seatUser(session, view.setter);
  const amSetter = view.me === view.setter;
  const guessing = view.phase === 'guess' && !amSetter && session.status === 'playing';
  const onKey = useCallback((k: string) => {
    if (!guessing || k.length !== 1) return;
    void move({ type: 'letter', letter: k }, true);
  }, [guessing, move]);

  if (view.phase === 'choose') {
    return amSetter ? (
      <div className="flex flex-col items-center gap-3 py-4 w-full max-w-sm">
        <div className="text-[15px] font-medium text-center">{t('games:board.hangman.chooseWord')} <Countdown deadline={session.deadline} /></div>
        <input
          value={word}
          onChange={(e) => setWord(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 12))}
          type="password"
          autoComplete="off"
          placeholder={t('games:board.hangman.wordPlaceholder')}
          className="input-standard w-full px-3 py-2 rounded-lg text-center tracking-[0.3em] uppercase"
          aria-label={t('games:board.hangman.wordPlaceholder')}
        />
        <div className="text-[12px] text-txt-tertiary text-center">{t('games:board.hangman.wordHint')}</div>
        <div className="flex gap-2">
          <GameButton kind="primary" disabled={word.length < 4} onClick={() => void move({ type: 'set_word', word })}>{t('games:board.hangman.useWord')}</GameButton>
          <GameButton onClick={() => void move({ type: 'set_word', word: null })}>{t('games:board.hangman.randomWord')}</GameButton>
        </div>
      </div>
    ) : (
      <div className="py-10 text-center text-[15px] text-txt-secondary">{setter && <><PlayerName id={setter} /> </>}{t('games:board.hangman.choosing')} <Countdown deadline={session.deadline} /></div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="text-[13px] text-txt-secondary text-center">
        {amSetter ? t('games:board.hangman.youSet') : <>{setter && <PlayerName id={setter} />} {t('games:board.hangman.theySet')}</>}
      </div>
      <Gallows wrong={view.wrong.length} max={view.maxWrong} />
      <div className="flex flex-wrap justify-center gap-1.5" aria-label={t('games:board.hangman.pattern')}>
        {view.pattern.map((ch, i) => (
          <span key={i} className={`w-8 desktop:w-9 h-11 flex items-end justify-center pb-1 border-b-[3px] text-[22px] font-bold uppercase ${ch ? 'border-accent-primary' : 'border-white/40'} ${amSetter && !view.guessed.includes(ch ?? '') ? 'text-txt-tertiary' : ''}`}>{ch ?? ''}</span>
        ))}
      </div>
      <div className="text-[13px] text-txt-secondary">{t('games:board.hangman.misses', { misses: view.wrong.length, max: view.maxWrong })} {view.wrong.length > 0 && <span className="uppercase tracking-wider text-txt-danger">{view.wrong.join(' ')}</span>}</div>
      {guessing && (
        <>
          <WordKeyboard onKey={onKey} used={view.guessed} />
          <form className="flex gap-2 w-full max-w-sm" onSubmit={(e) => { e.preventDefault(); if (solve) { void move({ type: 'solve', word: solve }, true); setSolve(''); } }}>
            <input value={solve} onChange={(e) => setSolve(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 12))} placeholder={t('games:board.hangman.solvePlaceholder')} aria-label={t('games:board.hangman.solvePlaceholder')} className="input-standard flex-1 px-3 py-2 rounded-lg" />
            <GameButton kind="secondary" disabled={!solve}>{t('games:board.hangman.solve')}</GameButton>
          </form>
        </>
      )}
      {view.word && view.phase === 'over' && <div className="text-[14px]">{t('games:board.word.answerWas')} <span className="font-bold uppercase tracking-wider">{view.word}</span></div>}
    </div>
  );
}

const REJECT_KEYS = {
  not_a_word: 'games:board.duel.rejected.not_a_word',
  wrong_letter: 'games:board.duel.rejected.wrong_letter',
  used: 'games:board.duel.rejected.used',
  too_short: 'games:board.duel.rejected.too_short',
} as const;

export function WordDuelBoard({ session, view, move }: BoardProps<WordDuelView>) {
  const { t } = useTranslation(['games']);
  const [word, setWord] = useState('');
  const myTurn = session.status === 'playing' && view.turn === view.me;
  const opp = view.me === 0 ? 1 : 0;
  useEffect(() => { if (!myTurn) setWord(''); }, [myTurn]);
  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-lg mx-auto">
      <TurnLine session={session} turn={view.turn} me={view.me} extra={<Countdown deadline={session.deadline} />} />
      <div className="flex items-center gap-6 text-[13px]">
        <span>{t('games:board.duel.you')}: <b className="text-[18px] tabular-nums text-accent-primary">{view.scores[view.me] ?? 0}</b> <span className="text-txt-tertiary">({t('games:board.duel.turnsLeft', { count: view.turnsLeft[view.me] ?? 0 })})</span></span>
        <span>{seatUser(session, opp) && <PlayerName id={seatUser(session, opp)!} />}: <b className="text-[18px] tabular-nums">{view.scores[opp] ?? 0}</b></span>
      </div>
      <div className="flex items-center justify-center gap-2">
        <span className="text-[13px] text-txt-secondary">{t('games:board.duel.startWith')}</span>
        <span className="w-12 h-12 rounded-xl bg-accent-primary text-on-accent text-[26px] font-extrabold uppercase flex items-center justify-center">{view.letter}</span>
      </div>
      {myTurn && (
        <form className="flex gap-2 w-full" onSubmit={(e) => { e.preventDefault(); if (word.length >= 3) { void move({ type: 'word', word }, true); setWord(''); } }}>
          <input autoFocus value={word} onChange={(e) => setWord(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 20))} placeholder={t('games:board.duel.placeholder', { letter: view.letter.toUpperCase() })} aria-label={t('games:board.duel.placeholder', { letter: view.letter.toUpperCase() })} className="input-standard flex-1 px-3 py-2 rounded-lg lowercase" />
          <GameButton kind="primary" disabled={word.length < 3}>{t('games:board.duel.play')}</GameButton>
        </form>
      )}
      {view.rejected && <div className="text-[13px] text-txt-danger" role="alert">“{view.rejected.word}”: {t(REJECT_KEYS[view.rejected.reason])}</div>}
      <ol className="w-full flex flex-col gap-1 max-h-64 overflow-y-auto">
        {[...view.words].reverse().map((w, i) => (
          <li key={view.words.length - i} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-[14px] ${w.seat === view.me ? 'bg-accent-primary/15' : 'bg-white/[0.05]'}`}>
            <span className="font-semibold tracking-wide"><span className="uppercase text-accent-primary">{w.word[0]}</span>{w.word.slice(1)}</span>
            <span className="text-txt-tertiary tabular-nums">+{w.points}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
