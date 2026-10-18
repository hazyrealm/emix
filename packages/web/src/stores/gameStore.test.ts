import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GameSessionView } from '@backspace/shared/src/games';

const playSound = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../audio/AudioManager', () => ({ AudioManager: { getInstance: () => ({ playSound }) } }));

import { useGameStore } from './gameStore';
import { useAuthStore } from './authStore';
import { playGameSound } from '../utils/gameAudio';
import { shareText } from '../components/games/DailyWord';

function session(patch: Partial<GameSessionView> = {}): GameSessionView {
  return {
    id: 's1', gameId: 'tictactoe', hostId: 'bob', context: { kind: 'direct' }, status: 'lobby',
    players: ['bob'], seats: [], invited: ['me'], options: {}, seq: 1, view: null, result: null,
    series: {}, draws: 0, rematch: [], away: [], deadline: null, createdAt: 1, updatedAt: 1, ...patch,
  };
}

beforeEach(() => {
  playSound.mockClear();
  useGameStore.setState({ sessions: {}, openId: null, minimized: false, volume: 70, muted: false });
  useAuthStore.setState({ user: { id: 'me', status: 'online', chosenStatus: 'online' } as never });
});

describe('game sessions on the client', () => {
  it('never goes back to an older version when pushes arrive out of order', () => {
    useGameStore.getState().upsert(session({ seq: 5, status: 'playing', invited: [] }));
    useGameStore.getState().upsert(session({ seq: 3, status: 'lobby', invited: [] }));
    expect(useGameStore.getState().sessions.s1!.seq).toBe(5);
  });

  it('chimes for a new invitation, but not under Do Not Disturb', async () => {
    useGameStore.getState().upsert(session());
    await vi.waitFor(() => expect(playSound).toHaveBeenCalledWith('games/invite', expect.anything()));
    playSound.mockClear();
    useAuthStore.setState({ user: { id: 'me', status: 'dnd', chosenStatus: 'dnd' } as never });
    useGameStore.getState().upsert(session({ id: 's2' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(playSound).not.toHaveBeenCalled();
  });

  it('game sounds follow their own volume and mute, through the speaker path only', async () => {
    useGameStore.setState({ volume: 50 });
    await playGameSound('win');
    expect(playSound).toHaveBeenLastCalledWith('games/win', { volume: 0.35 });
    useGameStore.setState({ muted: true });
    playSound.mockClear();
    await playGameSound('lose');
    expect(playSound).not.toHaveBeenCalled();
  });
});

describe('daily word sharing', () => {
  it('shares squares only, never the letters', () => {
    const text = shareText({
      number: 12, day: '2026-01-12', status: 'won', answer: 'apple', nextAt: 0,
      guesses: [{ word: 'crane', marks: ['absent', 'absent', 'present', 'absent', 'correct'] }, { word: 'apple', marks: ['correct', 'correct', 'correct', 'correct', 'correct'] }],
      stats: { played: 1, won: 1, currentStreak: 1, bestStreak: 1, distribution: [0, 1, 0, 0, 0, 0] },
    }, false);
    expect(text).toBe('Emix Daily Word #12 2/6\n\n⬛⬛🟨⬛🟩\n🟩🟩🟩🟩🟩');
    expect(text.toLowerCase()).not.toContain('apple');
  });
});
