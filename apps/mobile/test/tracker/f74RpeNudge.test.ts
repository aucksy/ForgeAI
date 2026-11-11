/**
 * F74 (R-144): after a set ticked with how hard it felt, the next sets of that exercise suggest a
 * little more (felt easy) or hold / go lighter (very hard). Hints only: typed numbers never change.
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

import { computeProgressionTarget, rowTargetFill, targetFill, type ProgSession } from '@/tracker/engine/progression';
import { DEFAULT_TARGET_RPE, nudgeLine, rpeNudge, type NudgeInput } from '@/tracker/engine/rpeNudge';
import { fillForSet, nudgeForSet, type DraftExercise, type DraftSet } from '@/tracker/store/activeWorkoutStore';
import type { Exercise } from '@/types/models';

const base = (p: Partial<NudgeInput> = {}): NudgeInput => ({
  logType: 'weight_reps',
  done: { weightKg: 60, reps: 10, rpe: 6, setNo: 1 },
  doneGoal: 10,
  base: { weightKg: 60, reps: 10 },
  repMax: 12,
  stepUpKg: 62.5,
  stepDownKg: 57.5,
  ...p,
});

describe('rpeNudge (pure)', () => {
  it('the planned effort is "about 2 reps left" (RPE 8) when the plan gives none', () => {
    expect(DEFAULT_TARGET_RPE).toBe(8);
  });

  it('clearly easier (6 against 8), every rep done: one more rep', () => {
    expect(rpeNudge(base())).toMatchObject({ kind: 'more-reps', weightKg: 60, reps: 11, fromSet: 1 });
  });

  it('not clearly easier: 7 or 7.5 against 8 changes nothing', () => {
    expect(rpeNudge(base({ done: { weightKg: 60, reps: 10, rpe: 7, setNo: 1 } }))).toBeNull();
    expect(rpeNudge(base({ done: { weightKg: 60, reps: 10, rpe: 7.5, setNo: 1 } }))).toBeNull();
  });

  it('a plan week at RPE 9: 7 is clearly easier', () => {
    expect(rpeNudge(base({ targetRpe: 9, done: { weightKg: 60, reps: 10, rpe: 7, setNo: 1 } }))?.kind).toBe('more-reps');
  });

  it('easy but short of the planned reps: never more (hold)', () => {
    expect(rpeNudge(base({ done: { weightKg: 60, reps: 9, rpe: 6, setNo: 1 } }))?.kind).toBe('hold');
  });

  it('at the top of the rep range: one weight step (a rung of his own ladder) instead of a rep', () => {
    const n = rpeNudge(base({ done: { weightKg: 100, reps: 12, rpe: 6, setNo: 2 }, doneGoal: 12, base: { weightKg: 100, reps: 12 }, stepUpKg: 102.5 }));
    expect(n).toMatchObject({ kind: 'more-weight', weightKg: 102.5, fromSet: 2 });
    expect(n!.reps).toBeGreaterThanOrEqual(11);
  });

  it('safety cap: never past what the set just done showed (a big step on a light weight is refused)', () => {
    // 20 kg x 12 at RPE 6: 25 kg (+25%) needs more than the set showed.
    expect(rpeNudge(base({ done: { weightKg: 20, reps: 12, rpe: 6, setNo: 1 }, doneGoal: 12, base: { weightKg: 20, reps: 12 }, stepUpKg: 25 }))).toBeNull();
  });

  it('safety cap: never more than 10% over the best 1-rep max before today (a mistaken "6" on a heavy set)', () => {
    expect(rpeNudge(base({ bestE1rm: 60 }))).toBeNull();
    expect(rpeNudge(base({ bestE1rm: 90 }))?.kind).toBe('more-reps');
  });

  it('very hard (10): keep the weight; 2+ reps short at 9.5-10: one small step lighter', () => {
    expect(rpeNudge(base({ done: { weightKg: 60, reps: 10, rpe: 10, setNo: 1 } }))).toMatchObject({ kind: 'hold', weightKg: 60, reps: 10 });
    expect(rpeNudge(base({ done: { weightKg: 60, reps: 8, rpe: 10, setNo: 1 }, base: { weightKg: 60, reps: 8 } }))).toMatchObject({
      kind: 'lighter',
      weightKg: 57.5,
      reps: 10,
    });
    // Nothing lighter on his rack: hold.
    expect(rpeNudge(base({ done: { weightKg: 60, reps: 8, rpe: 10, setNo: 1 }, stepDownKg: null }))?.kind).toBe('hold');
  });

  it('after a long rest (F73) an easy set moves nothing', () => {
    expect(rpeNudge(base({ done: { weightKg: 60, reps: 10, rpe: 6, setNo: 1, longRest: true } }))).toBeNull();
  });

  it('no effort logged, or a row at another weight (a back-off): nothing', () => {
    expect(rpeNudge(base({ done: { weightKg: 60, reps: 10, rpe: null, setNo: 1 } }))).toBeNull();
    expect(rpeNudge(base({ base: { weightKg: 50, reps: 12 } }))).toBeNull();
  });

  it('reps-only moves: one more rep', () => {
    expect(rpeNudge(base({ logType: 'reps', done: { weightKg: 0, reps: 12, rpe: 6, setNo: 1 }, doneGoal: 12, base: { weightKg: 0, reps: 12 } }))).toMatchObject({
      kind: 'more-reps',
      reps: 13,
    });
  });

  it('the reason line, in plain words', () => {
    const kg = (x: number) => `${x} kg`;
    expect(nudgeLine({ kind: 'more-reps', weightKg: 60, reps: 11, fromSet: 1 }, kg)).toBe('Set 1 felt easy, so try 1 more rep.');
    expect(nudgeLine({ kind: 'more-weight', weightKg: 62.5, reps: 12, fromSet: 2 }, kg)).toBe('Set 2 felt easy, so try 62.5 kg.');
    expect(nudgeLine({ kind: 'lighter', weightKg: 57.5, reps: 10, fromSet: 1 }, kg)).toBe('Set 1 was very hard, so try 57.5 kg.');
    expect(nudgeLine({ kind: 'hold', weightKg: 60, reps: 10, fromSet: 1 }, kg)).toBe('Set 1 was very hard, so keep the same weight.');
    // 0.77.0 fresh eyes: no weight on a reps-only row (Air Squat), so no "same weight".
    expect(nudgeLine({ kind: 'hold', weightKg: 0, reps: 40, fromSet: 1 }, kg)).toBe('Set 1 was very hard, so do not try for more reps.');
  });
});

const bench: Exercise = { id: 'e1', name: 'Bench Press', aliases: [], muscleGroup: 'chest', secondaryMuscles: [], equipment: 'barbell', isCompound: true, incrementKg: 2.5 };
const row = (key: string, p: Partial<DraftSet> = {}): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...p });
const card = (sets: DraftSet[]): DraftExercise =>
  ({ key: 'c', exerciseId: 'e1', name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', previousSets: [], prevTyped: true, sets }) as DraftExercise;
const sess = (dateISO: string, reps: number[]): ProgSession => ({
  dateISO,
  sets: reps.map((r) => ({ weightKg: 60, reps: r, rpe: null, setType: 'normal' as const })),
});

describe('the live set rows (fillForSet / nudgeForSet)', () => {
  const t = computeProgressionTarget({
    exercise: bench,
    target: { targetSets: 3, repRangeMin: 8, repRangeMax: 12 },
    // R-350: +1 rep on each set (10, 9, 9 -> 11, 10, 10), so sets 2-3 hint 10 as these checks were written.
    history: [sess('2026-10-20', [10, 9, 9])],
    todayISO: '2026-10-27',
  });
  const fill = rowTargetFill(t);

  it('the Target carries one rung up and down of his ladder for the live suggestion (targetFill itself is unchanged)', () => {
    expect(targetFill(t)).not.toHaveProperty('nudge');
    expect(fill?.nudge?.repMax).toBe(12);
    expect(fill?.nudge?.stepUpKg).toBeGreaterThan(60);
  });

  it('set 1 ticked at RPE 6 with every rep: sets 2 and 3 hint one more rep; the reason shows once', () => {
    const before = card([row('a'), row('b'), row('c3')]);
    expect(fillForSet(before, 'b', fill)).toEqual({ weightKg: 60, reps: 10 });
    const c = card([row('a', { weightKg: 60, reps: 11, rpe: 6, done: true }), row('b'), row('c3')]);
    expect(fillForSet(c, 'b', fill)).toEqual({ weightKg: 60, reps: 11 });
    expect(nudgeForSet(c, 'b', fill)).toMatchObject({ kind: 'more-reps', fromSet: 1 });
    expect(fillForSet(c, 'c3', fill)).toEqual({ weightKg: 60, reps: 11 });
  });

  it('a number the member typed is never changed (no suggestion on that row)', () => {
    const c = card([row('a', { weightKg: 60, reps: 11, rpe: 6, done: true }), row('b', { reps: 9 }), row('c3')]);
    expect(nudgeForSet(c, 'b', fill)).toBeNull();
    expect(fillForSet(c, 'b', fill)?.reps).not.toBe(12);
  });

  it('set 1 at RPE 10: the next rows hold (no extra rep), with a reason', () => {
    const c = card([row('a', { weightKg: 60, reps: 11, rpe: 10, done: true }), row('b'), row('c3')]);
    expect(fillForSet(c, 'b', fill)).toEqual({ weightKg: 60, reps: 10 });
    expect(nudgeForSet(c, 'b', fill)?.kind).toBe('hold');
  });

  it('no effort on the set above, or a drop set above: hints as before', () => {
    const c = card([row('a', { weightKg: 60, reps: 11, done: true }), row('b')]);
    expect(nudgeForSet(c, 'b', fill)).toBeNull();
    expect(fillForSet(c, 'b', fill)).toEqual({ weightKg: 60, reps: 10 });
  });

  it('after a long rest (ticks 6 minutes apart on a 1:30 rest) set 2 felt easy, but set 3 is not raised', () => {
    const T = 1_700_000_000_000;
    const c = {
      ...card([
        row('a', { weightKg: 60, reps: 10, rpe: 8, done: true, doneAt: T }),
        row('b', { weightKg: 60, reps: 11, rpe: 6, done: true, doneAt: T + 360_000 }),
        row('c3'),
      ]),
      restSec: 90,
    } as DraftExercise;
    expect(nudgeForSet(c, 'c3', fill)).toBeNull();
  });
});
