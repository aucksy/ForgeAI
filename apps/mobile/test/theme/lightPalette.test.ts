/**
 * Light mode (owner, 9 Nov 2026: "it should be system default … carefully design it and test it").
 *  - the light chart slots: same hues and order as the dark ones, each a mark on a white card,
 *    and colour-blind pairs still apart (the dark slots' own rule: adjacent pairs >= 12 apart under
 *    deuteranopia and protanopia);
 *  - the light ramp climbs from the card to the deepest ember;
 *  - switching looks rewrites the live tokens and keeps the gym's colours on top; share pictures
 *    and widgets (darkColor) stay dark;
 *  - a gym's colour on the light look is darkened until it reads (4.5:1) on every light plane;
 *  - the member's choice: "Same as phone" by default, and what it resolves to.
 */
import { describe, expect, it } from 'vitest';

import { contrastRatio, deltaE, hexToOklch, over, type GymBrand } from '@forgeai/theme';

import { applyBrandToTokens, lightBrandPalette, setTokenScheme, tokenScheme } from '@/theme/brandTokens';
import { cleanLookChoice, LOOK_WORDS, resolveScheme } from '@/theme/lookChoice';
import { chart, color, darkChart, darkColor, gradients, LIGHT, shadow } from '@/theme/tokens';
import { mapLevels, MAP_BODY, MAP_BODY_LIGHT, regionFill } from '@/tracker/lib/bodyMapColors';

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const unlin = (v: number) => {
  const c = Math.max(0, Math.min(1, v));
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};
/** Machado et al. 2009, severity 1 (linear RGB). */
const CVD = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
} as const;
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const simulate = (h: string, m: readonly (readonly number[])[]) => {
  const l = hex(h).map(lin);
  return toHex(m.map((row) => unlin(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])));
};

