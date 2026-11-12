/**
 * R-146 (owner, 27 Oct 2026): "1,925 kg beaten ✓ (1,925 kg done)" read wrong when done = the plan
 * exactly. Owner, 12 Nov 2026: "reached" and "beaten" are retired; every finished line is one format,
 * "<done> done · Previous: <prev> · +<diff>" ("same as last time" when equal, "First time" with nothing
 * to compare).
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

describe('R-146: exactly the plan, then more (one finished format, owner 12 Nov 2026)', () => {
  it('his case: 40 x 20, 45 x 13, 45 x 12 = 1,925, exactly the plan: still green, done next to previous', () => {
    const g = kgProgress(plan, [row(40, 20), row(45, 13), row(45, 12)]);
    expect(kgBeaten(g)).toBe(true);
    expect(kgLiveLine(plan, g, total, weight)).toBe('1,925 kg done · Previous: 1,880 kg · +45 kg');
  });
  it('more than the plan: what was done next to the previous workout (owner, 12 Nov 2026)', () => {
    const g = kgProgress(plan, [row(40, 20), row(45, 14), row(45, 12)]);
    expect(kgLiveLine(plan, g, total, weight)).toBe('1,970 kg done · Previous: 1,880 kg · +90 kg');
  });
  it('reps with nothing to compare: "First time", whether exactly the plan or more', () => {
    const reps: KgPlan = { reps: true, sets: [1, 2, 3].map(() => ({ weightKg: 1, reps: 15, asLast: false })), total: 45, last: null, pct: null }; // R-366: with a last time, the words name it (r366RepsLastTime)
    const at = (n: number[]) => kgProgress(reps, n.map((r) => row(1, r)));
    expect(repLiveLine(reps, at([15, 15, 15]))).toBe('45 reps done · First time');
    expect(repLiveLine(reps, at([15, 16, 16]))).toBe('47 reps done · First time');
  });
  it('no member word says "volume", "PR", "session", "reached" or "beaten"', () => {
    const lines = [kgLiveLine(plan, kgProgress(plan, [row(40, 20), row(45, 13), row(45, 12)]), total, weight)];
    for (const l of lines) expect(l).not.toMatch(/volume|\bPR\b|session|reached|beaten/i);
  });
});
