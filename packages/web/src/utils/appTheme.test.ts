import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES } from '@backspace/shared/src/builtinThemes';
import { normalizeTheme, normalizeThemeSelection } from '@backspace/shared/src/theme';
import { contrastRatio, generatePalette, hexToRgb, themeVariables } from './appTheme';

const rgb = (channels: string) => channels.split(' ').map(Number) as [number, number, number];

describe('app themes', () => {
  it('ships twelve valid built-in themes with readable text', () => {
    expect(BUILTIN_THEMES).toHaveLength(12);
    for (const theme of BUILTIN_THEMES) {
      expect(normalizeTheme(theme.data), theme.id).not.toBeNull();
      const v = themeVariables(theme.data);
      expect(contrastRatio(rgb(v['--text-message']!), rgb(v['--bg-chat']!)), theme.id).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(rgb(v['--text-primary']!), rgb(v['--bg-chat']!)), theme.id).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio([255, 255, 255], rgb(v['--accent-primary']!)), theme.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('repairs unreadable text instead of rendering it', () => {
    const base = BUILTIN_THEMES[0]!.data;
    const bad = { ...base, colors: { ...base.colors, message: base.colors.chat, text: base.colors.chat } };
    const v = themeVariables(bad);
    expect(contrastRatio(rgb(v['--text-message']!), hexToRgb(base.colors.chat))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps warning and status colours out of reach of a theme', () => {
    const base = BUILTIN_THEMES[0]!.data;
    const v = themeVariables({ ...base, colors: { ...base.colors, notification: '#000000' } });
    expect(v['--text-danger']).toBe('252 165 165');
    expect(v['--status-dnd']).toBe('252 165 165');
  });

  it('rejects anything that is not structured theme data', () => {
    expect(normalizeTheme({ mode: 'dark', colors: { bg: 'url(javascript:1)' } })).toBeNull();
    expect(normalizeTheme('<style>body{}</style>')).toBeNull();
    const withExtras = normalizeTheme({ ...BUILTIN_THEMES[0]!.data, css: 'body{display:none}', background: { image: '../../etc/passwd', gradient: ['#000000'] } });
    expect(withExtras).not.toHaveProperty('css');
    expect(withExtras?.background).toBeUndefined();
    expect(normalizeThemeSelection({ kind: 'builtin', id: '"><script>' })).toBeNull();
  });

  it('builds a complete, valid palette from three colours', () => {
    for (const mode of ['dark', 'light'] as const) {
      const colors = generatePalette(mode, mode === 'dark' ? '#1e1b4b' : '#e0e7ff', '#ec4899', mode === 'dark' ? '#f8fafc' : '#111827');
      expect(normalizeTheme({ mode, colors })).not.toBeNull();
    }
  });
});
