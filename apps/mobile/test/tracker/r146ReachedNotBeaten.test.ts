/**
 * R-146 (owner, 27 Oct 2026): "1,925 kg beaten ✓ (1,925 kg done)" read wrong when done = the plan
 * exactly. Exactly the plan says "reached" (still green); "beaten" only for more.
 */
import { describe, expect, it } from 'vitest';

import { kgBeaten, kgLiveLine, kgProgress, repLiveLine, type KgPlan, type KgRow } from '@/tracker/lib/kgTarget';

const total = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`;
const weight = (kg: number) => `${kg} kg`;
const row = (weightKg: number, reps: number): KgRow => ({ weightKg, reps, done: true, isWarmup: false });
// His Triceps Pushdown plan: 40 x 20, 45 x 14, 45 x 11 = 1,925 kg.
const plan: KgPlan = {
  sets: [
    { weightKg: 40, reps: 20, asLast: true },
    { weightKg: 45, reps: 14, asLast: false },
    { weightKg: 45, reps: 11, asLast: false },
  ],
  total: 1925,
  last: 1880,
  pct: 45 / 1880,
};

describe('R-146: reached vs beaten', () => {
  it('his case: 40 x 20, 45 x 13, 45 x 12 = 1,925 exactly says "reached", still green', () => {
    const g = kgProgress(plan, [row(40, 20), row(45, 13), row(45, 12)]);
    expect(kgBeaten(g)).toBe(true);
    expect(kgLiveLine(plan, g, total, weight)).toBe('1,925 kg reached ✓');
  });
  it('more than the plan says "beaten" with what was done', () => {
    const g = kgProgress(plan, [row(40, 20), row(45, 14), row(45, 12)]);
    expect(kgLiveLine(plan, g, total, weight)).toBe('1,925 kg beaten ✓ (1,970 kg done)');
  });
  it('reps: exactly the plan is "reached", more is "beaten"', () => {
    const reps: KgPlan = { reps: true, sets: [1, 2, 3].map(() => ({ weightKg: 1, reps: 15, asLast: false })), total: 45, last: 42, pct: null };
    const at = (n: number[]) => kgProgress(reps, n.map((r) => row(1, r)));
    expect(repLiveLine(reps, at([15, 15, 15]))).toBe('45 reps reached ✓');
    expect(repLiveLine(reps, at([15, 16, 16]))).toBe('45 reps beaten ✓ (47 done)');
  });
  it('no member word says "volume", "PR" or "session"', () => {
    const lines = [kgLiveLine(plan, kgProgress(plan, [row(40, 20), row(45, 13), row(45, 12)]), total, weight)];
    for (const l of lines) expect(l).not.toMatch(/volume|\bPR\b|session/i);
  });
});
