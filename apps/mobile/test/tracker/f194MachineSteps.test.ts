/**
 * F194 (owner R-352, 5 Nov 2026): Settings -> Plates and bars -> "Machine and cable steps". Learn from
 * my weights (default, today's guess) / 2.5 kg / 5 kg. A machine's or cable's suggested weight is then
 * only a weight on that grid, and a jump up on a 5 kg stack is 5 kg, never 2.5 (rule A, R-350: every
 * set at the top -> the next weight by "Weight jumps"). Free weights keep their own rules.
 */
import { describe, expect, it } from 'vitest';

import { computeProgressionTarget, type ProgSession, type WeightJump } from '@/tracker/engine/progression';
import { buildLadder, isMachineStep, jumpRungKg, machineStepKg, type MachineStep } from '@/tracker/engine/weightLadder';
import { MACHINE_STEP_CHOICES, MACHINE_STEP_HELP, MACHINE_STEP_WHY } from '@/tracker/services/targetChoices';
import type { Exercise } from '@/types/models';

const TODAY = '2026-11-07';

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'cglp',
    name: 'Close-Grip Lat Pulldown',
    aliases: [],
    muscleGroup: 'back',
    secondaryMuscles: [],
    equipment: 'cable',
    isCompound: true,
    incrementKg: 2.5,
    ...over,
  };
}
/** n days before 6 Nov 2026. */
const day = (n: number): string => new Date(Date.UTC(2026, 10, 6) - n * 86400000).toISOString().slice(0, 10);
const sess = (dateISO: string, sets: [number, number][]): ProgSession => ({
  dateISO,
  sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, rpe: null, setType: 'normal' as const })),
});
const three = (kg: number, reps: number): [number, number][] => [
  [kg, reps],
  [kg, reps],
  [kg, reps],
];
const range = { targetSets: 3, repRangeMin: 8, repRangeMax: 12 };
const run = (
  history: ProgSession[],
  machineStep?: MachineStep,
  more: { exercise?: Exercise; jump?: WeightJump; ladder?: number[] } = {},
) =>
  computeProgressionTarget({
    exercise: more.exercise ?? ex(),
    target: range,
    history,
    todayISO: TODAY,
    jump: more.jump ?? 'standard',
    ...(machineStep ? { machineStep } : {}),
    ...(more.ladder ? { ladder: more.ladder } : {}),
  });
const onGrid = (kg: number, g: number): boolean => Math.abs(kg / g - Math.round(kg / g)) < 1e-9;

describe('F194: the setting and its words', () => {
  it('knows its three choices, Learn first and recommended', () => {
    expect(MACHINE_STEP_CHOICES.map((c) => c.label)).toEqual(['Learn from my weights', '2.5 kg', '5 kg']);
    expect(MACHINE_STEP_CHOICES[0].value).toBe('learn');
    expect(MACHINE_STEP_CHOICES[0].recommended).toBe(true);
    expect(isMachineStep('kg5')).toBe(true);
    expect(isMachineStep('5')).toBe(false);
    expect(isMachineStep(undefined)).toBe(false);
    expect(machineStepKg('kg2_5')).toBe(2.5);
    expect(machineStepKg('kg5')).toBe(5);
    expect(machineStepKg('learn')).toBeNull();
    expect(machineStepKg('nonsense')).toBeNull();
  });

  it('member words: no banned words', () => {
    const all = [MACHINE_STEP_HELP, MACHINE_STEP_WHY, ...MACHINE_STEP_CHOICES.flatMap((c) => [c.label, c.detail])].join(' ');
    expect(all).not.toMatch(/\bvolume\b|\bPR\b|\bsession\b|\bstack\b/i);
  });
});

