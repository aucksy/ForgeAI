/**
 * Gym branding (D6): share pictures carry ForgeAI's mark. It is ForgeAI's own — the bar, spark,
 * dot and "AI" stay in ForgeAI's fixed colours whatever gym look the app wears (it used to mix a
 * fixed orange bar with the gym's dot and "AI").
 */
import { afterEach, describe, expect, it } from 'vitest';

import { applyBrandToTokens } from '@/theme/brandTokens';
import { color } from '@/theme/tokens';
import { FORGE_MARK, logoMark, wordmark } from '@/tracker/share/brand';

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
    const allowed = [...Object.values(FORGE_MARK), color.ink].sort();
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
});
