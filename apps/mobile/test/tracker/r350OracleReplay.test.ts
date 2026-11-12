/**
 * R-350/R-351 + R-364 (owner, 5 Nov 2026: "UAT of all types"): an oracle replay. A simulated member
 * trains ~500 workouts per lift, doing the suggested weight with random good and bad days, while the
 * rules are checked after every workout:
 *  - the weight is the same, one real step up (every set reached the top), or one step down (every set
 *    under the bottom twice running); never two steps, never off the lift's grid;
 *  - at the same weight each set's goal is at most last time's reps + 1 (or a repeated missed goal),
 *    never above the top unless that set already did more (R-454, owner, 12 Nov 2026: then exactly
 *    what it did), and never under what that set did last time; after a step the goals sit inside
 *    the range;
 *  - the kg to beat is never under last time's total, and the finished line ("... done · ...") never shows before the
 *    member's total passes last time's (checked set by set as the workout is ticked);
 *  - warm-ups (even typed the wrong way round, as the owner did) never change the suggestion;
 *  - state changes mid-history: the rep range, Weight jumps, the number of sets.
 * Plus edge cases (first workout, one set, dumbbell pairs, a 5 kg machine) and edits after a tick.
 */
import { describe, expect, it } from 'vitest';

import { computeProgressionTarget, type ProgSession, type ProgressionTarget, type WeightJump } from '@/tracker/engine/progression';
import { kgBeaten, kgLiveLine, kgPlan, kgProgress, lineGreen, type KgRow } from '@/tracker/lib/kgTarget';
import type { Exercise } from '@/types/models';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function ex(over: Partial<Exercise>): Exercise {
  return { id: 'x', name: 'Lift', aliases: [], muscleGroup: 'back', secondaryMuscles: [], equipment: 'barbell', isCompound: true, incrementKg: 2.5, ...over };
}

const iso = (day: number) => new Date(Date.UTC(2025, 0, 1) + day * 86400000).toISOString().slice(0, 10);
const sumKg = (sets: { weightKg: number; reps: number }[]) => sets.reduce((a, s) => a + s.weightKg * s.reps, 0);

interface Lift {
  name: string;
  exercise: Exercise;
  start: number;
  /** Every weight must be a multiple of this (the lift's grid). */
  grid: number;
  pair?: boolean;
  sets: number;
}

const LIFTS: Lift[] = [
  { name: 'barbell row', exercise: ex({ id: 'row', equipment: 'barbell' }), start: 40, grid: 2.5, sets: 3 },
  { name: '5 kg machine stack', exercise: ex({ id: 'pec', equipment: 'machine', incrementKg: 5 }), start: 40, grid: 5, sets: 3 },
  { name: 'dumbbell pair typed as total', exercise: ex({ id: 'db', equipment: 'dumbbell', incrementKg: 2.5 }), start: 20, grid: 5, pair: true, sets: 3 },
  { name: 'one set only', exercise: ex({ id: 'one', equipment: 'cable', incrementKg: 2.5 }), start: 30, grid: 2.5, sets: 1 },
];

/** Range and Weight jumps change mid-history (state changes); so does the number of sets. */
function settingsAt(n: number, lift: Lift) {
  const range = n < 250 ? { min: 6, max: 10 } : { min: 8, max: 12 };
  const jump: WeightJump = n < 150 ? 'standard' : n < 350 ? 'large' : 'small';
  const sets = lift.sets === 1 ? 1 : n >= 420 ? lift.sets + 1 : lift.sets;
  return { range, jump, sets };
}

