/**
 * 15 Oct 2026 (owner, in the gym): the workout in progress heads the exercise's History tab, so
 * today's sets sit right above last time's to compare.
 */
import { describe, expect, it } from 'vitest';

import { currentWorkoutSets } from '@/tracker/services/currentInHistory';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';

const set = (key: string, o: Partial<DraftSet>): DraftSet => ({ key, weightKg: 60, reps: 8, isWarmup: false, done: true, ...o }) as DraftSet;
const ex = (key: string, exerciseId: string, sets: DraftSet[]): DraftExercise =>
  ({ key, exerciseId, name: exerciseId, muscleGroup: 'chest', equipment: 'barbell', sets, previousSets: [] }) as unknown as DraftExercise;

describe('the workout in progress on the History tab', () => {
  it('no open workout, or the exercise is not in it: no card', () => {
    expect(currentWorkoutSets(false, [ex('a', 'bench', [set('1', {})])], 'bench')).toBeNull();
    expect(currentWorkoutSets(true, [ex('a', 'squat', [set('1', {})])], 'bench')).toBeNull();
    expect(currentWorkoutSets(true, [ex('a', 'bench', [set('1', {})])], undefined)).toBeNull();
  });

  it('in it with nothing ticked: an empty card (where today will land)', () => {
    expect(currentWorkoutSets(true, [ex('a', 'bench', [set('1', { done: false })])], 'bench')).toEqual([]);
  });

  it('only ticked working sets, in order, across every card of the exercise; warm-ups left out', () => {
    const out = currentWorkoutSets(
      true,
      [
        ex('a', 'bench', [set('w', { isWarmup: true, weightKg: 40 }), set('1', { weightKg: 80, reps: 5, rpe: 8 }), set('2', { done: false })]),
        ex('b', 'row', [set('1', {})]),
        ex('c', 'bench', [set('1', { weightKg: 60, reps: 10, setType: 'drop' })]),
      ],
      'bench',
    );
    expect(out?.map((s) => [s.weightKg, s.reps, s.setType ?? null, s.cardIndex ?? 0, s.rpe ?? null])).toEqual([
      [80, 5, null, 0, 8],
      [60, 10, 'drop', 1, null],
    ]);
    expect(out?.map((s) => s.setNumber)).toEqual([1, 2]);
  });
});

describe('review: not while editing a saved workout or logging a past one', () => {
  it('no card then (the saved one is already in History; a past day is not "today")', () => {
    expect(currentWorkoutSets(true, [ex('a', 'bench', [set('1', {})])], 'bench', true)).toBeNull();
  });
});
