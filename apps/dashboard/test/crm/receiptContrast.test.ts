/**
 * The printed receipt's text greys must be readable on its white paper (axe, 16 Oct 2026:
 * "of ₹10,000" and "Computer-generated receipt…" were #7C818E on white, 3.89:1, under the
 * 4.5:1 WCAG AA bar). Every ink in the receipt's PAPER palette is checked against white.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { contrastRatio } from '@forgeai/theme';

const src = readFileSync(resolve(__dirname, '../../src/crm/ui/screens/Receipt.tsx'), 'utf8');
const paper = src.slice(src.indexOf('const PAPER = {'), src.indexOf('} as const;', src.indexOf('const PAPER = {')));
const inks = [...paper.matchAll(/^\s*(ink\w*):\s*'(#[0-9A-Fa-f]{6})'/gm)].map((m) => ({ name: m[1], hex: m[2] }));

describe('receipt paper text contrast', () => {
  it('finds the receipt inks', () => {
    expect(inks.map((i) => i.name)).toContain('ink');
    expect(inks.map((i) => i.name)).toContain('inkSoft');
  });

  it('every ink reads at 4.5:1 or better on white', () => {
    for (const { name, hex } of inks) {
      expect(contrastRatio(hex, '#FFFFFF'), `${name} ${hex}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the old 3.9:1 grey is gone from the receipt', () => {
    expect(src).not.toMatch(/#7C818E/i);
  });
});
