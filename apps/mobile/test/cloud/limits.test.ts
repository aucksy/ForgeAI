/**
 * Chart ranges in months (src/cloud/limits.ts). Tracker #43's server switch was retired by F56 MettleUp Plus
 * (R-461): the free part's rules are tested in test/plan/memberPlanRules.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { monthsOfRange } from '@/cloud/limits';
import { CHART_RANGES } from '@/tracker/engine/historyChart';

describe('monthsOfRange', () => {
  it('every chart range in the app', () => {
    expect(monthsOfRange('30d')).toBe(1);
    expect(monthsOfRange('3m')).toBe(3);
    expect(monthsOfRange('weeks')).toBe(3);
    expect(monthsOfRange('1y')).toBe(12);
    expect(monthsOfRange('year')).toBe(12);
    expect(monthsOfRange('all')).toBeNull();
    expect(monthsOfRange('anything else')).toBeNull();
  });

  it('R-500: the first Profile chart range says 3 months and counts as 3 months, like the exercise charts', () => {
    expect(CHART_RANGES.map((r) => [r.label, monthsOfRange(r.id)])).toEqual([
      ['Last 3 months', 3],
      ['Last 12 months', 12],
      ['All time', null],
    ]);
  });
});
