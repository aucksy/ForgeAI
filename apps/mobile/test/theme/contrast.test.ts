import { describe, expect, it } from 'vitest';

import { color, gradients } from '@/theme/tokens';

/**
 * SH-19 / LW-14: every colour the app uses for TEXT must reach WCAG AA (4.5:1) against
 * every plane text sits on. Measured in a gym, on a bench, under bright lights — so the
 * hint numbers in a set row (what a tick will save) count as text, not as "disabled".
 */

type Rgb = [number, number, number];

function parse(c: string): { rgb: Rgb; a: number } {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(c);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] == null ? 1 : Number(m[4]) };
  const h = c.replace('#', '');
  return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb, a: 1 };
}

/** A see-through colour laid over an opaque one, as the screen shows it. */
function over(top: string, base: string): Rgb {
  const t = parse(top);
  const b = parse(base).rgb;
  return t.rgb.map((v, i) => Math.round(v * t.a + b[i] * (1 - t.a))) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Every plane text sits on: page, cards, sheets, input wells, glass, the light top of a hero card. */
const planes: Record<string, Rgb> = {
  bg: parse(color.bg).rgb,
  surface: parse(color.surface).rgb,
  surfaceRaised: parse(color.surfaceRaised).rgb,
  surfaceSunken: parse(color.surfaceSunken).rgb,
  glassOnBg: over(color.glass, color.bg),
  heroTop: parse(gradients.steel[0]).rgb,
};

/**
 * Text colours. `inkFaint` is here on purpose: it is the placeholder colour of every input,
 * including the set-row hints. Only `inkDisabled` is left out — WCAG 1.4.3 exempts inactive
 * controls, and it is never to be used for information (see docs/DESIGN-LANGUAGE.md).
 */
const textTokens = {
  ink: color.ink,
  inkSecondary: color.inkSecondary,
  inkMuted: color.inkMuted,
  inkFaint: color.inkFaint,
  accent: color.accent,
  accentBright: color.accentBright,
  goodText: color.goodText,
  criticalText: color.criticalText,
  warning: color.warning,
} as const;

describe('text contrast (WCAG AA 4.5:1)', () => {
  for (const [name, fg] of Object.entries(textTokens)) {
    for (const [plane, bg] of Object.entries(planes)) {
      it(`${name} on ${plane}`, () => {
        expect(contrast(parse(fg).rgb, bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('accent text on an accent-tinted chip still passes', () => {
    for (const base of [color.surface, color.surfaceRaised]) {
      const chip = over(color.accentSoft, base);
      expect(contrast(parse(color.accent).rgb, chip)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parse(color.ink).rgb, chip)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the grey ladder still reads as a ladder (ink > secondary > muted > faint)', () => {
    const l = (c: string) => luminance(parse(c).rgb);
    expect(l(color.ink)).toBeGreaterThan(l(color.inkSecondary));
    expect(l(color.inkSecondary)).toBeGreaterThan(l(color.inkMuted));
    expect(l(color.inkMuted)).toBeGreaterThan(l(color.inkFaint));
    expect(l(color.inkFaint)).toBeGreaterThan(l(color.inkDisabled));
  });

  it('disabled ink is dim but still visible (>= 3:1 on the page and on cards)', () => {
    for (const plane of ['bg', 'surface', 'surfaceSunken'] as const) {
      expect(contrast(parse(color.inkDisabled).rgb, planes[plane])).toBeGreaterThanOrEqual(3);
    }
  });
});
