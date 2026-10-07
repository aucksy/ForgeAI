/**
 * Phase 1 workout screen — the pure rules behind the new behaviour:
 * rest timer decisions, live records, routine-change detection, the greyed fill
 * for extra sets, and the lock-screen card text.
 */
import { describe, expect, it } from 'vitest';

import { describeDiff, diffRoutine } from '@/tracker/services/routineDiff';
import { liveRecordFlags, recordLabel } from '@/tracker/services/liveRecords';
import { DEFAULT_REST_SEC, afterSetCompleted, effectiveRestSec, fmtRest } from '@/tracker/services/restRules';
import { clockTime, ongoingText } from '@/tracker/services/workoutPresence';
import { rpeColor } from '@/tracker/lib/rpe';
import { monthGrid } from '@/tracker/lib/calendar';
import { fillForSet } from '@/tracker/store/activeWorkoutStore';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';

let n = 0;
function set(patch: Partial<DraftSet> = {}): DraftSet {
  n += 1;
  return { key: `s${n}`, weightKg: 60, reps: 8, isWarmup: false, done: false, ...patch };
}
function ex(patch: Partial<DraftExercise> = {}): DraftExercise {
  n += 1;
  return {
    key: `e${n}`,
    exerciseId: `x${n}`,
    name: `Lift ${n}`,
    muscleGroup: 'chest',
    equipment: 'barbell',
    previousSets: [],
    sets: [set()],
    ...patch,
  };
}

// ------------------------------------------------------------------ rest rules
describe('rest timer rules', () => {
  it('formats rest lengths the way the picker shows them', () => {
    expect(fmtRest(0)).toBe('Off');
    expect(fmtRest(45)).toBe('45s');
    expect(fmtRest(90)).toBe('1:30');
    expect(fmtRest(120)).toBe('2:00');
  });

  it('uses the exercise rest when set, the default otherwise, and 0 means off', () => {
    expect(effectiveRestSec({ restSec: null }, 90)).toBe(90);
    expect(effectiveRestSec({}, 120)).toBe(120);
    expect(effectiveRestSec({ restSec: 150 }, 90)).toBe(150);
    expect(effectiveRestSec({ restSec: 0 }, 90)).toBe(0);
    expect(DEFAULT_REST_SEC).toBe(90);
  });

  it('starts the exercise rest after a working set', () => {
    const a = ex({ restSec: 120, sets: [set({ done: true }), set()] });
    expect(afterSetCompleted([a], a.key, a.sets[0].key, 90)).toEqual({ restSec: 120, nextExKey: null });
  });

  it('starts no timer after a warm-up, or when rest is off', () => {
    const w = ex({ sets: [set({ isWarmup: true, done: true }), set()] });
    expect(afterSetCompleted([w], w.key, w.sets[0].key, 90).restSec).toBeNull();
    const off = ex({ restSec: 0, sets: [set({ done: true })] });
    expect(afterSetCompleted([off], off.key, off.sets[0].key, 90).restSec).toBeNull();
    const defaultOff = ex({ sets: [set({ done: true })] });
    expect(afterSetCompleted([defaultOff], defaultOff.key, defaultOff.sets[0].key, 0).restSec).toBeNull();
  });

  it('starts no timer when the next set is a drop set', () => {
    const d = ex({ sets: [set({ done: true }), set({ setType: 'drop' })] });
    expect(afterSetCompleted([d], d.key, d.sets[0].key, 90).restSec).toBeNull();
    // ...but does once the drop set itself is done
    d.sets[1].done = true;
    expect(afterSetCompleted([d], d.key, d.sets[1].key, 90).restSec).toBe(90);
  });

  it('supersets rest per round: A → B with no rest, end of round → rest and back to A', () => {
    const a = ex({ supersetGroup: 1, sets: [set({ done: true }), set()] });
    const b = ex({ supersetGroup: 1, sets: [set(), set()] });
    const other = ex({ sets: [set()] });
    expect(afterSetCompleted([a, other, b], a.key, a.sets[0].key, 90)).toEqual({ restSec: null, nextExKey: b.key });
    b.sets[0].done = true;
    expect(afterSetCompleted([a, other, b], b.key, b.sets[0].key, 90)).toEqual({ restSec: 90, nextExKey: a.key });
  });

  it('last round of a superset: rest, nowhere left to jump', () => {
    const a = ex({ supersetGroup: 2, sets: [set({ done: true })] });
    const b = ex({ supersetGroup: 2, sets: [set({ done: true })] });
    expect(afterSetCompleted([a, b], b.key, b.sets[0].key, 60)).toEqual({ restSec: 60, nextExKey: null });
  });

  it('ignores unknown keys', () => {
    const a = ex();
    expect(afterSetCompleted([a], 'nope', a.sets[0].key, 90)).toEqual({ restSec: null, nextExKey: null });
  });
});

