/**
 * R-300 / R-301 / R-303 / R-304 / R-306 / R-307 / R-308 (owner, 3 Nov 2026): per-set goals on every
 * same-weight rule, rep goals that follow "Weight jumps", a step back that asks first (with goals per
 * set and a visible reason), the missed goal again after a short day, and live chasing on the NEXT set.
 */
import { describe, expect, it } from 'vitest';

import {
  applyStepBack,
  computeProgressionTarget,
  growGoals,
  stepBackGoals,
  withoutStepBack,
  type ProgSession,
  type ProgSet,
  type StuckChoice,
  type WeightJump,
} from '@/tracker/engine/progression';
import { kgLiveLine, kgPlan, kgProgress, repLiveLine, type KgPlan, type KgRow } from '@/tracker/lib/kgTarget';
import { dropLine, showStepBack, stepBackAsk } from '@/tracker/lib/stepBack';
import { STUCK_CHOICES } from '@/tracker/services/targetChoices';
import { cleanStepBackChoices } from '@/tracker/store/trackerPrefsStore';
import type { Exercise } from '@/types/models';

const base: Exercise = { id: 'e1', name: 'Lateral Raise', aliases: [], muscleGroup: 'shoulders', secondaryMuscles: [], equipment: 'dumbbell', isCompound: false, incrementKg: 2.5 };
const set = (weightKg: number, reps: number, rpe: number | null = null): ProgSet => ({ weightKg, reps, rpe, setType: 'normal' });
const sess = (dateISO: string, sets: ProgSet[]): ProgSession => ({ dateISO, sets });

describe('R-307: the lateral raise, rep goals follow Weight jumps (big next step, so R2b)', () => {
  const lat: Exercise = { ...base, equipment: 'machine', incrementKg: 5 };
  const prev = sess('2026-10-20', [set(20, 19, 9), set(20, 16, 9), set(20, 15, 9.5), set(20, 14, 9)]);
  const run = (jump: WeightJump) =>
    computeProgressionTarget({
      exercise: lat,
      target: { targetSets: 4, repRangeMin: 10, repRangeMax: 15 },
      history: [prev],
      todayISO: '2026-10-27',
      ladder: [20, 25],
      jump,
    });
  const kg = (jump: WeightJump) => kgPlan(run(jump), prev.sets)!.total;

  it('Small: 19, 17, 16, 14 = 1,320 kg', () => {
    const t = run('small');
    expect(t.rule).toBe('R2b');
    expect(t.targetWeightKg).toBe(20);
    expect(t.setGoals).toEqual([19, 17, 16, 14]);
    expect(kg('small')).toBe(1320);
    expect(t.reason).toContain('aim for 19, 17, 16, 14');
  });

  it('Standard: 19, 17, 16, 15 = 1,340 kg', () => {
    expect(run('standard').setGoals).toEqual([19, 17, 16, 15]);
    expect(kg('standard')).toBe(1340);
    expect(run('standard').reason).toContain('aim for 19, 17, 16, 15');
  });

  it('Large: capped at +1 a set, so the same as Standard (set 1 is at the R2b cap, 15 + 4)', () => {
    expect(run('large').setGoals).toEqual([19, 17, 16, 15]);
    expect(kg('large')).toBe(1340);
  });

  it('never asks a set for fewer reps than it did (the old flat 17 asked set 1 for 2 fewer)', () => {
    for (const j of ['small', 'standard', 'large'] as const) run(j).setGoals.forEach((g, i) => expect(g).toBeGreaterThanOrEqual(prev.sets[i].reps));
  });
});

describe('R-307: growGoals (PURE)', () => {
  it('a set at RPE 7 or easier can take +2; RPE 10 sets come last; held sets get none', () => {
    const sets = [set(60, 10, 10), set(60, 9, 7), set(60, 8)];
    // 27 reps, Large +10% -> 30: set 2 (+2, easy) first, then set 3 (+1); set 1 at RPE 10 not needed.
    expect(growGoals(sets, 3, 12, 8, 0.1)).toEqual([10, 11, 9]);
    expect(growGoals(sets, 3, 12, 8, 0.1, { held: [false, false, true] })).toEqual([11, 11, 8]);
  });

  it('at least one rep, never past the cap', () => {
    expect(growGoals([set(60, 12), set(60, 12)], 2, 12, 8, 0.025)).toEqual([12, 12]);
    expect(growGoals([set(60, 8), set(60, 8)], 2, 12, 8, 0)).toEqual([9, 8]);
  });
});

