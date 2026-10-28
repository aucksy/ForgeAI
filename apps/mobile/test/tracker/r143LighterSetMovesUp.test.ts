/**
 * R-143 (owner, 27-28 Oct 2026): a lighter set (10%+ under last time's main weight) that reached
 * the top of the rep range moves up to the main weight next time, its reps back to the bottom of
 * the range. Only a lighter set that did not reach the top (a true back-off) stays as last time.
 * His case: Triceps Pushdown, 13 Oct: warm-up 30 x 20, then 40 x 20, 45 x 13, 45 x 11; range top 20.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const restStarts: number[] = [];
vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async (endsAt: number) => {
    restStarts.push(endsAt);
  },
  cancelRestEnd: async () => undefined,
}));
vi.mock('@/tracker/services/restCard', async (orig) => {
  const real = (await orig()) as typeof import('@/tracker/services/restCard');
  return { ...real, ringerMode: () => 'normal', dismissRestOver: () => undefined, postDoneNote: () => undefined };
});
vi.mock('@/tracker/services/workoutSounds', () => ({ playWorkoutSound: () => undefined }));
vi.mock('@/lib/haptics', () => ({ success: () => undefined, tap: () => undefined, warn: () => undefined }));
vi.mock('@/db', () => ({
  getDb: () => {
    throw new Error('no db in unit tests');
  },
  getMeta: async () => null,
  setMeta: async () => undefined,
}));
vi.mock('react-native', () => {
  const fixed: Record<string, unknown> = {
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
    AccessibilityInfo: { announceForAccessibility: () => undefined },
    Platform: { OS: 'test' },
  };
  const stub: unknown = new Proxy(
    {},
    {
      has: () => true,
      get(_t, k) {
        if (k === 'default') return stub;
        if (k === '__esModule') return true;
        if (k === 'then' || typeof k === 'symbol') return undefined;
        if (k in fixed) return fixed[k];
        return () => {
          throw new Error(`native ${String(k)} in a unit test`);
        };
      },
    },
  );
  return stub as Record<string, unknown>;
});
import { computeProgressionTarget, liftsUp, liftUpOf, targetFill, type ProgSession } from '@/tracker/engine/progression';
import { kgPlan } from '@/tracker/lib/kgTarget';
import { fillForSet, toPrevSet, type DraftExercise, type DraftSet, type PrevSet } from '@/tracker/store/activeWorkoutStore';
import type { Exercise } from '@/types/models';

const row = (key: string, p: Partial<DraftSet> = {}): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...p });
const card = (sets: DraftSet[], previousSets: PrevSet[]): DraftExercise =>
  ({ key: 'c', exerciseId: 'e1', name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', previousSets, prevTyped: true, sets }) as DraftExercise;
const prev = (weightKg: number, reps: number): PrevSet => toPrevSet({ weightKg, reps, durationSec: null, distanceM: null, loadMode: null }, 'weight_reps');
const bench: Exercise = { id: 'e1', name: 'Bench Press', aliases: [], muscleGroup: 'chest', secondaryMuscles: [], equipment: 'barbell', isCompound: true, incrementKg: 2.5 };
const sess = (dateISO: string, sets: [number, number][]): ProgSession => ({ dateISO, sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, rpe: null, setType: 'normal' as const })) });
const wr = (f: { weightKg: number; reps: number } | null) => (f ? [f.weightKg, f.reps] : null);


const pushdown: Exercise = { ...bench, id: 'e1', name: 'Triceps Pushdown', muscleGroup: 'triceps', equipment: 'cable', isCompound: false, incrementKg: 5 };
const his: ProgSession = {
  dateISO: '2026-10-13',
  sets: [
    { weightKg: 30, reps: 20, rpe: null, setType: 'warmup' },
    { weightKg: 40, reps: 20, rpe: null, setType: 'normal' },
    { weightKg: 45, reps: 13, rpe: null, setType: 'normal' },
    { weightKg: 45, reps: 11, rpe: null, setType: 'normal' },
  ],
};
const range = { targetSets: 3, repRangeMin: 12, repRangeMax: 20 };

describe('R-143: a lighter set that reached the top of the range moves up', () => {
  const t = computeProgressionTarget({ exercise: pushdown, target: range, history: [his], todayISO: '2026-10-20' });
  const lastSets = [
    { weightKg: 40, reps: 20 },
    { weightKg: 45, reps: 13 },
    { weightKg: 45, reps: 11 },
  ];

  it('his case: the plan puts set 1 at 45 kg (bottom of the range), sets 2-3 keep their goals (14, and 11 raised to the bottom 12)', () => {
    expect(t.targetWeightKg).toBe(45);
    const plan = kgPlan(t, lastSets)!;
    expect(plan.sets.map((s) => [s.weightKg, s.reps, s.asLast])).toEqual([
      [45, 12, false],
      [45, 14, false],
      [45, 12, false],
    ]);
  });

  it('his case: set row 1 hints 45 kg too (the rows and the plan agree)', () => {
    const c = card([row('w', { isWarmup: true }), row('a'), row('b'), row('c3')], [prev(40, 20), prev(45, 13), prev(45, 11)]);
    const fill = targetFill(t);
    expect(fill?.liftUp).toEqual({ topReps: 20, weightKg: 45, reps: 12 });
    expect(['a', 'b', 'c3'].map((k) => wr(fillForSet(c, k, fill)))).toEqual([
      [45, 12],
      [45, 14],
      [45, 12],
    ]);
  });

  it('a lighter set short of the top stays as last time (a true back-off)', () => {
    const backoff: ProgSession = { dateISO: '2026-10-13', sets: [[45, 13], [45, 11], [40, 15]].map(([weightKg, reps]) => ({ weightKg, reps, rpe: null, setType: 'normal' as const })) };
    const t2 = computeProgressionTarget({ exercise: pushdown, target: range, history: [backoff], todayISO: '2026-10-20' });
    const plan = kgPlan(t2, [{ weightKg: 45, reps: 13 }, { weightKg: 45, reps: 11 }, { weightKg: 40, reps: 15 }])!;
    expect(plan.sets[2]).toEqual({ weightKg: 40, reps: 15, asLast: true });
    const c = card([row('a'), row('b'), row('c3')], [prev(45, 13), prev(45, 11), prev(40, 15)]);
    expect(wr(fillForSet(c, 'c3', targetFill(t2)))).toEqual([40, 15]);
  });

  it('a back-off AFTER the main sets that reached the top moves up too', () => {
    const plan = kgPlan(t, [{ weightKg: 45, reps: 13 }, { weightKg: 45, reps: 11 }, { weightKg: 40, reps: 20 }])!;
    expect(plan.sets[2]).toEqual({ weightKg: 45, reps: 12, asLast: false });
  });

  it('a heavy top set is never moved, whatever its reps', () => {
    const up = liftUpOf(t);
    expect(liftsUp({ weightKg: 60, reps: 25 }, 45, up)).toBe(false);
    expect(liftsUp({ weightKg: 40, reps: 19 }, 45, up)).toBe(false);
    expect(liftsUp({ weightKg: 40, reps: 20 }, 45, up)).toBe(true);
    // Within 10% of the main weight it is a main set already, not a lighter one.
    expect(liftsUp({ weightKg: 42.5, reps: 20 }, 45, up)).toBe(false);
  });

  it('when the main sets move up too, the lighter set moves to last time\'s main weight, not past it', () => {
    const ready: ProgSession = { dateISO: '2026-10-13', sets: [[40, 20], [45, 20], [45, 20]].map(([weightKg, reps]) => ({ weightKg, reps, rpe: null, setType: 'normal' as const })) };
    const t3 = computeProgressionTarget({ exercise: pushdown, target: range, history: [ready], todayISO: '2026-10-20' });
    expect(t3.targetWeightKg).toBeGreaterThan(45);
    expect(liftUpOf(t3)?.weightKg).toBe(45);
  });
});

describe('R-143 keeps a planned high-rep back-off (16 Oct audit C3-4)', () => {
  it('80 x 10 after 100 x 5 in a 4-6 range is far above the range: it stays as last time', () => {
    const t = computeProgressionTarget({ exercise: bench, target: { targetSets: 4, repRangeMin: 4, repRangeMax: 6 }, history: [sess('2026-10-03', [[100, 5], [100, 5], [80, 10], [80, 10]])], todayISO: '2026-10-06' });
    expect(liftsUp({ weightKg: 80, reps: 10 }, 100, liftUpOf(t))).toBe(false);
    // Up to 2 over the top still moves (a lighter set at 22 in a range to 20).
    expect(liftsUp({ weightKg: 40, reps: 22 }, 45, { topReps: 20, weightKg: 45, reps: 12 })).toBe(true);
  });
});
