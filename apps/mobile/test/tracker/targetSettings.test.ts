/**
 * Oct 2026 (owner) — scientific Targets that follow two simple settings. PURE parts:
 *  - "Weight jumps" (Small ~2.5% · Standard ~5% · Large ~10%): the heaviest rung of the member's
 *    ladder within the share, always at least one step; the big-jump guard is unchanged;
 *  - the gym's real plates make a bar's smallest step (no 1.25 kg plates → 5 kg) — only once the
 *    member set up Plates and bars; every barbell weight is then one they can load (review fix);
 *  - per-set goals (10, 9, 8 last time → 11, 9, 8), never below last time's same set; one miss
 *    repeats last time; RPE 10 under the range is a miss;
 *  - ONE source for the set hints: `setGoals` → `targetFill` → `fillForSet` (by working-set
 *    number), a weight typed above carries down, and a hint never asks for more reps than were
 *    just done at that weight;
 *  - "Rep range": "Match my goal" keeps every row's own range; any other choice sets every row's;
 *  - review fixes: the beginner fast lane goes at most one size past the choice, later sets never
 *    aim under the range, warm-ups follow a moved working weight;
 *  - the settings persist with guards and are part of the Target query.
 * The real-SQL path (settings reaching the Targets) is in test/db/targetSettingsReal.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { KG_PER_LB, setDisplayUnits } from '@/lib/units';
import {
  computeProgressionTarget,
  DEFAULT_JUMP,
  isWeightJump,
  perSetGoals,
  targetFill,
  targetLine,
  warmupWeightKg,
  type ProgSession,
  type ProgSetType,
  type WeightJump,
} from '@/tracker/engine/progression';
import { choiceRepRange, isRepRangeChoice, rangeForRow } from '@/tracker/engine/repRanges';
import { buildLadder, upRungsKg } from '@/tracker/engine/weightLadder';
import {
  addPlate,
  barStepKg,
  EMPTY_SETUP,
  gymCanLoad,
  gymPlatesFor,
  isCustomSetup,
  togglePlate,
  type GymPlates,
  type PlateSetup,
} from '@/tracker/services/plateMath';
import { REP_RANGE_CHOICES, REP_RANGE_HELP, REP_RANGE_KEEP, WEIGHT_JUMP_CHOICES, WEIGHT_JUMP_HELP, choiceLabel } from '@/tracker/services/targetChoices';
import { fillForSet, type DraftExercise, type DraftSet } from '@/tracker/store/activeWorkoutStore';
import { querySignature, targetQuery } from '@/tracker/store/targetStore';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';
import type { Exercise } from '@/types/models';

// The settings are persisted; here they are kept in memory (no phone storage in a unit test).
useTrackerPrefs.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });

afterEach(() => setDisplayUnits('metric'));

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
const dumbbell = (over: Partial<Exercise> = {}) => ex({ name: 'Dumbbell Curl', muscleGroup: 'biceps', equipment: 'dumbbell', isCompound: false, ...over });

type S = [number, number] | [number, number, number | null] | [number, number, number | null, ProgSetType];
function sess(dateISO: string, sets: S[]): ProgSession {
  return { dateISO, sets: sets.map(([weightKg, reps, rpe = null, setType = 'normal']) => ({ weightKg, reps, rpe, setType })) };
}
const three = (kg: number, reps: number, d = '2026-10-03') => sess(d, [[kg, reps], [kg, reps], [kg, reps]]);

function run(
  exercise: Exercise,
  history: ProgSession[],
  opts: { min?: number; max?: number; sets?: number; jump?: WeightJump; gym?: GymPlates | null; experience?: 'beginner' | 'intermediate' } = {},
) {
  return computeProgressionTarget({
    exercise,
    target: { targetSets: opts.sets ?? 3, repRangeMin: opts.min ?? 8, repRangeMax: opts.max ?? 12 },
    history,
    todayISO: TODAY,
    experience: opts.experience,
    jump: opts.jump,
    gym: opts.gym,
  });
}

/** A gym with no 1.25 kg plates (kg): its smallest bar jump is 5 kg. */
const noSmall = gymPlatesFor(togglePlate(EMPTY_SETUP, 1.25, false), 'metric')!;
/** A gym set up with the standard plates plus a 0.5 kg plate (its smallest jump 1 kg). */
const withHalf = gymPlatesFor(addPlate(EMPTY_SETUP, 0.5, 'metric') as PlateSetup, 'metric')!;