describe('F194 happy path: a cable at the top of its reps (rule A)', () => {
  const last = [sess(day(2), three(50, 12))];

  it('Learn from my weights = today: 50 -> 52.5 kg (the catalogue step)', () => {
    const t = run(last, 'learn');
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(52.5);
    // Absent = the same as Learn.
    expect(run(last).targetWeightKg).toBe(52.5);
  });

  it('5 kg: 50 -> 55 kg, never 52.5', () => {
    const t = run(last, 'kg5');
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(55);
    expect(t.reason).toContain('55 kg');
    expect(t.reason).not.toContain('52.5');
  });

  it('2.5 kg: 50 -> 52.5 kg', () => {
    expect(run(last, 'kg2_5').targetWeightKg).toBe(52.5);
  });

  it('5 kg with every "Weight jumps" choice: at least one 5 kg step, the heaviest one inside the share', () => {
    const h = [sess(day(2), three(100, 12))];
    expect(run(h, 'kg5', { jump: 'small' }).targetWeightKg).toBe(105);
    expect(run(h, 'kg5', { jump: 'standard' }).targetWeightKg).toBe(105);
    expect(run(h, 'kg5', { jump: 'large' }).targetWeightKg).toBe(110);
    const light = [sess(day(2), three(20, 12))];
    expect(run(light, 'kg5', { jump: 'small' }).targetWeightKg).toBe(25);
    expect(run(light, 'kg2_5', { jump: 'small' }).targetWeightKg).toBe(22.5);
  });

  it('a machine follows it too (a 5 kg catalogue step keeps 5 kg under Learn)', () => {
    const m = ex({ id: 'mlp', name: 'Machine Lat Pulldown', equipment: 'machine', incrementKg: 5 });
    expect(run(last, 'learn', { exercise: m }).targetWeightKg).toBe(55);
    expect(run(last, 'kg2_5', { exercise: m }).targetWeightKg).toBe(52.5);
    expect(run(last, 'kg5', { exercise: m }).targetWeightKg).toBe(55);
  });

  it('under the top: same weight, whatever the setting', () => {
    const h = [sess(day(2), three(50, 10))];
    for (const m of ['learn', 'kg2_5', 'kg5'] as const) {
      const t = run(h, m);
      expect(t.targetWeightKg).toBe(50);
      expect(t.change).not.toBe('up');
    }
  });
});

describe('F194 negative: free weights keep their own rules', () => {
  const last = [sess(day(2), three(60, 12))];
  for (const equipment of ['barbell', 'dumbbell', 'other'] as const) {
    it(`${equipment}: 2.5 kg and 5 kg change nothing`, () => {
      const e = ex({ id: equipment, name: equipment, equipment, incrementKg: 2.5 });
      const a = run(last, 'learn', { exercise: e });
      const b = run(last, 'kg5', { exercise: e });
      const c = run(last, 'kg2_5', { exercise: e });
      expect(b.targetWeightKg).toBe(a.targetWeightKg);
      expect(c.targetWeightKg).toBe(a.targetWeightKg);
      expect(b.reason).toBe(a.reason);
    });
  }

  it('a pound ladder is not touched (the choices are kg)', () => {
    const l5 = buildLadder([45.359], 'own', { units: 'imperial', stackStepKg: 5, catalogStepKg: 2.5 });
    const l0 = buildLadder([45.359], 'own', { units: 'imperial', catalogStepKg: 2.5 });
    expect(l5.rungs).toEqual(l0.rungs);
    expect(l5.step).toBe(l0.step);
  });

  it('a dumbbell ladder ignores a stack step even if one is passed', () => {
    const a = buildLadder([20, 22.5], 'dumbbell', { units: 'metric', stackStepKg: 5 });
    const b = buildLadder([20, 22.5], 'dumbbell', { units: 'metric' });
    expect(a).toEqual(b);
  });
});

