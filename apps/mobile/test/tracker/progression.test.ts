/**
 * Progression engine v2 — one test per rule, and for every defect the research found in
 * the frozen engine (Progressive-Overload-Research-v3 §2, cases B C E F G J) a check that
 * the OLD engine gives the wrong answer and the new one the right answer.
 */
import { describe, expect, it } from 'vitest';

import { parseWorkoutPlan, planRowView } from '@/components/chat/payload';
import { computeOverloadTarget } from '@/engine/overload';
import { groupRows } from '@/tracker/db/progressionHistory';
import {
  computeProgressionTarget,
  learnStep,
  summarise,
  targetBadge,
  targetFill,
  targetLine,
  type ProgSession,
  type ProgSetType,
} from '@/tracker/engine/progression';
import { defaultRepRange, exerciseKind } from '@/tracker/engine/repRanges';
import type { Exercise } from '@/types/models';

const TODAY = '2026-10-06';

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'e1',
    name: 'Bench Press',
    aliases: [],
    muscleGroup: 'chest',
    secondaryMuscles: [],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 2.5,
    ...over,
  };
}

type S = [number, number] | [number, number, number | null] | [number, number, number | null, ProgSetType];
function sess(dateISO: string, sets: S[]): ProgSession {
  return {
    dateISO,
    sets: sets.map(([weightKg, reps, rpe = null, setType = 'normal']) => ({ weightKg, reps, rpe, setType })),
  };
}
const range = (min: number, max: number, sets = 3) => ({ targetSets: sets, repRangeMin: min, repRangeMax: max });

function run(exercise: Exercise, r: ReturnType<typeof range>, history: ProgSession[], experience?: 'beginner' | 'intermediate' | 'advanced') {
  return computeProgressionTarget({ exercise, target: r, history, todayISO: TODAY, experience });
}
/** The frozen engine on the same history (it only sees weight × reps). */
function old(exercise: Exercise, r: ReturnType<typeof range>, history: ProgSession[]) {
  return computeOverloadTarget({
    exercise,
    target: r,
    history: history.map((h) => ({ dateISO: h.dateISO, sets: h.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })) })),
  });
}

describe('defects found in the old engine', () => {
  it('B: a drop set no longer blocks the weight increase', () => {
    const h = [sess('2026-10-03', [[20, 12], [20, 12], [20, 12], [12.5, 10, null, 'drop']])];
    expect(old(ex(), range(8, 12), h).action).toBe('hold'); // before: stuck
    const t = run(ex(), range(8, 12), h);
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(22.5);
    expect(t.change).toBe('up');
  });

  it('C: an unloaded pull-up at the top of its range never asks for kilos', () => {
    const pull = ex({ name: 'Pull Up', equipment: 'bodyweight', incrementKg: 2.5 });
    const h = [sess('2026-10-03', [[0, 12], [0, 12], [0, 12]])];
    expect(old(pull, range(8, 12), h).targetWeightKg).toBe(2.5); // before: "add 2.5 kg"
    const t = run(pull, range(8, 12), h);
    // R-350: +1 rep a set up to the rep cap (B2 merged into B1).
    expect(t.rule).toBe('B1');
    expect(t.targetWeightKg).toBe(0);
    expect(t.bodyweightOnly).toBe(true);
    expect(t.repGoal).toBe(13);
    expect(targetLine(t)).toBe('Bodyweight · aim for 13');
    expect(t.reason).not.toMatch(/kg/);
  });

  it('E (R-350): a 50% dumbbell step happens at the top of the range, reps kept inside it', () => {
    // The big-jump "add reps first" rule (R2b) is gone (owner, 5 Nov 2026): 5 x 15 = 75 kg a set
    // is 10 reps at 7.5 kg, lifted to the bottom of the range, 12.
    const lat = ex({ name: 'Lateral Raise', equipment: 'dumbbell', isCompound: false });
    const t = run(lat, range(12, 15), [sess('2026-10-03', [[5, 15], [5, 15], [5, 15]])]);
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(7.5);
    expect(t.setGoals).toEqual([12, 12, 12]);
  });

  it('F: a steady 12, 11, 10 inside the range for three workouts is not cut', () => {
    const h = [
      sess('2026-10-03', [[40, 12], [40, 11], [40, 10]]),
      sess('2026-09-30', [[40, 12], [40, 11], [40, 10]]),
      sess('2026-09-27', [[40, 12], [40, 10], [40, 9]]),
    ];
    expect(old(ex(), range(8, 12), h).action).toBe('deload'); // before: cut to 35 kg
    const t = run(ex(), range(8, 12), h);
    expect(t.rule).toBe('R5');
    expect(t.targetWeightKg).toBe(40);
    // Oct 2026 per-set goals: set 1 is at the top (12), so the extra reps go to sets 2 and 3
    // (R-307: Standard aims about 5% more, 33 -> 35 reps).
    expect(t.setGoals).toEqual([12, 12, 11]);
    expect(t.repGoal).toBe(12);
  });

  it('G (R-350): flat workouts are never cut; the stall rule is gone', () => {
    const flat = (d: string) => sess(d, [[60, 8], [60, 7], [60, 6]]);
    const three = [flat('2026-10-03'), flat('2026-09-30'), flat('2026-09-27')];
    expect(old(ex(), range(5, 8), three).reason).toMatch(/three weeks/); // before
    const t = run(ex(), range(5, 8), [...three, flat('2026-09-24')]);
    expect(t.rule).toBe('R4'); // tagged for a plan's early easy week only
    expect(t.setGoals).toEqual([8, 8, 7]);
    expect(t.targetWeightKg).toBe(60);
    expect(t.stepBack).toBeUndefined();
  });

  it('J: a heavy top single does not become the working weight', () => {
    const h = [sess('2026-10-03', [[105, 3], [95, 8], [95, 8], [95, 8]])];
    expect(old(ex(), range(5, 8), h).targetWeightKg).toBe(105); // before
    const t = run(ex(), range(5, 8), h);
    expect(t.last?.weightKg).toBe(95);
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(97.5);
  });
});

