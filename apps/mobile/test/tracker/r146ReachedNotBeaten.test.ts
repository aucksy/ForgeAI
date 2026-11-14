/**
 * R-146 (owner, 27 Oct 2026): "1,925 kg beaten ✓ (1,925 kg done)" read wrong when done = the plan
 * exactly. Owner, 12 Nov 2026: "reached" is retired; every finished line is one format. R-498 (owner, 14 Nov
 * 2026): green with a previous workout, "Previous set volume beaten! +<diff>" / "Done <done> · Previous <prev>"
 * ("You matched your previous total" when equal); "First time" with nothing to compare keeps "<done> done · First time".
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
    expect(kgLiveLine(plan, g, total, weight)).toBe('Previous set volume beaten! +45\u00a0kg\nDone 1,925 kg · Previous 1,880 kg');
  });
  it('more than the plan: what was done next to the previous workout (owner, 12 Nov 2026)', () => {
    const g = kgProgress(plan, [row(40, 20), row(45, 14), row(45, 12)]);
    expect(kgLiveLine(plan, g, total, weight)).toBe('Previous set volume beaten! +90\u00a0kg\nDone 1,970 kg · Previous 1,880 kg');
  });
  it('reps with nothing to compare: "First time", whether exactly the plan or more', () => {
    const reps: KgPlan = { reps: true, sets: [1, 2, 3].map(() => ({ weightKg: 1, reps: 15, asLast: false })), total: 45, last: null, pct: null }; // R-366: with a last time, the words name it (r366RepsLastTime)
    const at = (n: number[]) => kgProgress(reps, n.map((r) => row(1, r)));
    expect(repLiveLine(reps, at([15, 15, 15]))).toBe('45 reps done · First time');
    expect(repLiveLine(reps, at([15, 16, 16]))).toBe('47 reps done · First time');
  });
  it('no member word says "PR", "session" or "reached"; "volume" and "beaten" only in the owner\'s R-498 shout', () => {
    const lines = [kgLiveLine(plan, kgProgress(plan, [row(40, 20), row(45, 13), row(45, 12)]), total, weight)];
    for (const l of lines) expect(l).not.toMatch(/\bPR\b|session|reached/i);
    // R-498 (owner, 14 Nov 2026): "Previous set volume beaten!" is his own wording for this line only.
    for (const l of lines) expect(l.replace(/^(Previous set volume beaten!|You matched your previous total)/, '')).not.toMatch(/volume|beaten/i);
  });
});
