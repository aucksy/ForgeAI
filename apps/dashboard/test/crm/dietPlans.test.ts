/**
 * Diet plans from the trainer (R-120): the builder's checks (the server's _diet_clean in
 * supabase/migrations/0035_trainer_measurements_diet.sql, in plain words), the ready-made plans (R-532:
 * added up from the food table, veg really veg, safe numbers), and
 * who gets a plan (by name, or through a membership plan they have today: 0024's rule).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CHECK_FIRST,
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
  FOODS,
  READY_NOTE,
  READY_SUITS,
  recipeTotals,
  splitDiets,
  STARTER_DIETS,
  type DietPlan,
  type FoodKey,
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

describe('the ready-made plans (R-532)', () => {
  // Hand-typed totals drift: every plan is added up from its food table (IFCT 2017 first) and must
  // match what it tells the member. docs/diet-plans/SOURCES.md has every number and its source.
  const REF_KG = 65; // the middle of "an adult of about 60 to 70 kg"
  const MEAT = new Set<FoodKey>(['egg', 'eggBoiled', 'eggWhite', 'chicken', 'rohu']);
  const VEG_FOODS = new Set<FoodKey>(['vegetables', 'cucumber', 'tomato', 'onion', 'mint']);
  const parts = (s: (typeof STARTER_DIETS)[number]) => s.recipe.flatMap((m) => m.lines.flatMap((l) => l.parts));

  it('six of them: fat loss, muscle gain and maintenance, each veg and non-veg', () => {
    expect(STARTER_DIETS.map((s) => s.title)).toEqual([
      'Fat loss veg · 1,600 kcal',
      'Fat loss non-veg · 1,600 kcal',
      'Muscle gain veg · 2,600 kcal',
      'Muscle gain non-veg · 2,600 kcal',
      'Maintenance veg · 2,200 kcal',
      'Maintenance non-veg · 2,200 kcal',
    ]);
    expect(new Set(STARTER_DIETS.map((s) => s.key)).size).toBe(6);
  });

  it('the calories they say are within 5% of their food, and the protein within 10%', () => {
    const report = STARTER_DIETS.map((s) => {
      const t = recipeTotals(s.recipe);
      return { key: s.key, kcal: [s.kcal, Math.round(t.kcal)], protein: [s.proteinG, Math.round(t.proteinG)] };
    });
    console.log('[diet] stated vs added up:', JSON.stringify(report));
    for (const s of STARTER_DIETS) {
      const t = recipeTotals(s.recipe);
      expect(Math.abs(t.kcal / s.kcal - 1), `${s.key} kcal ${t.kcal.toFixed(0)}`).toBeLessThanOrEqual(0.05);
      expect(Math.abs(t.proteinG / s.proteinG - 1), `${s.key} protein ${t.proteinG.toFixed(1)}`).toBeLessThanOrEqual(0.1);
    }
  });

  it('every line of food says its weight, and is in the table', () => {
    for (const s of STARTER_DIETS) {
      for (const m of s.recipe) {
        expect(m.lines.map((l) => l.text)).toEqual(s.meals.find((x) => x.name === m.name)?.items);
        for (const l of m.lines) {
          if (l.parts.length === 0) continue; // water
          expect(l.text, s.key).toMatch(/\b\d+ (g|ml)\b|\b\d+ (boiled )?eggs\b/);
          for (const [food, g] of l.parts) {
            expect(FOODS[food], `${s.key}: ${food}`).toBeDefined();
            expect(g).toBeGreaterThan(0);
          }
        }
      }
    }
    for (const f of Object.values(FOODS)) {
      expect(f.kcal).toBeGreaterThan(0);
      expect(f.source).toMatch(/IFCT 2017|Nutritive Value of Indian Foods|Pack label/);
    }
    // No vague cups: "1 cup roasted chana" was about 370 kcal.
    expect(JSON.stringify(STARTER_DIETS.map((s) => s.meals))).not.toMatch(/\bcups? (of )?(rice|chana|sprouts|poha|curd)/i);
  });

  it('veg means no eggs, meat or fish; non-veg has them', () => {
    for (const s of STARTER_DIETS) {
      const meat = parts(s).filter(([f]) => MEAT.has(f));
      const words = JSON.stringify(s.meals);
      if (s.food === 'veg') {
        expect(meat, s.key).toEqual([]);
        expect(words, s.key).not.toMatch(/\b(eggs?|chicken|fish|mutton|meat|rohu|katla|omelette)\b/i);
      } else {
        expect(meat.length, s.key).toBeGreaterThan(0);
      }
    }
  });

  it('safe for an adult of about 60 to 70 kg who trains: enough food, protein in range, oil and vegetables right', () => {
    for (const s of STARTER_DIETS) {
      const t = recipeTotals(s.recipe);
      const perKg = s.proteinG / REF_KG;
      // Fat loss never below about 1,500 kcal; protein 1.2 to 1.6 g/kg. Others: 1.4 to 2.0 g/kg (ISSN).
      if (s.aim === 'fat-loss') {
        expect(s.kcal, s.key).toBeGreaterThanOrEqual(1500);
        expect(perKg, s.key).toBeGreaterThanOrEqual(1.2);
        expect(perKg, s.key).toBeLessThanOrEqual(1.6);
      } else {
        expect(perKg, s.key).toBeGreaterThanOrEqual(1.4);
        expect(perKg, s.key).toBeLessThanOrEqual(2.0);
      }
      // ICMR-NIN 2024: oil in moderation (here at most 30 g a day); at least 400 g of vegetables a day.
      expect(t.oilG, s.key).toBeLessThanOrEqual(30);
      const vegG = parts(s).filter(([f]) => VEG_FOODS.has(f)).reduce((n, [, g]) => n + g, 0);
      expect(vegG, s.key).toBeGreaterThanOrEqual(400);
      // No supplements in the meals: whey is only ever mentioned as optional, for adults.
      expect(JSON.stringify(s.meals), s.key).not.toMatch(/whey|protein powder|supplement/i);
      if (/whey/i.test(s.notes)) expect(s.notes).toMatch(/Whey is optional, for adults only\./);
    }
  });

  it('every one says who it suits, who asks a doctor first, and the doctor line; it fits the server', () => {
    for (const s of STARTER_DIETS) {
      for (const must of [READY_SUITS, READY_NOTE, CHECK_FIRST, DOCTOR_LINE]) expect(s.notes, s.key).toContain(must);
      expect(s.notes).toContain(`${recipeTotals(s.recipe).oilG / 5} teaspoons (${recipeTotals(s.recipe).oilG} g)`);
      const { payload, problem } = dietPayload(draftFromStarter(s, ['m1']));
      expect(problem, s.key).toBeNull();
      expect(payload?.kcal).toBe(s.kcal);
      expect(payload?.proteinG).toBe(s.proteinG);
      expect(payload?.assign).toEqual({ memberIds: ['m1'], planIds: [] });
      // No medical promises, no fasting or detox, no "sample", and none of the words members never see.
      // (The doctor line names diseases on purpose, so it is left out of this check.)
      const said = JSON.stringify({ ...s, recipe: undefined, notes: s.notes.replace(CHECK_FIRST, '') });
      expect(said, s.key).not.toMatch(/\b(cure|guarantee|detox|cleanse|fasting|disease|sample|volume|PR|session)\b/i);
    }
  });

  it('every source in the table is written down in docs/diet-plans/SOURCES.md', () => {
    const doc = readFileSync(fileURLToPath(new URL('../../../../docs/diet-plans/SOURCES.md', import.meta.url)), 'utf8');
    for (const f of Object.values(FOODS)) {
      for (const code of f.source.match(/\b[A-Z]\d{3}\b/g) ?? []) expect(doc, f.name).toContain(code);
    }
    for (const s of STARTER_DIETS) expect(doc, s.key).toContain(s.title);
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