describe('rules', () => {
  it('R0: first time shows no kilos (owner: Option A, 6 Oct 2026)', () => {
    const machine = ex({ name: 'Leg Press', equipment: 'machine', incrementKg: 5, isCompound: true });
    expect(old(machine, range(8, 12), []).targetWeightKg).toBe(20); // before: a guessed 20 kg
    const t = run(machine, range(8, 12), []);
    expect(t.rule).toBe('R0');
    expect(t.action).toBe('start');
    expect(t.repGoal).toBeNull();
    expect(targetLine(t)).toBe('First time · find a weight for 8–12 reps');
    expect(t.reason).toContain('could lift about 2 more times');
    expect(t.reason).not.toMatch(/\d kg/);
    expect(targetBadge(t)).toBeNull();
    expect(targetFill(t)).toBeNull();
  });

  it('R0: a first-time bodyweight move says reps, no kilos', () => {
    const t = run(ex({ name: 'Pull Up', equipment: 'bodyweight' }), range(5, 8), []);
    expect(targetLine(t)).toBe('First time · bodyweight, 5–8 reps');
  });

  it('R0: warm-ups and drop sets alone count as no history', () => {
    const t = run(ex(), range(8, 12), [sess('2026-10-03', [[40, 10, null, 'drop']])]);
    expect(t.rule).toBe('R0');
  });

  it('R1: 3–5 weeks off holds the weight and aims for the bottom', () => {
    const t = run(ex(), range(8, 12), [sess('2026-09-08', [[60, 10], [60, 10], [60, 9]])]);
    expect(t.rule).toBe('R1');
    expect(t.targetWeightKg).toBe(60);
    expect(t.repGoal).toBe(8);
    expect(t.reason).toContain('4 weeks ago');
  });

  it('R1b: 6+ weeks off goes about 10% lighter', () => {
    const t = run(ex(), range(8, 12), [sess('2026-08-20', [[60, 12], [60, 12], [60, 12]])]);
    expect(t.rule).toBe('R1b');
    expect(t.targetWeightKg).toBe(55);
    expect(t.change).toBe('down');
  });

  it('R2 (R-350): RPE never counts as extra reps; only reaching the top moves the weight', () => {
    const h = [sess('2026-10-03', [[40, 11, 8], [40, 10, 8], [40, 10, 8]])];
    const t = run(ex(), range(8, 12), h);
    expect(t.rule).toBe('R5');
    expect(t.targetWeightKg).toBe(40);
    expect(t.setGoals).toEqual([12, 11, 11]);
  });

  it('R2: one missing set of a planned 3 still progresses; two missing do not', () => {
    expect(run(ex(), range(8, 12), [sess('2026-10-03', [[40, 12], [40, 12]])]).rule).toBe('R2');
    expect(run(ex(), range(8, 12), [sess('2026-10-03', [[40, 12]])]).rule).toBe('R5');
  });

  it('R2 (R-350): no beginner fast lane; every member gets his own Weight jumps step', () => {
    const h = [sess('2026-10-03', [[60, 15], [60, 15], [60, 15]])];
    expect(run(ex(), range(8, 12), h, 'beginner').targetWeightKg).toBe(62.5);
    expect(run(ex(), range(8, 12), h, 'intermediate').targetWeightKg).toBe(62.5);
  });

  it('R3: under the range twice at the same weight goes lighter', () => {
    const h = [
      sess('2026-10-03', [[100, 4], [100, 4], [100, 3]]),
      sess('2026-09-30', [[100, 4], [100, 4], [100, 4]]),
      sess('2026-09-27', [[100, 5], [100, 5], [100, 5]]),
    ];
    const t = run(ex(), range(5, 8), h);
    expect(t.rule).toBe('R3');
    expect(t.targetWeightKg).toBe(90);
    expect(t.change).toBe('down');
    expect(targetBadge(t)).toBe('Lighter');
  });

  it('R3 (R-350): two workouts under the range at a new weight step back too', () => {
    const h = [
      sess('2026-10-03', [[102.5, 4], [102.5, 4], [102.5, 4]]),
      sess('2026-09-30', [[102.5, 4], [102.5, 4], [102.5, 4]]),
      sess('2026-09-27', [[100, 8], [100, 8], [100, 8]]),
    ];
    const t = run(ex(), range(5, 8), h);
    expect(t.rule).toBe('R3');
    expect(t.change).toBe('down');
    expect(t.setGoals).toEqual([5, 5, 5]);
  });

  it('a weight with nowhere lighter to go holds and adds a rep (the range-moved rule is gone)', () => {
    const h = [sess('2026-10-03', [[2.5, 4], [2.5, 4]]), sess('2026-09-30', [[2.5, 4], [2.5, 4]])];
    const t = run(ex({ equipment: 'dumbbell' }), range(8, 12, 2), h);
    expect(t.rule).toBe('R5');
    expect(t.setGoals).toEqual([5, 5]);
    expect(t.targetWeightKg).toBe(2.5);
    expect(t.change).toBeNull();
  });

  it('R4: improving reps at the same weight is not a stall', () => {
    const h = [
      sess('2026-10-03', [[60, 8], [60, 8], [60, 7]]),
      sess('2026-09-30', [[60, 8], [60, 7], [60, 7]]),
      sess('2026-09-27', [[60, 8], [60, 7], [60, 6]]),
      sess('2026-09-24', [[60, 8], [60, 7], [60, 6]]),
    ];
    expect(run(ex(), range(5, 8), h).rule).toBe('R5');
  });

  it('R5 (R-350): every set aims one more than the same set last time', () => {
    const t = run(ex(), range(8, 12), [sess('2026-10-03', [[50, 10], [50, 9], [50, 8]])]);
    expect(t.setGoals).toEqual([11, 10, 9]);
    expect(t.repGoal).toBe(11);
    expect(targetLine(t)).toBe('50 kg · 11, 10, 9');
    expect(t.reason).toBe('Add 1 rep to each set: 50 kg × 11, 10, 9.');
    expect(targetBadge(t)).toBeNull();
    expect(t.action).toBe('hold');
  });

  it('B1: an unloaded bodyweight move below the range aims for one more rep, never lighter', () => {
    const pull = ex({ name: 'Pull Up', equipment: 'bodyweight' });
    const h = [sess('2026-10-03', [[0, 4], [0, 3], [0, 3]]), sess('2026-09-30', [[0, 3], [0, 3], [0, 2]])];
    const t = run(pull, range(8, 12), h);
    expect(t.rule).toBe('B1');
    expect(t.setGoals).toEqual([5, 4, 4]);
    expect(t.change).toBeNull();
  });

  it('B2cap: at the rep cap, suggest a harder version', () => {
    const pull = ex({ name: 'Pull Up', equipment: 'bodyweight' });
    const t = run(pull, range(8, 12), [sess('2026-10-03', [[0, 15], [0, 15], [0, 15]])]);
    expect(t.rule).toBe('B2cap');
    expect(t.reason).toContain('harder version');
  });

  it('a loaded bodyweight move progresses its added weight', () => {
    const dip = ex({ name: 'Dips', equipment: 'bodyweight' });
    const h = [sess('2026-10-03', [[10, 12], [10, 12], [10, 12]]), sess('2026-09-30', [[0, 12], [0, 12], [0, 12]])];
    const t = run(dip, range(8, 12), h);
    expect(t.bodyweightOnly).toBe(false);
    expect(t.targetWeightKg).toBe(12.5);
  });
});

