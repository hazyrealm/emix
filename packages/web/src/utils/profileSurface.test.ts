import { describe, it, expect } from 'vitest';
import {
  PROFILE_BACKGROUND_DARKNESS_DEFAULT,
  normalizeProfileStyle,
  profileGlassOn,
} from '@backspace/shared/src/profileStyle';
import { profileSurfaceClass } from '../components/ui/profile/ProfileVisuals';

describe('profile background darkness', () => {
  it('keeps 0 to 100, clamps outside it, and drops it with no background', () => {
    expect(normalizeProfileStyle({ background: { preset: 'ocean', darkness: 0 } })?.background?.darkness).toBe(0);
    expect(normalizeProfileStyle({ background: { image: 'a.png', darkness: 140 } })?.background?.darkness).toBe(100);
    expect(normalizeProfileStyle({ background: { colors: ['#000000', '#ffffff'], darkness: -5 } })?.background?.darkness).toBe(0);
    expect(normalizeProfileStyle({ background: { darkness: 40 } })).toBeNull();
  });

  it('defaults low so an uploaded picture stays vivid', () => {
    expect(PROFILE_BACKGROUND_DARKNESS_DEFAULT).toBeLessThanOrEqual(20);
  });
});

describe('glass panel', () => {
  it('is on by default with a background, and the owner can turn it off', () => {
    expect(profileGlassOn(normalizeProfileStyle({ background: { preset: 'ocean' } }))).toBe(true);
    expect(profileGlassOn(normalizeProfileStyle({ background: { preset: 'ocean' }, glass: false }))).toBe(false);
    expect(profileGlassOn(normalizeProfileStyle({ glass: true }))).toBe(true);
    expect(profileGlassOn(null)).toBe(false);
  });
});

describe('profile card surface', () => {
  it("uses the owner's own surface (no theme glass layer) only when they have a background", () => {
    expect(profileSurfaceClass(normalizeProfileStyle({ background: { image: 'a.png' } }))).toContain('emx-surface-own');
    expect(profileSurfaceClass(normalizeProfileStyle({ nameplate: 'galaxy' }))).not.toContain('emx-surface-own');
    expect(profileSurfaceClass(null)).not.toContain('emx-surface-own');
  });
});