describe('Weight jumps: the heaviest rung within the chosen share, always at least one step', () => {
  it('barbell 60 kg at the top: Small and Standard → 62.5, Large → 65', () => {
    const h = [three(60, 12)];
    expect(run(ex(), h, { jump: 'small' }).targetWeightKg).toBe(62.5);
    const std = run(ex(), h, { jump: 'standard' });
    expect(std.rule).toBe('R2');
    expect(std.targetWeightKg).toBe(62.5);
    expect(std.change).toBe('up');
    const large = run(ex(), h, { jump: 'large' });
    expect(large.rule).toBe('R2');
    expect(large.targetWeightKg).toBe(65);
    expect(large.reason).toContain('Time for 65 kg.');
    // No setting = Standard.
    expect(DEFAULT_JUMP).toBe('standard');
    expect(run(ex(), h).targetWeightKg).toBe(62.5);
  });

  it('a light lift gets the smallest step whatever the setting (20 kg bar → 22.5)', () => {
    for (const jump of ['small', 'standard', 'large'] as const) expect(run(ex(), [three(20, 12)], { jump }).targetWeightKg).toBe(22.5);
  });

  it('a heavy lift can skip rungs: 140 kg → 142.5 / 145 / 152.5', () => {
    const h = [three(140, 12)];
    expect(run(ex(), h, { jump: 'small' }).targetWeightKg).toBe(142.5);
    expect(run(ex(), h, { jump: 'standard' }).targetWeightKg).toBe(145);
    expect(run(ex(), h, { jump: 'large' }).targetWeightKg).toBe(152.5);
  });

  it('dumbbells: 12 kg on Standard is the next dumbbell (12.5); his own 12/14/16 rack → 16', () => {
    expect(run(dumbbell(), [three(12, 12)], { jump: 'standard' }).targetWeightKg).toBe(12.5);
    expect(run(dumbbell(), [three(12, 12)], { jump: 'large' }).targetWeightKg).toBe(12.5);
    const own = [three(14, 12), three(16, 8, '2026-09-30'), three(12, 12, '2026-09-27')];
    expect(run(dumbbell(), own, { jump: 'standard' }).targetWeightKg).toBe(16);
  });

  it('in pounds the jump lands on pound plates (135 lb + 5% → 140 lb)', () => {
    setDisplayUnits('imperial');
    const lb135 = 135 * KG_PER_LB;
    const t = run(ex(), [three(lb135, 12)], { jump: 'standard' });
    expect(t.targetWeightKg / KG_PER_LB).toBeCloseTo(140, 2);
  });

  it('the big-jump guard is unchanged: a 20 → 25 kg machine still asks for reps first, even on Large', () => {
    const machine = ex({ name: 'Leg Extension', equipment: 'machine', incrementKg: 5, isCompound: false });
    expect(run(machine, [three(20, 15)], { min: 10, max: 15, jump: 'large' }).rule).toBe('R2b');
  });

  it('a beginner who found it easy may go one size further (R2c); on Large it is a plain R2', () => {
    const easy = [three(60, 15)];
    const std = run(ex(), easy, { experience: 'beginner', jump: 'standard' });
    expect(std.rule).toBe('R2c');
    expect(std.targetWeightKg).toBe(65);
    // Review fix: on Small the fast lane stops at the Standard share (60 + 5% = 63 → 62.5), never 65.
    const small = run(ex(), easy, { experience: 'beginner', jump: 'small' });
    expect(small.targetWeightKg).toBe(62.5);
    expect(small.targetWeightKg).toBeLessThanOrEqual(60 * 1.05);
    const large = run(ex(), easy, { experience: 'beginner', jump: 'large' });
    expect(large.rule).toBe('R2');
    expect(large.targetWeightKg).toBe(65);
    expect(run(ex(), easy, { experience: 'intermediate', jump: 'standard' }).targetWeightKg).toBe(62.5);
  });

  it('after a jump, every set aims for the bottom of the range', () => {
    const t = run(ex(), [three(60, 12)], { jump: 'large' });
    expect(t.setGoals).toEqual([8, 8, 8]);
    expect(targetLine(t)).toBe('65 kg · aim for 8');
  });
});

