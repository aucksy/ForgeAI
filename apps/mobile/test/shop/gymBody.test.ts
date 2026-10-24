/**
 * Measurements the gym's trainer took and the gym's diet plans (R-120): reading the gym's answers
 * (0035), the copy kept on the phone, and merging the gym's measurements with the member's own on
 * the Body page without counting a day twice.
 */
import { describe, expect, it } from 'vitest';

import {
  DIET_DOCTOR_LINE,
  dietProblemWords,
  dietRowWords,
  dietTargetsWords,
  fromGymWords,
  gymDietFromRow,
  gymDietsFromRow,
  gymMeasuresFromRow,
  gymPointsFor,
  parseGymDietsCopy,
  parseGymMeasuresStore,
  withGymAnswer,
  type GymMeasuresStore,
} from '@/shop/gymBody';

const ANSWER = {
  ok: true,
  gymId: 'g1',
  gymName: 'Shakti Gym',
  entries: [
    { id: 'e2', date: '2026-10-20', weightKg: 73, bodyFat: null, tape: { waist: 84.5 }, byName: 'Ravi', updatedAt: 2 },
    { id: 'e1', date: '2026-09-20', weightKg: 74.5, bodyFat: 25, tape: { waist: 86, wrist: 17, arm: 'x' }, byName: null, updatedAt: 1 },
    { id: 'bad', date: '20 Sep' },
    { id: 'empty', date: '2026-09-01', tape: {} },
  ],
};

describe('member_measurements', () => {
  it('reads each day; unknown or broken values and empty days are dropped', () => {
    const a = gymMeasuresFromRow(ANSWER);
    expect(a?.ok).toBe(true);
    if (!a?.ok) return;
    expect(a.days.map((d) => d.id)).toEqual(['e2', 'e1']);
    expect(a.days[1]).toEqual({ id: 'e1', dateISO: '2026-09-20', weightKg: 74.5, bodyFat: 25, tape: { waist: 86 }, byName: null });
  });

  it('a "see the desk" answer is a problem, not an empty list', () => {
    expect(gymMeasuresFromRow({ error: 'NO_PHONE', gymName: 'Shakti Gym' })).toEqual({ ok: false, problem: 'NO_PHONE', gymName: 'Shakti Gym' });
    expect(gymMeasuresFromRow({ ok: true })).toBeNull();
  });
});

describe('the copy kept on the phone', () => {
  const a = gymMeasuresFromRow(ANSWER);
  if (!a?.ok) throw new Error('fixture');

  it('round-trips, and a fresh answer replaces only that gym (a deleted entry goes; another gym stays)', () => {
    let store: GymMeasuresStore = withGymAnswer({}, { gymId: 'old', gymName: 'Old Gym', days: [{ id: 'o1', dateISO: '2026-01-05', weightKg: 80, bodyFat: null, tape: {}, byName: null }] }, 1);
    store = withGymAnswer(store, a, 5);
    const back = parseGymMeasuresStore(JSON.stringify(store));
    expect(Object.keys(back).sort()).toEqual(['g1', 'old']);
    expect(back.g1.days).toHaveLength(2);
    const after = withGymAnswer(back, { gymId: 'g1', gymName: 'Shakti Gym', days: a.days.slice(0, 1) }, 9);
    expect(after.g1.days.map((d) => d.id)).toEqual(['e2']);
    expect(after.old.days).toHaveLength(1);
  });

  it('reads nothing from a broken copy', () => {
    expect(parseGymMeasuresStore('{oops')).toEqual({});
    expect(parseGymMeasuresStore(null)).toEqual({});
  });
});

