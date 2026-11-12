/**
 * R-350 (owner, 5 Nov 2026, option A): suggested weights follow two things only — the rep range and
 * the member's "Weight jumps" choice. Each working set vs the same set last time: under the top ->
 * same weight, +1 rep; every set at the top -> the next weight, each set's reps keeping about the
 * kg it lifted, inside the range. One safety: under the bottom twice -> a step lighter. RPE never
 * changes the numbers. R-351: the kg to beat is never under last time's total.
 */
import { describe, expect, it } from 'vitest';

import { computeProgressionTarget, targetLine, type ProgSession, type WeightJump } from '@/tracker/engine/progression';
import { kgBeaten, kgLiveLine, kgPlan, kgProgress, kgToBeatLine, type KgRow } from '@/tracker/lib/kgTarget';
import type { Exercise } from '@/types/models';

const TODAY = '2026-11-05';

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'tbar',
    name: 'T-Bar Row',
    aliases: [],
    muscleGroup: 'back',
    secondaryMuscles: [],
    equipment: 'machine',
    isCompound: true,
    incrementKg: 2.5,
    ...over,
  };
}
const sess = (dateISO: string, sets: [number, number, (number | null)?][]): ProgSession => ({
  dateISO,
  sets: sets.map(([weightKg, reps, rpe = null]) => ({ weightKg, reps, rpe, setType: 'normal' as const })),
});
const range = (min: number, max: number, sets = 3) => ({ targetSets: sets, repRangeMin: min, repRangeMax: max });
const run = (
  exercise: Exercise,
  r: ReturnType<typeof range>,
  history: ProgSession[],
  more: { jump?: WeightJump; pair?: boolean; logType?: 'assisted' | 'reps' } = {},
) => computeProgressionTarget({ exercise, target: r, history, todayISO: TODAY, ...more });

