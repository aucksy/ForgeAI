/**
 * Oct 2026 design critique — the month report's "Against <month>" cards: one shared number size,
 * picked from the longest number, so a 7-character "236,885" is not shrunk beside a full-size "22".
 */
import { describe, expect, it } from 'vitest';

import { compareValueSize } from '@/tracker/lib/compareTiles';
import { type } from '@/theme/tokens';

describe('compare tiles (month report)', () => {
  it('short numbers keep the big size', () => {
    expect(compareValueSize(['22', '4,512', '422'])).toBe(type.size.h2);
  });

  it('one long number makes all three the smaller size', () => {
    expect(compareValueSize(['22', '236,885', '422'])).toBe(type.size.h3);
    expect(compareValueSize(['1', '10,000', '9'])).toBe(type.size.h3);
  });

  it('no numbers is the big size (nothing to fit)', () => {
    expect(compareValueSize([])).toBe(type.size.h2);
  });
});
