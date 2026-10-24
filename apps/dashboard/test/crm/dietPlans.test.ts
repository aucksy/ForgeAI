/**
 * Diet plans from the trainer (R-120): the builder's checks (the server's _diet_clean in
 * supabase/migrations/0035_trainer_measurements_diet.sql, in plain words), the starter samples, and
 * who gets a plan (by name, or through a membership plan they have today: 0024's rule).
 */
import { describe, expect, it } from 'vitest';

import {
  copyOfDiet,
  dietErrorWords,
  dietFromRow,
  dietPayload,
  dietSendChoices,
  dietSizeWords,
  dietsForMember,
  dietWithMember,
  dietWithoutMember,
  DOCTOR_LINE,
  draftFromStarter,
  emptyDietDraft,
  splitDiets,
  STARTER_DIETS,
  type DietPlan,
} from '../../src/crm/logic/dietPlans';

const TODAY = '2026-10-24';

function plan(over: Partial<DietPlan> = {}): DietPlan {
  return {
    id: 'd1',
    title: 'Fat loss veg',
    goal: null,
    kcal: 1600,
    proteinG: 90,
    meals: [{ name: 'Lunch', time: '1:30 pm', items: ['2 roti', '1 bowl dal'] }],
    notes: null,
    assign: { memberIds: [], planIds: [] },
    withdrawn: false,
    byName: 'Ravi',
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

describe('the starter plans', () => {
  it('are plain samples that fit the server and say to see a doctor', () => {
    expect(STARTER_DIETS.map((s) => s.title)).toEqual(['Fat loss veg · 1,600 kcal', 'Muscle gain non-veg · 2,600 kcal', 'Maintenance veg · 2,000 kcal']);
    for (const s of STARTER_DIETS) {
      expect(s.notes).toContain(DOCTOR_LINE);
      const { payload, problem } = dietPayload(draftFromStarter(s, ['m1']));
      expect(problem).toBeNull();
      expect(payload?.kcal).toBe(s.kcal);
      expect(payload?.assign).toEqual({ memberIds: ['m1'], planIds: [] });
      // No medical promises, and none of the words members never see.
      expect(JSON.stringify(s)).not.toMatch(/\b(cure|guarantee|detox|disease|volume|PR|session)\b/i);
    }
  });

  it('a new empty plan already carries the doctor line', () => {
    expect(emptyDietDraft().notes).toBe(DOCTOR_LINE);
  });
});

describe('dietPayload', () => {
  it('one food per line, blank lines and empty meals dropped, spaces tidied', () => {
    const d = { ...emptyDietDraft(), title: '  Fat   loss ', kcal: '1,600', meals: [{ name: ' Breakfast ', time: '8 am', itemsText: '2 chilla\n\n  1 cup curd ' }, { name: 'Lunch', time: '', itemsText: '  ' }] };
    const { payload, problem } = dietPayload(d);
    expect(problem).toBeNull();
    expect(payload).toMatchObject({ title: 'Fat loss', kcal: 1600, proteinG: null, meals: [{ name: 'Breakfast', time: '8 am', items: ['2 chilla', '1 cup curd'] }] });
  });

  it('says what is wrong, one thing at a time', () => {
    const base = emptyDietDraft();
    const withFood = { ...base, meals: [{ name: 'Lunch', time: '', itemsText: '2 roti' }] };
    expect(dietPayload({ ...withFood, title: ' ' }).problem).toBe('Give the plan a name, like “Fat loss veg”.');
    expect(dietPayload({ ...base, title: 'X' }).problem).toBe('Add the food for at least one meal (one food per line).');
    expect(dietPayload({ ...withFood, title: 'X', kcal: '100' }).problem).toBe('Calories a day: a whole number from 800 to 6000, or leave it empty.');
    expect(dietPayload({ ...withFood, title: 'X', proteinG: '90.5' }).problem).toBe('Protein a day: a whole number of grams from 20 to 400, or leave it empty.');
    expect(dietPayload({ ...withFood, title: 'X', meals: [{ name: '', time: '', itemsText: 'rice' }] }).problem).toBe('Each meal with food needs a name, like “Breakfast”.');
  });
});

describe('reading and listing', () => {
  it('reads a server row; drops meals with no food', () => {
    const p = dietFromRow({ id: 'x', title: 'T', meals: [{ name: 'A', items: ['egg'] }, { name: 'B', items: [] }], assign: { memberIds: ['m1', 'm1'] }, withdrawn: false, updatedAt: 5 });
    expect(p?.meals).toEqual([{ name: 'A', time: null, items: ['egg'] }]);
    expect(p?.assign).toEqual({ memberIds: ['m1'], planIds: [] });
    expect(dietFromRow({ id: 'x', meals: [] })).toBeNull();
  });

  it('splits open from withdrawn, newest change first; sizes in words', () => {
    const { open, withdrawn } = splitDiets([plan({ id: 'a', updatedAt: 1 }), plan({ id: 'b', updatedAt: 3 }), plan({ id: 'c', withdrawn: true })]);
    expect(open.map((p) => p.id)).toEqual(['b', 'a']);
    expect(withdrawn.map((p) => p.id)).toEqual(['c']);
    expect(dietSizeWords(plan())).toBe('1 meal · 1,600 kcal · 90 g protein');
  });

  it('a copy is new and sent to nobody', () => {
    const c = copyOfDiet(plan({ assign: { memberIds: ['m1'], planIds: ['pl'] } }));
    expect(c.id).toBeUndefined();
    expect(c.title).toBe('Fat loss veg (copy)');
    expect(c.assign).toEqual({ memberIds: [], planIds: [] });
  });
});

describe('who gets it', () => {
  const memberships = [
    { memberId: 'm-bilal', planId: 'pl-gold', startsOn: '2026-10-01', endsOn: '2026-12-31', cancelled: false },
    { memberId: 'm-chand', planId: 'pl-gold', startsOn: '2026-06-01', endsOn: '2026-09-30', cancelled: false },
  ];
  const byName = plan({ id: 'p1', assign: { memberIds: ['m-asha'], planIds: [] } });
  const gold = plan({ id: 'p2', assign: { memberIds: [], planIds: ['pl-gold'] } });
  const gone = plan({ id: 'p3', withdrawn: true, assign: { memberIds: ['m-asha'], planIds: [] } });

  it('by name, or through a membership plan covering today; never a withdrawn one', () => {
    expect(dietsForMember([byName, gold, gone], 'm-asha', memberships, TODAY).map((p) => p.id)).toEqual(['p1']);
    expect(dietsForMember([byName, gold, gone], 'm-bilal', memberships, TODAY).map((p) => p.id)).toEqual(['p2']);
    expect(dietsForMember([byName, gold, gone], 'm-chand', memberships, TODAY)).toEqual([]);
    expect(dietSendChoices([byName, gold, gone], 'm-bilal', memberships, TODAY).map((c) => [c.plan.id, c.already])).toEqual([
      ['p1', false],
      ['p2', true],
    ]);
  });

  it('adds and takes off one member', () => {
    expect(dietWithMember(byName, 'm-bilal').assign.memberIds).toEqual(['m-asha', 'm-bilal']);
    expect(dietWithMember(byName, 'm-asha').assign.memberIds).toEqual(['m-asha']);
    expect(dietWithoutMember(byName, 'm-asha').assign.memberIds).toEqual([]);
  });

  it('refusals in plain words', () => {
    expect(dietErrorWords(new Error('WITHDRAWN'))).toBe('This plan was withdrawn, so it can’t be changed. Make a copy of it instead.');
    expect(dietErrorWords(new Error('BAD_KEY'))).toBeNull();
  });
});
