/**
 * 16 Oct 2026 end-to-end audit, C3 (routines and suggestions) — the Target engine.
 * Audit/e2e-v2/C3-routines-suggestions.md. Each test failed on the code before its fix.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { KG_PER_LB, setDisplayUnits } from '@/lib/units';
import { computeProgressionTarget, targetLine, type ProgSession, type ProgSetType, type WeightJump } from '@/tracker/engine/progression';
import type { Exercise } from '@/types/models';

afterEach(() => setDisplayUnits('metric'));

const TODAY = '2026-10-06';

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'e1',
    name: 'Squat',
    aliases: [],
    muscleGroup: 'quads',
    secondaryMuscles: [],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 2.5,
    ...over,
  };
}
const dumbbell = () => ex({ name: 'Dumbbell Press', equipment: 'dumbbell', isCompound: false });

type S = [number, number] | [number, number, number | null] | [number, number, number | null, ProgSetType];
function sess(dateISO: string, sets: S[]): ProgSession {
  return { dateISO, sets: sets.map(([weightKg, reps, rpe = null, setType = 'normal']) => ({ weightKg, reps, rpe, setType })) };
}
const three = (kg: number, reps: number, d: string) => sess(d, [[kg, reps], [kg, reps], [kg, reps]]);
/** `n` dates going back two days at a time from 3 Oct 2026, newest first. */
function dates(n: number): string[] {
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 9, 3 - 2 * i)).toISOString().slice(0, 10));
}

function run(
  exercise: Exercise,
  history: ProgSession[],
  opts: { min?: number; max?: number; sets?: number; jump?: WeightJump; ladder?: number[]; gym?: { barKg: number; platesKg: number[] } } = {},
) {
  return computeProgressionTarget({
    exercise,
    target: { targetSets: opts.sets ?? 3, repRangeMin: opts.min ?? 8, repRangeMax: opts.max ?? 12 },
    history,
    todayISO: TODAY,
    jump: opts.jump,
    ...(opts.gym ? { gym: opts.gym } : {}),
    ...(opts.ladder ? { ladder: opts.ladder } : {}),
  });
}

describe('C3-1: a typo or an old far-away weight never becomes the next step', () => {
  // Three years of squats 60 … 140 kg in 2.5s, plus one typo of 1400 kg.
  const ladder = [...Array.from({ length: 33 }, (_, i) => 60 + 2.5 * i), 1400];

  it('140 kg x 16 with a 1400 kg typo in the ladder: 145 kg, never "Time for 1400 kg"', () => {
    const t = run(ex(), [three(140, 16, '2026-10-03')], { ladder });
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(145);
    expect(t.reason).not.toContain('1400');
    expect(t.reason).not.toContain('big jump');
  });

  it('140 kg x 12 (not past the big-jump escape) also moves to 145, never "Add reps first"', () => {
    const t = run(ex(), [three(140, 12, '2026-10-03')], { ladder });
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(145);
  });

  it('a 22.5 kg dumbbell with a 225 kg typo: the next dumbbell, 25 kg', () => {
    const t = run(dumbbell(), [three(22.5, 12, '2026-10-03')], { ladder: [15, 17.5, 20, 22.5, 225] });
    expect(t.targetWeightKg).toBe(25);
  });

  it('an old 140 kg from before an injury: 100 x 16 now goes to 105, not 140', () => {
    const t = run(ex(), [three(100, 16, '2026-10-03')], { ladder: [80, 85, 90, 95, 100, 140] });
    expect(t.targetWeightKg).toBe(105);
    expect(t.change).toBe('up');
  });

  it('his own next rung one step away is still used (50 → 55 on a 5 kg ladder)', () => {
    const t = run(ex(), [three(50, 12, '2026-10-03')], { ladder: [40, 45, 50, 55, 60], jump: 'small' });
    expect(t.targetWeightKg).toBe(55);
  });
});

describe('C3-2: heavy and light days never teach a 20 kg step', () => {
  it('alternating 100-105 and 80-85 kg, then 105 x 12, 12, 12: Standard gives 110, not 125', () => {
    const d = dates(8);
    const h = [
      three(105, 12, d[0]),
      three(85, 12, d[1]),
      three(105, 10, d[2]),
      three(85, 10, d[3]),
      three(100, 12, d[4]),
      three(80, 12, d[5]),
      three(100, 10, d[6]),
      three(80, 10, d[7]),
    ];
    const t = run(ex(), h, { jump: 'standard' });
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBeGreaterThanOrEqual(107.5);
    expect(t.targetWeightKg).toBeLessThanOrEqual(110);
    expect(t.warm?.stepKg ?? 0).toBeLessThanOrEqual(5);
  });

  it('a real repeated 2.5 kg jump is still learned', () => {
    const d = dates(4);
    const h = [three(67.5, 12, d[0]), three(65, 12, d[1]), three(62.5, 12, d[2]), three(60, 12, d[3])];
    expect(run(ex(), h, { jump: 'small' }).targetWeightKg).toBe(70);
  });
});

