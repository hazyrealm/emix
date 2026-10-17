import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sharedBy: vi.fn(),
  audio: vi.fn(),
  playSound: vi.fn(async () => ({ stop: () => {} })),
  cacheSound: vi.fn(async () => true),
}));

vi.mock('../api/client', () => ({ api: { ringtones: { sharedBy: mocks.sharedBy, audio: mocks.audio } } }));
vi.mock('../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => ({ playSound: mocks.playSound, cacheSound: mocks.cacheSound, resumeContext: async () => {} }) },
}));
vi.mock('../stores/spaceStore', () => ({
  useSpaceStore: { getState: () => ({ dmChannels: [
    { id: 'dm-bob', members: [{ id: 'me' }, { id: 'bob' }] },
    { id: 'group', members: [{ id: 'me' }, { id: 'bob' }, { id: 'janice' }] },
  ] }) },
}));
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'me' } }) } }));

import { DEFAULT_RINGTONE_SETTINGS } from '@backspace/shared/src/ringtones';
import { useRingtoneStore } from '../stores/ringtoneStore';
import { incomingRingtoneFor, outgoingRingtoneFor, playRingtone } from './ringtonePlayback';

function settings(patch: Partial<typeof DEFAULT_RINGTONE_SETTINGS>) {
  useRingtoneStore.setState({ settings: { ...DEFAULT_RINGTONE_SETTINGS, friends: {}, ...patch } });
}

beforeEach(() => {
  vi.clearAllMocks();
  settings({});
});

describe('who hears what', () => {
  it('rings the per-friend sound when that friend calls, else my incoming ringtone', () => {
    settings({ incoming: { kind: 'builtin', id: 'pulse' }, friends: { janice: { incoming: { kind: 'builtin', id: 'bells' } } } });
    expect(incomingRingtoneFor('janice')).toEqual({ kind: 'builtin', id: 'bells' });
    expect(incomingRingtoneFor('bob')).toEqual({ kind: 'builtin', id: 'pulse' });
  });

  it("plays the callee's shared ringtone when I chose theirs, and mine when they share none", async () => {
    settings({ callerPlays: 'theirs', outgoing: { kind: 'builtin', id: 'retro' } });
    mocks.sharedBy.mockResolvedValueOnce({ ringtone: { kind: 'custom', id: '42', name: 'Hero' } });
    expect(await outgoingRingtoneFor('dm-bob')).toEqual({ kind: 'custom', id: '42' });
    mocks.sharedBy.mockResolvedValueOnce({ ringtone: null });
    expect(await outgoingRingtoneFor('dm-bob')).toEqual({ kind: 'builtin', id: 'retro' });
  });

  it('asks nobody in a group call and honours per-friend and "none" choices', async () => {
    settings({ callerPlays: 'theirs', outgoing: { kind: 'default' }, friends: { bob: { callerPlays: 'none' } } });
    expect(await outgoingRingtoneFor('dm-bob')).toEqual({ kind: 'silent' });
    expect(await outgoingRingtoneFor('group')).toEqual({ kind: 'default' });
    expect(mocks.sharedBy).not.toHaveBeenCalled();
  });

  it('plays locally through the sound cache, and falls back to the default when an upload is gone', async () => {
    await playRingtone({ kind: 'builtin', id: 'aurora' }, 'incoming', 50);
    expect(mocks.playSound).toHaveBeenLastCalledWith('ringtones/aurora', { loop: true, volume: 0.5 });
    mocks.cacheSound.mockResolvedValueOnce(false);
    await playRingtone({ kind: 'custom', id: '7' }, 'outgoing', 100);
    expect(mocks.playSound).toHaveBeenLastCalledWith('call_calling', { loop: true, volume: 1 });
    expect(await playRingtone({ kind: 'silent' }, 'incoming', 100)).toBeNull();
  });
});