describe("the gym's real plates", () => {
  it('only a setup the member changed counts: the default setup gives no gym', () => {
    expect(isCustomSetup(EMPTY_SETUP)).toBe(false);
    expect(gymPlatesFor(EMPTY_SETUP, 'metric')).toBeNull();
    expect(gymPlatesFor(EMPTY_SETUP, 'imperial')).toBeNull();
    // Switched off and on again = the default.
    expect(gymPlatesFor(togglePlate(togglePlate(EMPTY_SETUP, 1.25, false), 1.25, true), 'metric')).toBeNull();
    expect(noSmall).toEqual({ barKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5] });
  });

  it('no setup: his own small jumps stay (60 → 61 → 62 kg: Small 63, Standard 65 on his 1 kg steps, never 64.5)', () => {
    const h = [three(62, 12), three(61, 12, '2026-09-30'), three(60, 12, '2026-09-27')];
    expect(run(ex(), h, { jump: 'small' }).targetWeightKg).toBe(63);
    expect(run(ex(), h, { jump: 'standard' }).targetWeightKg).toBe(65);
    expect(run(ex(), h, { jump: 'standard', gym: null }).targetWeightKg).toBe(65);
    // A setup with a 0.5 kg plate makes 1 kg jumps: 63 on Small too.
    expect(run(ex(), h, { jump: 'small', gym: withHalf }).targetWeightKg).toBe(63);
  });

  it('with a setup, every suggested barbell weight is one the plates can load', () => {
    const h = [three(62, 12), three(61, 12, '2026-09-30'), three(60, 12, '2026-09-27')];
    for (const jump of ['small', 'standard', 'large'] as const) {
      const t = run(ex(), h, { jump, gym: noSmall });
      expect(gymCanLoad(t.targetWeightKg, noSmall)).toBe(true);
      expect(t.targetWeightKg).toBe(65);
    }
    // Lighter (a long break) lands on a loadable weight too: 62 kg → 55, never 57.
    const back = run(ex(), [three(62, 10, '2026-08-01')], { gym: noSmall });
    expect(back.rule).toBe('R1b');
    expect(gymCanLoad(back.targetWeightKg, noSmall)).toBe(true);
    expect(back.targetWeightKg).toBeLessThan(62);
  });

  it('pounds, 2.5 lb plates off (10 lb jumps): the grid counts from the 45 lb bar (135 → 145, bar → 55)', () => {
    setDisplayUnits('imperial');
    const lb = (n: number) => n * KG_PER_LB;
    const gym = gymPlatesFor(togglePlate(EMPTY_SETUP, 2.5, false), 'imperial')!;
    expect(run(ex(), [three(lb(135), 12)], { jump: 'standard', gym }).targetWeightKg / KG_PER_LB).toBeCloseTo(145, 2);
    expect(upRungsKg(lb(45), 1, buildLadder([lb(45)], 'plates', { units: 'imperial', gym }))[0] / KG_PER_LB).toBeCloseTo(55, 2);
    const ladder = buildLadder([lb(135)], 'plates', { units: 'imperial', gym });
    for (const r of ladder.rungs) expect(Math.abs((r - 45) / 10 - Math.round((r - 45) / 10))).toBeLessThan(1e-6);
    // No setup: the old 5 lb grid (135 → 140).
    expect(run(ex(), [three(lb(135), 12)], { jump: 'standard' }).targetWeightKg / KG_PER_LB).toBeCloseTo(140, 2);
  });

  it('his own weights the gym can no longer load are moved onto ones it can (140 lb → 145)', () => {
    setDisplayUnits('imperial');
    const lb = (n: number) => n * KG_PER_LB;
    const gym = gymPlatesFor(togglePlate(EMPTY_SETUP, 2.5, false), 'imperial')!;
    const h = [three(lb(135), 12), three(lb(140), 8, '2026-09-30'), three(lb(130), 8, '2026-09-27')];
    const t = run(ex(), h, { jump: 'standard', gym });
    expect(t.targetWeightKg / KG_PER_LB).toBeCloseTo(145, 2);
    expect(gymCanLoad(t.targetWeightKg, gym)).toBe(true);
    // Without the setup his own 140 lb rung is the next one.
    expect(run(ex(), h, { jump: 'standard' }).targetWeightKg / KG_PER_LB).toBeCloseTo(140, 2);
  });

  it('the smallest bar jump is the smallest plate on each side: 2.5 kg, 5 kg without 1.25s, 5 lb', () => {
    expect(barStepKg(EMPTY_SETUP, 'metric')).toBe(2.5);
    expect(barStepKg(togglePlate(EMPTY_SETUP, 1.25, false), 'metric')).toBe(5);
    expect(barStepKg(EMPTY_SETUP, 'imperial')).toBeCloseTo(5 * KG_PER_LB, 6);
    const none = [25, 20, 15, 10, 5, 2.5, 1.25].reduce((s, p) => togglePlate(s, p, false), EMPTY_SETUP);
    expect(barStepKg(none, 'metric')).toBeNull();
  });

  it('no 1.25 kg plates → 2.5 kg pairs = a 5 kg barbell step (60 → 65 on every setting)', () => {
    for (const jump of ['small', 'standard', 'large'] as const) {
      expect(run(ex(), [three(60, 12)], { jump, gym: noSmall }).targetWeightKg).toBe(65);
    }
    // The usual plates (2.5 kg step) keep 62.5.
    expect(run(ex(), [three(60, 12)], { jump: 'standard', gym: { barKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5, 1.25] } }).targetWeightKg).toBe(62.5);
  });

  it('a learned 2.5 kg jump the plates cannot make is rounded up to 5 kg', () => {
    const h = [three(60, 12), three(57.5, 12, '2026-09-30'), three(55, 12, '2026-09-27')];
    expect(run(ex(), h, { jump: 'standard' }).targetWeightKg).toBe(62.5);
    expect(run(ex(), h, { jump: 'standard', gym: noSmall }).targetWeightKg).toBe(65);
    expect(buildLadder([55, 57.5, 60], 'plates', { learnedStepKg: 2.5, gym: noSmall, units: 'metric' }).step).toBe(5);
  });

  it('dumbbells and machines keep their own steps', () => {
    expect(run(dumbbell(), [three(12, 12)], { gym: noSmall }).targetWeightKg).toBe(12.5);
    expect(buildLadder([12], 'dumbbell', { gym: noSmall, units: 'metric' }).step).toBeNull();
  });
});

