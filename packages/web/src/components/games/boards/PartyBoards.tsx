import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DRAWING_COLORS, DRAWING_SIZES, type DrawingCanvasOp, type DrawingStroke, type DrawingView, type GameSessionView, type TriviaView } from '@backspace/shared/src/games';
import type { BoardProps } from './common';
import { Countdown, GameButton, PlayerChip, PlayerName } from '../gameUi';
import { api } from '../../../api/client';
import { onDrawing } from '../../../stores/gameStore';
import { wsSend } from '../../../hooks/useWebSocket';

function Leaderboard({ scores, players, highlight, gained }: { scores: Record<string, number>; players: string[]; highlight?: string[]; gained?: Record<string, number> }) {
  const { t } = useTranslation(['games']);
  const ranked = [...players].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  return (
    <ol className="flex flex-col gap-1.5 w-full" aria-label={t('games:board.leaderboard')}>
      {ranked.map((id, i) => (
        <li key={id} className="flex items-center gap-2">
          <span className="w-5 text-right text-[12px] text-txt-tertiary tabular-nums">{i + 1}</span>
          <div className="flex-1 min-w-0"><PlayerChip id={id} size={22} active={highlight?.includes(id)} /></div>
          <span className="tabular-nums text-[13px] font-semibold w-14 text-right">{scores[id] ?? 0}</span>
          {gained && <span className={`tabular-nums text-[12px] w-12 text-right ${gained[id] ? 'text-status-online' : 'text-txt-tertiary'}`}>{gained[id] ? `+${gained[id]}` : ''}</span>}
        </li>
      ))}
    </ol>
  );
}

const CATEGORY_LABEL = {
  science: 'games:options.trivia.science', geography: 'games:options.trivia.geography', history: 'games:options.trivia.history',
  nature: 'games:options.trivia.nature', arts: 'games:options.trivia.arts', sports: 'games:options.trivia.sports',
} as const;

export function TriviaBoard({ session, view, move }: BoardProps<TriviaView>) {
  const { t } = useTranslation(['games']);
  const reveal = view.phase !== 'question';
  return (
    <div className="flex flex-col desktop:flex-row gap-5 w-full max-w-4xl mx-auto">
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex items-center justify-between text-[13px] text-txt-secondary">
          <span>{t('games:board.trivia.question', { n: view.index + 1, total: view.total })} · {t(CATEGORY_LABEL[view.category])}</span>
          {view.phase === 'question' && <Countdown deadline={session.deadline} className="text-[15px]" />}
        </div>
        <h3 className="text-[18px] desktop:text-[20px] font-semibold leading-snug">{view.question}</h3>
        <div className="grid grid-cols-1 desktop:grid-cols-2 gap-2.5">
          {view.choices.map((choice, i) => {
            const mine = view.mine === i;
            const right = reveal && view.correct === i;
            const wrongPick = reveal && mine && view.correct !== i;
            return (
              <button
                key={i}
                type="button"
                disabled={view.mine !== null || reveal || session.status !== 'playing'}
                onClick={() => void move({ type: 'answer', index: view.index, choice: i })}
                className={`text-left px-4 py-3 rounded-xl text-[15px] font-medium transition-colors border-2 ${
                  right ? 'bg-status-online/25 border-status-online' : wrongPick ? 'bg-accent-rose/20 border-accent-rose' : mine ? 'bg-accent-primary/25 border-accent-primary' : 'bg-white/[0.05] border-transparent hover:bg-white/[0.1]'
                } disabled:cursor-default`}
              >
                <span className="text-txt-tertiary mr-2">{String.fromCharCode(65 + i)}</span>{choice}
                {right && <span className="sr-only"> ({t('games:board.trivia.correct')})</span>}
              </button>
            );
          })}
        </div>
        <div className="text-[13px] text-txt-secondary min-h-[20px]" aria-live="polite">
          {view.phase === 'question' && (view.mine === null ? t('games:board.trivia.pick') : t('games:board.trivia.answered', { count: view.answered.length, total: session.seats.length }))}
          {view.phase === 'reveal' && (view.mine === view.correct ? t('games:board.trivia.youGotIt', { points: view.gained[session.seats[view.me] ?? ''] ?? 0 }) : t('games:board.trivia.missed'))}
        </div>
      </div>
      <div className="desktop:w-64">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-txt-tertiary mb-2">{t('games:board.leaderboard')}</div>
        <Leaderboard scores={view.scores} players={session.seats} gained={reveal ? view.gained : undefined} highlight={view.answered} />
      </div>
    </div>
  );
}

const W = 1000;
const H = 750;