describe('C3-6: after a unit switch the Up weight is one the plates can load', () => {
  it('135 lb shown in kg → 62.5 or 65 kg, never 66.2', () => {
    const lb135 = 135 * KG_PER_LB;
    const t = run(ex(), [three(lb135, 12, '2026-10-03')], { jump: 'large' });
    expect([62.5, 65]).toContain(t.targetWeightKg);
    expect(t.reason).toMatch(/Time for (62\.5|65) kg\./);
  });

  it('60 kg shown in lb → a multiple of 5 lb, never 137.3', () => {
    setDisplayUnits('imperial');
    const t = run(ex(), [three(60, 12, '2026-10-03')], { jump: 'large' });
    const lb = t.targetWeightKg / KG_PER_LB;
    expect(Math.abs(lb / 5 - Math.round(lb / 5))).toBeLessThan(1e-3);
    expect(lb).toBeGreaterThan(132.3);
  });

  it('300 lb leg press in kg → a clean kg weight', () => {
    const t = run(ex({ name: 'Leg Press', equipment: 'machine', isCompound: true }), [three(300 * KG_PER_LB, 12, '2026-10-03')], { jump: 'standard' });
    expect(Math.abs(t.targetWeightKg * 2 - Math.round(t.targetWeightKg * 2))).toBeLessThan(1e-6);
    expect(t.targetWeightKg).toBeGreaterThan(300 * KG_PER_LB);
  });
});

describe('C3-7: "Weight jumps" works past the top of his ladder — with a custom Plates and bars setup', () => {
  const d = dates(4);
  const h = [three(60, 12, d[0]), three(55, 12, d[1]), three(50, 12, d[2]), three(45, 12, d[3])];
  // A Plates and bars setup the member changed (passed only then): its smallest pair is 2.5 kg.
  const gym = { barKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5, 1.25] };
  it('custom setup: Small 62.5, Standard 62.5, Large 65', () => {
    expect(run(ex({ name: 'Bench Press' }), h, { jump: 'small', gym }).targetWeightKg).toBe(62.5);
    expect(run(ex({ name: 'Bench Press' }), h, { jump: 'standard', gym }).targetWeightKg).toBe(62.5);
    expect(run(ex({ name: 'Bench Press' }), h, { jump: 'large', gym }).targetWeightKg).toBe(65);
    expect(targetLine(run(ex({ name: 'Bench Press' }), h, { jump: 'small', gym }))).toBe('62.5 kg · aim for 8');
  });
  it('no setup (owner decision, review of 8b7c0c9): his own learned 5 kg step — 65 on every setting', () => {
    for (const jump of ['small', 'standard', 'large'] as const) expect(run(ex({ name: 'Bench Press' }), h, { jump }).targetWeightKg).toBe(65);
  });
});

describe('C3-4: back-off sets — the top sets are judged on their own', () => {
  it('2 x 100 x 6 + 2 x 80 x 10 back-offs, 4-set routine, range 4–6, at the top: Up', () => {
    const d = dates(6);
    const h = d.map((x) => sess(x, [[100, 6], [100, 6], [80, 10], [80, 10]]));
    const t = run(ex(), h, { min: 4, max: 6, sets: 4 });
    expect(t.change).toBe('up');
    expect(t.rule).toBe('R2');
  });

  it('3 x 100 x 5 + 2 x 80 back-offs, 5 sets, range 3–5: Up', () => {
    const h = dates(3).map((x) => sess(x, [[100, 5], [100, 5], [100, 5], [80, 8], [80, 8]]));
    expect(run(ex(), h, { min: 3, max: 5, sets: 5 }).change).toBe('up');
  });

  it('one cut-short workout is still not enough to move up', () => {
    const t = run(ex(), [sess('2026-10-03', [[100, 6]])], { min: 4, max: 6, sets: 4 });
    expect(t.change).not.toBe('up');
  });
});

describe('C3-8: the longer the break, the lighter the start', () => {
  const h = (d: string) => [three(140, 5, d)];
  it('6 weeks: about 10% lighter; 15 weeks: about 20%; a year: about 30%', () => {
    const six = run(ex(), h('2026-08-25'), { min: 3, max: 5 }).targetWeightKg;
    const fifteen = run(ex(), h('2026-06-23'), { min: 3, max: 5 }).targetWeightKg;
    const year = run(ex(), h('2025-09-20'), { min: 3, max: 5 }).targetWeightKg;
    expect(six).toBeGreaterThanOrEqual(125);
    expect(six).toBeLessThan(140);
    expect(fifteen).toBeLessThanOrEqual(115);
    expect(fifteen).toBeGreaterThanOrEqual(105);
    expect(year).toBeLessThanOrEqual(100);
    expect(year).toBeGreaterThanOrEqual(90);
  });
});