describe('per-set goals at the same weight', () => {
  it('10, 9, 8 last time → 11, 9, 8; the line prints them', () => {
    const t = run(ex(), [sess('2026-10-03', [[40, 10], [40, 9], [40, 8]])]);
    expect(t.rule).toBe('R5');
    expect(t.setGoals).toEqual([11, 9, 8]);
    expect(targetLine(t)).toBe('40 kg · 11, 9, 8');
  });

  it('set 1 already at the top: the extra rep goes to the first set still below it', () => {
    expect(run(ex(), [sess('2026-10-03', [[40, 12], [40, 9], [40, 8]])]).setGoals).toEqual([12, 10, 8]);
    expect(run(ex(), [sess('2026-10-03', [[40, 12], [40, 12], [40, 8]])]).setGoals).toEqual([12, 12, 9]);
  });

  it('+2 when that set was logged at RPE 7 or easier, never past the top', () => {
    expect(run(ex(), [sess('2026-10-03', [[40, 9, 7], [40, 9], [40, 8]])]).setGoals).toEqual([11, 9, 8]);
    expect(run(ex(), [sess('2026-10-03', [[40, 9, 8], [40, 9], [40, 8]])]).setGoals).toEqual([10, 9, 8]);
    expect(run(ex(), [sess('2026-10-03', [[40, 11, 6], [40, 9], [40, 8]])]).setGoals).toEqual([12, 9, 8]);
  });

  it('a failure set is a working set and can take the +1', () => {
    expect(run(ex(), [sess('2026-10-03', [[40, 12], [40, 9, null, 'failure']])], { sets: 2 }).setGoals).toEqual([12, 10]);
  });

  it('more planned sets than last time: the extra ones aim for last time’s last set', () => {
    expect(run(ex(), [sess('2026-10-03', [[40, 10], [40, 9], [40, 8]])], { sets: 4 }).setGoals).toEqual([11, 9, 8, 8]);
  });

  it('a goal is never below last time’s same set', () => {
    const lasts: number[][] = [[10, 9, 8], [12, 11, 10], [8, 8, 7], [11, 10, 12], [9, 7, 5], [12, 12, 11]];
    for (const reps of lasts) {
      const t = run(ex(), [sess('2026-10-03', reps.map((r) => [40, r] as S))]);
      expect(t.change).toBeNull();
      t.setGoals.forEach((g, i) => expect(g).toBeGreaterThanOrEqual(reps[i]));
    }
  });

  it('one miss (every set under the range): last time’s numbers again', () => {
    const t = run(ex(), [sess('2026-10-03', [[40, 6], [40, 5], [40, 5]])]);
    expect(t.rule).toBe('R5');
    expect(t.setGoals).toEqual([6, 5, 5]);
    expect(t.reason).toContain('match it');
  });

  it('RPE 10 under the range is a miss; RPE 8 under it has reps to spare and is not', () => {
    expect(run(ex(), [sess('2026-10-03', [[40, 7, 10], [40, 7, 10], [40, 7, 10]])]).setGoals).toEqual([7, 7, 7]);
    // Not a miss: no set aims under the bottom of the range (review fix), so 8, 8, 8.
    expect(run(ex(), [sess('2026-10-03', [[40, 7, 8], [40, 7, 8], [40, 7, 8]])]).setGoals).toEqual([8, 8, 8]);
  });

  it('review fix: a later set never aims under the bottom of the range (10, 7, 6 in 8–12 → 11, 8, 8)', () => {
    const t = run(ex(), [sess('2026-10-03', [[60, 10], [60, 7], [60, 6]])]);
    expect(t.setGoals).toEqual([11, 8, 8]);
    expect(targetLine(t)).toBe('60 kg · 11, 8, 8');
    // The first set under the range takes the +1 and is floored too: 7, 9, 10 → 8, 9, 10.
    expect(run(ex(), [sess('2026-10-03', [[60, 7], [60, 9], [60, 10]])]).setGoals).toEqual([8, 9, 10]);
    for (const reps of [[12, 7, 5], [9, 6, 6], [10, 8, 3]]) {
      const g = run(ex(), [sess('2026-10-03', reps.map((r) => [60, r] as S))]).setGoals;
      g.forEach((x) => expect(x).toBeGreaterThanOrEqual(8));
    }
    expect(perSetGoals([{ weightKg: 60, reps: 10, rpe: null, setType: 'normal' }, { weightKg: 60, reps: 6, rpe: null, setType: 'normal' }], 2, 12, false, 8)).toEqual([11, 8]);
  });

  it('perSetGoals is PURE and empty with no sets', () => {
    expect(perSetGoals([], 3, 12, false)).toEqual([]);
  });

  it('bodyweight, assisted and pyramids keep one goal for every set', () => {
    const pull = ex({ name: 'Pull Up', equipment: 'bodyweight' });
    const b = run(pull, [sess('2026-10-03', [[0, 6], [0, 5], [0, 4]])]);
    expect(new Set(b.setGoals).size).toBe(1);
    const ramp = run(ex(), [sess('2026-10-03', [[60, 10], [70, 8], [80, 5]])], { min: 5, max: 8 });
    expect(ramp.topSetOnly).toBe(true);
    expect(new Set(ramp.setGoals).size).toBe(1);
  });
});

