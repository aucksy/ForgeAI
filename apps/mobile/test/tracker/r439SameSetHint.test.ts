/**
 * R-439 (owner, 10 Nov 2026): Air Squat, last time 65 then 40 reps; today set 1 = 66 at RPE 8.5,
 * and set 2 hinted 66 ("way too much for squats"). Cause: no Target fill (over the rep cap the
 * Target only says "try a harder version"), so the hint copied the row above. Now set 2 follows
 * its own set last time, scaled by today's form: 40 x 66/65 -> 41.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/tracker/services/workoutAlerts', () => ({ scheduleRestEnd: async () => undefined, cancelRestEnd: async () => undefined }));
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

import { computeProgressionTarget, rowTargetFill, type ProgSession } from '@/tracker/engine/progression';
import { fillForSet, type DraftExercise, type DraftSet } from '@/tracker/store/activeWorkoutStore';
import { sameSetHint } from '@/tracker/lib/sameSetHint';
import type { Exercise } from '@/types/models';

const row = (key: string, p: Partial<DraftSet> = {}): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...p });

const airSquat: Exercise = {
  id: 'sq',
  name: 'Air Squat',
  aliases: [],
  muscleGroup: 'quads',
  secondaryMuscles: [],
  equipment: 'bodyweight',
  isCompound: true,
  incrementKg: 1,
} as Exercise;

const squatCard = (sets: DraftSet[], previous = [65, 40]): DraftExercise =>
  ({
    key: 'c',
    exerciseId: 'sq',
    name: 'Air Squat',
    muscleGroup: 'quads',
    equipment: 'bodyweight',
    logType: 'reps',
    previousSets: previous.map((r) => ({ weightKg: 0, reps: r })),
    previousWarmups: [{ weightKg: 0, reps: 25 }],
    prevTyped: true,
    sets,
  }) as unknown as DraftExercise;

/** His screen: W 25 done, set 1 66 at RPE 8.5 done, set 2 blank. */
const hisScreen = (rpe: number | undefined = 8.5): DraftSet[] => [
  row('w', { isWarmup: true, weightKg: 0, reps: 25, done: true }),
  row('s1', { weightKg: 0, reps: 66, rpe, done: true }),
  row('s2'),
];

describe('R-439 his Air Squat screen', () => {
  // The real Target for his history: over the rep cap (20) with a harder version -> no row fill.
  const history: ProgSession[] = [
    {
      dateISO: '2026-10-26',
      sets: [
        { weightKg: 0, reps: 25, rpe: null, setType: 'warmup' },
        { weightKg: 0, reps: 65, rpe: null, setType: 'normal' },
        { weightKg: 0, reps: 40, rpe: null, setType: 'normal' },
      ],
    },
  ];
  const t = computeProgressionTarget({
    exercise: airSquat,
    target: { targetSets: 2, repRangeMin: 8, repRangeMax: 12 },
    history,
    todayISO: '2026-11-10',
    logType: 'reps',
    repCap: 20,
    harder: { id: 'pistol', name: 'Pistol Squat' },
  });

  it('why it said 66: the Target only suggests a harder version, so the rows get no Target fill', () => {
    expect(t.version?.kind).toBe('harder');
    expect(rowTargetFill(t)).toBeNull();
  });

  it('set 2 now hints 41 (40 last time x 66/65), not 66', () => {
    const fill = fillForSet(squatCard(hisScreen()), 's2', rowTargetFill(t));
    expect(fill).toEqual({ weightKg: 0, reps: 41 });
    expect(fill?.reps).not.toBe(66);
  });

  it('before any tick, set 2 still hints last time (40)', () => {
    const c = squatCard([row('w', { isWarmup: true }), row('s1'), row('s2')]);
    expect(fillForSet(c, 's2', null)?.reps).toBe(40);
  });

  it('R-512: a hard set 1 (RPE 9, 9.5 or 10) no longer holds set 2 back: it hints like any set (41)', () => {
    for (const rpe of [9, 9.5, 10]) {
      expect(fillForSet(squatCard(hisScreen(rpe)), 's2', null)?.reps).toBe(41);
    }
  });

  it('set 1 short of last time (52 vs 65) lowers set 2 the same way: 40 x 52/65 = 32', () => {
    const c = squatCard([row('s1', { weightKg: 0, reps: 52, rpe: 9, done: true }), row('s2')]);
    expect(fillForSet(c, 's2', null)?.reps).toBe(32);
  });

  it('a big day on set 1 (80 vs 65) never asks more than last time + 1 rep', () => {
    const c = squatCard([row('s1', { weightKg: 0, reps: 80, done: true }), row('s2')]);
    expect(fillForSet(c, 's2', null)?.reps).toBe(41);
  });

  it('matched last time and it felt fine (RPE 8): one rep more (41); no effort logged: same (40)', () => {
    const easy = squatCard([row('s1', { weightKg: 0, reps: 65, rpe: 8, done: true }), row('s2')]);
    expect(fillForSet(easy, 's2', null)?.reps).toBe(41);
    const none = squatCard([row('s1', { weightKg: 0, reps: 65, done: true }), row('s2')]);
    expect(fillForSet(none, 's2', null)?.reps).toBe(40);
  });

  it('no same set last time (an extra set 3): the old rule, which is the set just done', () => {
    const c = squatCard([...hisScreen(), row('s3')]);
    // set 3 has no last-time set; set 2 is not ticked, so it copies the nearest number above (66).
    expect(fillForSet(c, 's3', null)?.reps).toBe(66);
  });

  it('no history at all: the row above, as before', () => {
    const c = squatCard([row('s1', { weightKg: 0, reps: 30, done: true }), row('s2')], []);
    expect(fillForSet(c, 's2', null)?.reps).toBe(30);
  });

  it('a number the member typed in set 2 is never replaced (a hint only)', () => {
    const c = squatCard([...hisScreen().slice(0, 2), row('s2', { reps: 50 })]);
    // The fill is what an empty tick would save; the typed 50 stays in the row itself.
    expect(c.sets[2].reps).toBe(50);
  });
});