describe('R-306 / R-308: the pec deck stall, 45 kg -> 40 kg', () => {
  const deck: Exercise = { ...base, name: 'Pec Deck Fly', muscleGroup: 'chest', equipment: 'machine', incrementKg: 5 };
  const day = (d: string) => sess(d, [set(45, 12, 9), set(45, 9, 9.5), set(45, 7, 9.5)]);
  const history = [day('2026-10-20'), day('2026-10-13'), day('2026-10-06'), day('2026-10-01')];
  const run = (stuck?: StuckChoice, declined?: string) =>
    computeProgressionTarget({
      exercise: deck,
      target: { targetSets: 3, repRangeMin: 10, repRangeMax: 15 },
      history,
      todayISO: '2026-10-27',
      ladder: [40, 45, 50],
      ...(stuck ? { stuck } : {}),
      ...(declined ? { stepBackDeclinedISO: declined } : {}),
    });

  it('each set gets its own goal at 40 kg from its reps and RPE: 15, 13, 11 (never 13 on all)', () => {
    expect(stepBackGoals(history[0].sets, 3, 45, 40, 10, 15)).toEqual([15, 13, 11]);
    // No RPE: the reps as they are (45 x 12 -> 40: 17.25 -> 17).
    expect(stepBackGoals([set(45, 12)], 1, 45, 40, 10, 20)).toEqual([17]);
  });

  it('Ask me (the default): same weight, per-set goals, and the step back as an offer', () => {
    const t = run();
    expect(t.rule).toBe('R4');
    expect(t.targetWeightKg).toBe(45);
    expect(t.change).toBeNull();
    expect(t.dropNote).toBeUndefined();
    expect(t.stepBack).toMatchObject({ weightKg: 40, setGoals: [15, 13, 11], fromKg: 45, workouts: 4 });
    expect(t.stepBack?.dropNote).toBe('Stuck at 45 kg, so a small step back to 40 kg.');
    const tried = applyStepBack(t);
    expect(tried).toMatchObject({ targetWeightKg: 40, setGoals: [15, 13, 11], repGoal: 15, change: 'down', dropNote: 'Stuck at 45 kg, so a small step back to 40 kg.' });
    expect(tried.stepBack).toBeUndefined();
    expect(withoutStepBack(t).stepBack).toBeUndefined();
    expect(withoutStepBack(t).targetWeightKg).toBe(45);
  });

  it('Step back by itself: 40 kg with 15, 13, 11 and the visible reason', () => {
    const t = run('auto');
    expect(t.targetWeightKg).toBe(40);
    expect(t.change).toBe('down');
    expect(t.setGoals).toEqual([15, 13, 11]);
    expect(t.dropNote).toBe('Stuck at 45 kg, so a small step back to 40 kg.');
    expect(t.stepBack).toBeUndefined();
  });

  it('Never suggest it: same weight, no offer', () => {
    const t = run('never');
    expect(t.targetWeightKg).toBe(45);
    expect(t.stepBack).toBeUndefined();
  });

  it('"Stay" waits for 4 more stuck workouts from that day on', () => {
    expect(run('ask', '2026-10-06').stepBack).toBeUndefined();
    expect(run('ask', '2026-10-01').stepBack?.weightKg).toBe(40);
  });

  it('the card asks in plain words, and stops asking once a set is ticked', () => {
    const t = run();
    const ask = stepBackAsk(t.stepBack!, (kg) => `${kg} kg`);
    expect(ask.text).toBe(
      'Stuck at 45 kg for 4 workouts. Studies show a lighter weight with more reps builds about the same muscle (Schoenfeld and others, 2017). Try 40 kg today?',
    );
    expect(ask.tryLabel).toBe('Try 40 kg');
    expect(ask.stayLabel).toBe('Stay at 45 kg');
    expect(`${ask.text} ${ask.tryLabel} ${ask.stayLabel}`).not.toMatch(/volume|PR|session/i);
    expect(showStepBack(t, false)).toBe(true);
    expect(showStepBack(t, true)).toBe(false);
  });

  it('the drop line shows only when the weight is below the previous one', () => {
    expect(dropLine(run())).toBeNull();
    expect(dropLine(applyStepBack(run()))).toBe('Stuck at 45 kg, so a small step back to 40 kg.');
    expect(dropLine(run('auto'))).toBe('Stuck at 45 kg, so a small step back to 40 kg.');
  });

  it('settings: Ask me is the default; Try / Stay answers are kept by day only', () => {
    expect(STUCK_CHOICES.map((c) => c.value)).toEqual(['ask', 'auto', 'never']);
    expect(STUCK_CHOICES.find((c) => c.recommended)?.value).toBe('ask');
    expect(cleanStepBackChoices({ a: { declinedISO: '2026-11-03' }, b: { triedISO: 'soon' }, c: 4 })).toEqual({ a: { declinedISO: '2026-11-03' } });
  });

  it('the offer appears only on a stall', () => {
    const t = computeProgressionTarget({
      exercise: deck,
      target: { targetSets: 3, repRangeMin: 10, repRangeMax: 15 },
      history: [day('2026-10-20')],
      todayISO: '2026-10-27',
      ladder: [40, 45, 50],
    });
    expect(t.rule).toBe('R5');
    expect(t.stepBack).toBeUndefined();
  });
});

