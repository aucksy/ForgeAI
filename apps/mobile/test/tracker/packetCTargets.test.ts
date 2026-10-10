/**
 * Phase 2, packet C — "Targets you can load" (audit TG-01 … TG-11, SH-09). Pure rules; the
 * same flows against real SQL are in test/db/targetsReal.test.ts. Synthetic numbers only.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { ageToText, heightToText, parseProfileExtras } from '@/components/settings/profileFields';
import { KG_PER_LB, setDisplayUnits, wNum } from '@/lib/units';
import { kgToTyped } from '@/tracker/components/unitText';
import { convertCounting } from '@/tracker/engine/logTypes';
import { computeProgressionTarget, targetFill, targetLine, toEasyTarget, type ProgSession } from '@/tracker/engine/progression';
import { buildLadder, cleanRung, downRungKg, ladderKind, upRungsKg } from '@/tracker/engine/weightLadder';
import { toPrevSet } from '@/tracker/store/activeWorkoutStore';
import { querySignature, targetQuery } from '@/tracker/store/targetStore';
import type { Exercise } from '@/types/models';

const TODAY = '2026-10-06';
const ex = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'e1',
  name: 'Bench Press',
  aliases: [],
  muscleGroup: 'chest',
  secondaryMuscles: [],
  equipment: 'barbell',
  isCompound: true,
  incrementKg: 2.5,
  ...over,
});
const sess = (dateISO: string, weightKg: number, reps: number[]): ProgSession => ({
  dateISO,
  sets: reps.map((r) => ({ weightKg, reps: r, rpe: null, setType: 'normal' as const })),
});
const range = { targetSets: 3, repRangeMin: 8, repRangeMax: 12 };
const run = (exercise: Exercise, history: ProgSession[], ladder?: number[]) =>
  computeProgressionTarget({ exercise, target: range, history, todayISO: TODAY, ...(ladder ? { ladder } : {}) });

afterEach(() => setDisplayUnits('metric'));

describe('TG-01 the ladder: weights the member has actually used', () => {
  it('a bench only ever loaded in 5 kg jumps moves 50 → 55, never 52.5', () => {
    const t = run(ex(), [sess('2026-10-03', 50, [12, 12, 12])], [40, 45, 50]);
    expect(t.targetWeightKg).toBe(55);
  });

  it('a 7 kg cable stack (12/19/26/33/40) goes 40 → 47, never 40.5 or 42.5', () => {
    const fly = ex({ name: 'Cable Fly', equipment: 'cable', isCompound: false });
    const t = run(fly, [sess('2026-10-03', 33, [16, 16, 16])], [12, 19, 26, 33, 40]); // +21%: done the extra reps first
    expect(t.targetWeightKg).toBe(40);
    expect(run(fly, [sess('2026-10-03', 40, [16, 16, 16])], [12, 19, 26, 33, 40]).targetWeightKg).toBe(47);
  });

  it('Up is the NEXT rung (one away), even when the old step would land between', () => {
    const curl = ex({ name: 'Hammer Curl', equipment: 'dumbbell', isCompound: false });
    expect(run(curl, [sess('2026-10-03', 20, [16, 16, 16])], [10, 12.5, 15, 20, 25, 30]).targetWeightKg).toBe(25);
  });

  it('Lighter is the used rung nearest to 10% lighter (22 kg dumbbells → 20, never 19.5)', () => {
    const l = buildLadder([16, 18, 20, 22, 24], 'dumbbell');
    expect(downRungKg(22, l)).toBe(20);
  });

  it('thin history (under 3 weights) falls back to the gym\'s steps; a machine never invents a stack', () => {
    expect(buildLadder([50], 'plates').rungs).toContain(52.5);
    expect(buildLadder([10], 'dumbbell').rungs).toContain(12.5);
    expect(buildLadder([45, 60], 'own').rungs).toEqual([45, 60]);
    expect(upRungsKg(45, 1, buildLadder([45, 60], 'own'))).toEqual([60]);
  });

  it('the kind follows the equipment', () => {
    expect(ladderKind('barbell')).toBe('plates');
    expect(ladderKind('dumbbell')).toBe('dumbbell');
    expect(ladderKind('cable')).toBe('own');
    expect(ladderKind('bodyweight', 'weighted')).toBe('plates');
  });
});

describe('TG-02 pounds and kilos never mix', () => {
  it('a Hevy history in pounds, used in kg: 165 lb reads 75 kg, and the box gets "75", not "74.843"', () => {
    const lb165 = 165 * KG_PER_LB; // 74.843 kg
    const t = run(ex(), [sess('2026-10-03', lb165, [10, 9, 9])], [lb165]);
    expect(t.rule).toBe('R5');
    expect(t.change).toBeNull(); // the same weight, read cleanly — not an "Up"
    expect(targetLine(t)).toBe('75 kg · aim for 10');
    expect(kgToTyped(targetFill(t)!.weightKg)).toBe('75');
  });

  it('kg history shown in lb: rungs on pound plates (60 kg → 130 lb, 62.5 → 140)', () => {
    setDisplayUnits('imperial');
    expect(cleanRung(60 / KG_PER_LB, 'plates', 'imperial')).toBe(130);
    expect(cleanRung(62.5 / KG_PER_LB, 'plates', 'imperial')).toBe(140);
    // A weight logged in pounds stays exactly what he typed.
    expect(cleanRung(135, 'plates', 'imperial')).toBe(135);
  });

  it('an Up and a Lighter in lb are whole pound plates', () => {
    setDisplayUnits('imperial');
    const h = [sess('2026-10-03', 100, [4, 4, 4]), sess('2026-09-30', 100, [4, 4, 4])];
    const t = computeProgressionTarget({ exercise: ex(), target: { targetSets: 3, repRangeMin: 5, repRangeMax: 8 }, history: h, todayISO: TODAY });
    expect(t.change).toBe('down');
    expect(Number(wNum(t.targetWeightKg)) % 5).toBe(0);
  });

  it('the easy week keeps the clean same weight', () => {
    const lb165 = 165 * KG_PER_LB;
    const t = run(ex(), [sess('2026-10-03', lb165, [12, 12, 12])], [lb165, 70]);
    expect(t.change).toBe('up');
    expect(toEasyTarget(t, 'easy', (n) => Math.ceil(n / 2)).targetWeightKg).toBe(75);
  });
});

describe('TG-03 Counting conversion', () => {
  it('50 as typed = 25 each, and back; reps-per-side counting never touches the weight', () => {
    expect(convertCounting(50, 'one', 'both')).toBe(25);
    expect(convertCounting(25, 'both', 'one')).toBe(50);
    expect(convertCounting(25, 'both', 'both_side')).toBe(25);
    expect(convertCounting(40, 'one', 'side')).toBe(40);
    expect(convertCounting(40, null, 'both')).toBe(40); // unknown → unchanged
  });

  it('PREVIOUS reads an old "as typed" set in today\'s counting', () => {
    expect(toPrevSet({ weightKg: 50, reps: 10, loadMode: 'one' }, 'weight_reps', 'both')).toEqual({ weightKg: 25, reps: 10 });
    expect(toPrevSet({ weightKg: 25, reps: 10 }, 'weight_reps', 'both')).toEqual({ weightKg: 25, reps: 10 });
  });
});

describe('TG-04 switching units recomputes the Target', () => {
  it('the screen\'s Target query changes with the unit, so the Target and its "why" are rebuilt', () => {
    const cards = [{ key: 'k', exerciseId: 'e1' }];
    const kg = targetQuery('d1', cards, { easy: false, effort: false, units: 'metric' });
    const lb = targetQuery('d1', cards, { easy: false, effort: false, units: 'imperial' });
    expect(querySignature(kg)).not.toBe(querySignature(lb));
    setDisplayUnits('imperial');
    const t = run(ex(), [sess('2026-10-03', 60, [12, 12, 12])]);
    expect(t.reason).toMatch(/ lb\b/);
    expect(t.reason).not.toMatch(/ kg\b/);
  });

  it('a Counting change or a swap also changes the query', () => {
    const a = targetQuery('d1', [{ key: 'k', exerciseId: 'e1', loadMode: 'one' }], { easy: false, effort: false, units: 'metric' });
    const b = targetQuery('d1', [{ key: 'k', exerciseId: 'e1', loadMode: 'both' }], { easy: false, effort: false, units: 'metric' });
    const c = targetQuery('d1', [{ key: 'k', exerciseId: 'e2', swappedFrom: { exerciseId: 'e1' } }], { easy: false, effort: false, units: 'metric' });
    expect(new Set([a, b, c].map(querySignature)).size).toBe(3);
    expect(c.cards[0].planExerciseId).toBe('e1');
  });
});

describe('TG-07 a blank weight never makes a loaded lift "Bodyweight"', () => {
  const press = ex({ name: 'Leg Press', equipment: 'machine', incrementKg: 5 });

  it('first time saved at 0 kg → still the first-time line, not "Bodyweight · aim for 11"', () => {
    const t = run(press, [sess('2026-10-03', 0, [10, 10, 10])]);
    expect(t.bodyweightOnly).toBe(false);
    expect(targetLine(t)).toBe('First time · find a weight for 8–12 reps');
  });

  it('one blank-weight workout among loaded ones is skipped', () => {
    const t = run(press, [sess('2026-10-03', 0, [10, 10]), sess('2026-09-30', 100, [10, 10, 10])]);
    expect(t.bodyweightOnly).toBe(false);
    expect(t.last?.weightKg).toBe(100);
  });

  it('a real bodyweight move logged at 0 kg stays bodyweight', () => {
    const dip = ex({ name: 'Dips', equipment: 'bodyweight' });
    expect(run(dip, [sess('2026-10-03', 0, [10, 10, 10])]).bodyweightOnly).toBe(true);
  });
});

describe('SH-09 Profile: experience, age and height', () => {
  it('blank = not given; out of range is refused with the welcome screen\'s words', () => {
    expect(parseProfileExtras('', '', 'metric')).toEqual({ ok: true, age: 0, heightCm: 0 });
    expect(parseProfileExtras('34', '180', 'metric')).toEqual({ ok: true, age: 34, heightCm: 180 });
    expect(parseProfileExtras('5', '', 'metric').ok).toBe(false);
    expect(parseProfileExtras('', '300', 'metric').ok).toBe(false);
  });

  it('height in inches under "lb, miles", stored in cm', () => {
    expect(parseProfileExtras('', '70', 'imperial')).toEqual({ ok: true, age: 0, heightCm: 177.8 });
    expect(heightToText(177.8, 'imperial')).toBe('70');
    expect(heightToText(0, 'metric')).toBe('');
    expect(ageToText(0)).toBe('');
  });
});
