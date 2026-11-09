/**
 * Gym branding (D6): share pictures carry ForgeAI's mark. It is ForgeAI's own — the bar, spark,
 * dot and "AI" stay in ForgeAI's fixed colours whatever gym look the app wears (it used to mix a
 * fixed orange bar with the gym's dot and "AI").
 */
import { afterEach, describe, expect, it } from 'vitest';

import { Resvg } from '@resvg/resvg-js';

import { WORDMARK_BOX, WORDMARK_FORGE_STOPS, WORDMARK_METTLE_D, WORDMARK_STEEL_STOPS, WORDMARK_UP_D } from '@/components/brand/mettleUpMark';
import { applyBrandToTokens } from '@/theme/brandTokens';
import { color } from '@/theme/tokens';
import { FORGE_MARK, logoMark, MIN_CAP, wordmark } from '@/tracker/share/brand';
import { CLEAR_BACKGROUND, sceneToSvg } from '@/tracker/share/scene';

const RAMS = { accent: '#F7D411', bg: '#0A0A0C', logoUrl: null, heading: 'bold-italic' as const, updatedAt: null };

const fills = (nodes: { fill?: string }[]) => [...new Set(nodes.map((n) => n.fill).filter(Boolean))].sort();

describe("share pictures: ForgeAI's mark", () => {
  afterEach(() => {
    applyBrandToTokens(null);
  });

  it("is drawn in ForgeAI's fixed colours, the same in a gym's look as in ForgeAI's", () => {
    applyBrandToTokens(null);
    const forge = wordmark(0, 0, 40).nodes;
    applyBrandToTokens(RAMS);
    expect(color.accent).toBe('#F7D411');
    const inGym = wordmark(0, 0, 40).nodes;
    expect(inGym).toEqual(forge);
    const allowed = [...Object.values(FORGE_MARK)].sort();
    for (const f of fills(inGym as { fill?: string }[])) expect(allowed).toContain(f);
    expect(fills(logoMark(0, 0, 40) as { fill?: string }[])).toEqual([...Object.values(FORGE_MARK)].sort());
  });

  it('0.56.0: the mark is the Forged hex (six faces, the M cut out), placed in its square', () => {
    const mark = logoMark(100, 50, 56);
    expect(mark).toHaveLength(6);
    for (const n of mark) {
      expect(n.t).toBe('path');
      const p = n as { x: number; y: number; scale: number };
      // The box's corners on the 512 grid, (52, 52) and (460, 460), land on (100, 50) and (156, 106).
      expect(p.x + 52 * p.scale).toBeCloseTo(100);
      expect(p.y + 460 * p.scale).toBeCloseTo(106);
    }
    expect(FORGE_MARK).toEqual({ molten: '#FF8A4C', forge: '#F0662A', slag: '#C9481A' });
  });

  it('R-259: the name is the steel letters as paths (no font), with the splash shine, centred on the mark', () => {
    const { nodes, width } = wordmark(100, 50, 56);
    expect(nodes.some((n) => n.t === 'text')).toBe(false);
    type Name = { fill?: string; shine?: { y1: number; y2: number; stops: unknown }; x: number; y: number; scale: number };
    const mettle = nodes.find((n) => n.t === 'path' && n.d === WORDMARK_METTLE_D) as Name;
    const up = nodes.find((n) => n.t === 'path' && n.d === WORDMARK_UP_D) as Name;
    // Owner, 9 Nov 2026: never flat. The shine runs from the cap line to the baseline.
    expect(mettle.fill).toBeUndefined();
    expect(up.fill).toBeUndefined();
    expect(mettle.shine).toEqual({ y1: 0, y2: 100, stops: WORDMARK_STEEL_STOPS });
    expect(up.shine).toEqual({ y1: 0, y2: 100, stops: WORDMARK_FORGE_STOPS });
    // Cap height 0.44 x the mark (as the app's lockup), its middle on the mark's middle (y 78).
    const cap = WORDMARK_BOX.h * mettle.scale;
    expect(cap).toBeCloseTo(56 * 0.44);
    expect(mettle.y + cap / 2).toBeCloseTo(78);
    expect(up).toMatchObject({ x: mettle.x, y: mettle.y, scale: mettle.scale });
    expect(mettle.x + WORDMARK_BOX.w * mettle.scale).toBeCloseTo(100 + width);
  });

  it('9 Nov 2026: drawn, the name shines like the splash (light top, dark middle band), see-through too', () => {
    // Mark 100 px, cap 100 px: the name's grid is 1:1 in pixels, starting at x 132 (mark + 0.32 gap).
    const { nodes, width } = wordmark(0, 0, 100, 100);
    const w = Math.ceil(width);
    const svg = sceneToSvg({ width: w, height: 100, background: CLEAR_BACKGROUND, nodes });
    const px = new Resvg(svg, { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: false } }).render().pixels;
    const at = (x: number, y: number) => [px[(y * w + x) * 4], px[(y * w + x) * 4 + 1], px[(y * w + x) * 4 + 2], px[(y * w + x) * 4 + 3]];
    const mStem = 132 + 12; // the M's left stem (grid x 0..25)
    const top = at(mStem, 4);
    const band = at(mStem, 50);
    expect(top[3]).toBe(255);
    expect(top[0]).toBeGreaterThan(230); // near white at the cap line
    expect(band[0]).toBeLessThan(140); // the dark horizon in the middle
    expect(Math.abs(band[0] - band[2])).toBeLessThan(30); // grey steel, not tinted
    const pStem = 132 + 610; // the P's stem (grid x 599..624)
    const upTop = at(pStem, 4);
    const upBand = at(pStem, 50);
    expect(upTop[0]).toBeGreaterThan(upTop[2] + 60); // orange metal
    expect(upBand[1]).toBeLessThan(upTop[1] - 60); // with its own dark band
  });

  it('BRAND.md: the name is never drawn under a 20 px cap height', () => {
    const small = wordmark(0, 0, 20).nodes.find((n) => n.t === 'path' && n.d === WORDMARK_METTLE_D) as { scale: number };
    expect(WORDMARK_BOX.h * small.scale).toBeCloseTo(MIN_CAP);
    expect(MIN_CAP).toBe(20);
  });
});