function replay(lift: Lift, seed: number, workouts = 500) {
  const r = rng(seed);
  const history: ProgSession[] = []; // newest first
  // Workout 0: the member's first, typed by hand (first-time target is not this rule's).
  history.unshift({ dateISO: iso(0), sets: Array.from({ length: lift.sets }, () => ({ weightKg: lift.start, reps: 8, rpe: null, setType: 'normal' as const })) });
  const prevGoals: number[][] = [];
  const failures: string[] = [];
  let ups = 0;
  let downs = 0;
  let sames = 0;
  for (let n = 1; n <= workouts; n++) {
    const { range, jump, sets } = settingsAt(n, lift);
    const input = { exercise: lift.exercise, target: { targetSets: sets, repRangeMin: range.min, repRangeMax: range.max }, history: [...history], todayISO: iso(n * 3), jump, pair: lift.pair };
    const t: ProgressionTarget = computeProgressionTarget(input);
    const last = history[0].sets.filter((s) => s.setType !== 'warmup');
    const w = last[0].weightKg;
    const goals = t.setGoals;
    const tag = `${lift.name} #${n} ${w}->${t.targetWeightKg} [${goals}] rule ${t.rule} last ${last.map((s) => s.reps)}`;
    const bad = (why: string) => failures.length < 10 && failures.push(`${why}: ${tag}`);

    // Warm-ups typed the wrong way round (weight and reps swapped) never change the suggestion.
    const withWarm = computeProgressionTarget({ ...input, history: [{ ...history[0], sets: [{ weightKg: 12, reps: 30, rpe: null, setType: 'warmup' }, ...history[0].sets] }, ...history.slice(1)] });
    if (withWarm.targetWeightKg !== t.targetWeightKg || withWarm.setGoals.join() !== goals.join()) bad('warm-up changed it');

    if (goals.length !== sets) bad('goal count');
    if (goals.some((g) => g < 1)) bad('goal under 1');
    // R-454: only the same weight may aim past the top, and only as far as that set did last time.
    if (Math.abs(t.targetWeightKg - w) > 1e-9 && goals.some((g) => g > range.max)) bad('goal over the top after a step');
    if (Math.abs(t.targetWeightKg / lift.grid - Math.round(t.targetWeightKg / lift.grid)) > 1e-6) bad('off the grid');
    if (t.targetWeightKg > w + 1e-9) {
      ups += 1;
      if (!last.slice(0, sets).every((s) => s.reps >= range.max) && !last.every((s) => s.reps >= range.max)) bad('up before every set reached the top');
      if (t.targetWeightKg - w > Math.max(lift.pair ? 5 : lift.grid, w * 0.11) + 1e-9) bad('more than one step up');
      if (goals.some((g) => g < range.min)) bad('goal under the range after a step up');
    } else if (t.targetWeightKg < w - 1e-9) {
      downs += 1;
      const prev = history[1]?.sets.filter((s) => s.setType !== 'warmup') ?? [];
      const under = (ss: typeof last) => ss.length > 0 && ss.every((s) => s.reps < range.min);
      if (!(under(last) && under(prev) && prev[0]?.weightKg === w)) bad('down without two workouts under the bottom');
      if (w - t.targetWeightKg > Math.max(lift.pair ? 5 : lift.grid, w * 0.125) + 1e-9) bad('more than one step down');
      if (goals.some((g) => g !== range.min)) bad('step-down goal is not the bottom');
    } else {
      sames += 1;
      // The first workout after a rep-range change: the short-day rule re-works the previous goals
      // with the NEW range (goals the member never saw), so only "never above the top" holds there.
      // Known and accepted: the app keeps no record of the old range.
      const rangeChanged = settingsAt(n - 1, lift).range.max !== range.max;
      const pg = prevGoals[0];
      goals.forEach((g, i) => {
        const did = (last[i] ?? last[last.length - 1]).reps;
        // R-454 (owner, 12 Nov 2026): never under what the same set did last time at this weight.
        if (i < last.length && g < last[i].reps) bad(`set ${i + 1} goal under last time's ${last[i].reps}`);
        if (rangeChanged) return;
        const allowed = Math.max(i < last.length ? did : 0, Math.min(range.max, Math.max(did + 1, pg?.[i] ?? 0)));
        if (g > allowed) bad(`set ${i + 1} goal over last+1`);
      });
    }

    // The workout: the member does the suggested weight; reps land around the goal.
    const doneSets = goals.map((g) => {
      const roll = r();
      const reps = Math.max(1, g + (roll < 0.15 ? -3 : roll < 0.35 ? -1 : roll < 0.85 ? 0 : 1));
      return { weightKg: t.targetWeightKg, reps };
    });
    // R-351: the kg to beat, and the live line set by set.
    const plan = kgPlan(t, last.map((s) => ({ weightKg: s.weightKg, reps: s.reps })));
    if (plan) {
      const lastTotal = sumKg(last.slice(0, sets));
      if (last.length === sets && plan.total + 1e-9 < lastTotal) bad(`kg to beat ${plan.total} under last time's ${lastTotal}`);
      for (let k = 0; k <= doneSets.length; k++) {
        const rows: KgRow[] = doneSets.map((s, i) =>
          i < k ? { weightKg: s.weightKg, reps: s.reps, done: true, isWarmup: false } : { weightKg: null, reps: null, done: false, isWarmup: false, hintKg: t.targetWeightKg, hintReps: goals[i] },
        );
        const g = kgProgress(plan, rows);
        const doneKg = sumKg(doneSets.slice(0, k));
        if (kgBeaten(g) && doneKg + 1e-9 < plan.total) bad(`"beaten" at ${doneKg} of ${plan.total}`);
        if (last.length === sets && kgBeaten(g) && doneKg + 1e-9 < lastTotal) bad(`"beaten" under last time's ${lastTotal}`);
        const line = kgLiveLine(plan, g, (kg) => `${kg} kg`, (kg) => `${kg} kg`);
        // Owner, 12 Nov 2026: the finished line is now "<done> done · Previous: ..." (no "reached"/"beaten"),
        // and (one rule for kilos and reps) it also shows once every set is done at last time's total or more.
        const allDone = k === doneSets.length;
        const atLast = plan.last != null && doneKg + 0.5 > plan.last;
        if (/beaten|reached| done · /.test(line ?? '') && doneKg + 1e-9 < plan.total && !(allDone && atLast)) bad(`line "${line}" too early`);
        // Green only with every set done and never under last time's total (or the plan, with no last time).
        if (lineGreen(plan, g) && !allDone) bad(`green with ${doneSets.length - k} set(s) open`);
        if (lineGreen(plan, g) && (plan.last != null ? !atLast : doneKg + 1e-9 < plan.total)) bad(`green at ${doneKg} under last time's ${plan.last}`);
        if (allDone && !lineGreen(plan, g) && (plan.last != null ? atLast : doneKg + 1e-9 >= plan.total)) bad(`not green at ${doneKg}, every set done`);
      }
    }
    prevGoals.unshift(goals);
    history.unshift({ dateISO: iso(n * 3), sets: doneSets.map((s) => ({ ...s, rpe: null, setType: 'normal' as const })) });
  }
  return { failures, ups, downs, sames };
}

