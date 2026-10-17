import { describe, expect, it } from 'vitest';
import { NEUTRAL_EFFECTS, effectsActive, effectsColorFilter, normalizeEffects, softFocusLayer } from './cameraEffectsStore';

describe('camera effects', () => {
  it('runs no processor while everything is neutral', () => {
    expect(effectsActive(NEUTRAL_EFFECTS)).toBe(false);
    expect(effectsColorFilter(NEUTRAL_EFFECTS)).toBe('none');
  });

  it('treats the outgoing mirror as an effect, but not the self-view mirror', () => {
    expect(effectsActive({ ...NEUTRAL_EFFECTS, mirrorOutgoing: true })).toBe(true);
  });

  it('scales soft focus with the frame, so 4K is softened as much as 360p', () => {
    const small = softFocusLayer(10, 640)!;
    const large = softFocusLayer(10, 3840)!;
    expect(large.radius / small.radius).toBeCloseTo(6);
    expect(large.alpha).toBe(small.alpha);
    expect(softFocusLayer(0, 1920)).toBeNull();
  });

  it('keeps soft focus out of the colour filter (it is drawn as its own layer)', () => {
    expect(effectsColorFilter({ ...NEUTRAL_EFFECTS, softFocus: 8 })).toBe('none');
  });

  it('defaults the outgoing mirror to off for stored settings from older builds', () => {
    expect(normalizeEffects({ brightness: 120 } as never).mirrorOutgoing).toBe(false);
  });
});