describe('ONE source: targetFill → fillForSet', () => {
  const t = run(ex(), [sess('2026-10-03', [[50, 10], [50, 9], [50, 8]])]);
  const fill = targetFill(t)!;

  let n = 0;
  const row = (patch: Partial<DraftSet> = {}): DraftSet => {
    n += 1;
    return { key: `r${n}`, weightKg: null, reps: null, isWarmup: false, done: false, ...patch };
  };
  const card = (sets: DraftSet[]): DraftExercise =>
    ({
      key: 'c',
      exerciseId: 'bench',
      name: 'Bench Press',
      muscleGroup: 'chest',
      equipment: 'barbell',
      previousSets: [{ weightKg: 50, reps: 10 }, { weightKg: 50, reps: 9 }, { weightKg: 50, reps: 8 }],
      sets,
    }) as DraftExercise;

  it('targetFill carries the per-set goals only when they differ', () => {
    expect(fill).toEqual({ weightKg: 50, reps: 11, setReps: [11, 9, 8], fromKg: 50 }); // C3-4: fromKg = last time's main weight
    const flat = run(ex(), [sess('2026-10-03', [[60, 12], [60, 12], [60, 11]])]);
    expect(flat.setGoals).toEqual([12, 12, 12]);
    expect(targetFill(flat)).toEqual({ weightKg: 60, reps: 12, fromKg: 60 });
  });

  it('each row hints its own goal by working-set number (warm-ups and drops not counted)', () => {
    const [w, s1, s2, d, s3] = [row({ isWarmup: true }), row(), row(), row({ setType: 'drop' }), row()];
    const c = card([w, s1, s2, d, s3]);
    expect(fillForSet(c, s1.key, fill)).toEqual({ weightKg: 50, reps: 11 });
    expect(fillForSet(c, s2.key, fill)).toEqual({ weightKg: 50, reps: 9 });
    expect(fillForSet(c, s3.key, fill)).toEqual({ weightKg: 50, reps: 8 });
    // A set beyond the goals keeps the last one.
    const extra = [row(), row(), row(), row()];
    expect(fillForSet(card(extra), extra[3].key, fill)).toEqual({ weightKg: 50, reps: 8 });
  });

  it('a weight typed in a set above carries down; the row keeps its own goal', () => {
    const [s1, s2] = [row({ weightKg: 52.5 }), row()];
    expect(fillForSet(card([s1, s2]), s2.key, fill)).toEqual({ weightKg: 52.5, reps: 9 });
  });

  it('a hint never asks for more reps than were just done at that weight', () => {
    const [s1, s2, s3] = [row({ weightKg: 50, reps: 7, done: true }), row(), row()];
    const c = card([s1, s2, s3]);
    expect(fillForSet(c, s2.key, fill)).toEqual({ weightKg: 50, reps: 7 });
    expect(fillForSet(c, s3.key, fill)).toEqual({ weightKg: 50, reps: 7 });
    // More than the goal above: the row still aims for its own goal, not the 12.
    const [a1, a2] = [row({ weightKg: 50, reps: 12, done: true }), row()];
    expect(fillForSet(card([a1, a2]), a2.key, fill)).toEqual({ weightKg: 50, reps: 9 });
    // A heavier weight done above: carried down, and capped by what was done at it.
    const [h1, h2] = [row({ weightKg: 55, reps: 6, done: true }), row()];
    expect(fillForSet(card([h1, h2]), h2.key, fill)).toEqual({ weightKg: 55, reps: 6 });
  });

  it('review fix: warm-ups follow a moved working weight (40 × 8 for 60 → 42.5 × 8 for 65)', () => {
    const h = [sess('2026-10-03', [[40, 8, null, 'warmup'], [60, 12], [60, 12], [60, 12]])];
    const up = run(ex(), h, { jump: 'large' });
    expect(up.targetWeightKg).toBe(65);
    const upFill = targetFill(up)!;
    const [w, s1] = [row({ isWarmup: true }), row()];
    const c = { ...card([w, s1]), previousSets: [{ weightKg: 60, reps: 12 }], previousWarmups: [{ weightKg: 40, reps: 8 }] } as DraftExercise;
    expect(fillForSet(c, w.key, upFill)).toEqual({ weightKg: 42.5, reps: 8 });
    expect(fillForSet(c, s1.key, upFill)).toEqual({ weightKg: 65, reps: 8 });
    // No change of working weight: last time's warm-up as it was.
    const same = run(ex(), [sess('2026-10-03', [[40, 8, null, 'warmup'], [60, 10], [60, 9], [60, 8]])]);
    expect(same.change).toBeNull();
    expect(fillForSet(c, w.key, targetFill(same))).toEqual({ weightKg: 40, reps: 8 });
    // No Target at all: last time's warm-up.
    expect(fillForSet(c, w.key, null)).toEqual({ weightKg: 40, reps: 8 });
  });

  it('warmupWeightKg: rounded down to a loadable step, never under the bar, never above the new weight', () => {
    const bar = { fromKg: 60, stepKg: 2.5, barKg: 20 };
    expect(warmupWeightKg(40, 65, bar)).toBe(42.5);
    expect(warmupWeightKg(40, 60, bar)).toBe(40);
    expect(warmupWeightKg(20, 50, bar)).toBe(20); // 20 × 50/60 = 16.7 → the empty bar
    expect(warmupWeightKg(70, 65, bar)).toBe(65); // never above the new working weight
    expect(warmupWeightKg(40, 65, { ...bar, gym: noSmall })).toBe(40); // 43.3 → the plates make 40
    expect(warmupWeightKg(10, 13, { fromKg: 12, stepKg: 2.5, barKg: null })).toBe(10); // dumbbells: 10.8 → 10
    // Pounds: 95 lb warm-up for 135 → 145: 102 → 100 lb.
    const lb = (n: number) => n * KG_PER_LB;
    expect(warmupWeightKg(lb(95), lb(145), { fromKg: lb(135), stepKg: lb(5), barKg: lb(45) }) / KG_PER_LB).toBeCloseTo(100, 4);
  });

  it('a drop row still hints its own last-time drop, never the Target', () => {
    const [s1, d] = [row({ weightKg: 50, reps: 10, done: true }), row({ setType: 'drop' })];
    const c = { ...card([s1, d]), previousSets: [{ weightKg: 50, reps: 10 }, { weightKg: 30, reps: 12, setType: 'drop' as const }] } as DraftExercise; // C1-3: drops are typed
    expect(fillForSet(c, d.key, fill)).toEqual({ weightKg: 30, reps: 12 });
  });
});

