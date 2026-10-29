// R-160: the gym's brand colour read from its logo (no AI). The rules are pure (packages/theme
// logoColour.ts); these tests feed them pixels the way the panel's 64 px canvas does.
import { describe, expect, it } from 'vitest';

import { buildBrandPalette, contrastRatio, deltaE, hexToRgb, logoColours, suggestBrandColour, suggestFromLogo } from '@forgeai/theme';

import { LOGO_WORDS, logoSuggestionLines } from '../../src/crm/brand/brandLogic';

/** RGBA bytes: `parts` is [hex or 'clear', how many pixels]. */
function pixels(parts: [string, number][]): Uint8ClampedArray {
  const n = parts.reduce((s, [, k]) => s + k, 0);
  const out = new Uint8ClampedArray(n * 4);
  let i = 0;
  for (const [hex, k] of parts) {
    const [r, g, b] = hex === 'clear' ? [255, 0, 0] : hexToRgb(hex);
    const a = hex === 'clear' ? 0 : 255;
    for (let j = 0; j < k; j += 1) {
      out.set([r, g, b, a], i);
      i += 4;
    }
  }
  return out;
}

describe('logoColours', () => {
  it('finds the red of a red logo on white paper, and ignores the paper', () => {
    const got = logoColours(pixels([['#FFFFFF', 3000], ['#D7262E', 1000]]));
    expect(got).toHaveLength(1);
    expect(deltaE(got[0].hex, '#D7262E')).toBeLessThan(2);
    expect(got[0].share).toBe(1);
  });

  it('has nothing to suggest for a logo that is only black, white and grey', () => {
    const r = suggestFromLogo(pixels([['#FFFFFF', 2000], ['#000000', 1000], ['#808080', 500], ['#1A1A1A', 300], ['#F2F2F2', 200]]));
    expect(r.colours).toEqual([]);
    expect(r.suggestion).toBeNull();
  });

  it('skips see-through pixels, whatever colour they carry', () => {
    expect(logoColours(pixels([['clear', 4000]]))).toEqual([]);
    const got = logoColours(pixels([['clear', 3000], ['#1E6FD9', 400]]));
    expect(got).toHaveLength(1);
    expect(deltaE(got[0].hex, '#1E6FD9')).toBeLessThan(2);
  });

  it('folds the soft edge of a letter into its colour instead of a colour of its own', () => {
    // A red mark with its anti-aliased rim (a few shades of almost the same red).
    const got = logoColours(pixels([['#D7262E', 800], ['#D92D35', 120], ['#D4222A', 120], ['#DB3038', 60], ['#FFFFFF', 2000]]));
    expect(got).toHaveLength(1);
  });

  it('puts the larger colour first and keeps the second one as another choice', () => {
    const got = logoColours(pixels([['#1E6FD9', 600], ['#E03A1E', 400], ['#FFFFFF', 3000]]));
    expect(got.map((c) => c.share)).toEqual([0.6, 0.4]);
    expect(deltaE(got[0].hex, '#1E6FD9')).toBeLessThan(2);
    expect(deltaE(got[1].hex, '#E03A1E')).toBeLessThan(2);
  });

  it('lets a vivid mark beat a slightly larger dull colour', () => {
    // 45 % bright red, 55 % a dull olive: the brand is the red.
    const got = logoColours(pixels([['#D7262E', 450], ['#6E6A3C', 550]]));
    expect(deltaE(got[0].hex, '#D7262E')).toBeLessThan(2);
  });

  it('drops specks under 2 % of the logo', () => {
    const got = logoColours(pixels([['#1E6FD9', 990], ['#19A97A', 10]]));
    expect(got).toHaveLength(1);
  });

  it('gives the same answer for the same pixels', () => {
    const px = pixels([['#1E6FD9', 500], ['#E03A1E', 500], ['#19A97A', 300]]);
    expect(logoColours(px)).toEqual(logoColours(px));
  });
});

describe('suggestBrandColour', () => {
  it('keeps a colour that already reads well, and says so', () => {
    const s = suggestBrandColour('#F7D411');
    expect(s.suggested).toBe('#F7D411');
    expect(s.adjusted).toBe(false);
    expect(s.darkOk).toBe(true);
    expect(s.darkRatio).toBeGreaterThanOrEqual(4.5);
    // Yellow on white is pale: said, not hidden.
    expect(s.lightOk).toBe(false);
  });

  it('lightens a dark navy until text in it reads on the dark app, keeping its hue', () => {
    const s = suggestBrandColour('#14286E');
    expect(s.adjusted).toBe(true);
    expect(s.fromLogo).toBe('#14286E');
    expect(s.darkOk).toBe(true);
    expect(s.darkRatio).toBeGreaterThanOrEqual(4.5);
    // Exactly what the member app will draw (the same engine).
    expect(s.suggested).toBe(buildBrandPalette({ accent: s.suggested }).color.accent);
    expect(s.suggested).toBe(buildBrandPalette({ accent: '#14286E' }).color.accent);
  });

  it('picks the words on the colour that read best (4.5 : 1 or better)', () => {
    for (const hex of ['#D7262E', '#1E6FD9', '#19A97A', '#F7D411', '#14286E', '#8E44AD']) {
      const s = suggestBrandColour(hex);
      expect(s.onColourRatio).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(s.onColour, s.suggested)).toBeCloseTo(s.onColourRatio, 1);
    }
  });

  it('measures a red that works both in the app and on the white card', () => {
    const s = suggestBrandColour('#E0301E');
    expect(s.darkOk).toBe(true);
    expect(s.lightRatio).toBeGreaterThanOrEqual(3);
    expect(s.lightOk).toBe(true);
  });
});

describe('the words', () => {
  const all = (s: ReturnType<typeof suggestBrandColour>) => [...Object.values(LOGO_WORDS), ...logoSuggestionLines(s).map((l) => l.text)].join(' ');

  it('say what was changed and how it reads', () => {
    const lines = logoSuggestionLines(suggestBrandColour('#14286E')).map((l) => l.text);
    expect(lines[0]).toContain('#14286E');
    expect(lines).toContain('Easy to read on the member app’s dark screens.');
  });

  it('never use the banned words', () => {
    for (const hex of ['#14286E', '#F7D411', '#E0301E']) {
      const text = all(suggestBrandColour(hex));
      expect(text).not.toMatch(/\bvolume\b|\bPRs?\b|\bsessions?\b|\bAI\b/i);
    }
  });
});