describe('weight step', () => {
  const sums = (...weights: number[]) => weights.map((w, i) => summarise(sess(`2026-09-${10 + i}`, [[w, 8], [w, 8]]))!);

  it('learns 5 kg from a gym without small plates', () => {
    expect(learnStep(sums(60, 65, 70, 75), { incrementKg: 2.5 })).toBe(5);
  });

  it('ignores a gap seen only once (a typo)', () => {
    expect(learnStep(sums(60, 62.5, 63), { incrementKg: 2.5 })).toBe(2.5);
  });

  it('falls back to the catalogue step, or 2.5 kg when unset', () => {
    expect(learnStep(sums(60), { incrementKg: 5 })).toBe(5);
    expect(learnStep(sums(60), { incrementKg: 0 })).toBe(2.5);
  });

  it('the learned step drives the next weight', () => {
    const h = [
      sess('2026-10-03', [[75, 12], [75, 12], [75, 12]]),
      sess('2026-09-30', [[70, 12], [70, 12], [70, 12]]),
      sess('2026-09-27', [[65, 12], [65, 12], [65, 12]]),
    ];
    expect(run(ex({ equipment: 'machine', incrementKg: 2.5 }), range(8, 12), h).targetWeightKg).toBe(80);
  });
});

describe('building blocks', () => {
  it('main weight = most sets, ties to the heaviest', () => {
    expect(summarise(sess('d', [[100, 5], [90, 8], [90, 8]]))!.mainWeight).toBe(90);
    expect(summarise(sess('d', [[60, 8], [62.5, 6], [65, 4]]))!.mainWeight).toBe(65);
  });

  it('failure sets count, drop sets do not', () => {
    const s = summarise(sess('d', [[50, 8, null, 'failure'], [50, 8], [30, 12, null, 'drop']]))!;
    expect(s.mainSets).toHaveLength(2);
  });

  it('history rows group into sessions and default old rows to normal', () => {
    const rows = [
      { session_id: 'a', date_iso: '2026-10-03', weight_kg: 50, reps: 8, rpe: null, set_type: null },
      { session_id: 'a', date_iso: '2026-10-03', weight_kg: 30, reps: 12, rpe: 9, set_type: 'drop' },
      { session_id: 'b', date_iso: '2026-09-30', weight_kg: 50, reps: 7, rpe: 8, set_type: 'weird' },
    ];
    const g = groupRows(rows);
    expect(g).toHaveLength(2);
    expect(g[0].sets.map((s) => s.setType)).toEqual(['normal', 'drop']);
    expect(g[1].sets[0]).toEqual({ weightKg: 50, reps: 7, rpe: 8, setType: 'normal' });
  });

  it('chat cards saved before v2 keep their fields; new ones carry the goal', () => {
    const base = { exerciseName: 'Bench', last: null, targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12, targetSets: 3, reason: '', action: 'hold' };
    const oldCard = parseWorkoutPlan({ targets: [base] })!;
    expect(oldCard.targets[0].change).toBeUndefined();
    expect(targetLine(oldCard.targets[0])).toBe('60 kg × 8–12');
    const newCard = parseWorkoutPlan({ targets: [{ ...base, repGoal: 9, change: null, bodyweightOnly: false }] })!;
    expect(newCard.targets[0].change).toBeNull();
    expect(targetLine(newCard.targets[0])).toBe('60 kg · aim for 9');
  });
});

