import { describe, expect, it } from 'vitest';

import {
  STRENGTH_LEVEL_MEANING,
  hasStrengthLevel,
  levelStarts,
  strengthLevelLine,
  strengthLevelOf,
  strengthLevelView,
  strengthStandardFor,
  type StrengthStandard,
} from '@/tracker/engine/strengthLevel';

const lvl = (catalogKey: string, e1rmKg: number, bodyWeightKg: number, standard: StrengthStandard = 'men', loadMode: 'one' | 'both' = 'one') =>
  strengthLevelOf({ catalogKey, e1rmKg, bodyWeightKg, standard, loadMode });

describe('F57 strength level — which lifts', () => {
  it('main barbell and dumbbell lifts have a level; machines, body-weight moves and own exercises do not', () => {
    for (const k of ['barbell_back_squat', 'barbell_bench_press', 'deadlift', 'overhead_press', 'barbell_row', 'dumbbell_bench_press']) {
      expect(hasStrengthLevel(k), k).toBe(true);
    }
    for (const k of ['leg_press', 'machine_chest_press', 'pull_up', 'smith_machine_deadlift', null, undefined, '', 'toString', '__proto__']) {
      expect(hasStrengthLevel(k as string | null | undefined), String(k)).toBe(false);
    }
  });

  it('levels rise for every lift and standard (Intermediate < Advanced < Elite)', () => {
    for (const k of ['barbell_back_squat', 'front_squat', 'deadlift', 'barbell_hip_thrust', 'barbell_bench_press', 'overhead_press', 'dumbbell_shoulder_press']) {
      for (const s of ['men', 'women', 'everyone'] as const) {
        const [i, a, e] = levelStarts(k, s)!;
        expect(i).toBeGreaterThan(0);
        expect(a).toBeGreaterThan(i);
        expect(e).toBeGreaterThan(a);
      }
    }
  });

  it("women's levels are lower than men's, and everyone sits between", () => {
    const men = levelStarts('barbell_bench_press', 'men')!;
    const women = levelStarts('barbell_bench_press', 'women')!;
    const all = levelStarts('barbell_bench_press', 'everyone')!;
    expect(women[0]).toBeLessThan(all[0]);
    expect(all[0]).toBeLessThan(men[0]);
    // Lower body keeps more of the men's level than upper body.
    expect(levelStarts('deadlift', 'women')![0] / levelStarts('deadlift', 'men')![0]).toBeGreaterThan(women[0] / men[0]);
  });

  it('variations sit below their main lift', () => {
    expect(levelStarts('front_squat', 'men')![0]).toBeLessThan(levelStarts('barbell_back_squat', 'men')![0]);
    expect(levelStarts('incline_barbell_press', 'men')![0]).toBeLessThan(levelStarts('barbell_bench_press', 'men')![0]);
    expect(levelStarts('romanian_deadlift', 'men')![0]).toBeLessThan(levelStarts('deadlift', 'men')![0]);
  });
});

describe('F57 strength level — the level', () => {
  it('an 80 kg man: bench 60 Beginner, 80 Intermediate, 112 Advanced, 152 Elite', () => {
    expect(lvl('barbell_bench_press', 60, 80)).toBe('beginner');
    expect(lvl('barbell_bench_press', 80, 80)).toBe('intermediate');
    expect(lvl('barbell_bench_press', 112, 80)).toBe('advanced');
    expect(lvl('barbell_bench_press', 152, 80)).toBe('elite');
  });

  it('exactly on a threshold counts as reaching it (floating point too)', () => {
    // 1.4 × 70 = 97.99999999999999 in doubles
    expect(lvl('barbell_bench_press', 1.4 * 70, 70)).toBe('advanced');
    expect(lvl('barbell_bench_press', 97.9, 70)).toBe('intermediate');
  });

  it('the same lift is a higher level when compared with women', () => {
    expect(lvl('barbell_bench_press', 51, 60, 'men')).toBe('beginner');
    expect(lvl('barbell_bench_press', 51, 60, 'women')).toBe('advanced');
  });

  it('a lighter member lifting the same weight is a higher level', () => {
    expect(lvl('barbell_back_squat', 120, 100)).toBe('beginner');
    expect(lvl('barbell_back_squat', 120, 70)).toBe('intermediate');
  });

  it('"Two dumbbells" counts both: 30 kg each is 60 kg', () => {
    // dumbbell bench: men's Intermediate starts at 0.8 × body weight = 64 kg for 80 kg
    expect(lvl('dumbbell_bench_press', 30, 80, 'men', 'both')).toBe('beginner');
    expect(lvl('dumbbell_bench_press', 32, 80, 'men', 'both')).toBe('intermediate');
    expect(lvl('dumbbell_bench_press', 64, 80, 'men', 'one')).toBe('intermediate');
  });

  it('no level without a lift, a best or a sensible body weight', () => {
    expect(lvl('leg_press', 300, 80)).toBeNull();
    expect(lvl('deadlift', 0, 80)).toBeNull();
    expect(lvl('deadlift', NaN, 80)).toBeNull();
    expect(lvl('deadlift', 100, 0)).toBeNull();
    expect(lvl('deadlift', 100, 8)).toBeNull(); // a typo, not a person
    expect(lvl('deadlift', 100, 800)).toBeNull();
    expect(strengthLevelOf({ catalogKey: 'deadlift', e1rmKg: null, bodyWeightKg: 80, standard: 'men', loadMode: 'one' })).toBeNull();
    expect(strengthLevelOf({ catalogKey: 'deadlift', e1rmKg: 100, bodyWeightKg: null, standard: 'men', loadMode: 'one' })).toBeNull();
  });
});