const total = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`;
const weight = (kg: number) => `${kg} kg`;
const done = (weightKg: number, reps: number): KgRow => ({ weightKg, reps, done: true, isWarmup: false });
const open = (hintKg: number, hintReps: number): KgRow => ({ weightKg: null, reps: null, done: false, isWarmup: false, hintKg, hintReps });

// His T-Bar Row, 5 Nov 2026: range 6-10, 30 x 13 @8.5, 30 x 12 @9, 30 x 10 @9.5, Weight jumps Standard.
const TBAR = [sess('2026-11-02', [[30, 13, 8.5], [30, 12, 9], [30, 10, 9.5]])];
const TBAR_LAST = [
  { weightKg: 30, reps: 13 },
  { weightKg: 30, reps: 12 },
  { weightKg: 30, reps: 10 },
];

describe('R-350: the owner T-Bar Row', () => {
  const t = run(ex(), range(6, 10), TBAR, { jump: 'standard' });

  it('every set reached 10 -> 32.5 kg, each set keeping about its kg: 10, 10, 9', () => {
    expect(t.rule).toBe('R2');
    expect(t.change).toBe('up');
    expect(t.targetWeightKg).toBe(32.5);
    expect(t.setGoals).toEqual([10, 10, 9]);
    expect(targetLine(t)).toBe('32.5 kg · 10, 10, 9');
    expect(t.reason).toBe('All sets reached 10. Move up to 32.5 kg: 10, 10, 9.');
  });

  it('R-351: the kg to beat is last time\'s 1,050 kg, never the plan\'s 942.5', () => {
    const p = kgPlan(t, TBAR_LAST)!;
    expect(p.total).toBe(1050);
    expect(p.planned).toBe(942.5);
    expect(kgToBeatLine(p, total)).toBe('1,050 kg to beat · your previous total');
    // Before a set: the next set asks what the row shows (10), never extra reps past the top.
    const g0 = kgProgress(p, [open(32.5, 10), open(32.5, 10), open(32.5, 9)]);
    expect(kgLiveLine(p, g0, total, weight)).toBe("Next set: 32.5 kg × 10 · Done: 0 of today's 1,050 kg");
  });

  it('R-351: his screen, 30 x 13 twice done and one set left, is not "beaten"', () => {
    const p = kgPlan(t, TBAR_LAST)!;
    const g = kgProgress(p, [done(30, 13), done(30, 13), open(30, 9)]);
    expect(kgBeaten(g)).toBe(false);
    expect(g.left).toBe(270);
    const line = kgLiveLine(p, g, total, weight);
    expect(line).toContain('780 of today\'s 1,050 kg');
    expect(line).not.toMatch(/beaten|reached/);
    // Passing 1,050 is "beaten"; exactly 1,050 is "reached".
    expect(kgLiveLine(p, kgProgress(p, [done(30, 13), done(30, 13), done(30, 10)]), total, weight)).toBe('1,080 kg done · Previous: 1,050 kg · +30 kg');
    expect(kgLiveLine(p, kgProgress(p, [done(30, 13), done(30, 13), done(30, 9)]), total, weight)).toBe("Today's 1,050 kg reached");
  });

  it('RPE never changes the numbers (the same reps without RPE give the same Target)', () => {
    const plain = run(ex(), range(6, 10), [sess('2026-11-02', [[30, 13], [30, 12], [30, 10]])], { jump: 'standard' });
    expect(plain.targetWeightKg).toBe(t.targetWeightKg);
    expect(plain.setGoals).toEqual(t.setGoals);
  });
});

describe('R-350: under the top -> same weight, +1 rep on each set', () => {
  it('30 x 8, 8, 7 -> 30 x 9, 9, 8', () => {
    const t = run(ex(), range(6, 10), [sess('2026-11-02', [[30, 8, 9], [30, 8, 9.5], [30, 7, 10]])]);
    expect(t.rule).toBe('R5');
    expect(t.change).toBeNull();
    expect(t.targetWeightKg).toBe(30);
    expect(t.setGoals).toEqual([9, 9, 8]);
    expect(t.reason).toBe('Add 1 rep to each set: 30 kg × 9, 9, 8.');
    // The kg to beat grows with the reps: 780 against 690.
    const p = kgPlan(t, [{ weightKg: 30, reps: 8 }, { weightKg: 30, reps: 8 }, { weightKg: 30, reps: 7 }])!;
    expect(p.total).toBe(780);
    expect(p.atLast).toBeUndefined();
  });

  it('a set already at the top stays there; the rest +1', () => {
    const t = run(ex(), range(6, 10), [sess('2026-11-02', [[30, 10], [30, 9], [30, 8]])]);
    expect(t.setGoals).toEqual([10, 10, 9]);
    expect(t.reason).toBe('Add 1 rep to each set under 10: 30 kg × 10, 10, 9.');
  });

  it('four flat workouts keep the weight and +1 (no stall rule, no step-back offer)', () => {
    const flat = (d: string) => sess(d, [[60, 8], [60, 7], [60, 6]]);
    const t = run(ex(), range(5, 8), [flat('2026-11-02'), flat('2026-10-30'), flat('2026-10-27'), flat('2026-10-24')]);
    // Still tagged R4 for a plan's early easy week (never shown); the numbers are the +1 rule's.
    expect(t.rule).toBe('R4');
    expect(t.change).toBeNull();
    expect(t.targetWeightKg).toBe(60);
    expect(t.setGoals).toEqual([8, 8, 7]);
    expect(t.stepBack).toBeUndefined();
  });

  it('no beginner fast lane, no big-jump rule: a 20 -> 25 kg machine step just happens', () => {
    const t = computeProgressionTarget({
      exercise: ex({ incrementKg: 5 }),
      target: range(10, 15),
      history: [sess('2026-11-02', [[20, 15], [20, 15], [20, 15]])],
      todayISO: TODAY,
      experience: 'beginner',
    });
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(25);
    expect(t.setGoals).toEqual([12, 12, 12]);
  });
});

describe('R-300 kept: after a short day the missed goal again', () => {
  it('goal 10, 10, 9 at 50 kg, did 10, 8, 7 -> 11, 10, 9 with one line', () => {
    const h = [sess('2026-11-02', [[50, 10], [50, 8], [50, 7]]), sess('2026-10-30', [[50, 9], [50, 9], [50, 8]])];
    const t = run(ex(), range(8, 12), h);
    expect(t.rule).toBe('R5');
    expect(t.setGoals).toEqual([11, 10, 9]);
    expect(t.reason).toBe('The previous workout fell a little short, so aim for the same goals again: 50 kg × 11, 10, 9.');
  });

  it('a missed goal after a weight step is asked again at that weight', () => {
    // 30 x 10, 10, 10 -> 32.5 x 9, 9, 9 (range 6-10); did 9, 8, 7 -> 10, 9, 9.
    const h = [sess('2026-11-02', [[32.5, 9], [32.5, 8], [32.5, 7]]), sess('2026-10-30', [[30, 10], [30, 10], [30, 10]])];
    const t = run(ex(), range(6, 10), h);
    expect(t.targetWeightKg).toBe(32.5);
    expect(t.setGoals).toEqual([10, 9, 9]);
  });
});

describe('R-350 safety: under the bottom twice -> one step lighter', () => {
  it('32.5 x 5, 5, 4 then 5, 4, 4 in 6-10 -> 30 kg x 6 on every set', () => {
    const h = [
      sess('2026-11-02', [[32.5, 5], [32.5, 4], [32.5, 4]]),
      sess('2026-10-30', [[32.5, 5], [32.5, 5], [32.5, 4]]),
      sess('2026-10-27', [[30, 10], [30, 10], [30, 10]]),
    ];
    const t = run(ex(), range(6, 10), h);
    expect(t.rule).toBe('R3');
    expect(t.change).toBe('down');
    expect(t.targetWeightKg).toBe(30);
    expect(t.setGoals).toEqual([6, 6, 6]);
    expect(t.dropNote).toBe('Reps fell under 6 twice, so a step back to 30 kg.');
  });

  it('once under the bottom is only +1 rep', () => {
    const h = [sess('2026-11-02', [[32.5, 5], [32.5, 5], [32.5, 4]]), sess('2026-10-30', [[30, 10], [30, 10], [30, 10]])];
    const t = run(ex(), range(6, 10), h);
    expect(t.rule).toBe('R5');
    expect(t.targetWeightKg).toBe(32.5);
  });
});

describe('R-350 on other kinds of exercise', () => {
  const curl = ex({ id: 'curl', name: 'Seated Incline Curl (Dumbbell)', equipment: 'dumbbell', isCompound: false });

  it('two dumbbells typed as one total move to a real pair: 20 (10 + 10) -> 25 (12.5 + 12.5)', () => {
    const t = run(curl, range(8, 12), [sess('2026-11-02', [[20, 12], [20, 12], [20, 12]])], { pair: true });
    expect(t.targetWeightKg).toBe(25);
    // 20 x 12 = 240 kg a set -> 9 reps at 25 kg.
    expect(t.setGoals).toEqual([9, 9, 9]);
    // Typed as one dumbbell: 22.5 kg, 10 reps.
    const one = run(curl, range(8, 12), [sess('2026-11-02', [[20, 12], [20, 12], [20, 12]])]);
    expect(one.targetWeightKg).toBe(22.5);
    expect(one.setGoals).toEqual([10, 10, 10]);
  });

  it('assisted: +1 rep with the same help, then one step less help from the bottom of the range', () => {
    const pull = ex({ id: 'apu', name: 'Assisted Pull Up', equipment: 'machine' });
    const t = run(pull, range(8, 12), [sess('2026-11-02', [[-20, 10], [-20, 9], [-20, 8]])], { logType: 'assisted' });
    expect(t.rule).toBe('R5');
    expect(t.targetWeightKg).toBe(-20);
    expect(t.setGoals).toEqual([11, 10, 9]);
    expect(t.reason).toBe('Add 1 rep to each set: 20 kg of help × 11, 10, 9.');
    const top = run(pull, range(8, 12), [sess('2026-11-02', [[-20, 12], [-20, 12], [-20, 12]])], { logType: 'assisted' });
    expect(top.rule).toBe('R2');
    expect(top.targetWeightKg).toBe(-17.5);
    expect(top.repGoal).toBe(8);
  });

  it('bodyweight: +1 rep on each set up to the rep cap, then a harder version', () => {
    const pullUp = ex({ id: 'pu', name: 'Pull Up', equipment: 'bodyweight' });
    const t = run(pullUp, range(8, 12), [sess('2026-11-02', [[0, 8], [0, 7], [0, 6]])]);
    expect(t.rule).toBe('B1');
    expect(t.bodyweightOnly).toBe(true);
    expect(t.setGoals).toEqual([9, 8, 7]);
    expect(targetLine(t)).toBe('Bodyweight · 9, 8, 7');
    expect(t.reason).toBe('Add 1 rep to each set: 9, 8, 7.');
    const cap = run(pullUp, range(8, 12), [sess('2026-11-02', [[0, 15], [0, 15], [0, 15]])]);
    expect(cap.rule).toBe('B2cap');
  });

  it('no member word says "volume", "PR" or "session"', () => {
    const reasons = [
      run(ex(), range(6, 10), TBAR).reason,
      run(ex(), range(6, 10), [sess('2026-11-02', [[30, 8], [30, 8], [30, 7]])]).reason,
    ];
    for (const r of reasons) expect(r).not.toMatch(/volume|\bPR\b|session/i);
  });
});

describe('R-358: no kg to beat after a Counting change', () => {
  it('his Dumbbell Preacher Curl: last time 10 x 15 in "one", now "side" -> no line', async () => {
    const { countingChanged } = await import('@/tracker/services/coachTargets');
    const { beatPlan } = await import('@/tracker/lib/kgTarget');
    const lastTime = [10, 15, 14].map((reps) => ({ weightKg: 10, reps, rpe: null, setType: 'normal' as const, loadMode: 'one' as const }));
    expect(countingChanged(lastTime, 'one', 'side')).toBe(true);
    expect(countingChanged(lastTime, 'one', 'one')).toBe(false);
    // A set saved with no counting of its own was logged under the exercise's saved one.
    expect(countingChanged([{ setType: 'normal' }], 'side', 'side')).toBe(false);
    // Warm-ups never decide it.
    expect(countingChanged([{ setType: 'warmup', loadMode: 'one' }], 'side', 'side')).toBe(false);
    const curl = ex({ id: 'pc', name: 'Dumbbell Preacher Curl', equipment: 'dumbbell', isCompound: false });
    const t = run(curl, range(8, 15), [sess('2026-10-22', [[10, 15], [10, 14], [10, 12]])]);
    const last = [{ weightKg: 10, reps: 15 }, { weightKg: 10, reps: 14 }, { weightKg: 10, reps: 12 }];
    expect(beatPlan(t, last)).not.toBeNull();
    expect(beatPlan({ ...t, countingChanged: true }, last)).toBeNull();
  });
});