describe('default rep ranges', () => {
  const bench = { name: 'Bench Press', equipment: 'barbell' as const, isCompound: true };
  const legPress = { name: 'Leg Press', equipment: 'machine' as const, isCompound: true };
  const pulldown = { name: 'Lat Pulldown', equipment: 'cable' as const, isCompound: true };
  const curl = { name: 'Dumbbell Curl', equipment: 'dumbbell' as const, isCompound: false };

  it('sorts exercises into big, mid and small', () => {
    expect(exerciseKind(bench)).toBe('big');
    expect(exerciseKind(legPress)).toBe('big');
    expect(exerciseKind(pulldown)).toBe('mid');
    expect(exerciseKind(curl)).toBe('small');
  });

  it('follows the research table', () => {
    expect(defaultRepRange(bench, 'muscle', 'intermediate')).toEqual({ repRangeMin: 6, repRangeMax: 10 });
    expect(defaultRepRange(curl, 'fat_loss', 'beginner')).toEqual({ repRangeMin: 10, repRangeMax: 15 });
    expect(defaultRepRange(bench, 'strength', 'advanced')).toEqual({ repRangeMin: 3, repRangeMax: 6 });
    expect(defaultRepRange(bench, 'strength', 'beginner')).toEqual({ repRangeMin: 5, repRangeMax: 8 });
    expect(defaultRepRange(pulldown, 'general', 'beginner')).toEqual({ repRangeMin: 8, repRangeMax: 12 });
    expect(defaultRepRange(curl, null, null)).toEqual({ repRangeMin: 8, repRangeMax: 12 });
  });
});

