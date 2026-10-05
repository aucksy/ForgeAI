/**
 * Phase 1 review fixes — each test fails on the first Phase 1 commit (1b28bac).
 *  - blank rows no longer count as sets done in "Update routine?";
 *  - a routine with the same lift twice is compared copy by copy;
 *  - ticking then unticking a blank row leaves it blank (nothing phantom is saved).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({
  getDb: () => {
    throw new Error('no db in unit tests');
  },
  getMeta: async () => null,
  setMeta: async () => undefined,
}));

import { diffRoutine } from '@/tracker/services/routineDiff';
import { workoutItems } from '@/tracker/services/routineOffer';
import { draftToRichSets } from '@/tracker/services/draftSets';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';

let n = 0;
function set(patch: Partial<DraftSet> = {}): DraftSet {
  n += 1;
  return { key: `s${n}`, weightKg: null, reps: null, isWarmup: false, done: false, ...patch };
}
function ex(patch: Partial<DraftExercise> = {}): DraftExercise {
  n += 1;
  return {
    key: `e${n}`,
    exerciseId: 'bench',
    name: 'Bench',
    muscleGroup: 'chest',
    equipment: 'barbell',
    previousSets: [],
    sets: [],
    ...patch,
  };
}

describe('Update routine? only counts added or removed set rows', () => {
  const routine = [{ exerciseId: 'bench', name: 'Bench', targetSets: 4 }];
  const rows = (k: number): DraftSet[] => Array.from({ length: k }, () => set());

  it('2 of 4 planned sets done, 2 left blank, is skipping — no change', () => {
    const bench = ex({ startRows: 4, sets: [set({ weightKg: 60, reps: 8, done: true }), set({ weightKg: 60, reps: 8, done: true }), set(), set()] });
    const items = workoutItems([bench]);
    expect(items[0].workingSets).toBe(0);
    expect(diffRoutine(routine, items).changed).toBe(false);
  });

  it('extra PREVIOUS rows left blank are not a change either', () => {
    const bench = ex({ startRows: 5, sets: rows(5) });
    expect(diffRoutine(routine, workoutItems([bench])).changed).toBe(false);
  });

  it('adding a row is a change, and reports the new row count', () => {
    const bench = ex({ startRows: 4, sets: rows(5) });
    const items = workoutItems([bench]);
    expect(items[0].workingSets).toBe(5);
    expect(diffRoutine(routine, items).setsChanged).toEqual(['Bench']);
  });

  it('warm-up rows never count', () => {
    const bench = ex({ startRows: 4, sets: [set({ isWarmup: true }), ...rows(4)] });
    expect(workoutItems([bench])[0].workingSets).toBe(0);
  });
});

describe('a routine with the same lift twice', () => {
  const routine = [
    { exerciseId: 'bench', name: 'Bench', targetSets: 3 },
    { exerciseId: 'squat', name: 'Squat', targetSets: 3 },
    { exerciseId: 'bench', name: 'Bench', targetSets: 2 },
  ];
  it('doing both copies as planned is no change', () => {
    const d = diffRoutine(routine, [
      { exerciseId: 'bench', name: 'Bench', workingSets: 3 },
      { exerciseId: 'squat', name: 'Squat', workingSets: 3 },
      { exerciseId: 'bench', name: 'Bench', workingSets: 2 },
    ]);
    expect(d.changed).toBe(false);
  });
  it('dropping the second copy is noticed as a removal', () => {
    const d = diffRoutine(routine, [
      { exerciseId: 'bench', name: 'Bench', workingSets: 3 },
      { exerciseId: 'squat', name: 'Squat', workingSets: 3 },
    ]);
    expect(d.removed).toEqual(['Bench']);
    expect(d.changed).toBe(true);
  });
});

describe('tick then untick a blank row', () => {
  beforeEach(() => {
    useActiveWorkout.setState({ active: true, startedAt: Date.now(), exercises: [], editingSessionId: null });
  });

  it('gives back the blank row, so finishing saves nothing for it', () => {
    const typed = set({ weightKg: 70, reps: 10, done: true });
    const extra = set(); // filled from the set above on tick
    const e = ex({ sets: [typed, extra] });
    useActiveWorkout.setState({ exercises: [e] });
    const st = useActiveWorkout.getState();

    st.toggleDone(e.key, extra.key);
    const ticked = useActiveWorkout.getState().exercises[0].sets[1];
    expect(ticked).toMatchObject({ done: true, weightKg: 70, reps: 10 });

    st.toggleDone(e.key, extra.key);
    const unticked = useActiveWorkout.getState().exercises[0].sets[1];
    expect(unticked).toMatchObject({ done: false, weightKg: null, reps: null });
    expect(draftToRichSets(useActiveWorkout.getState().exercises)).toHaveLength(1);
  });

  it('keeps a number the member typed after the tick', () => {
    const extra = set();
    const e = ex({ previousSets: [{ weightKg: 50, reps: 12 }], sets: [extra] });
    useActiveWorkout.setState({ exercises: [e] });
    const st = useActiveWorkout.getState();
    st.toggleDone(e.key, extra.key);
    st.updateSet(e.key, extra.key, { reps: 9 });
    st.toggleDone(e.key, extra.key);
    const row = useActiveWorkout.getState().exercises[0].sets[0];
    expect(row).toMatchObject({ done: false, weightKg: null, reps: 9 });
  });
});
