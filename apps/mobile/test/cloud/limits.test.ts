/**
 * Chart ranges in months (src/cloud/limits.ts). Tracker #43's server switch was retired by F56 MettleUp Plus
 * (R-461): the free part's rules are tested in test/plan/memberPlanRules.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { monthsOfRange } from '@/cloud/limits';

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
});
