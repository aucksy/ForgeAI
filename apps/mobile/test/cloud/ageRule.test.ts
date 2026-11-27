/**
 * R-630 (No Gaps, gate G3): the age grows from the day it was typed, never early, in India's time zone.
 * Design note: docs/designs/R-630.md section 3c.
 */
import { describe, expect, it } from 'vitest';

import { ageNow, isUnder18, under18DeleteWords } from '@/cloud/ageRule';

// Midday India time on a given calendar day, as ms.
const ist = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 6, 30);

describe('ageNow', () => {
  it('unknown or zero age stays unknown', () => {
    expect(ageNow(null, ist(2026, 11, 27), ist(2027, 1, 1))).toBeNull();
    expect(ageNow(0, ist(2026, 11, 27), ist(2027, 1, 1))).toBeNull();
  });

  it('17 typed today is still 17 tomorrow and on 1 January', () => {
    expect(ageNow(17, ist(2026, 11, 27), ist(2026, 11, 28))).toBe(17);
    expect(ageNow(17, ist(2026, 12, 31), ist(2027, 1, 1))).toBe(17);
  });

  it('turns 18 on the first anniversary of the day typed, not a day before', () => {
    expect(ageNow(17, ist(2026, 11, 27), ist(2027, 11, 26))).toBe(17);
    expect(ageNow(17, ist(2026, 11, 27), ist(2027, 11, 27))).toBe(18);
  });

  it('counts the day in India, not UTC (23:30 IST on 26 Nov is still 26 Nov)', () => {
    const typed = Date.UTC(2026, 10, 27, 0, 0); // 05:30 IST, 27 Nov
    const justBefore = Date.UTC(2027, 10, 26, 18, 0); // 23:30 IST, 26 Nov 2027
    const justAfter = Date.UTC(2027, 10, 26, 18, 31); // 00:01 IST, 27 Nov 2027
    expect(ageNow(17, typed, justBefore)).toBe(17);
    expect(ageNow(17, typed, justAfter)).toBe(18);
  });

  it('no day typed (an old phone) counts from now, the safe side', () => {
    expect(ageNow(17, null, ist(2027, 6, 1))).toBe(17);
  });
});

describe('isUnder18', () => {
  it('blocks only a known age under 18', () => {
    expect(isUnder18(16, ist(2026, 1, 1), ist(2026, 6, 1))).toBe(true);
    expect(isUnder18(18, ist(2026, 1, 1), ist(2026, 6, 1))).toBe(false);
    expect(isUnder18(null, null, ist(2026, 6, 1))).toBe(false);
    expect(isUnder18(17, ist(2025, 1, 1), ist(2026, 6, 1))).toBe(false);
  });
});

describe('under18DeleteWords', () => {
  it('never says "saved automatically" and says "Deleted" only after the server confirmed', () => {
    for (const s of ['pending', 'offline', 'signInNeeded', 'deleted', 'failed'] as const) {
      expect(under18DeleteWords(s).toLowerCase()).not.toContain('saved automatically');
    }
    expect(under18DeleteWords('deleted')).toContain('Deleted');
    expect(under18DeleteWords('pending')).not.toContain('Deleted');
    expect(under18DeleteWords('offline')).not.toContain('Deleted');
    expect(under18DeleteWords('deleted')).toContain('Your gym still keeps its own member record');
  });
});