describe('big-jump line', () => {
  it('the empty bar steps up normally (+2.5 kg on 20 kg is not "big")', () => {
    const t = computeProgressionTarget({
      exercise: ex(),
      target: range(8, 12),
      history: [sess('2026-10-03', [[20, 12], [20, 12], [20, 12]])],
      todayISO: TODAY,
    });
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(22.5);
  });

  it('a 20 → 25 kg machine step (+25%) is taken (R-350: no add-reps-first rule)', () => {
    const t = computeProgressionTarget({
      exercise: ex({ equipment: 'machine', incrementKg: 5, isCompound: false }),
      target: range(10, 15),
      history: [sess('2026-10-03', [[20, 15], [20, 15], [20, 15]])],
      todayISO: TODAY,
    });
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(25);
    expect(t.setGoals).toEqual([12, 12, 12]);
  });
});

describe('review fixes', () => {
  it('H1: lb-converted weights (135 lb = 61.2244898 kg) progress instead of being cut', () => {
    const lb = 61.2244898;
    const h = [sess('2026-10-03', [[lb, 12], [lb, 12], [lb, 12]]), sess('2026-09-30', [[lb, 12], [lb, 12], [lb, 12]])];
    const t = run(ex(), range(8, 12), h);
    expect(t.rule).toBe('R2');
    expect(t.change).toBe('up');
    expect(t.last?.topReps).toBe(12);
    const one = run(ex(), range(8, 12), [sess('2026-10-03', [[lb, 10], [lb, 9], [lb, 9]])]);
    expect(one.reason).toContain('Add 1 rep to each set: 60 kg × 11, 10, 10');
  });

  it('H2: a ramp at the top of the range moves up, and is never cut', () => {
    const ramp = (d: string) => sess(d, [[60, 12], [70, 12], [80, 12]]);
    const t = run(ex(), range(8, 12), [ramp('2026-10-03'), ramp('2026-09-30'), ramp('2026-09-27'), ramp('2026-09-24')]);
    expect(t.rule).toBe('R2');
    // TG-01: every weight he used (60, 70, 80) is a multiple of 5, so his bar moves in 5 kg
    // (owner decision: the gym's plates only with a custom Plates and bars setup).
    expect(t.targetWeightKg).toBe(85);
    const top = run(ex(), range(8, 12), [sess('2026-10-03', [[100, 6], [90, 8], [85, 10]])]);
    expect(top.reason).toContain('at your heaviest weight');
  });

  it('M1: climbing reps after a big jump are not undone', () => {
    const lat = ex({ name: 'Lateral Raise', equipment: 'dumbbell', isCompound: false });
    const h = [
      sess('2026-10-03', [[7.5, 7], [7.5, 7], [7.5, 7]]),
      sess('2026-09-30', [[7.5, 6], [7.5, 6], [7.5, 7]]),
      sess('2026-09-27', [[7.5, 6], [7.5, 6], [7.5, 6]]),
      sess('2026-09-24', [[5, 16], [5, 16], [5, 16]]),
    ];
    const t = run(lat, range(8, 12), h);
    expect(t.targetWeightKg).toBe(7.5);
    expect(t.change).toBeNull();
  });

  it('M2: one rep from moving up is never a stall', () => {
    const near = (d: string) => sess(d, [[60, 12], [60, 12], [60, 11]]);
    const t = run(ex(), range(8, 12), [near('2026-10-03'), near('2026-09-30'), near('2026-09-27'), near('2026-09-24')]);
    expect(t.rule).toBe('R5');
    expect(t.repGoal).toBe(12);
  });

  it('M3: a once-loaded bodyweight move back at bodyweight shows reps, never "0 kg"', () => {
    const dip = ex({ name: 'Dips', equipment: 'bodyweight' });
    const h = [sess('2026-10-03', [[0, 9], [0, 9], [0, 9]]), sess('2026-08-20', [[10, 8], [10, 8], [10, 8]])];
    const t = run(dip, range(8, 12), h);
    expect(t.bodyweightOnly).toBe(true);
    expect(targetLine(t)).toBe('Bodyweight · aim for 10');
    expect(t.reason).not.toMatch(/0 kg/);
  });

  it('M4: a comeback ramp (80 → 70 → 60 → 50) goes back up one small step, never a 20% jump', () => {
    const h = [
      sess('2026-10-03', [[50, 12], [50, 12], [50, 12]]),
      sess('2026-09-30', [[60, 8], [60, 8], [60, 8]]),
      sess('2026-09-27', [[70, 8], [70, 8], [70, 8]]),
      sess('2026-09-24', [[80, 8], [80, 8], [80, 8]]),
    ];
    // 16 Oct 2026 audit (C3-1, owner's rule): never more than one size step from his real
    // recent working weight — 60 is +20% from 50, so the walk goes one of his own 5 kg steps
    // (was 60). Never a learned "+10 kg" past it.
    expect(run(ex(), range(8, 12), h).targetWeightKg).toBe(55);
  });

  it('L2: a cut is the nearest whole steps to 10%, not more', () => {
    const h = [
      sess('2026-10-03', [[60, 4], [60, 4], [60, 4]]),
      sess('2026-09-30', [[60, 4], [60, 4], [60, 4]]),
    ];
    expect(run(ex(), range(5, 8), h).targetWeightKg).toBe(55);
  });
});