describe('R-364 oracle replay: 500 workouts per lift, every rule checked after every workout', () => {
  for (const lift of LIFTS) {
    it(`${lift.name}`, () => {
      const out = replay(lift, 350 + lift.grid * 7);
      expect(out.failures).toEqual([]);
      // The replay really exercised the rules: steps up, and mostly +1 rep days.
      expect(out.ups).toBeGreaterThan(5);
      expect(out.sames).toBeGreaterThan(out.ups);
    });
  }
  it('a weak member (many bad days) also steps down one step (about 10%), to the bottom of the range', () => {
    // Bad days only: every set well under the goal, so the safety rule must fire.
    const lift = LIFTS[0];
    const history: ProgSession[] = [
      { dateISO: iso(6), sets: [40, 40, 40].map((weightKg) => ({ weightKg, reps: 4, rpe: null, setType: 'normal' as const })) },
      { dateISO: iso(3), sets: [40, 40, 40].map((weightKg) => ({ weightKg, reps: 5, rpe: null, setType: 'normal' as const })) },
      { dateISO: iso(0), sets: [37.5, 37.5, 37.5].map((weightKg) => ({ weightKg, reps: 10, rpe: null, setType: 'normal' as const })) },
    ];
    const t = computeProgressionTarget({ exercise: lift.exercise, target: { targetSets: 3, repRangeMin: 6, repRangeMax: 10 }, history, todayISO: iso(9) });
    expect(t.targetWeightKg).toBe(35); // the existing step down: about 10% lighter, on the grid
    expect(t.setGoals).toEqual([6, 6, 6]);
  });
});

