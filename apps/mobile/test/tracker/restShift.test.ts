import { describe, expect, it } from 'vitest';

import { runningRestShift } from '@/tracker/services/restRules';

describe('changing the rest also moves the running timer (backlog, 21 Oct)', () => {
  it('2:30 -> 3:00 adds 30 seconds; 2:00 -> 1:30 takes 30 off', () => {
    expect(runningRestShift(150, 180)).toBe(30);
    expect(runningRestShift(120, 90)).toBe(-30);
  });
  it('no change, or the rest switched off before or after: the running timer is left alone', () => {
    expect(runningRestShift(90, 90)).toBeNull();
    expect(runningRestShift(90, 0)).toBeNull();
    expect(runningRestShift(0, 90)).toBeNull();
  });
});