describe('C3-9: a changed rep range is never read as a failure', () => {
  it('4 x 100 x 5 then Higher reps (12–20): no "Reps fell", a weight for about 12 reps', () => {
    const h = dates(4).map((x) => three(100, 5, x));
    const t = run(ex(), h, { min: 12, max: 20 });
    expect(t.reason).not.toContain('fell');
    expect(t.targetWeightKg).toBeLessThanOrEqual(85);
    expect(t.targetWeightKg).toBeGreaterThanOrEqual(75);
    expect(t.reason).toContain('well under 12–20');
  });

  it('60 x 10 then Strength (3–6): never more than one size step, aim for the top of the new range', () => {
    const t = run(ex(), [three(60, 10, '2026-10-03')], { min: 3, max: 6 });
    expect(t.targetWeightKg).toBeLessThanOrEqual(63);
    expect(t.targetWeightKg).toBeGreaterThanOrEqual(60);
    expect(t.repGoal).toBe(6);
  });
});

describe('C3-12: one cut-short workout does not set every goal', () => {
  it('8, 8, 8 then a single 4: the goals come from the last full workout (9, 8, 8)', () => {
    const t = run(ex(), [sess('2026-10-03', [[100, 4]]), three(100, 8, '2026-10-01')]);
    expect(t.setGoals).toEqual([9, 8, 8]);
  });
});

describe('C3-13: an extra set beyond the routine never blocks progress', () => {
  it('3-set routine, 12, 12, 12 and an extra 9: Up', () => {
    const t = run(ex(), [sess('2026-10-03', [[60, 12], [60, 12], [60, 12], [60, 9]])]);
    expect(t.change).toBe('up');
  });
});

describe('C3-14: the reason names the weight the line shows', () => {
  it('135 lb history shown in kg: the reason says 60 kg, never 61.23', () => {
    const t = run(ex(), [three(135 * KG_PER_LB, 10, '2026-10-03')]);
    expect(t.reason).not.toContain('61.2');
    expect(t.reason).toContain('60 kg');
  });
});

describe('C3-19: the first plank workout with a short last hold', () => {
  it('60, 60, 30 s: never "Time for 35 s"', () => {
    const plank = ex({ name: 'Plank', equipment: 'bodyweight' });
    const t = computeProgressionTarget({
      exercise: plank,
      target: { targetSets: 3, repRangeMin: 8, repRangeMax: 12 },
      history: [{ dateISO: '2026-10-03', sets: [60, 60, 30].map((s) => ({ weightKg: 0, reps: 0, rpe: null, setType: 'normal' as const, durationSec: s })) }],
      todayISO: TODAY,
      logType: 'time',
    });
    expect(t.holdSec).toBeGreaterThanOrEqual(60);
  });
});

describe('C3-15: "Add warm-up sets" never goes under the empty bar, and uses the gym\'s plates', () => {
  it('bench 40 kg: no 15 kg warm-up; 95 lb: no 40 lb', async () => {
    const { computeWarmups } = await import('@/tracker/services/warmupMath');
    const kg = computeWarmups(40, 2.5, undefined, { barKg: 20 }).map((w) => w.weightKg);
    expect(Math.min(...kg)).toBeGreaterThanOrEqual(20);
    expect(new Set(kg).size).toBe(kg.length);
    setDisplayUnits('imperial');
    const lb = computeWarmups(95 * KG_PER_LB, 2.5, undefined, { barKg: 45 * KG_PER_LB }).map((w) => w.weightKg / KG_PER_LB);
    expect(Math.min(...lb)).toBeGreaterThanOrEqual(45 - 1e-6);
  });

  it('no 1.25 kg plates: every warm-up for 60 kg is loadable (never 47.5)', async () => {
    const { computeWarmups } = await import('@/tracker/services/warmupMath');
    const gym = { barKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5] };
    const kg = computeWarmups(60, 2.5, undefined, { barKg: 20, gym }).map((w) => w.weightKg);
    for (const w of kg) expect(((w - 20) / 5) % 1).toBe(0);
  });
});

describe('C3-16: an EZ-bar warm-up lighter than the 20 kg bar stays light', () => {
  it('last warm-up 12.5 kg for 25 kg, Target 27.5: warm-up about 12.5, never 20', async () => {
    const { warmupWeightKg } = await import('@/tracker/engine/progression');
    expect(warmupWeightKg(12.5, 27.5, { fromKg: 25, stepKg: 2.5, barKg: 20 })).toBe(12.5);
    // A straight bar's 20 kg warm-up stays at least the bar.
    expect(warmupWeightKg(20, 65, { fromKg: 60, stepKg: 2.5, barKg: 20 })).toBe(20);
  });
});

describe('C3-27: a routine\'s planned weight from a lb routine reads on kg plates', () => {
  it('135 lb planned, shown in kg: 60 kg, never 61.2', async () => {
    const { plannedWeightKg } = await import('@/tracker/engine/weightLadder');
    expect(plannedWeightKg(135 * KG_PER_LB, 'barbell', 'metric')).toBe(60);
    expect(plannedWeightKg(80, 'barbell', 'metric')).toBe(80);
  });
});
