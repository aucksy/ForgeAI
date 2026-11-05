// T74 (R-356): the gym's home-screen shortcut icon rules (packages/theme shortcutIcon.ts), the
// owner panel's preview. The SAME cases and numbers are in the phone's Kotlin twin
// (apps/mobile/modules/forge-phone/android/src/test/.../ShortcutArtTest.kt), so the preview shows
// what the phone draws.
import { describe, expect, it } from 'vitest';

import { contentRadius, ICON_NEUTRAL_DARK, planShortcutIcon, readIconEdge } from '@forgeai/theme';

import { shortcutPreviewBox } from '../../src/crm/brand/brandLogic';

type Px = [number, number, number, number];
const WHITE: Px = [255, 255, 255, 255];
const BLACK: Px = [0, 0, 0, 255];
const CLEAR: Px = [0, 0, 0, 0];

function img(w: number, h: number, at: (x: number, y: number) => Px): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) out.set(at(x, y), (y * w + x) * 4);
  return out;
}

const disc = (x: number, y: number, cx: number, cy: number, r: number) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;

/** The owner's case: a round black badge on a white square. */
const badge = img(128, 128, (x, y) => (disc(x, y, 64, 64, 56) ? BLACK : WHITE));

describe('shortcut icon (T74, R-356)', () => {
  it('a badge on a white square fills the icon with white and fits the badge in the safe circle', () => {
    const p = planShortcutIcon(badge, 128, 128, ['#101010']);
    expect(p.edge).toBe('solid');
    expect(p.bg).toBe('#FFFFFF');
    const reach = contentRadius(badge, 128, 128, [255, 255, 255])!;
    expect((reach * p.width) / 128).toBeCloseTo(32, 2);
    expect(p.width).toBeGreaterThanOrEqual(70);
    expect(p.width).toBeLessThanOrEqual(74);
    expect(p.height).toBeCloseTo(p.width, 3);
    expect(p.left).toBeCloseTo((108 - p.width) / 2, 3);
  });

  it('a see-through logo takes the first gym colour it stands out on', () => {
    const logo = img(128, 128, (x, y) => (disc(x, y, 64, 64, 40) ? [0xf0, 0x70, 0x20, 255] : CLEAR));
    const p = planShortcutIcon(logo, 128, 128, ['#F7D411', '#0A0A0C']);
    expect(p.edge).toBe('clear');
    expect(p.bg).toBe('#0A0A0C');
    expect(Math.abs((40.5 * p.width) / 128 - 32)).toBeLessThan(0.6);
  });

  it('a black see-through logo with no gym colours goes on white, not the neutral dark', () => {
    const logo = img(100, 100, (x, y) => (disc(x, y, 50, 50, 30) ? BLACK : CLEAR));
    const p = planShortcutIcon(logo, 100, 100);
    expect(p.edge).toBe('clear');
    expect(p.bg).toBe('#FFFFFF');
  });

  it('a white see-through logo with no gym colours goes on the neutral dark', () => {
    const logo = img(100, 100, (x, y) => (disc(x, y, 50, 50, 30) ? WHITE : CLEAR));
    expect(planShortcutIcon(logo, 100, 100).bg).toBe(ICON_NEUTRAL_DARK);
  });

  it('a photo edge is busy and the whole picture fits inside the circle', () => {
    const photo = img(128, 128, (x, y) => [x * 2, y * 2, 90, 255]);
    const p = planShortcutIcon(photo, 128, 128);
    expect(p.edge).toBe('busy');
    expect(Math.abs(p.width - 45.25)).toBeLessThan(0.05);
  });

  it('JPEG noise on a white edge is still one colour', () => {
    const noisy = img(128, 128, (x, y) => {
      if (disc(x, y, 64, 64, 56)) return BLACK;
      const n = 255 - ((x * 7 + y * 13) % 11);
      return [n, n, n, 255];
    });
    const p = planShortcutIcon(noisy, 128, 128);
    expect(p.edge).toBe('solid');
    expect(p.width).toBeGreaterThanOrEqual(70);
    expect(p.width).toBeLessThanOrEqual(74);
  });

  it('a wide wordmark on red keeps its shape and fills with red', () => {
    const logo = img(200, 80, (x, y) => (x >= 40 && x < 160 && y >= 30 && y < 50 ? WHITE : [0xd7, 0x26, 0x2e, 255]));
    const p = planShortcutIcon(logo, 200, 80);
    expect(p.edge).toBe('solid');
    expect(p.bg).toBe('#D7262E');
    expect(p.width).toBeCloseTo((200 * 32) / Math.hypot(60, 10), 2);
    expect(p.height / p.width).toBeCloseTo(0.4, 4);
  });

  it('a blank picture is scaled as a whole', () => {
    const blank = img(64, 64, () => WHITE);
    expect(contentRadius(blank, 64, 64, [255, 255, 255])).toBeNull();
    expect(planShortcutIcon(blank, 64, 64).width).toBeCloseTo((64 * 32) / Math.hypot(32, 32), 2);
  });

  it('a thin dark frame is part of the logo, so the whole picture fits the circle', () => {
    const framed = img(128, 128, (x, y) => (x === 0 || y === 0 || x === 127 || y === 127 ? BLACK : WHITE));
    const e = readIconEdge(framed, 128, 128);
    expect(e.edge).toBe('busy');
    expect(e.colour).toEqual([255, 255, 255]);
    expect(Math.abs(planShortcutIcon(framed, 128, 128).width - 45.25)).toBeLessThan(0.05);
  });

  it('the panel preview shows the 72 dp viewport: the logo box in % of the round preview', () => {
    const p = planShortcutIcon(badge, 128, 128);
    const box = shortcutPreviewBox(p);
    // The 108 dp canvas is 150 % of the 72 dp circle; its middle is the circle's middle.
    expect(box.width).toBeCloseTo((p.width / 72) * 100, 3);
    expect(box.left).toBeCloseTo(((p.left - 18) / 72) * 100, 3);
    expect(box.left + box.width / 2).toBeCloseTo(50, 3);
    expect(box.top + box.height / 2).toBeCloseTo(50, 3);
  });
});
