/**
 * Gym branding (Level 1): the palette engine (packages/theme/src/brand.ts) — one brand colour
 * (+ optional background tone) → the phone's whole colour set, every pair readable (WCAG), any
 * nudge reported. The owner's panel previews with the same function.
 */
import { describe, expect, it } from 'vitest';

import {
  BUTTON_INK,
  FORGE_PLANES,
  FORGE_SERIES,
  PHONE_INK,
  brandReport,
  buildBrandPalette,
  contrastRatio,
  hexToOklch,
  isBranded,
  normalizeHex,
  over,
  parseGymBrand,
  sameBrand,
} from '@forgeai/theme';

const RAMS = { accent: '#F7D411', bg: '#0A0A0C' };

function textPlanes(p: ReturnType<typeof buildBrandPalette>): string[] {
  return [p.color.bg, p.color.surface, p.color.surfaceRaised, p.color.surfaceSunken, over(p.color.glass, p.color.bg), p.gradients.steel[0]];
}

describe('palette engine — RAM\'S FITNESS CLUB IMPACT (first client)', () => {
  const p = buildBrandPalette(RAMS);

  it('keeps their yellow and their page colour exactly, with no nudge', () => {
    expect(p.color.accent).toBe('#F7D411');
    expect(p.color.bg).toBe('#0A0A0C');
    expect(p.nudges.filter((n) => n.what !== 'chart')).toEqual([]);
    expect(p.ok).toBe(true);
  });

  it('puts BLACK text on the yellow', () => {
    expect(p.color.onAccent).toBe('#0A0A0A');
    expect(contrastRatio(p.color.onAccent, p.color.accent)).toBeGreaterThan(12);
  });

  it('cards and lines land next to their own (#141417 cards, #26262C lines)', () => {
    // Derived from the page tone with ForgeAI's steps: within a hair of their brand sheet.
    const near = (a: string, b: string) => Math.abs(hexToOklch(a).L - hexToOklch(b).L);
    expect(near(p.color.surface, '#141417')).toBeLessThan(0.02);
    expect(near(p.color.grid, '#26262C')).toBeLessThan(0.03);
    // Planes stay in their order: page < well < card < sheet.
    const L = (h: string) => hexToOklch(h).L;
    expect(L(p.color.bg)).toBeLessThan(L(p.color.surfaceSunken));
    expect(L(p.color.surfaceSunken)).toBeLessThan(L(p.color.surface));
    expect(L(p.color.surface)).toBeLessThan(L(p.color.surfaceRaised));
  });

  it('charts: slot 0 is a yellow mark; the yellow slot it would be confused with gives way to ember', () => {
    expect(hexToOklch(p.chart.series[0]).h).toBeCloseTo(hexToOklch('#F7D411').h, -1);
    expect(contrastRatio(p.chart.series[0], p.color.surface)).toBeGreaterThanOrEqual(3);
    expect(p.chart.series.slice(1)).toEqual(['#3987E5', '#19A97A', '#9085E9', '#E8641F']);
    expect(p.nudges.map((n) => n.what)).toEqual(['chart']);
    // The ramp climbs in lightness (magnitude reads as brightness).
    const Ls = p.chart.ramp.map((h) => hexToOklch(h).L);
    for (let i = 1; i < Ls.length; i += 1) expect(Ls[i]).toBeGreaterThan(Ls[i - 1]);
  });
});

