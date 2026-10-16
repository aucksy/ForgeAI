/**
 * Dark | light switch (16 Oct 2026). Every text colour must be readable in BOTH palettes: at least
 * 4.5:1 on the page, on a card and in a sunken field (the WCAG body-text floor).
 */
import { contrastRatio } from '@forgeai/theme';
import { describe, expect, it } from 'vitest';

import { color, darkColor, lightColor } from '../../src/theme';

const TEXT = ['ink', 'inkSecondary', 'inkMuted', 'accentBright', 'warning', 'goodText', 'criticalText'] as const;
const PLANES = ['bg', 'surface', 'surfaceRaised', 'surfaceSunken'] as const;

describe('dark and light palettes', () => {
  for (const [name, p] of [['dark', darkColor], ['light', lightColor]] as const) {
    it(`${name}: every text colour is 4.5:1 or more on every plane`, () => {
      const low: string[] = [];
      for (const t of TEXT) for (const b of PLANES) {
        const r = contrastRatio(p[t], p[b]);
        if (r < 4.5) low.push(`${t} on ${b}: ${r.toFixed(2)}`);
      }
      expect(low).toEqual([]);
    });
  }

  it('both palettes name the same colours, and screens read them as CSS variables', () => {
    expect(Object.keys(lightColor).sort()).toEqual(Object.keys(darkColor).sort());
    expect(color.ink).toBe('var(--c-ink)');
  });
});