describe('gymPointsFor: the Body page', () => {
  const a = gymMeasuresFromRow(ANSWER);
  if (!a?.ok) throw new Error('fixture');
  const store = withGymAnswer({}, a, 5);

  it('the gym’s values for one measure, oldest first, in the app’s own units', () => {
    expect(gymPointsFor(store, 'bodyweight', new Set()).map((p) => [p.dateISO, p.value])).toEqual([
      ['2026-09-20', 74.5],
      ['2026-10-20', 73],
    ]);
    expect(gymPointsFor(store, 'waist', new Set()).map((p) => p.value)).toEqual([86, 84.5]);
    expect(gymPointsFor(store, 'body_fat', new Set()).map((p) => p.value)).toEqual([25]);
    expect(gymPointsFor(store, 'calf', new Set())).toEqual([]);
  });

  it('a day with the member’s own entry shows theirs: the gym’s is left out, never counted twice', () => {
    expect(gymPointsFor(store, 'bodyweight', new Set(['2026-10-20'])).map((p) => p.dateISO)).toEqual(['2026-09-20']);
  });

  it('two gyms on the same day: the newer copy only; ids never clash', () => {
    const two = withGymAnswer(store, { gymId: 'g2', gymName: 'New Gym', days: [{ id: 'n1', dateISO: '2026-10-20', weightKg: 72, bodyFat: null, tape: {}, byName: 'Sam' }] }, 9);
    const pts = gymPointsFor(two, 'bodyweight', new Set());
    expect(pts.map((p) => [p.dateISO, p.value, p.gymName])).toEqual([
      ['2026-09-20', 74.5, 'Shakti Gym'],
      ['2026-10-20', 72, 'New Gym'],
    ]);
    expect(new Set(pts.map((p) => p.id)).size).toBe(pts.length);
    expect(fromGymWords(pts[1])).toBe('From New Gym · Sam');
    expect(fromGymWords(pts[0])).toBe('From Shakti Gym');
  });
});

describe('diet plans', () => {
  const row = {
    id: 'd1',
    title: 'Fat loss veg · 1,600 kcal',
    goal: 'Lose fat slowly',
    kcal: 1600,
    proteinG: 90,
    meals: [
      { name: 'Breakfast', time: '8:30 am', items: ['2 moong dal chilla', ' ', '1 cup curd'] },
      { name: 'Snack', items: [] },
    ],
    notes: `Drink water. ${DIET_DOCTOR_LINE}`,
    byName: 'Ravi',
    updatedAt: 10,
  };

  it('reads a plan; meals with no food go; a plan with no meal is skipped', () => {
    const p = gymDietFromRow(row);
    expect(p?.meals).toEqual([{ name: 'Breakfast', time: '8:30 am', items: ['2 moong dal chilla', '1 cup curd'] }]);
    expect(gymDietFromRow({ ...row, meals: [{ name: 'Snack', items: [] }] })).toBeNull();
    expect(dietTargetsWords(p!)).toBe('1,600 kcal · 90 g protein a day');
    expect(dietTargetsWords({ kcal: null, proteinG: null })).toBeNull();
  });

  it('the answer and the kept copy', () => {
    const a = gymDietsFromRow({ ok: true, gymId: 'g1', gymName: 'Shakti Gym', plans: [row, { id: 'x' }] });
    expect(a?.ok && a.plans.map((p) => p.id)).toEqual(['d1']);
    const kept = parseGymDietsCopy(JSON.stringify({ gymId: 'g1', gymName: 'Shakti Gym', plans: a?.ok ? a.plans : [], at: 3 }));
    expect(kept?.plans[0].title).toBe('Fat loss veg · 1,600 kcal');
    expect(parseGymDietsCopy('nope')).toBeNull();
    expect(gymDietsFromRow({ error: 'NAME_MISMATCH', gymName: 'Shakti Gym' })).toEqual({ ok: false, problem: 'NAME_MISMATCH', gymName: 'Shakti Gym' });
  });

  it('words: the Gym tab row and a "see the desk" answer', () => {
    expect(dietRowWords([{ title: 'Fat loss veg' }])).toBe('Fat loss veg');
    expect(dietRowWords([{ title: 'A' }, { title: 'B' }])).toBe('2 plans from your trainer');
    expect(dietProblemWords('NO_PHONE', 'Shakti Gym').title).toBe('Check in once to see your diet plan');
  });

  it('no banned member words anywhere', () => {
    const all = JSON.stringify([dietProblemWords('NO_PHONE', 'G'), dietProblemWords('SHARED_NUMBER', 'G'), dietRowWords(null), DIET_DOCTOR_LINE]);
    expect(all).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});