describe('Rep range', () => {
  const bench = ex();
  const press = ex({ name: 'Dumbbell Shoulder Press', equipment: 'dumbbell', isCompound: true });
  const curl = dumbbell();

  it('each choice by kind of exercise; Match my goal keeps the routine row', () => {
    expect(choiceRepRange(bench, 'strength')).toEqual({ repRangeMin: 3, repRangeMax: 6 });
    expect(choiceRepRange(press, 'strength')).toEqual({ repRangeMin: 6, repRangeMax: 10 });
    expect(choiceRepRange(curl, 'strength')).toEqual({ repRangeMin: 6, repRangeMax: 10 });
    expect(choiceRepRange(bench, 'muscle')).toEqual({ repRangeMin: 6, repRangeMax: 10 });
    expect(choiceRepRange(press, 'muscle')).toEqual({ repRangeMin: 8, repRangeMax: 12 });
    expect(choiceRepRange(curl, 'muscle')).toEqual({ repRangeMin: 10, repRangeMax: 15 });
    for (const e of [bench, press, curl]) expect(choiceRepRange(e, 'higher')).toEqual({ repRangeMin: 12, repRangeMax: 20 });
    expect(choiceRepRange(bench, 'goal')).toBeNull();
  });

  it('review fix: Match my goal keeps every row; any other choice sets EVERY row (a program row too)', () => {
    expect(rangeForRow({ repRangeMin: 6, repRangeMax: 10 }, bench, 'goal')).toEqual({ repRangeMin: 6, repRangeMax: 10 });
    expect(rangeForRow({ repRangeMin: 5, repRangeMax: 8 }, bench, 'goal')).toEqual({ repRangeMin: 5, repRangeMax: 8 });
    expect(rangeForRow({ repRangeMin: 6, repRangeMax: 10 }, bench, 'strength')).toEqual({ repRangeMin: 3, repRangeMax: 6 });
    // A row with a range of its own (a program's 5–8) follows the choice too.
    expect(rangeForRow({ repRangeMin: 5, repRangeMax: 8 }, bench, 'strength')).toEqual({ repRangeMin: 3, repRangeMax: 6 });
    expect(rangeForRow({ repRangeMin: 8, repRangeMax: 12 }, curl, 'higher')).toEqual({ repRangeMin: 12, repRangeMax: 20 });
    expect(rangeForRow({ repRangeMin: 4, repRangeMax: 6 }, curl, 'muscle')).toEqual({ repRangeMin: 10, repRangeMax: 15 });
  });

  it('a Higher-reps range changes the Target the same way any range does', () => {
    const r = choiceRepRange(curl, 'higher')!;
    const t = computeProgressionTarget({ exercise: curl, target: { targetSets: 3, ...r }, history: [three(10, 15)], todayISO: TODAY });
    expect(t.rule).toBe('R5');
    expect(t.targetRepsMin).toBe(12);
    expect(t.setGoals).toEqual([16, 15, 15]);
  });
});