describe('light chart palette', () => {
  const series = LIGHT.chart.series;

  it('every slot is a mark on a white card and on a light well (>= 3:1)', () => {
    for (const s of series) {
      expect(contrastRatio(s, LIGHT.color.surface), s).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(s, LIGHT.color.surfaceRaised), s).toBeGreaterThanOrEqual(3);
    }
  });

  it('same hues in the same order as the dark slots (the order is the colour-blind safety)', () => {
    chart.series.forEach((d, i) => {
      const diff = Math.abs(((hexToOklch(d).h - hexToOklch(series[i]).h + 540) % 360) - 180);
      expect(diff, `slot ${i}`).toBeLessThan(15);
    });
  });

  it('adjacent slots stay apart for colour-blind eyes (>= 12, as the dark slots)', () => {
    for (const m of Object.values(CVD)) {
      for (let i = 0; i < series.length - 1; i += 1) {
        expect(deltaE(simulate(series[i], m), simulate(series[i + 1], m))).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('the ramp darkens step by step from near the card to the deepest ember', () => {
    const L = LIGHT.chart.ramp.map((c) => hexToOklch(c).L);
    for (let i = 1; i < L.length; i += 1) expect(L[i]).toBeLessThan(L[i - 1]);
    expect(contrastRatio(LIGHT.chart.ramp[5], LIGHT.color.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('switching looks', () => {
  it('writes the light look into the live tokens and back, objects kept', () => {
    const series = chart.series;
    const ember = gradients.ember;
    const offset = shadow.card.shadowOffset;
    expect(tokenScheme()).toBe('dark');
    const darkBg = color.bg;
    expect(setTokenScheme('light')).toBe(true);
    expect(color.bg).toBe(LIGHT.color.bg);
    expect(color.accent).toBe(LIGHT.color.accent);
    expect(color.onAccent).toBe('#FFFFFF');
    expect([...chart.series]).toEqual([...LIGHT.chart.series]);
    expect(shadow.card.shadowOpacity).toBe(LIGHT.shadow.card.shadowOpacity);
    expect(shadow.card.shadowOffset).toBe(offset);
    expect(chart.series).toBe(series);
    expect(gradients.ember).toBe(ember);
    // Share pictures and widgets keep the dark look.
    expect(darkColor.bg).toBe(darkBg);
    expect(setTokenScheme('light')).toBe(false);
    expect(setTokenScheme('dark')).toBe(true);
    expect(color.bg).toBe(darkBg);
    expect(shadow.card.shadowOffset.height).toBe(8);
  });

  it("keeps the gym's colours on top, on both looks, and the dark copies dark", () => {
    const ram: GymBrand = { accent: '#F7D411', bg: '#101010', logoUrl: null, heading: 'bold-italic', updatedAt: null };
    applyBrandToTokens(ram);
    const darkAccent = color.accent;
    expect(darkColor.accent).toBe(darkAccent);
    setTokenScheme('light');
    expect(color.bg).toBe(LIGHT.color.bg);
    expect(color.accent).not.toBe(darkAccent);
    expect(hexToOklch(color.accent).h).toBeCloseTo(hexToOklch('#F7D411').h, -1);
    expect(darkColor.accent).toBe(darkAccent);
    expect(darkColor.bg).not.toBe(LIGHT.color.bg);
    expect(darkChart.series[0]).not.toBe(chart.series[0]);
    applyBrandToTokens(null);
    expect(color.accent).toBe(LIGHT.color.accent);
    setTokenScheme('dark');
    expect(color.accent).toBe('#FF7A3B');
  });

  it("MettleUp's own ember (a logo-only gym) keeps the hand-tuned light look", () => {
    setTokenScheme('light');
    applyBrandToTokens({ accent: '#FF7A3B', bg: null, logoUrl: null, heading: 'normal', updatedAt: null });
    expect(color.accent).toBe(LIGHT.color.accent);
    applyBrandToTokens(null);
    setTokenScheme('dark');
  });

  it('the body map: a pale figure on the light look, the share picture still dark', () => {
    setTokenScheme('light');
    expect(regionFill('body', new Map())).toBe(MAP_BODY_LIGHT);
    expect(regionFill('body', new Map(), undefined, true)).toBe(MAP_BODY);
    expect(mapLevels(true)[4]).toBe(darkChart.ramp[5]);
    expect(mapLevels()[4]).toBe(LIGHT.chart.ramp[5]);
    setTokenScheme('dark');
  });
});

describe("a gym's colour on the light look", () => {
  const planes = [LIGHT.color.bg, LIGHT.color.surface, LIGHT.color.surfaceRaised, LIGHT.color.surfaceSunken, over(LIGHT.color.glass, LIGHT.color.bg)];
  for (const accent of ['#F7D411', '#00E5FF', '#7CFC00', '#FFFFFF', '#FF69B4', '#1E3A8A', '#000000', '#E10600']) {
    it(`${accent}: text in it reads on every light plane and on its own tint; words on it read`, () => {
      const p = lightBrandPalette({ accent });
      for (const plane of planes) {
        expect(contrastRatio(p.color.accent, plane)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(p.color.accentBright, plane)).toBeGreaterThanOrEqual(4.5);
      }
      for (const plane of [LIGHT.color.bg, LIGHT.color.surface, LIGHT.color.surfaceRaised]) {
        expect(contrastRatio(p.color.accent, over(p.color.accentSoft, plane))).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(p.color.onAccent, p.color.accent)).toBeGreaterThanOrEqual(4.5);
      // The big button keeps a gradient its frozen dark ink reads on.
      for (const stop of p.gradients.ember) expect(contrastRatio('#1F0D05', stop)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.chart.series[0], LIGHT.color.surface)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('the member’s choice', () => {
  it('"Same as phone" by default; anything damaged is too', () => {
    expect(cleanLookChoice(null)).toBe('system');
    expect(cleanLookChoice('purple')).toBe('system');
    expect(cleanLookChoice('light')).toBe('light');
    expect(cleanLookChoice('dark')).toBe('dark');
  });

  it('follows the phone, or the member’s pick', () => {
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    // A phone that cannot say keeps the dark look the app always had.
    expect(resolveScheme('system', null)).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('plain words', () => {
    expect(LOOK_WORDS).toEqual({ system: 'Same as phone', light: 'Light', dark: 'Dark' });
  });
});