describe('F57 strength level — the page line', () => {
  const weighIns = [
    { dateISO: '2026-01-01', weightKg: 100 },
    { dateISO: '2026-06-01', weightKg: 70 },
  ];

  it('uses the body weight on the day of the best set, not today', () => {
    // squat 120: at 100 kg (Jan) Beginner for men; at 70 kg it would be Intermediate
    const v = strengthLevelView({ catalogKey: 'barbell_back_squat', best: { value: 120, dateISO: '2026-03-10' }, exerciseLoadMode: 'one', weighIns, standard: 'men' });
    expect(v).toEqual({ kind: 'level', level: 'beginner', standard: 'men' });
    const later = strengthLevelView({ catalogKey: 'barbell_back_squat', best: { value: 120, dateISO: '2026-07-10' }, exerciseLoadMode: 'one', weighIns, standard: 'men' });
    expect(later).toEqual({ kind: 'level', level: 'intermediate', standard: 'men' });
  });

  it('a best set before the first weigh-in uses the first weigh-in', () => {
    const v = strengthLevelView({ catalogKey: 'barbell_back_squat', best: { value: 125, dateISO: '2025-06-01' }, exerciseLoadMode: 'one', weighIns, standard: 'men' });
    expect(v).toEqual({ kind: 'level', level: 'intermediate', standard: 'men' });
  });

  it("the best set's own counting wins over the exercise's", () => {
    const base = { catalogKey: 'dumbbell_bench_press', weighIns: [{ dateISO: '2026-01-01', weightKg: 80 }], standard: 'men' as const };
    expect(strengthLevelView({ ...base, best: { value: 32, dateISO: '2026-02-01', loadMode: 'both' }, exerciseLoadMode: 'one' })).toMatchObject({ level: 'intermediate' });
    expect(strengthLevelView({ ...base, best: { value: 32, dateISO: '2026-02-01', loadMode: 'one' }, exerciseLoadMode: 'both' })).toMatchObject({ level: 'beginner' });
    expect(strengthLevelView({ ...base, best: { value: 32, dateISO: '2026-02-01' }, exerciseLoadMode: 'both' })).toMatchObject({ level: 'intermediate' });
  });

  it('no weigh-in asks for one; no best or no level shows nothing', () => {
    const need = strengthLevelView({ catalogKey: 'deadlift', best: { value: 100, dateISO: '2026-01-01' }, exerciseLoadMode: 'one', weighIns: [], standard: 'everyone' });
    expect(need).toEqual({ kind: 'needWeight' });
    expect(strengthLevelLine(need)).toBe('Log your body weight to see your strength level');
    expect(strengthLevelView({ catalogKey: 'deadlift', best: null, exerciseLoadMode: 'one', weighIns, standard: 'men' })).toEqual({ kind: 'none' });
    expect(strengthLevelView({ catalogKey: 'leg_press', best: { value: 200, dateISO: '2026-01-01' }, exerciseLoadMode: 'one', weighIns, standard: 'men' })).toEqual({ kind: 'none' });
    expect(strengthLevelLine({ kind: 'none' })).toBeNull();
  });

  it('the line shows the level and nothing that divides back to the body weight', () => {
    const line = strengthLevelLine({ kind: 'level', level: 'advanced', standard: 'men' })!;
    expect(line).toBe('Strength level: Advanced');
    for (const text of [line, ...Object.values(STRENGTH_LEVEL_MEANING)]) {
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(/×|\bkg\b|\blb\b|body weight/i);
    }
  });

  it('member words: never "volume", "PR" or "session"', () => {
    const all = [strengthLevelLine({ kind: 'needWeight' })!, ...Object.values(STRENGTH_LEVEL_MEANING)].join(' ');
    expect(all).not.toMatch(/\bvolume\b|\bPR\b|\bsession\b/i);
  });
});

describe('F57 who the member is compared with', () => {
  it("the member's own choice wins", () => {
    expect(strengthStandardFor('men', 'female')).toBe('men');
    expect(strengthStandardFor('everyone', 'female')).toBe('everyone');
    expect(strengthStandardFor('women', 'male')).toBe('women');
  });
  it('no choice: Female body figure → women; Male (the starting figure) → everyone', () => {
    expect(strengthStandardFor(null, 'female')).toBe('women');
    expect(strengthStandardFor(null, 'male')).toBe('everyone');
    expect(strengthStandardFor('junk', 'male')).toBe('everyone');
  });
});
