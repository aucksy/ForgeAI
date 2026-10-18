/**
 * OWNER-INBOX #19: a trainer's starting numbers fill the set boxes for every kind of exercise
 * the admin app sends — weight × reps (already, C3-20), a weighted move's added kg, and a timed
 * hold's seconds — but only where the rows above, the Target and PREVIOUS leave them empty.
 */
import { describe, expect, it } from 'vitest';

import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';
import { fillForSet, planOfSet } from '@/tracker/store/activeWorkoutStore';

const row = (key: string, plan?: DraftSet['plan']): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...(plan ? { plan } : {}) }) as DraftSet;
const card = (logType: string, sets: DraftSet[]): DraftExercise =>
  ({ key: 'c', exerciseId: 'e1', name: 'X', muscleGroup: 'back', equipment: 'bodyweight', logType, previousSets: [], prevTyped: true, sets }) as unknown as DraftExercise;

describe('a routine plan fills the boxes on a first time, for every kind', () => {
  it('weighted: the added kg and reps', () => {
    const c = card('weighted', [row('a', { weightKg: 10, reps: 6 }), row('b', { weightKg: 10, reps: 6 })]);
    expect(fillForSet(c, 'a', null)).toMatchObject({ weightKg: 10, reps: 6 });
  });
  it('timed: the hold seconds', () => {
    const c = card('time', [row('a', { durationSec: 45 })]);
    expect(fillForSet(c, 'a', null)).toMatchObject({ durationSec: 45 });
    // A Target's hold leads over the plan.
    expect(fillForSet(c, 'a', { weightKg: 0, reps: 0, durationSec: 60 })).toMatchObject({ durationSec: 60 });
  });
  it('a plan set carries its hold time; warm-ups never', () => {
    expect(planOfSet({ type: 'normal', durationSec: 30 })).toEqual({ durationSec: 30 });
    expect(planOfSet({ type: 'warmup', durationSec: 30 })).toBeUndefined();
    expect(planOfSet({ type: 'normal' })).toBeUndefined();
  });

  it("review fix: a flat trainer plan never comes back over the member's own progress", () => {
    const prevSet = { weightKg: 30, reps: 10, durationSec: null, distanceM: null, loadMode: null, setType: 'normal' };
    const c = { ...card('weight_reps', [row('a', { weightKg: 20, reps: 8 }), row('b', { weightKg: 20, reps: 8 })]), previousSets: [prevSet, prevSet] } as unknown as DraftExercise;
    const target = { weightKg: 32.5, reps: 10, fromKg: 30 };
    expect(fillForSet(c, 'a', target)).toMatchObject({ weightKg: 32.5, reps: 10 });
    expect(fillForSet(c, 'b', target)).toMatchObject({ weightKg: 32.5 });
  });
});
