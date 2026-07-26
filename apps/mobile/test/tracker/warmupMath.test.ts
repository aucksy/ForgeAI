import { describe, expect, it } from 'vitest';

import { computeWarmups } from '@/tracker/services/warmupMath';

describe('computeWarmups', () => {
  it('produces the 40/60/80 ramp snapped to the increment', () => {
    const r = computeWarmups(100, 2.5);
    expect(r).toEqual([
      { weightKg: 40, reps: 5 },
      { weightKg: 60, reps: 5 },
      { weightKg: 80, reps: 3 },
    ]);
  });

  it('returns nothing for a non-positive working weight', () => {
    expect(computeWarmups(0, 2.5)).toEqual([]);
    expect(computeWarmups(-10, 2.5)).toEqual([]);
  });

  it('never warms up at or above the working weight', () => {
    // At 20 kg working, the ramp snaps to 7.5 / 12.5 / 15 — all below the work set.
    const r = computeWarmups(20, 2.5);
    for (const step of r) expect(step.weightKg).toBeLessThan(20);
  });

  it('drops duplicate consecutive loads on very light lifts', () => {
    // Every percentage of a tiny load rounds to the single increment -> dedup.
    const r = computeWarmups(5, 2.5);
    const weights = r.map((s) => s.weightKg);
    expect(new Set(weights).size).toBe(weights.length);
  });

  it('falls back to a 2.5 kg increment when given a non-positive increment', () => {
    // 45 kg working: 40% = 18 -> snaps to 17.5 ONLY with a 2.5 increment (a 5 kg
    // fallback would give 20), so this value discriminates the fallback.
    const r = computeWarmups(45, 0);
    expect(r).toEqual([
      { weightKg: 17.5, reps: 5 },
      { weightKg: 27.5, reps: 5 },
      { weightKg: 35, reps: 3 },
    ]);
  });
});