describe('the two settings: saved, guarded, and part of the Target query', () => {
  it('defaults: Standard and Match my goal; unknown values fall back', () => {
    const st = useTrackerPrefs.getState();
    expect(st.weightJump).toBe('standard');
    expect(st.repRange).toBe('goal');
    st.setWeightJump('huge' as never);
    expect(useTrackerPrefs.getState().weightJump).toBe('standard');
    st.setRepRange('powerlifting' as never);
    expect(useTrackerPrefs.getState().repRange).toBe('goal');
    st.setWeightJump('large');
    st.setRepRange('higher');
    expect(useTrackerPrefs.getState()).toMatchObject({ weightJump: 'large', repRange: 'higher' });
    st.setWeightJump('standard');
    st.setRepRange('goal');
    expect(['small', 'standard', 'large'].every(isWeightJump)).toBe(true);
    expect(['goal', 'strength', 'muscle', 'higher'].every(isRepRangeChoice)).toBe(true);
    expect(isWeightJump('medium')).toBe(false);
    expect(isRepRangeChoice('power')).toBe(false);
  });

  it('a saved blob from before keeps the defaults; an unknown saved value falls back to them', () => {
    const merge = useTrackerPrefs.persist.getOptions().merge!;
    const now = { ...useTrackerPrefs.getInitialState() };
    expect(merge({ sounds: false }, now)).toMatchObject({ weightJump: 'standard', repRange: 'goal' });
    expect(merge({ weightJump: 'small', repRange: 'strength' }, now)).toMatchObject({ weightJump: 'small', repRange: 'strength' });
    expect(merge({ weightJump: 'giant', repRange: 7 }, now)).toMatchObject({ weightJump: 'standard', repRange: 'goal' });
  });

  it('a change of either setting, or of the plates, changes the query signature', () => {
    const base = { easy: false, effort: false, units: 'metric' as const, previousFrom: 'any' as const };
    const sig = (o: object) => querySignature(targetQuery('day', [{ key: 'k', exerciseId: 'bench' }], { ...base, ...o }));
    const std = sig({ jump: 'standard', repRange: 'goal', gym: null });
    expect(sig({ jump: 'large', repRange: 'goal', gym: null })).not.toBe(std);
    expect(sig({ jump: 'standard', repRange: 'strength', gym: null })).not.toBe(std);
    expect(sig({ jump: 'standard', repRange: 'goal', gym: noSmall })).not.toBe(std);
    // Absent = the saved settings and plates (the default setup = no gym: his own steps).
    const q = targetQuery('day', [], base);
    expect(q).toMatchObject({ jump: 'standard', repRange: 'goal', gym: null });
  });
});

