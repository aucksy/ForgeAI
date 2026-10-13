/**
 * 13 Oct 2026 audit (A1): a typed number must fit its box whole. On a ~360 dp phone at a large
 * text size with "Track RPE" on, the boxes are ~44 dp and "22.5" / "102.5" / "1:30" at 15 × 1.3
 * were cut off ("22.", "102") — the tests before only checked the boxes were 44 dp wide.
 */
import { describe, expect, it } from 'vitest';

import { BOX_FONT_MIN, BOX_TEXT_INSET, boxFontSize, numberEm, rowLayout } from '../../src/tracker/components/setRowLayout';

const fits = (text: string, boxW: number, fs: number): boolean => boxFontSize(text, boxW, fs) * numberEm(text) <= boxW - BOX_TEXT_INSET + 0.01;

describe('a typed number fits its box (A1)', () => {
  it('measures the number font: "102.5" is wider than "22.5", a dot narrower than a digit', () => {
    expect(numberEm('102.5')).toBeGreaterThan(numberEm('22.5'));
    expect(numberEm('.')).toBeLessThan(numberEm('0') / 2);
  });

  for (const width of [320, 340, 360, 393, 411]) {
    for (const fs of [1, 1.15, 1.3, 1.5, 2]) {
      it(`${width} dp at text ${fs}× with Track RPE on: decimals, big weights and times fit`, () => {
        const L = rowLayout(width, true, { fontScale: fs });
        for (const t of ['22.5', '102.5', '142.5', '1,000', '0.25', '8']) expect(fits(t, L.inputW, fs)).toBe(true);
        const T = rowLayout(width, true, { fontScale: fs, logType: 'time' });
        for (const t of ['1:30', '12:45']) expect(fits(t, T.inputW, fs)).toBe(true);
      });
    }
  }

  it('keeps the phone\'s own size whenever the number already fits', () => {
    const L = rowLayout(411, true, { fontScale: 1 });
    expect(boxFontSize('100', L.inputW, 1)).toBe(15);
    expect(boxFontSize('', L.inputW, 1.3)).toBeCloseTo(19.5);
    expect(boxFontSize('8', 44, 1.3)).toBeCloseTo(19.5);
  });

  it('shrinks only as much as needed, never below a readable floor', () => {
    const L = rowLayout(360, true, { fontScale: 1.3 });
    const s = boxFontSize('102.5', L.inputW, 1.3);
    expect(s).toBeLessThan(19.5);
    expect(s).toBeGreaterThanOrEqual(BOX_FONT_MIN);
    expect(boxFontSize('123456789.25', 30, 2)).toBe(BOX_FONT_MIN);
  });
});
