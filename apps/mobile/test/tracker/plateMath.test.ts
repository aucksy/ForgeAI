import { describe, expect, it } from 'vitest';

import { DEFAULT_BAR_KG, computePlates } from '@/tracker/services/plateMath';

describe('computePlates', () => {
  it('loads an exactly achievable target with the greedy per-side fill', () => {
    const r = computePlates(100); // 20 bar -> 40 per side
    expect(r.exact).toBe(true);
    expect(r.achievableKg).toBe(100);
    expect(r.perSide).toEqual([25, 15]);
    expect(r.barKg).toBe(DEFAULT_BAR_KG);
  });

  it('reports the closest achievable load when the target is not hittable', () => {
    const r = computePlates(101); // 40.5 per side; smallest plate is 1.25
    expect(r.exact).toBe(false);
    expect(r.achievableKg).toBe(100); // rounds down to loadable
    expect(r.achievableKg).toBeLessThan(101);
  });

  it('returns no plates when the target is at or below the bar', () => {
    const atBar = computePlates(20);
    expect(atBar.perSide).toEqual([]);
    expect(atBar.achievableKg).toBe(20);
    expect(atBar.exact).toBe(true);

    const belowBar = computePlates(10);
    expect(belowBar.perSide).toEqual([]);
    expect(belowBar.achievableKg).toBe(20);
    expect(belowBar.exact).toBe(false);
  });

  it('honours a custom bar and plate set', () => {
    const r = computePlates(50, 15, [20, 10, 5, 2.5]);
    // (50-15)/2 = 17.5 per side -> 10 + 5 + 2.5
    expect(r.perSide).toEqual([10, 5, 2.5]);
    expect(r.achievableKg).toBe(50);
    expect(r.exact).toBe(true);
  });

  it('selects the concrete greedy per-side plates for a mixed target', () => {
    // (72.5-20)/2 = 26.25 per side -> 25 then 1.25 (only exact combo).
    const r = computePlates(72.5);
    expect(r.perSide).toEqual([25, 1.25]);
    expect(r.achievableKg).toBe(72.5);
    expect(r.exact).toBe(true);
  });
});