describe('the words on the settings page', () => {
  it('three jump sizes and four ranges, the default tagged Recommended, each with one plain line', () => {
    expect(WEIGHT_JUMP_CHOICES.map((c) => c.label)).toEqual(['Small', 'Standard', 'Large']);
    expect(WEIGHT_JUMP_CHOICES.filter((c) => c.recommended).map((c) => c.value)).toEqual(['standard']);
    expect(WEIGHT_JUMP_CHOICES.map((c) => c.detail)).toEqual(['About 2.5% more each time', 'About 5% more each time', 'About 10% more each time']);
    expect(WEIGHT_JUMP_HELP).toBe("How much to add when you reach the top of your reps. On barbell lifts we use your gym's smallest plates.");
    expect(REP_RANGE_KEEP).toBe('Match my goal keeps the range each exercise has in its routine. Any other choice sets the range for every exercise.');
    expect(REP_RANGE_KEEP).not.toContain('set yourself');
    // Member-visible words never say "volume", "PR" or "session".
    const words = [WEIGHT_JUMP_HELP, REP_RANGE_KEEP, REP_RANGE_HELP, ...REP_RANGE_CHOICES.map((c) => c.detail), ...WEIGHT_JUMP_CHOICES.map((c) => c.detail)].join(' ');
    expect(words).not.toMatch(/volume|\bPR\b|session/i);
    expect(REP_RANGE_CHOICES.map((c) => c.label)).toEqual(['Match my goal', 'Strength', 'Muscle', 'Higher reps']);
    expect(REP_RANGE_CHOICES.filter((c) => c.recommended).map((c) => c.value)).toEqual(['goal']);
    expect(REP_RANGE_HELP).toBe('Muscle grows in any of these if you finish close to your limit. Strength likes fewer reps.');
    expect(choiceLabel(REP_RANGE_CHOICES, 'higher')).toBe('Higher reps');
    expect(choiceLabel(WEIGHT_JUMP_CHOICES, 'odd' as WeightJump)).toBe('Small');
  });
});
