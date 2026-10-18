import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BATTLESHIP_FLEET, type BattleshipShip, type BattleshipShot, type BattleshipView } from '@backspace/shared/src/games';
import { TurnLine, type BoardProps } from './common';
import { Countdown, GameButton } from '../gameUi';

const N = 10;
const cellsOf = (s: BattleshipShip): [number, number][] =>
  Array.from({ length: s.len }, (_, i) => (s.dir === 'h' ? [s.x + i, s.y] : [s.x, s.y + i]));

function fits(ships: BattleshipShip[], ship: BattleshipShip): boolean {
  const taken = new Set(ships.flatMap(cellsOf).map(([x, y]) => `${x},${y}`));
  return cellsOf(ship).every(([x, y]) => x < N && y < N && !taken.has(`${x},${y}`));
}

function randomLayout(): BattleshipShip[] {
  for (;;) {
    const ships: BattleshipShip[] = [];
    let ok = true;
    for (const len of BATTLESHIP_FLEET) {
      let placed = false;
      for (let i = 0; i < 300 && !placed; i++) {
        const dir = Math.random() < 0.5 ? 'h' : 'v';
        const ship: BattleshipShip = { len, dir, x: Math.floor(Math.random() * (dir === 'h' ? N - len + 1 : N)), y: Math.floor(Math.random() * (dir === 'v' ? N - len + 1 : N)) };
        if (fits(ships, ship)) { ships.push(ship); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
}

function Grid({ label, ships = [], shots, sunk = [], onCell, active = false, preview = [] }: {
  label: string;
  ships?: BattleshipShip[];
  shots: BattleshipShot[];
  sunk?: BattleshipShip[];
  onCell?: (x: number, y: number) => void;
  active?: boolean;
  preview?: [number, number][];
}) {
  const shipCells = useMemo(() => new Set(ships.flatMap(cellsOf).map(([x, y]) => `${x},${y}`)), [ships]);
  const sunkCells = useMemo(() => new Set(sunk.flatMap(cellsOf).map(([x, y]) => `${x},${y}`)), [sunk]);
  const shotAt = useMemo(() => new Map(shots.map((s) => [`${s.x},${s.y}`, s.hit])), [shots]);
  const previewCells = new Set(preview.map(([x, y]) => `${x},${y}`));
  return (
    <div className="flex flex-col gap-1.5 w-[min(100%,340px)]">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-txt-tertiary">{label}</div>
      <div className={`grid grid-cols-10 gap-[2px] aspect-square rounded-lg p-1 ${active ? 'bg-accent-primary/30 ring-2 ring-accent-primary/60' : 'bg-[#0b3b5c]'}`} role="grid" aria-label={label}>
        {Array.from({ length: N * N }, (_, i) => {
          const x = i % N;
          const y = Math.floor(i / N);
          const key = `${x},${y}`;
          const hit = shotAt.get(key);
          const isShip = shipCells.has(key);
          const isSunk = sunkCells.has(key);
          return (
            <button
              key={key}
              type="button"
              disabled={!onCell || hit !== undefined}
              onClick={() => onCell?.(x, y)}
              aria-label={`${String.fromCharCode(65 + y)}${x + 1}${hit === true ? ' hit' : hit === false ? ' miss' : ''}`}
              className={`relative rounded-[3px] flex items-center justify-center ${onCell && hit === undefined ? 'hover:bg-white/30 cursor-crosshair' : ''}`}
              style={{ background: isSunk ? '#7f1d1d' : previewCells.has(key) ? 'rgb(167 139 250 / 0.8)' : isShip ? '#94a3b8' : 'rgb(56 189 248 / 0.18)' }}
            >
              {hit === true && <span className="w-[60%] h-[60%] rounded-full bg-[#f97316] shadow-[0_0_6px_#f97316]" />}
              {hit === false && <span className="w-[26%] h-[26%] rounded-full bg-white/70" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BattleshipBoard({ session, view, move }: BoardProps<BattleshipView>) {
  const { t } = useTranslation(['games']);
  const [layout, setLayout] = useState<BattleshipShip[]>([]);
  const [dir, setDir] = useState<'h' | 'v'>('h');
  const [hover, setHover] = useState<[number, number] | null>(null);
  const opp = view.me === 0 ? 1 : 0;
  const remaining: number[] = [...BATTLESHIP_FLEET].sort((a, b) => b - a);
  for (const s of layout) remaining.splice(remaining.indexOf(s.len), 1);
  const nextLen = remaining[0];

  if (view.phase === 'placement' && view.me >= 0 && !view.placed[view.me]) {
    const candidate = hover && nextLen ? { x: hover[0], y: hover[1], len: nextLen, dir } : null;
    const place = (x: number, y: number) => {
      const onShip = layout.findIndex((s) => cellsOf(s).some(([cx, cy]) => cx === x && cy === y));
      if (onShip >= 0) { setLayout(layout.filter((_, i) => i !== onShip)); return; }
      if (!nextLen) return;
      const ship: BattleshipShip = { x, y, len: nextLen, dir };
      if (fits(layout, ship)) setLayout([...layout, ship]);
    };
    return (
      <div className="flex flex-col items-center gap-3 w-full">
        <div className="text-[14px] text-center">{t('games:board.battleship.place')} <Countdown deadline={session.deadline} className="ml-1" /></div>
        <div className="text-[12px] text-txt-tertiary text-center max-w-sm">{t('games:board.battleship.placeHint')}</div>
        <div onMouseLeave={() => setHover(null)} onMouseMove={(e) => {
          const grid = (e.target as HTMLElement).closest('[role=grid]');
          const btn = (e.target as HTMLElement).closest('button');
          if (!grid || !btn) return;
          const i = [...grid.children].indexOf(btn);
          if (i >= 0) setHover([i % N, Math.floor(i / N)]);
        }} className="w-[min(100%,340px)]">
          <Grid
            label={t('games:board.battleship.yourWaters')}
            ships={layout}
            shots={[]}
            onCell={place}
            preview={candidate && fits(layout, candidate) ? cellsOf(candidate) : []}
          />
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          <GameButton onClick={() => setDir(dir === 'h' ? 'v' : 'h')}>{dir === 'h' ? t('games:board.battleship.horizontal') : t('games:board.battleship.vertical')}</GameButton>
          <GameButton onClick={() => setLayout(randomLayout())}>{t('games:board.battleship.random')}</GameButton>
          <GameButton onClick={() => setLayout([])} disabled={!layout.length}>{t('games:board.battleship.clear')}</GameButton>
          <GameButton kind="primary" disabled={remaining.length > 0} onClick={() => void move({ type: 'fleet', ships: layout })}>{t('games:board.battleship.ready')}</GameButton>
        </div>
        <div className="text-[12px] text-txt-tertiary">{nextLen ? t('games:board.battleship.next', { len: nextLen }) : t('games:board.battleship.allPlaced')}</div>
      </div>
    );
  }

  if (view.phase === 'placement') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="text-[15px] font-medium">{t('games:board.battleship.waitingPlacement')}</div>
        <Countdown deadline={session.deadline} />
        {view.myShips && <Grid label={t('games:board.battleship.yourWaters')} ships={view.myShips} shots={[]} />}
      </div>
    );
  }

  const myTurn = session.status === 'playing' && view.turn === view.me;
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <TurnLine session={session} turn={view.turn} me={view.me} />
      <div className="flex flex-col desktop:flex-row gap-4 items-center desktop:items-start justify-center w-full">
        <Grid
          label={t('games:board.battleship.enemyWaters')}
          shots={view.shots[view.me] ?? []}
          sunk={view.sunk[view.me] ?? []}
          onCell={myTurn ? (x, y) => void move({ type: 'fire', x, y }, true) : undefined}
          active={myTurn}
        />
        <Grid
          label={t('games:board.battleship.yourWaters')}
          ships={view.myShips ?? []}
          shots={view.shots[opp] ?? []}
          sunk={view.phase === 'over' ? view.sunk[opp] ?? [] : []}
        />
      </div>
      <div className="text-[12px] text-txt-tertiary">
        {t('games:board.battleship.sunkCount', { mine: (view.sunk[view.me] ?? []).length, theirs: (view.sunk[opp] ?? []).length, total: BATTLESHIP_FLEET.length })}
      </div>
    </div>
  );
}