describe('F194: setting changed mid-history', () => {
  // He logged in 2.5 kg steps for weeks, then told the app his gym's cables go up 5 kg.
  const history = [
    sess(day(2), three(52.5, 12)),
    sess(day(5), three(50, 12)),
    sess(day(9), three(47.5, 12)),
    sess(day(12), three(45, 12)),
  ];

  it('Learn keeps his 2.5 kg steps: 52.5 -> 55', () => {
    expect(run(history, 'learn').targetWeightKg).toBe(55);
  });

  it('5 kg from an off-grid 52.5: the next real weight, 55 (never 57.5)', () => {
    expect(run(history, 'kg5').targetWeightKg).toBe(55);
  });

  it('5 kg from 50 at the top: 55, though he once logged 52.5', () => {
    const h = [sess(day(2), three(50, 12)), sess(day(5), three(52.5, 9)), sess(day(9), three(47.5, 12))];
    expect(run(h, 'learn').targetWeightKg).toBe(52.5);
    expect(run(h, 'kg5').targetWeightKg).toBe(55);
  });

  it('a step lighter (under the bottom twice) lands on the grid too', () => {
    const h = [sess(day(2), three(50, 6)), sess(day(5), three(50, 6)), sess(day(9), three(45, 12))];
    const t = run(h, 'kg5');
    expect(t.rule).toBe('R3');
    expect(t.targetWeightKg).toBe(45);
    const h2 = [sess(day(2), three(52.5, 6)), sess(day(5), three(52.5, 6))];
    const t2 = run(h2, 'kg5');
    expect(t2.rule).toBe('R3');
    expect(onGrid(t2.targetWeightKg!, 5)).toBe(true);
    expect(t2.targetWeightKg!).toBeLessThan(52.5);
  });

  it('back to Learn gives exactly today again', () => {
    const a = run(history, 'learn');
    run(history, 'kg5');
    expect(run(history, 'learn')).toEqual(a);
    expect(run(history)).toEqual(a);
  });
});

describe('F194 edge cases', () => {
  it('no history: no weight is made up, whatever the setting', () => {
    const a = run([], 'learn');
    const b = run([], 'kg5');
    expect(b.targetWeightKg).toBe(a.targetWeightKg);
    expect(b.rule).toBe(a.rule);
  });

  it('mixed steps (40, 42.5, 45, 50, 55, 57.5): 5 kg uses only multiples of 5', () => {
    const ladder = [40, 42.5, 45, 50, 55, 57.5];
    const l = buildLadder(ladder, 'own', { units: 'metric', stackStepKg: 5, catalogStepKg: 2.5 });
    expect(l.own).toEqual([40, 45, 50, 55]);
    expect(l.rungs.every((r) => onGrid(r, 5))).toBe(true);
    expect(l.step).toBe(5);
    expect(jumpRungKg(55, 0.05, l)).toBe(60);
    expect(run([sess(day(2), three(55, 12))], 'kg5', { ladder }).targetWeightKg).toBe(60);
    // Learn keeps his own 57.5.
    expect(run([sess(day(2), three(55, 12))], 'learn', { ladder }).targetWeightKg).toBe(57.5);
  });

  it('every weight 5..200 kg, every jump: 5 kg goes up by whole 5s, 2.5 kg by whole 2.5s', () => {
    for (let w = 5; w <= 200; w += 5) {
      for (const share of [0.025, 0.05, 0.1]) {
        const l5 = buildLadder([w], 'own', { units: 'metric', stackStepKg: 5, catalogStepKg: 2.5 });
        const up5 = jumpRungKg(w, share, l5);
        expect(onGrid(up5, 5)).toBe(true);
        expect(up5 - w).toBeGreaterThanOrEqual(5 - 1e-9);
        const l2 = buildLadder([w], 'own', { units: 'metric', stackStepKg: 2.5, catalogStepKg: 5 });
        const up2 = jumpRungKg(w, share, l2);
        expect(onGrid(up2, 2.5)).toBe(true);
        expect(up2).toBeGreaterThan(w);
      }
    }
  });

  it('500 workouts of history: on the grid, and quick', () => {
    const history: ProgSession[] = [];
    const ladder: number[] = [];
    for (let i = 0; i < 500; i++) {
      const kg = 30 + ((i * 7) % 17) * 2.5; // 30 .. 70 in 2.5s, mixed
      history.push(sess(day(2 + i), three(kg, 8 + (i % 5))));
      ladder.push(kg, kg, kg);
    }
    history[0] = sess(day(2), three(62.5, 12));
    const started = Date.now();
    const t5 = run(history, 'kg5', { ladder });
    const t2 = run(history, 'kg2_5', { ladder });
    const tl = run(history, 'learn', { ladder });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(t5.targetWeightKg).toBe(65);
    expect(onGrid(t2.targetWeightKg!, 2.5)).toBe(true);
    expect(t2.targetWeightKg!).toBeGreaterThan(62.5);
    expect(tl.targetWeightKg!).toBeGreaterThan(62.5);
  });
});
