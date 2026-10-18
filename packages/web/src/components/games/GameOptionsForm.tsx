import { useTranslation } from 'react-i18next';
import {
  CHESS_CLOCKS, DRAWING_ROUNDS, DRAWING_TIMES, MEMORY_SIZES, RPS_BEST_OF, TRIVIA_CATEGORIES, TRIVIA_LENGTHS, WORDRACE_TIMERS,
  type GameId, type GameOptions,
} from '@backspace/shared/src/games';

function Choice<T extends string | number>({ label, value, options, render, onChange, disabled }: {
  label: string; value: T; options: readonly T[]; render: (v: T) => string; onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-txt-secondary">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o)} type="button" role="radio" aria-checked={value === o} disabled={disabled} onClick={() => onChange(o)}
            className={`px-3 py-1.5 rounded-lg text-[13px] transition-colors ${value === o ? 'bg-accent-primary text-on-accent' : 'bg-white/[0.06] hover:bg-white/[0.12] text-txt-secondary'} disabled:opacity-60 disabled:cursor-default`}>
            {render(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

const TRIVIA_LABELS = {
  mixed: 'games:options.trivia.mixed', science: 'games:options.trivia.science', geography: 'games:options.trivia.geography',
  history: 'games:options.trivia.history', nature: 'games:options.trivia.nature', arts: 'games:options.trivia.arts', sports: 'games:options.trivia.sports',
} as const;

/** The options a game has; `null` when it has none. */
export function GameOptionsForm({ gameId, value, onChange, disabled = false }: { gameId: GameId; value: GameOptions; onChange: (o: GameOptions) => void; disabled?: boolean }) {
  const { t } = useTranslation(['games']);
  const set = (patch: GameOptions) => onChange({ ...value, ...patch });
  switch (gameId) {
    case 'rps':
      return <Choice label={t('games:options.bestOf')} value={value.bestOf ?? 3} options={RPS_BEST_OF} render={(v) => t('games:options.bestOfN', { count: v })} onChange={(bestOf) => set({ bestOf })} disabled={disabled} />;
    case 'chess':
      return <Choice label={t('games:options.clock')} value={value.clock ?? '10+0'} options={CHESS_CLOCKS} render={(v) => (v === 'none' ? t('games:options.noClock') : v)} onChange={(clock) => set({ clock })} disabled={disabled} />;
    case 'memory':
      return <Choice label={t('games:options.cards')} value={value.size ?? 16} options={MEMORY_SIZES} render={(v) => t('games:options.cardsN', { count: v })} onChange={(size) => set({ size })} disabled={disabled} />;
    case 'wordrace':
      return <Choice label={t('games:options.timer')} value={value.timer ?? 0} options={WORDRACE_TIMERS} render={(v) => (v === 0 ? t('games:options.noTimer') : t('games:options.minutes', { count: v / 60 }))} onChange={(timer) => set({ timer })} disabled={disabled} />;
    case 'trivia':
      return (
        <div className="flex flex-col gap-3">
          <Choice label={t('games:options.category')} value={value.category ?? 'mixed'} options={TRIVIA_CATEGORIES} render={(v) => t(TRIVIA_LABELS[v])} onChange={(category) => set({ category })} disabled={disabled} />
          <Choice label={t('games:options.questions')} value={value.questions ?? 10} options={TRIVIA_LENGTHS} render={(v) => String(v)} onChange={(questions) => set({ questions })} disabled={disabled} />
        </div>
      );
    case 'drawing':
      return (
        <div className="flex flex-col gap-3">
          <Choice label={t('games:options.rounds')} value={value.rounds ?? 1} options={DRAWING_ROUNDS} render={(v) => String(v)} onChange={(rounds) => set({ rounds })} disabled={disabled} />
          <Choice label={t('games:options.drawTime')} value={value.drawTime ?? 80} options={DRAWING_TIMES} render={(v) => t('games:options.seconds', { count: v })} onChange={(drawTime) => set({ drawTime })} disabled={disabled} />
        </div>
      );
    default:
      return null;
  }
}
