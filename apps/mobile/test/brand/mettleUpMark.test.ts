/**
 * First MettleUp release (0.56.0): the Forged mark (branding/mettleup/BRAND.md) drawn from plain
 * paths, the M cut out in the geometry. Rendered with resvg and read back pixel by pixel, so what is
 * checked is what a phone draws: three face colours in their order, and the M showing through.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';

import { clipToConvex, HEX, M_CUT, MARK_BOX, MARK_FACES, METTLEUP_COLOURS, signedArea2 } from '@/components/brand/mettleUpMark';

const SIZE = 512;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 512 512">${MARK_FACES.map((f) => `<path d="${f.d}" fill="${f.fill}"/>`).join('')}</svg>`;
const img = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render();
const px = img.pixels;
const at = (x: number, y: number) => {
  const i = (Math.round(y) * SIZE + Math.round(x)) * 4;
  return { rgb: `#${[px[i], px[i + 1], px[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`, a: px[i + 3] };
};

describe('MettleUp mark: the Forged hex', () => {
  it('the brand colours, as BRAND.md', () => {
    expect(METTLEUP_COLOURS).toEqual({ molten: '#FF8A4C', forge: '#F0662A', slag: '#C9481A' });
  });
  it('lightest on top: Molten top faces, Forge sides, Slag bottom', () => {
    expect(at(256, 110)).toEqual({ rgb: METTLEUP_COLOURS.molten, a: 255 });
    expect(at(200, 140)).toEqual({ rgb: METTLEUP_COLOURS.molten, a: 255 });
    expect(at(410, 256)).toEqual({ rgb: METTLEUP_COLOURS.forge, a: 255 });
    expect(at(100, 256)).toEqual({ rgb: METTLEUP_COLOURS.forge, a: 255 });
    expect(at(256, 420)).toEqual({ rgb: METTLEUP_COLOURS.slag, a: 255 });
    expect(at(230, 320)).toEqual({ rgb: METTLEUP_COLOURS.slag, a: 255 }); // the gap under the V stays open
  });
  it('the M is a cut: the background shows through its stems and its V', () => {
    expect(at(184, 300).a).toBe(0); // left stem
    expect(at(328, 200).a).toBe(0); // right stem, in a top face's corner
    expect(at(256, 275).a).toBe(0); // the V, where all six faces meet
    expect(at(184, 340).a).toBe(0); // left stem foot, in a bottom face
  });
  it('outside the hex: nothing', () => {
    expect(at(60, 60).a).toBe(0);
    expect(at(450, 450).a).toBe(0);
  });
  it('covers exactly the hex minus the M (no face paints over the cut, none leaves a gap)', () => {
    let alpha = 0;
    for (let i = 3; i < px.length; i += 4) alpha += px[i];
    const expected = Math.abs(signedArea2(HEX)) / 2 - Math.abs(signedArea2(M_CUT)) / 2;
    expect(Math.abs(alpha / 255 - expected) / expected).toBeLessThan(0.005);
  });
  it('the clip keeps only what is inside the convex shape', () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;
    const part = clipToConvex([[5, 5], [15, 5], [15, 15], [5, 15]], square);
    expect(Math.abs(signedArea2(part)) / 2).toBeCloseTo(25);
  });
  it('the hex fills its box top to bottom (the old mark\'s square, same size on screen)', () => {
    const ys = HEX.map((p) => p[1]);
    expect(Math.min(...ys)).toBe(MARK_BOX.y);
    expect(Math.max(...ys)).toBe(MARK_BOX.y + MARK_BOX.size);
  });
  it('same geometry as the brand files (branding/mettleup/web/mark.svg)', () => {
    const brand = readFileSync(join(__dirname, '..', '..', '..', '..', 'branding', 'mettleup', 'web', 'mark.svg'), 'utf8');
    expect(brand).toContain('M256 52 432.67 154 432.67 358 256 460 79.33 358 79.33 154Z');
    expect(brand).toContain(`M${M_CUT.map((p) => p.join(' ')).join(' ')}Z`);
  });
});

describe('the welcome screen shows MettleUp, not the frozen FORGEAI Logo', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', '..', 'src', ...p.split('/')), 'utf8');
  it('no screen imports the old Logo any more', () => {
    expect(src('onboarding/components/WelcomeScreen.tsx')).not.toMatch(/components\/ui\/Logo/);
    expect(src('onboarding/components/WelcomeScreen.tsx')).toContain('<MettleUpLogo height={26} />');
  });
  it('the lockup is read out as MettleUp, its "UP" in Forge orange', () => {
    const logo = src('components/brand/MettleUpLogo.tsx');
    expect(logo).toContain('accessibilityLabel="MettleUp"');
    expect(logo).toContain('fill={METTLEUP_COLOURS.forge}');
  });
});