describe('set-row fill from the Target (second review)', () => {
  it('a first time never fills the guessed start weight', () => {
    const t = run(ex(), range(8, 12), []);
    expect(t.rule).toBe('R0');
    expect(targetFill(t)).toBeNull();
  });

  it('after a pyramid only the line speaks; rows keep last time', () => {
    const t = run(ex(), range(5, 8), [sess('2026-10-03', [[60, 10], [70, 8], [80, 5]])]);
    expect(t.topSetOnly).toBe(true);
    expect(targetFill(t)).toBeNull();
  });

  it('a normal Target fills its weight and rep goal', () => {
    const t = run(ex(), range(5, 8), [sess('2026-10-03', [[72.5, 8], [72.5, 8], [72.5, 8], [72.5, 8]])]);
    // R-61 (owner, 22 Oct 2026): warm-ups stay as last time, so a moved weight carries nothing for them.
    // R-350: 72.5 x 8 = 580 kg a set -> 7 reps at 75 kg.
    expect(targetFill(t)).toEqual({ weightKg: 75, reps: 7, fromKg: 72.5, liftUp: { topReps: 8, weightKg: 72.5, reps: 5 } }); // C3-4: fromKg = last time's main weight; R-143: where a lighter set at the top moves
  });
});

describe('first time everywhere (Option A, third review)', () => {
  const card = (over: Record<string, unknown>) =>
    parseWorkoutPlan({
      targets: [{ exerciseName: 'Leg Press', last: null, targetWeightKg: 20, targetRepsMin: 8, targetRepsMax: 12, targetSets: 3, action: 'start', ...over }],
    })!.targets[0];

  it('an old saved card hides its guessed-weight reason under the new line', () => {
    const v = planRowView(card({ reason: 'First time on Leg Press — starting light at 20 kg to groove the movement.' }));
    expect(targetLine(v.line)).toBe('First time · find a weight for 8–12 reps');
    expect(v.showReason).toBe(false);
  });

  it('an old bodyweight first-time card reads as bodyweight', () => {
    const v = planRowView(card({ exerciseName: 'Pull Up', targetWeightKg: 0, reason: 'First time on Pull Up — bodyweight only today.' }));
    expect(targetLine(v.line)).toBe('First time · bodyweight, 8–12 reps');
    expect(v.showReason).toBe(true);
  });

  it('a new first-time card keeps its reason', () => {
    const t = run(ex({ name: 'Leg Press', equipment: 'machine' }), range(8, 12), []);
    const v = planRowView(parseWorkoutPlan({ targets: [t] })!.targets[0]);
    expect(v.showReason).toBe(true);
    expect(targetLine(v.line)).toBe('First time · find a weight for 8–12 reps');
  });

  it('the Home card can show pounds through the same line', () => {
    const t = run(ex(), range(8, 12), [sess('2026-10-03', [[50, 10], [50, 9], [50, 8]])]);
    expect(targetLine(t, (kg) => `${Math.round(kg * 2.2046)} lb`)).toBe('110 lb · 11, 10, 9');
  });
});