describe('R-439 weighted lifts', () => {
  const bench = (sets: DraftSet[], previous: [number, number][]): DraftExercise =>
    ({
      key: 'b',
      exerciseId: 'e1',
      name: 'Bench Press',
      muscleGroup: 'chest',
      equipment: 'barbell',
      previousSets: previous.map(([w, r]) => ({ weightKg: w, reps: r })),
      prevTyped: true,
      sets,
    }) as unknown as DraftExercise;

  it('no Target (same flaw): last 100 x 8, 100 x 5; today set 1 100 x 8 -> set 2 hints 100 x 5, not 8', () => {
    const c = bench([row('a', { weightKg: 100, reps: 8, rpe: 8.5, done: true }), row('b')], [
      [100, 8],
      [100, 5],
    ]);
    expect(fillForSet(c, 'b', null)).toEqual({ weightKg: 100, reps: 5 });
  });

  it('no Target, another weight today than last time: the old rule (row above)', () => {
    const c = bench([row('a', { weightKg: 105, reps: 6, done: true }), row('b')], [
      [100, 8],
      [100, 5],
    ]);
    expect(fillForSet(c, 'b', null)).toEqual({ weightKg: 105, reps: 6 });
  });

  it('with a Target (the usual case) nothing changes: each set its own goal, capped at the set just done', () => {
    const t = computeProgressionTarget({
      exercise: { id: 'e1', name: 'Bench Press', aliases: [], muscleGroup: 'chest', secondaryMuscles: [], equipment: 'barbell', isCompound: true, incrementKg: 2.5 } as Exercise,
      target: { targetSets: 2, repRangeMin: 6, repRangeMax: 12 },
      history: [{ dateISO: '2026-11-03', sets: [{ weightKg: 100, reps: 8, rpe: null, setType: 'normal' }, { weightKg: 100, reps: 5, rpe: null, setType: 'normal' }] }],
      todayISO: '2026-11-10',
    });
    const fill = rowTargetFill(t);
    expect(fill?.setReps).toEqual([9, 6]);
    const c = bench([row('a', { weightKg: 100, reps: 9, done: true }), row('b')], [
      [100, 8],
      [100, 5],
    ]);
    expect(fillForSet(c, 'b', fill)).toEqual({ weightKg: 100, reps: 6 });
  });
});

describe('R-439 timed holds', () => {
  const plank = (sets: DraftSet[]): DraftExercise =>
    ({
      key: 'p',
      exerciseId: 'pl',
      name: 'Plank',
      muscleGroup: 'abs',
      equipment: 'bodyweight',
      logType: 'time',
      previousSets: [
        { weightKg: 0, reps: 0, durationSec: 60 },
        { weightKg: 0, reps: 0, durationSec: 40 },
      ],
      prevTyped: true,
      sets,
    }) as unknown as DraftExercise;

  it('last 60 s then 40 s; today 66 s: set 2 hints 44 s at most (40 + 5 cap), never 66 s', () => {
    const c = plank([row('a', { weightKg: 0, reps: 0, durationSec: 66, done: true }), row('b')]);
    expect(fillForSet(c, 'b', null)?.durationSec).toBe(44);
  });
});

describe('sameSetHint (pure)', () => {
  it('no same set or nothing ticked: null (the caller keeps its rule)', () => {
    expect(sameSetHint({ own: null, pairs: [{ today: 66, last: 65 }], justDone: null, step: 1 })).toBeNull();
    expect(sameSetHint({ own: 40, pairs: [], justDone: null, step: 1 })).toBeNull();
  });
  it('never more than the set just done, never under 1', () => {
    expect(sameSetHint({ own: 40, pairs: [{ today: 30, last: 20 }], justDone: { value: 30, rpe: null }, step: 1 })).toBe(30);
    expect(sameSetHint({ own: 2, pairs: [{ today: 1, last: 50 }], justDone: { value: 1, rpe: null }, step: 1 })).toBe(1);
  });
});