function drawStroke(ctx: CanvasRenderingContext2D, s: DrawingStroke, scale: number) {
  ctx.save();
  ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const [first, ...rest] = s.points;
  if (!first) { ctx.restore(); return; }
  ctx.beginPath();
  ctx.moveTo(first[0] * scale, first[1] * scale);
  if (!rest.length) ctx.lineTo(first[0] * scale + 0.1, first[1] * scale);
  for (const [x, y] of rest) ctx.lineTo(x * scale, y * scale);
  ctx.stroke();
  ctx.restore();
}

/** The strokes without the last pen stroke (all its chunks), as the server undoes it. */
function withoutLastStroke(list: DrawingStroke[]): DrawingStroke[] {
  const last = list[list.length - 1];
  if (!last) return list;
  let cut = list.length - 1;
  while (cut > 0 && last.g !== undefined && list[cut - 1]!.g === last.g) cut -= 1;
  return list.slice(0, cut);
}

/** The shared canvas: everyone sees it; only the drawer can draw on it. */
function SketchCanvas({ session, drawing, turnKey }: { session: GameSessionView; drawing: boolean; turnKey: string }) {
  const { t } = useTranslation(['games']);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<DrawingStroke[]>([]);
  const [color, setColor] = useState<string>(DRAWING_COLORS[0]);
  const [size, setSize] = useState<number>(DRAWING_SIZES[1]);
  const [erase, setErase] = useState(false);
  const pen = useRef<{ points: [number, number][]; sent: number; g: number } | null>(null);
  const group = useRef(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = canvas.width / W;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes.current) drawStroke(ctx, s, scale);
  }, []);

  // Size the backing store to the element, at device resolution.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.width * dpr * (H / W));
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  // A new turn starts blank; reopening mid-turn fetches what is already drawn.
  useEffect(() => {
    strokes.current = [];
    redraw();
    let cancelled = false;
    api.games.canvas(session.id).then(({ strokes: s }) => { if (!cancelled) { strokes.current = s; redraw(); } }).catch(() => {});
    const off = onDrawing(session.id, (op: DrawingCanvasOp) => {
      if (op.kind === 'clear') strokes.current = [];
      else if (op.kind === 'undo') strokes.current = withoutLastStroke(strokes.current);
      else strokes.current = [...strokes.current, op.stroke];
      redraw();
    });
    return () => { cancelled = true; off(); };
  }, [session.id, turnKey, redraw]);

  const send = (op: DrawingCanvasOp) => wsSend({ type: 'game_draw', sessionId: session.id, op });

  const flush = (final: boolean) => {
    const p = pen.current;
    if (!p) return;
    // Each chunk starts at the previous chunk's last point so the line stays joined.
    const from = Math.max(0, p.sent - 1);
    const chunk = p.points.slice(from);
    if (chunk.length >= (final ? 1 : 2)) {
      const stroke: DrawingStroke = { color: erase ? '#111111' : color, size, points: chunk.slice(0, 400), g: p.g, ...(erase ? { erase: true } : {}) };
      strokes.current = [...strokes.current, stroke];
      send({ kind: 'stroke', stroke });
      p.sent = p.points.length;
    }
  };

  const point = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * W),
      Math.round(Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) * H),
    ];
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    group.current += 1;
    pen.current = { points: [point(e)], sent: 0, g: group.current };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pen.current;
    if (!p) return;
    const pt = point(e);
    const last = p.points[p.points.length - 1]!;
    if (Math.abs(pt[0] - last[0]) + Math.abs(pt[1] - last[1]) < 3) return;
    p.points.push(pt);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) drawStroke(ctx, { color, size, points: [last, pt], ...(erase ? { erase: true } : {}) }, canvas.width / W);
    if (p.points.length - p.sent >= 24) flush(false);
  };
  const onUp = () => {
    flush(true);
    pen.current = null;
    redraw();
  };

  useEffect(() => {
    if (!drawing) return;
    const id = window.setInterval(() => flush(false), 90);
    return () => window.clearInterval(id);
  });

  return (
    <div className="flex flex-col gap-2 w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-label={t('games:board.drawing.canvas')}
        className={`w-full rounded-xl bg-white shadow-inner ${drawing ? 'cursor-crosshair touch-none' : ''}`}
        style={{ aspectRatio: `${W} / ${H}` }}
      />
      {drawing && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t('games:board.drawing.color')}>
            {DRAWING_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={!erase && color === c} aria-label={c} onClick={() => { setColor(c); setErase(false); }}
                className={`w-7 h-7 rounded-full border-2 ${!erase && color === c ? 'border-accent-primary scale-110' : 'border-white/30'}`} style={{ background: c }} />
            ))}
          </div>
          <div className="flex gap-1" role="radiogroup" aria-label={t('games:board.drawing.size')}>
            {DRAWING_SIZES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={size === s} aria-label={t('games:board.drawing.sizeN', { size: s })} onClick={() => setSize(s)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${size === s ? 'bg-accent-primary/30' : 'bg-white/[0.06]'}`}>
                <span className="rounded-full bg-current" style={{ width: Math.min(20, s / 1.5 + 3), height: Math.min(20, s / 1.5 + 3) }} />
              </button>
            ))}
          </div>
          <GameButton kind={erase ? 'primary' : 'secondary'} onClick={() => setErase(!erase)}>{t('games:board.drawing.eraser')}</GameButton>
          <GameButton onClick={() => { strokes.current = withoutLastStroke(strokes.current); redraw(); send({ kind: 'undo' }); }}>{t('games:board.drawing.undo')}</GameButton>
          <GameButton kind="danger" onClick={() => { strokes.current = []; redraw(); send({ kind: 'clear' }); }}>{t('games:board.drawing.clear')}</GameButton>
        </div>
      )}
    </div>
  );
}

export function DrawingBoard({ session, view, move }: BoardProps<DrawingView>) {
  const { t } = useTranslation(['games']);
  const [guess, setGuess] = useState('');
  const me = session.seats[view.me] ?? '';
  const isDrawer = view.drawer === me;
  const guessedIt = view.guessed.includes(me);
  const turnKey = `${view.round}:${view.drawer}`;
  const feedRef = useRef<HTMLOListElement>(null);
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }); }, [view.feed.length]);

  return (
    <div className="flex flex-col desktop:flex-row gap-4 w-full max-w-5xl mx-auto">
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <span className="text-txt-secondary">{t('games:board.drawing.round', { round: view.round, rounds: view.rounds })} · <PlayerName id={view.drawer} /> {t('games:board.drawing.isDrawing')}</span>
          <Countdown deadline={session.deadline} className="text-[15px]" />
        </div>
        <div className="text-center text-[20px] font-bold tracking-[0.3em] min-h-[30px]" aria-live="polite">
          {view.phase === 'reveal' && view.revealed ? <span>{t('games:board.drawing.wordWas')} <span className="tracking-normal text-accent-primary">{view.revealed}</span></span>
            : view.word ? <span className="tracking-normal">{view.word}</span>
              : <span aria-label={t('games:board.drawing.hint', { letters: view.hint.length })}>{view.hint}</span>}
        </div>
        {view.phase === 'choose' && isDrawer && view.choices && (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="text-[15px] font-medium">{t('games:board.drawing.pickWord')}</div>
            <div className="flex flex-wrap justify-center gap-2">
              {view.choices.map((w, i) => <GameButton key={w} kind="primary" onClick={() => void move({ type: 'pick', index: i })}>{w}</GameButton>)}
            </div>
          </div>
        )}
        {view.phase === 'choose' && !isDrawer && <div className="py-6 text-center text-txt-secondary"><PlayerName id={view.drawer} /> {t('games:board.drawing.choosing')}</div>}
        {(view.phase === 'draw' || view.phase === 'reveal' || view.phase === 'over') && <SketchCanvas session={session} drawing={isDrawer && view.phase === 'draw'} turnKey={turnKey} />}
      </div>
      <div className="desktop:w-72 flex flex-col gap-3">
        <Leaderboard scores={view.scores} players={session.seats} highlight={view.guessed} />
        <ol ref={feedRef} className="flex flex-col gap-1 h-40 desktop:h-56 overflow-y-auto rounded-lg bg-white/[0.04] p-2 text-[13px]" aria-live="polite" aria-label={t('games:board.drawing.guesses')}>
          {view.feed.map((f, i) => (
            <li key={i} className={f.correct ? 'text-status-online font-medium' : 'text-txt-secondary'}>
              <PlayerName id={f.userId} />{f.correct ? ` ${t('games:board.drawing.guessedIt')}` : `: ${f.text}`}
            </li>
          ))}
        </ol>
        {view.close && !guessedIt && <div className="text-[13px] text-accent-amber" role="status">{t('games:board.drawing.close')}</div>}
        {!isDrawer && view.phase === 'draw' && (
          guessedIt ? <div className="text-[13px] text-status-online">{t('games:board.drawing.youGotIt')}</div> : (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (guess.trim()) { void move({ type: 'guess', word: guess }); setGuess(''); } }}>
              <input value={guess} onChange={(e) => setGuess(e.target.value.slice(0, 60))} placeholder={t('games:board.drawing.guessPlaceholder')} aria-label={t('games:board.drawing.guessPlaceholder')} className="input-standard flex-1 min-w-0 px-3 py-2 rounded-lg" />
              <GameButton kind="primary" disabled={!guess.trim()}>{t('games:board.drawing.send')}</GameButton>
            </form>
          )
        )}
      </div>
    </div>
  );
}
