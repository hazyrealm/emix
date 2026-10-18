import { BATTLESHIP_FLEET, type BattleshipShip, type BattleshipShot, type BattleshipView } from '@backspace/shared/src/games.js';
import { forfeit, isInt, winFor, type BaseState, type GameRules, type RuleContext } from '../types.js';

/**
 * Battleship on a 10×10 grid with a fleet of 5, 4, 3, 3 and 2. Both players
 * place their fleet in secret (ships may touch but not overlap); a player who
 * has not placed within the time limit gets a random layout. Then they take
 * turns firing one shot each. A ship is revealed to its attacker only once
 * sunk; every ship is revealed when the match ends.
 */
const SIZE = 10;
export const PLACEMENT_MS = 3 * 60_000;

interface State extends BaseState {
  phase: 'placement' | 'battle';
  turn: 0 | 1;
  fleets: [BattleshipShip[] | null, BattleshipShip[] | null];
  /** shots[seat] = the shots `seat` fired at the other fleet. */
  shots: [BattleshipShot[], BattleshipShot[]];
  placementEndsAt: number;
}

export function cells(ship: BattleshipShip): [number, number][] {
  return Array.from({ length: ship.len }, (_, i) => (ship.dir === 'h' ? [ship.x + i, ship.y] : [ship.x, ship.y + i]) as [number, number]);
}

/** The fleet if it is exactly the standard one, inside the grid, with no overlaps. */
export function validFleet(raw: unknown): BattleshipShip[] | null {
  if (!Array.isArray(raw) || raw.length !== BATTLESHIP_FLEET.length) return null;
  const ships: BattleshipShip[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') return null;
    const { x, y, len, dir } = r as Record<string, unknown>;
    if (!isInt(x, 0, SIZE - 1) || !isInt(y, 0, SIZE - 1) || !isInt(len, 2, 5) || (dir !== 'h' && dir !== 'v')) return null;
    ships.push({ x, y, len, dir });
  }
  const lengths = ships.map((s) => s.len).sort((a, b) => b - a);
  if (lengths.join() !== [...BATTLESHIP_FLEET].join()) return null;
  const seen = new Set<string>();
  for (const ship of ships) for (const [cx, cy] of cells(ship)) {
    if (cx >= SIZE || cy >= SIZE) return null;
    const key = `${cx},${cy}`;
    if (seen.has(key)) return null;
    seen.add(key);
  }
  return ships;
}

export function randomFleet(rng: () => number): BattleshipShip[] {
  for (;;) {
    const ships: BattleshipShip[] = [];
    const taken = new Set<string>();
    let ok = true;
    for (const len of BATTLESHIP_FLEET) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const dir = rng() < 0.5 ? 'h' : 'v';
        const x = Math.floor(rng() * (dir === 'h' ? SIZE - len + 1 : SIZE));
        const y = Math.floor(rng() * (dir === 'v' ? SIZE - len + 1 : SIZE));
        const ship: BattleshipShip = { x, y, len, dir };
        if (cells(ship).some(([cx, cy]) => taken.has(`${cx},${cy}`))) continue;
        for (const [cx, cy] of cells(ship)) taken.add(`${cx},${cy}`);
        ships.push(ship);
        placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
}

function isSunk(ship: BattleshipShip, shots: BattleshipShot[]): boolean {
  return cells(ship).every(([cx, cy]) => shots.some((s) => s.x === cx && s.y === cy));
}

function toBattle(state: State, ctx: RuleContext): State {
  const fleets: [BattleshipShip[], BattleshipShip[]] = [state.fleets[0] ?? randomFleet(ctx.rng), state.fleets[1] ?? randomFleet(ctx.rng)];
  return { ...state, fleets, phase: 'battle' };
}

export const battleship: GameRules<State> = {
  start: (players, _o, ctx, round) => ({
    players, result: null, phase: 'placement', turn: (round % 2) as 0 | 1,
    fleets: [null, null], shots: [[], []], placementEndsAt: ctx.now + PLACEMENT_MS,
  }),
  move(state, seat, move, ctx) {
    if (move.type === 'resign') return { state: forfeit(state, seat, 'resigned') };
    if (move.type === 'fleet') {
      if (state.phase !== 'placement' || state.fleets[seat]) return { error: 'game_wrong_state' };
      const fleet = validFleet(move.ships);
      if (!fleet) return { error: 'game_illegal_move' };
      const fleets: State['fleets'] = [...state.fleets];
      fleets[seat] = fleet;
      const next = { ...state, fleets };
      return { state: fleets[0] && fleets[1] ? toBattle(next, ctx) : next };
    }
    if (move.type !== 'fire' || !isInt(move.x, 0, SIZE - 1) || !isInt(move.y, 0, SIZE - 1)) return { error: 'game_illegal_move' };
    if (state.phase !== 'battle') return { error: 'game_wrong_state' };
    if (seat !== state.turn) return { error: 'game_not_your_turn' };
    const mine = state.shots[seat];
    if (mine.some((s) => s.x === move.x && s.y === move.y)) return { error: 'game_illegal_move' };
    const target = state.fleets[seat === 0 ? 1 : 0]!;
    const hit = target.some((ship) => cells(ship).some(([cx, cy]) => cx === move.x && cy === move.y));
    const shots: State['shots'] = [...state.shots];
    shots[seat] = [...mine, { x: move.x, y: move.y, hit }];
    const won = target.every((ship) => isSunk(ship, shots[seat]));
    return { state: { ...state, shots, turn: seat === 0 ? 1 : 0, result: won ? winFor(state.players, seat) : null } };
  },
  deadline: (s) => (s.phase === 'placement' && !s.result ? s.placementEndsAt : null),
  timeout: (s, ctx) => toBattle(s, ctx),
  view(s, me): BattleshipView {
    const over = s.result !== null;
    const sunkBy = (attacker: 0 | 1): BattleshipShip[] => {
      const fleet = s.fleets[attacker === 0 ? 1 : 0] ?? [];
      return over ? fleet : fleet.filter((ship) => isSunk(ship, s.shots[attacker]));
    };
    return {
      me, phase: over ? 'over' : s.phase, turn: s.turn,
      placed: [!!s.fleets[0], !!s.fleets[1]],
      myShips: me >= 0 ? s.fleets[me] ?? null : null,
      shots: s.shots,
      sunk: [sunkBy(0), sunkBy(1)],
    };
  },
  drop: (s, seat) => forfeit(s, seat, 'abandoned'),
};