describe('palette engine — readability rules', () => {
  const cases: [string, string | null][] = [
    ['#F7D411', '#0A0A0C'],
    ['#B71C1C', null], // dark red
    ['#0D47A1', '#101828'], // navy on navy
    ['#2E7D32', '#3A3A3A'], // green on a grey that is too light
    ['#000000', '#000000'],
    ['#FFFFFF', '#FFFFFF'],
    ['#7B1FA2', null],
    ['#FF7A3B', null],
  ];

  it.each(cases)('%s on %s: every pair passes', (accent, bg) => {
    const p = buildBrandPalette({ accent, bg });
    expect(p.checks.filter((c) => !c.pass)).toEqual([]);
    expect(p.ok).toBe(true);
    for (const plane of textPlanes(p)) {
      expect(contrastRatio(p.color.accent, plane)).toBeGreaterThanOrEqual(4.5);
      for (const ink of Object.values(PHONE_INK)) expect(contrastRatio(ink, plane)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(p.color.onAccent, p.color.accent)).toBeGreaterThanOrEqual(4.5);
    for (const stop of p.gradients.ember) expect(contrastRatio(BUTTON_INK, stop)).toBeGreaterThanOrEqual(4.5);
  });

  it('a dark red is lightened (hue kept) and the nudge is reported in plain words', () => {
    const p = buildBrandPalette({ accent: '#B71C1C' });
    expect(p.color.accent).not.toBe('#B71C1C');
    const n = p.nudges.find((x) => x.what === 'accent');
    expect(n).toMatchObject({ from: '#B71C1C', to: p.color.accent });
    expect(n?.words).toMatch(/lightened/);
    expect(Math.abs(hexToOklch(p.color.accent).h - hexToOklch('#B71C1C').h)).toBeLessThan(6);
    expect(hexToOklch(p.color.accent).L).toBeGreaterThan(hexToOklch('#B71C1C').L);
  });

  it('a background too light for grey text is darkened, and says so', () => {
    const p = buildBrandPalette({ accent: '#2E7D32', bg: '#3A3A3A' });
    expect(p.nudges.find((n) => n.what === 'background')?.words).toMatch(/darkened/);
    expect(hexToOklch(p.color.bg).L).toBeLessThan(hexToOklch('#3A3A3A').L);
  });

  it('without a tone, the planes are ForgeAI\'s own', () => {
    const p = buildBrandPalette({ accent: '#7B1FA2' });
    expect([p.color.bg, p.color.surface, p.color.surfaceRaised, p.color.surfaceSunken]).toEqual([
      FORGE_PLANES.bg,
      FORGE_PLANES.surface,
      FORGE_PLANES.surfaceRaised,
      FORGE_PLANES.surfaceSunken,
    ]);
  });

  it("ForgeAI's own page tone gives back ForgeAI's planes (the steps are ForgeAI's)", () => {
    const p = buildBrandPalette({ accent: '#FF7A3B', bg: FORGE_PLANES.bg });
    const close = (a: string, b: string) => Math.abs(hexToOklch(a).L - hexToOklch(b).L) < 0.006;
    expect(close(p.color.surface, FORGE_PLANES.surface)).toBe(true);
    expect(close(p.color.surfaceRaised, FORGE_PLANES.surfaceRaised)).toBe(true);
    expect(close(p.color.grid, FORGE_PLANES.grid)).toBe(true);
    expect(p.chart.series).toEqual(['#FF7A3B', ...FORGE_SERIES.slice(1)]);
  });

  it('is deterministic', () => {
    expect(buildBrandPalette(RAMS)).toEqual(buildBrandPalette({ accent: 'f7d411', bg: '#0a0a0c' }));
  });

  it('refuses a non-colour (callers check with normalizeHex first)', () => {
    expect(() => buildBrandPalette({ accent: 'yellow' })).toThrow();
    expect(() => buildBrandPalette({ accent: '#F7D411', bg: 'nope' })).toThrow();
    expect(normalizeHex('fd1')).toBe('#FFDD11');
    expect(normalizeHex(' #f7d411 ')).toBe('#F7D411');
    expect(normalizeHex('#F7D41')).toBeNull();
  });

  it('writes the readability report the panel shows', () => {
    const lines = brandReport(buildBrandPalette({ accent: '#B71C1C' }));
    expect(lines[0]).toMatch(/was lightened/);
    expect(lines.join(' ')).toMatch(/Words on your colour are black/);
    expect(lines[lines.length - 1]).toBe('Every text and button passes the readability check.');
  });
});

describe('the brand record (member_join / member_me / owner_gym)', () => {
  it('reads the server object; an empty one is no brand', () => {
    expect(parseGymBrand({ accent: '#f7d411', bg: '#0A0A0C', logoUrl: 'https://x.supabase.co/storage/v1/object/public/gym-logos/a/b.png', heading: 'bold-italic', updatedAt: '2026-10-13T10:00:00Z' })).toEqual({
      accent: '#F7D411',
      bg: '#0A0A0C',
      logoUrl: 'https://x.supabase.co/storage/v1/object/public/gym-logos/a/b.png',
      heading: 'bold-italic',
      updatedAt: '2026-10-13T10:00:00Z',
    });
    expect(parseGymBrand({ accent: null, bg: null, logoUrl: null, heading: 'normal', updatedAt: null })).toBeNull();
    expect(parseGymBrand(null)).toBeNull();
    expect(parseGymBrand({ accent: 'red', logoUrl: 'http://insecure/x.png', heading: 'wild' })).toBeNull();
  });

  it('a gym is branded by a colour or a logo; same-brand ignores the save time', () => {
    const b = parseGymBrand({ accent: '#F7D411', heading: 'normal', updatedAt: 'a' });
    expect(isBranded(b)).toBe(true);
    expect(isBranded(parseGymBrand({ logoUrl: 'https://h.co/l.png' }))).toBe(true);
    expect(isBranded(parseGymBrand({ heading: 'bold-italic' }))).toBe(false);
    expect(isBranded(null)).toBe(false);
    expect(sameBrand(b, b && { ...b, updatedAt: 'b' })).toBe(true);
    expect(sameBrand(b, null)).toBe(false);
    expect(sameBrand(null, null)).toBe(true);
  });
});