// ------------------------------------------------------------------ live records
describe('live records', () => {
  it('no history → no record flags (a first session is not news)', () => {
    const a = ex({ bests: null, sets: [set({ weightKg: 100, reps: 5, done: true })] });
    expect(liveRecordFlags(a).size).toBe(0);
  });

  it('flags a heavier weight, then a better e1RM at a lighter weight', () => {
    const heavy = set({ weightKg: 85, reps: 3, done: true });
    const moreReps = set({ weightKg: 80, reps: 12, done: true }); // e1RM 112 > 85*1.1=93.5
    const a = ex({ bests: { weightKg: 80, e1rm: 100 }, sets: [heavy, moreReps] });
    const flags = liveRecordFlags(a);
    expect(flags.get(heavy.key)).toBe('weight');
    expect(flags.get(moreReps.key)).toBe('e1rm');
  });

  it('only counts ticked working sets, and compares against earlier sets in the same workout', () => {
    const warm = set({ weightKg: 200, reps: 1, isWarmup: true, done: true });
    const notDone = set({ weightKg: 150, reps: 5, done: false });
    const first = set({ weightKg: 90, reps: 5, done: true });
    const same = set({ weightKg: 90, reps: 5, done: true });
    const a = ex({ bests: { weightKg: 85, e1rm: 99 }, sets: [warm, notDone, first, same] });
    const flags = liveRecordFlags(a);
    expect([...flags.keys()]).toEqual([first.key]);
  });

  it('bodyweight sets (0 kg) never flag', () => {
    const a = ex({ bests: { weightKg: 0, e1rm: 0 }, sets: [set({ weightKg: 0, reps: 20, done: true })] });
    expect(liveRecordFlags(a).size).toBe(0);
  });

  it('labels in plain words', () => {
    // Phase 3: the label takes the hit (kind + value + set) and how the exercise is logged.
    const ctx = { logType: 'weight_reps', loadMode: 'one', distUnit: 'km' } as const;
    expect(recordLabel({ kind: 'weight', value: 85, set: { weightKg: 85, reps: 3 } }, ctx)).toBe('Heaviest weight · 85 kg');
    expect(recordLabel({ kind: 'e1rm', value: 112, set: { weightKg: 80, reps: 12 } }, ctx)).toBe('Best 1-rep max · 112 kg');
  });
});

// ------------------------------------------------------------------ routine diff
describe('routine change detection', () => {
  const routine = [
    { exerciseId: 'bench', name: 'Bench', targetSets: 3 },
    { exerciseId: 'row', name: 'Row', targetSets: 3 },
    { exerciseId: 'dip', name: 'Dips', targetSets: 3 },
  ];

  it('no change → no prompt', () => {
    const d = diffRoutine(routine, [
      { exerciseId: 'bench', name: 'Bench', workingSets: 3 },
      { exerciseId: 'row', name: 'Row', workingSets: 3 },
      { exerciseId: 'dip', name: 'Dips', workingSets: 3 },
    ]);
    expect(d.changed).toBe(false);
  });

  it('a skipped exercise left on screen (0 sets) is not a change', () => {
    const d = diffRoutine(routine, [
      { exerciseId: 'bench', name: 'Bench', workingSets: 3 },
      { exerciseId: 'row', name: 'Row', workingSets: 3 },
      { exerciseId: 'dip', name: 'Dips', workingSets: 0 },
    ]);
    expect(d.changed).toBe(false);
  });

  it('spots added, removed, set-count and order changes, and says so plainly', () => {
    const d = diffRoutine(routine, [
      { exerciseId: 'row', name: 'Row', workingSets: 4 },
      { exerciseId: 'bench', name: 'Bench', workingSets: 3 },
      { exerciseId: 'fly', name: 'Cable Fly', workingSets: 3 },
    ]);
    expect(d).toMatchObject({ changed: true, added: ['Cable Fly'], removed: ['Dips'], reordered: true, setsChanged: ['Row'] });
    expect(describeDiff(d)).toBe('You added Cable Fly. You removed Dips. You did a different number of sets on Row.');
  });

  it('order-only change has its own sentence', () => {
    const d = diffRoutine(routine, [
      { exerciseId: 'row', name: 'Row', workingSets: 3 },
      { exerciseId: 'bench', name: 'Bench', workingSets: 3 },
      { exerciseId: 'dip', name: 'Dips', workingSets: 3 },
    ]);
    expect(describeDiff(d)).toBe('You changed the exercise order.');
  });
});

