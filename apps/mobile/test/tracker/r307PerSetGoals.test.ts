/**
 * R-300 / R-304 (owner, 3 Nov 2026), under R-350's simple rule (owner, 5 Nov 2026): the missed goal
 * again after a short day, and live chasing on the NEXT set. R-307's growGoals (rep goals following
 * "Weight jumps"), R-301's big-jump goals and R-306 / R-308's stall step-back offer were removed with
 * R-350: same weight is +1 rep on each set, never past the top of the range.
 */
import { describe, expect, it } from 'vitest';

import { computeProgressionTarget, type ProgSession, type ProgSet } from '@/tracker/engine/progression';
import { kgLiveLine, kgProgress, repLiveLine, type KgPlan, type KgRow } from '@/tracker/lib/kgTarget';
import type { Exercise } from '@/types/models';

const base: Exercise = { id: 'e1', name: 'Lateral Raise', aliases: [], muscleGroup: 'shoulders', secondaryMuscles: [], equipment: 'dumbbell', isCompound: false, incrementKg: 2.5 };
const set = (weightKg: number, reps: number, rpe: number | null = null): ProgSet => ({ weightKg, reps, rpe, setType: 'normal' });
const sess = (dateISO: string, sets: ProgSet[]): ProgSession => ({ dateISO, sets });

describe('R-350: the lateral raise (R-301) under the simple rule', () => {
  // R-454 (owner, 12 Nov 2026: "Never suggesting less than before."): a set already past the top keeps
  // what it did (19, 16), the others +1 up to the top (was 15, 15, 15, 15).
  it('19, 16, 15, 14 in 10-15: +1 rep on each set up to 15, never under last time; no weight step until every set is at 15', () => {
    const t = computeProgressionTarget({
      exercise: { ...base, equipment: 'machine', incrementKg: 5 },
      target: { targetSets: 4, repRangeMin: 10, repRangeMax: 15 },
      history: [sess('2026-10-20', [set(20, 19, 9), set(20, 16, 9), set(20, 15, 9.5), set(20, 14, 9)])],
      todayISO: '2026-10-27',
      ladder: [20, 25],
      jump: 'standard',
    });
    expect(t.rule).toBe('R5');
    expect(t.targetWeightKg).toBe(20);
    expect(t.setGoals).toEqual([19, 16, 15, 15]);
  });
});

describe('R-300: after a short day, the missed goals again (nothing on top)', () => {
  const bench: Exercise = { ...base, name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell' };
  const s = (d: string, reps: number[]) => sess(d, reps.map((r) => set(60, r)));
  const run = (history: ProgSession[]) =>
    computeProgressionTarget({ exercise: bench, target: { targetSets: 3, repRangeMin: 8, repRangeMax: 12 }, history, todayISO: '2026-10-27' });

  it('10, 10, 10 aimed 11, 11, 11; did 10, 10, 9: aims 11, 11, 11 again and says so', () => {
    expect(run([s('2026-10-13', [10, 10, 10])]).setGoals).toEqual([11, 11, 11]);
    const t = run([s('2026-10-20', [10, 10, 9]), s('2026-10-13', [10, 10, 10])]);
    expect(t.setGoals).toEqual([11, 11, 11]);
    expect(t.reason).toBe('The previous workout fell a little short, so aim for the same goals again: 60 kg × 11, 11, 11.');
    expect(t.reason).not.toMatch(/last time[^.]*short/i);
  });

  it('short twice running at the same weight: the same goal, no extra', () => {
    const t = run([s('2026-10-24', [10, 10, 10]), s('2026-10-20', [10, 10, 9]), s('2026-10-13', [10, 10, 10])]);
    expect(t.setGoals).toEqual([11, 11, 11]);
  });

  it('a set that beat its goal on a short day keeps its better number', () => {
    expect(run([s('2026-10-20', [12, 9, 9]), s('2026-10-13', [10, 10, 10])]).setGoals).toEqual([12, 11, 11]);
  });

  it('goals reached: +1 as usual', () => {
    expect(run([s('2026-10-20', [11, 11, 11]), s('2026-10-13', [10, 10, 10])]).setGoals).toEqual([12, 12, 12]);
  });
});

describe('R-300 / R-304: the live line', () => {
  const plan: KgPlan = { sets: [{ weightKg: 40, reps: 10, asLast: false }, { weightKg: 40, reps: 10, asLast: false }, { weightKg: 40, reps: 10, asLast: false }], total: 1200, last: null, pct: null };
  const row = (reps: number | null, done: boolean): KgRow => ({ weightKg: reps == null ? null : 40, reps, done, isWarmup: false });
  const total = (kg: number) => `${kg.toLocaleString('en-US')} kg`;
  const weight = (kg: number) => `${kg} kg`;

  it('extra reps go to the NEXT open set first', () => {
    const g = kgProgress(plan, [row(9, true), row(null, false), row(null, false)]);
    expect(g.next.map((x) => x.reps)).toEqual([11, 10]);
  });

  it('all sets done and short: no "add a set", just how much and that it is fine', () => {
    const g = kgProgress(plan, [row(9, true), row(9, true), row(9, true)]);
    const line = kgLiveLine(plan, g, total, weight);
    expect(line).toBe('Done: 1,080 of 1,200 kg · 120 kg less, fine for this workout');
    expect(line).not.toMatch(/add a set/);
    const reps = { ...plan, reps: true as const, sets: plan.sets.map((x) => ({ ...x, weightKg: 1 })), total: 30 };
    expect(repLiveLine(reps, kgProgress(reps, [row(9, true), row(9, true), row(9, true)]))).toBe('Done: 27 of 30 reps · 3 reps less, fine for this workout');
  });
});