describe('R-300: after a short day, the missed goals again (nothing on top)', () => {
  const bench: Exercise = { ...base, name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell' };
  const s = (d: string, reps: number[]) => sess(d, reps.map((r) => set(60, r)));
  const run = (history: ProgSession[]) =>
    computeProgressionTarget({ exercise: bench, target: { targetSets: 3, repRangeMin: 8, repRangeMax: 12 }, history, todayISO: '2026-10-27' });

  it('10, 10, 10 aimed 11, 11, 10; did 10, 10, 9: aims 11, 11, 10 again and says so', () => {
    expect(run([s('2026-10-13', [10, 10, 10])]).setGoals).toEqual([11, 11, 10]);
    const t = run([s('2026-10-20', [10, 10, 9]), s('2026-10-13', [10, 10, 10])]);
    expect(t.setGoals).toEqual([11, 11, 10]);
    expect(t.reason).toContain('The previous workout fell a little short, so the same goals again.');
    expect(t.reason).not.toMatch(/last time[^.]*short/i);
  });

  it('short twice running at the same weight: the same goal, no extra', () => {
    const t = run([s('2026-10-24', [10, 10, 10]), s('2026-10-20', [10, 10, 9]), s('2026-10-13', [10, 10, 10])]);
    expect(t.setGoals).toEqual([11, 11, 10]);
  });

  it('a set that beat its goal on a short day keeps its better number', () => {
    expect(run([s('2026-10-20', [12, 9, 9]), s('2026-10-13', [10, 10, 10])]).setGoals).toEqual([12, 11, 10]);
  });

  it('goals reached: grows as usual', () => {
    expect(run([s('2026-10-20', [11, 11, 10]), s('2026-10-13', [10, 10, 10])]).setGoals).toEqual([12, 12, 10]);
  });
});

describe('R-300 / R-304: the live line', () => {
  const plan: KgPlan = { sets: [{ weightKg: 40, reps: 10, asLast: false }, { weightKg: 40, reps: 10, asLast: false }, { weightKg: 40, reps: 10, asLast: false }], total: 1200, last: null, pct: null };
  const row = (reps: number | null, done: boolean): KgRow => ({ weightKg: reps == null ? null : 40, reps, done, isWarmup: false });
  const total = (kg: number) => `${kg.toLocaleString('en-US')} kg`;
  const weight = (kg: number) => `${kg} kg`;

  it('extra reps go to the NEXT open set first', () => {
    const g = kgProgress(plan, [row(9, true), row(null, false), row(null, false)]);
    expect(g.next.map((x) => x.reps)).toEqual([11, 10]);
  });

  it('all sets done and short: no "add a set", just how much and that it is fine', () => {
    const g = kgProgress(plan, [row(9, true), row(9, true), row(9, true)]);
    const line = kgLiveLine(plan, g, total, weight);
    expect(line).toBe('1,080 of 1,200 kg · 120 kg short, fine for today');
    expect(line).not.toMatch(/add a set/);
    const reps = { ...plan, reps: true as const, sets: plan.sets.map((x) => ({ ...x, weightKg: 1 })), total: 30 };
    expect(repLiveLine(reps, kgProgress(reps, [row(9, true), row(9, true), row(9, true)]))).toBe('27 of 30 reps · 3 reps short, fine for today');
  });
});
