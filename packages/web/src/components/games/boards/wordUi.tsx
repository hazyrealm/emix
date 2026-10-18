import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { LetterMark, WordGuess } from '@backspace/shared/src/games';
import { useGameStore } from '../../../stores/gameStore';

/**
 * Tile colours. The colour-blind palette swaps green/yellow for orange/blue,
 * and every tile also carries a symbol for its mark, so colour is never the
 * only cue.
 */
export function markStyle(mark: LetterMark | undefined, colorblind: boolean): { bg: string; fg: string } {
  if (mark === 'correct') return { bg: colorblind ? '#f97316' : '#16a34a', fg: '#fff' };
  if (mark === 'present') return { bg: colorblind ? '#3b82f6' : '#ca8a04', fg: '#fff' };
  if (mark === 'absent') return { bg: '#3f3f46', fg: '#e4e4e7' };
  return { bg: 'transparent', fg: 'inherit' };
}

const MARK_SYMBOL: Record<LetterMark, string> = { correct: '●', present: '◐', absent: '' };

export function LetterRow({ guess, length, pending = '', shake = false }: { guess?: WordGuess; length: number; pending?: string; shake?: boolean }) {
  const { t } = useTranslation(['games']);
  const colorblind = useGameStore((s) => s.colorblind);
  const letters = guess ? guess.word : pending;
  const label = guess
    ? guess.word.toUpperCase().split('').map((ch, i) => `${ch} ${t(`games:board.word.marks.${guess.marks[i]!}`)}`).join(', ')
    : undefined;
  return (
    <div className={`grid gap-1.5 ${shake ? 'animate-[emx-shake_300ms]' : ''}`} style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-label={label} role={guess ? 'img' : undefined}>
      {Array.from({ length }, (_, i) => {
        const ch = letters[i];
        const mark = guess?.marks[i];
        const { bg, fg } = markStyle(mark, colorblind);
        return (
          <div
            key={i}
            aria-hidden={!!guess}
            className={`relative aspect-square flex items-center justify-center rounded-md text-[clamp(16px,calc(5*var(--app-vw)),26px)] font-bold uppercase transition-colors duration-300 ${mark ? '' : ch ? 'border-2 border-white/40' : 'border-2 border-white/15'}`}
            style={{ background: bg, color: fg, transitionDelay: mark ? `${i * 80}ms` : undefined }}
          >
            {ch ?? ''}
            {mark && MARK_SYMBOL[mark] && <span className="absolute top-0.5 right-1 text-[9px] opacity-80">{MARK_SYMBOL[mark]}</span>}
          </div>
        );
      })}
    </div>
  );
}

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/** The best mark each letter has received so far, for the keyboard. */
export function keyMarks(guesses: WordGuess[]): Record<string, LetterMark> {
  const rank = { absent: 0, present: 1, correct: 2 } as const;
  const out: Record<string, LetterMark> = {};
  for (const g of guesses) [...g.word].forEach((ch, i) => {
    const m = g.marks[i]!;
    if (!out[ch] || rank[m] > rank[out[ch]!]) out[ch] = m;
  });
  return out;
}

/** On-screen keyboard; the physical keyboard works too while `enabled`. */
export function WordKeyboard({ onKey, marks = {}, enabled = true, used = [] }: {
  onKey: (key: string) => void;
  marks?: Record<string, LetterMark>;
  enabled?: boolean;
  /** Letters already tried (Hangman), shown dimmed. */
  used?: string[];
}) {
  const { t } = useTranslation(['games']);
  const colorblind = useGameStore((s) => s.colorblind);
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'Enter') { onKey('enter'); e.preventDefault(); }
      else if (e.key === 'Backspace') { onKey('back'); e.preventDefault(); }
      else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toLowerCase());
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey, enabled]);
  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[500px] select-none" aria-label={t('games:board.word.keyboard')}>
      {ROWS.map((row, r) => (
        <div key={row} className="flex gap-1 justify-center">
          {r === 2 && (
            <button type="button" disabled={!enabled} onClick={() => onKey('enter')} className="px-2 desktop:px-3 h-12 rounded-md bg-white/[0.14] text-[12px] font-bold uppercase disabled:opacity-40">{t('games:board.word.enter')}</button>
          )}
          {[...row].map((ch) => {
            const { bg, fg } = markStyle(marks[ch], colorblind);
            const dim = used.includes(ch);
            return (
              <button
                key={ch}
                type="button"
                disabled={!enabled || dim}
                onClick={() => onKey(ch)}
                className={`flex-1 max-w-[44px] h-12 rounded-md text-[15px] font-bold uppercase disabled:cursor-default ${dim ? 'opacity-30' : ''}`}
                style={{ background: marks[ch] ? bg : 'rgb(var(--overlay) / 0.14)', color: marks[ch] ? fg : undefined }}
              >
                {ch}
              </button>
            );
          })}
          {r === 2 && (
            <button type="button" disabled={!enabled} onClick={() => onKey('back')} aria-label={t('games:board.word.backspace')} className="px-2 desktop:px-3 h-12 rounded-md bg-white/[0.14] disabled:opacity-40">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z" /></svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