describe('R-364 edge and state-change cases', () => {
  const row = (weightKg: number, reps: number, done = true): KgRow => ({ weightKg, reps, done, isWarmup: false });
  const base = { exercise: ex({ id: 'tbar', equipment: 'machine' }), target: { targetSets: 3, repRangeMin: 6, repRangeMax: 10 }, todayISO: '2026-11-05' };
  const tbar: ProgSession[] = [{ dateISO: '2026-11-02', sets: [[30, 13], [30, 12], [30, 10]].map(([weightKg, reps]) => ({ weightKg, reps, rpe: 9, setType: 'normal' as const })) }];

  it('first workout ever: no history, no kg-to-beat line', () => {
    const t = computeProgressionTarget({ ...base, history: [] });
    expect(t.action).toBe('start');
    expect(kgPlan(t, [])).toBeNull();
  });

  it('regression R-349: T-Bar Row after 30 x 13, 12, 10 is never 32.5 kg x 6 on every set', () => {
    const t = computeProgressionTarget({ ...base, history: tbar });
    expect(t.setGoals).not.toEqual([6, 6, 6]);
    expect(t.setGoals).toEqual([10, 10, 9]);
  });

  it('regression R-351: 585 kg "beaten" after 2 sets while 270 kg under last time can never come back', () => {
    const t = computeProgressionTarget({ ...base, history: tbar });
    const p = kgPlan(t, [{ weightKg: 30, reps: 13 }, { weightKg: 30, reps: 12 }, { weightKg: 30, reps: 10 }])!;
    const g = kgProgress(p, [row(30, 13), row(30, 13), { weightKg: null, reps: null, done: false, isWarmup: false, hintKg: 30, hintReps: 9 }]);
    expect(kgBeaten(g)).toBe(false);
    expect(kgLiveLine(p, g, (kg) => `${kg} kg`, (kg) => `${kg} kg`)).not.toMatch(/beaten|reached| done · /);
  });

  it('edit after a tick: lowering a done set\'s reps takes "beaten" away again', () => {
    const t = computeProgressionTarget({ ...base, history: tbar });
    const p = kgPlan(t, [{ weightKg: 30, reps: 13 }, { weightKg: 30, reps: 12 }, { weightKg: 30, reps: 10 }])!;
    expect(kgBeaten(kgProgress(p, [row(32.5, 11), row(32.5, 11), row(32.5, 11)]))).toBe(true); // 1,072.5
    expect(kgBeaten(kgProgress(p, [row(32.5, 11), row(32.5, 11), row(32.5, 9)]))).toBe(false); // edited to 9: 1,007.5
  });

  it('rep range changed after the last workout: the new top decides (6-10 -> 12-15 keeps the weight, +1)', () => {
    const t = computeProgressionTarget({ ...base, target: { targetSets: 3, repRangeMin: 12, repRangeMax: 15 }, history: tbar });
    expect(t.targetWeightKg).toBe(30);
    expect(t.setGoals).toEqual([14, 13, 11]);
  });

  it('Weight jumps changed: Large takes a bigger step from the same history than Small', () => {
    const hist: ProgSession[] = [{ dateISO: '2026-11-02', sets: [100, 100, 100].map((weightKg) => ({ weightKg, reps: 10, rpe: null, setType: 'normal' as const })) }];
    const bb = { ...base, exercise: ex({ id: 'sq', equipment: 'barbell' }), history: hist };
    const small = computeProgressionTarget({ ...bb, jump: 'small' }).targetWeightKg;
    const large = computeProgressionTarget({ ...bb, jump: 'large' }).targetWeightKg;
    expect(small).toBeGreaterThan(100);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(110);
  });

  it('a 5 kg machine never suggests a 2.5 kg step (no 42.5 after 40)', () => {
    const hist: ProgSession[] = [35, 40, 40].map((w, i) => ({ dateISO: iso(10 - i * 3), sets: [w, w, w].map((weightKg) => ({ weightKg, reps: 12, rpe: null, setType: 'normal' as const })) }));
    hist[0].sets.forEach((s) => (s.weightKg = 40));
    const t = computeProgressionTarget({ ...base, exercise: ex({ id: 'pec', equipment: 'machine', incrementKg: 5 }), target: { targetSets: 3, repRangeMin: 8, repRangeMax: 12 }, history: hist, todayISO: iso(13) });
    expect(t.targetWeightKg % 5).toBe(0);
    expect(t.targetWeightKg).toBe(45);
  });
});