// ------------------------------------------------------------------ extra-set fill
describe('fill for an extra set', () => {
  it('uses last workout first, then the set above, and never fills warm-ups', () => {
    const s1 = set({ weightKg: 70, reps: 10 });
    const s2 = set({ weightKg: null, reps: null });
    const s3 = set({ weightKg: null, reps: null });
    const w = set({ weightKg: 20, reps: 10, isWarmup: true });
    const a = ex({ previousSets: [{ weightKg: 60, reps: 8 }], sets: [w, s1, s2, s3] });
    expect(fillForSet(a, w.key)).toBeNull();
    expect(fillForSet(a, s1.key)).toEqual({ weightKg: 60, reps: 8 }); // PREVIOUS wins
    expect(fillForSet(a, s2.key)).toEqual({ weightKg: 70, reps: 10 }); // set above (typed)
    // set above is blank with no PREVIOUS → keep walking up to the typed set
    expect(fillForSet(a, s3.key)).toEqual({ weightKg: 70, reps: 10 });
    // nothing with numbers above at all → no hint
    const lone = ex({ sets: [set({ weightKg: null, reps: null }), set({ weightKg: null, reps: null })] });
    expect(fillForSet(lone, lone.sets[1].key)).toBeNull();
  });

  it('a blank set above with a PREVIOUS still passes its hint down', () => {
    const s1 = set({ weightKg: null, reps: null });
    const s2 = set({ weightKg: null, reps: null });
    const a = ex({ previousSets: [{ weightKg: 50, reps: 12 }], sets: [s1, s2] });
    expect(fillForSet(a, s2.key)).toEqual({ weightKg: 50, reps: 12 });
  });
});

// ------------------------------------------------------------------ fill from the Target (progression v2)
describe('fill from the Target', () => {
  const target = { weightKg: 75, reps: 5 };

  it('working rows hint the Target, not last time (the line and the rows agree)', () => {
    const s1 = set({ weightKg: null, reps: null });
    const s2 = set({ weightKg: null, reps: null });
    const a = ex({ previousSets: [{ weightKg: 72.5, reps: 8 }, { weightKg: 72.5, reps: 8 }], sets: [s1, s2] });
    expect(fillForSet(a, s1.key)).toEqual({ weightKg: 72.5, reps: 8 }); // before: last time
    expect(fillForSet(a, s1.key, target)).toEqual({ weightKg: 75, reps: 5 });
    expect(fillForSet(a, s2.key, target)).toEqual({ weightKg: 75, reps: 5 });
  });

  it('a weight the member typed above wins; the rep goal stays', () => {
    const s1 = set({ weightKg: 70, reps: null });
    const s2 = set({ weightKg: null, reps: null });
    const a = ex({ sets: [s1, s2] });
    expect(fillForSet(a, s2.key, target)).toEqual({ weightKg: 70, reps: 5 });
  });

  it('warm-up and drop rows keep their old hints', () => {
    const w = set({ weightKg: null, reps: null, isWarmup: true });
    const s1 = set({ weightKg: 75, reps: 5 });
    const d = set({ weightKg: null, reps: null, setType: 'drop' });
    const a = ex({ sets: [w, s1, d] });
    expect(fillForSet(a, w.key, target)).toBeNull();
    expect(fillForSet(a, d.key, target)).toEqual({ weightKg: 75, reps: 5 }); // the set above, as before
    expect(fillForSet(a, d.key, { weightKg: 99, reps: 1 })).toEqual({ weightKg: 75, reps: 5 }); // not the Target
  });
});

// ------------------------------------------------------------------ lock-screen card
describe('lock-screen card text', () => {
  it('counts working sets, or shows when rest ends', () => {
    const exercises = [
      { sets: [{ done: true, isWarmup: true }, { done: true, isWarmup: false }, { done: false, isWarmup: false }] },
    ];
    expect(ongoingText(exercises, null)).toBe('1 of 2 sets done');
    expect(ongoingText([], null)).toBe('Add an exercise to start');
    const at = new Date(2026, 9, 5, 18, 42).getTime();
    expect(ongoingText(exercises, at)).toBe('Resting · next set at 6:42 pm');
    expect(clockTime(new Date(2026, 9, 5, 0, 5).getTime())).toBe('12:05 am');
    expect(clockTime(new Date(2026, 9, 5, 12, 0).getTime())).toBe('12:00 pm');
  });
});

// ------------------------------------------------------------------ small helpers
describe('RPE colours and the calendar grid', () => {
  it('colours easy, hard and near-failure differently', () => {
    const easy = rpeColor(6.5);
    const hard = rpeColor(8);
    const max = rpeColor(9.5);
    expect(new Set([easy, hard, max]).size).toBe(3);
  });

  it('builds a Monday-first month grid', () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g.length % 7).toBe(0);
    expect(g.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(g.filter(Boolean)).toHaveLength(31);
  });
});
