import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DAILY_WORD_GUESSES, DAILY_WORD_LENGTH, type DailyWordState, type DailyWordStats } from '@backspace/shared/src/games';
import { api, HttpError } from '../../api/client';
import { describeError } from '../../i18n/errors';
import { useUIStore } from '../../stores/uiStore';
import { useGameStore } from '../../stores/gameStore';
import { LetterRow, WordKeyboard, keyMarks } from './boards/wordUi';
import { GameButton, useCountdown } from './gameUi';
import { playGameSound } from '../../utils/gameAudio';

export function StatsGrid({ stats }: { stats: DailyWordStats }) {
  const { t } = useTranslation(['games']);
  const max = Math.max(1, ...stats.distribution);
  const cells = [
    [stats.played, t('games:daily.stats.played')],
    [stats.played ? Math.round((stats.won / stats.played) * 100) : 0, t('games:daily.stats.winRate')],
    [stats.currentStreak, t('games:daily.stats.current')],
    [stats.bestStreak, t('games:daily.stats.best')],
  ] as const;
  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="grid grid-cols-4 gap-2 text-center">
        {cells.map(([n, label]) => (
          <div key={label}><div className="text-[22px] font-bold tabular-nums">{n}</div><div className="text-[11px] text-txt-tertiary leading-tight">{label}</div></div>
        ))}
      </div>
      <div className="flex flex-col gap-1" aria-label={t('games:daily.stats.distribution')}>
        {stats.distribution.map((n, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <span className="w-3 text-right tabular-nums text-txt-tertiary">{i + 1}</span>
            <div className="flex-1"><div className="h-5 rounded bg-accent-primary/70 text-right pr-1.5 text-[11px] font-semibold leading-5 text-on-accent tabular-nums" style={{ width: `${Math.max(7, (n / max) * 100)}%` }}>{n}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Spoiler-free result: squares only, no letters. */
export function shareText(state: DailyWordState, colorblind: boolean): string {
  const sq = { correct: colorblind ? '🟧' : '🟩', present: colorblind ? '🟦' : '🟨', absent: '⬛' } as const;
  const score = state.status === 'won' ? state.guesses.length : 'X';
  return [`Emix Daily Word #${state.number} ${score}/${DAILY_WORD_GUESSES}`, '', ...state.guesses.map((g) => g.marks.map((m) => sq[m]).join(''))].join('\n');
}

export function DailyWord() {
  const { t } = useTranslation(['games']);
  const addToast = useUIStore((s) => s.addToast);
  const colorblind = useGameStore((s) => s.colorblind);
  const setColorblind = useGameStore((s) => s.setColorblind);
  const [state, setState] = useState<DailyWordState | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraftState] = useState('');
  const draftRef = useRef('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const setDraft = (d: string) => { draftRef.current = d; setDraftState(d); };
  const left = useCountdown(state?.nextAt ?? null);

  const load = useCallback(() => {
    setFailed(false);
    api.games.daily().then(({ daily }) => setState(daily)).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);
  // A new day: fetch the new puzzle.
  useEffect(() => { if (left === 0) load(); }, [left, load]);

  const nudge = () => { setShake(true); window.setTimeout(() => setShake(false), 320); };
  const playing = state?.status === 'playing';

  const onKey = useCallback((k: string) => {
    if (!playing || busy) return;
    const d = draftRef.current;
    if (k === 'back') { setDraft(d.slice(0, -1)); return; }
    if (k !== 'enter') { if (d.length < DAILY_WORD_LENGTH) setDraft(d + k); return; }
    if (d.length !== DAILY_WORD_LENGTH) { nudge(); return; }
    setBusy(true);
    api.games.dailyGuess(d)
      .then(({ daily }) => {
        setState(daily);
        setDraft('');
        if (daily.status === 'won') void playGameSound('win');
        else if (daily.status === 'lost') void playGameSound('lose');
        else void playGameSound('move');
      })
      .catch((err) => {
        nudge();
        addToast(err instanceof HttpError && err.code === 'game_unknown_word' ? t('games:daily.notAWord') : describeError(err), 'warning');
      })
      .finally(() => setBusy(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, busy, addToast, t]);

  if (failed) return <div className="py-10 text-center text-txt-secondary">{t('games:common.loadFailed')} <button type="button" onClick={load} className="text-accent-primary hover:underline">{t('games:common.retry')}</button></div>;
  if (!state) return <div className="py-10 text-center text-txt-tertiary" role="status">{t('games:common.loading')}</div>;

  const share = async () => {
    const text = shareText(state, colorblind);
    try {
      await navigator.clipboard.writeText(text);
      addToast(t('games:daily.copied'), 'success');
    } catch {
      addToast(t('games:daily.copyFailed'), 'warning');
    }
  };
  const h = left !== null ? Math.floor(left / 3600) : 0;
  const m = left !== null ? Math.floor((left % 3600) / 60) : 0;
  const s = left !== null ? left % 60 : 0;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto">
      <div className="flex items-center justify-between w-full">
        <h2 className="text-[18px] font-bold">{t('games:daily.title', { number: state.number })}</h2>
        <label className="flex items-center gap-2 text-[12px] text-txt-secondary cursor-pointer">
          <input type="checkbox" checked={colorblind} onChange={(e) => setColorblind(e.target.checked)} className="accent-[rgb(var(--accent-primary))]" />
          {t('games:audio.colorblind')}
        </label>
      </div>
      <div className="flex flex-col gap-1.5 w-[min(100%,320px)]">
        {Array.from({ length: DAILY_WORD_GUESSES }, (_, i) => (
          <LetterRow key={i} length={DAILY_WORD_LENGTH} guess={state.guesses[i]} pending={i === state.guesses.length && playing ? draft : ''} shake={shake && i === state.guesses.length} />
        ))}
      </div>
      {playing ? (
        <WordKeyboard onKey={onKey} marks={keyMarks(state.guesses)} enabled={!busy} />
      ) : (
        <div className="flex flex-col items-center gap-4 w-full rounded-2xl bg-white/[0.04] p-4 animate-fade-in">
          <div className="text-[17px] font-bold">{state.status === 'won' ? t('games:daily.won', { count: state.guesses.length }) : t('games:daily.lost')}</div>
          {state.answer && <div className="text-[14px]">{t('games:board.word.answerWas')} <span className="font-bold uppercase tracking-widest">{state.answer}</span></div>}
          <StatsGrid stats={state.stats} />
          <div className="flex items-center gap-3">
            <GameButton kind="primary" onClick={() => void share()}>{t('games:daily.share')}</GameButton>
            <span className="text-[12px] text-txt-tertiary tabular-nums">{t('games:daily.next')} {`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`}</span>
          </div>
        </div>
      )}
      <p className="text-[12px] text-txt-tertiary text-center">{t('games:daily.rules')}</p>
    </div>
  );
}
