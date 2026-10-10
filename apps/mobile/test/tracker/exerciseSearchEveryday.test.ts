/**
 * Audit Phase 4 (EX-01): search understands people. 200 everyday searches over the REAL
 * library — at least 98 % must find an intended exercise in the top 3 — plus the rules one by
 * one (any order, plurals, one typo, spacing, spellings, Hevy titles, "Did you mean").
 */
import { describe, expect, it } from 'vitest';

import { CATALOG } from '@/tracker/catalog/exerciseCatalog';
import { didYouMean, editDistance, filterExercises, matchRank, stem } from '@/tracker/services/exerciseSearch';

import { EVERYDAY_SEARCHES } from '../fixtures/everydaySearches';

const LIBRARY = CATALOG.map((e) => ({
  key: e.key,
  name: e.name,
  aliases: [...e.aliases],
  equipment: e.equipment,
  muscles: { primary: [...e.primary], secondary: [...e.secondary] },
  catalogKey: e.key,
}));
const search = (q: string) => filterExercises(LIBRARY, { query: q, muscle: null, equipment: null });

describe('EX-01 200 everyday searches', () => {
  it('the table has 200 searches, each naming real library exercises', () => {
    expect(EVERYDAY_SEARCHES.length).toBe(200);
    const keys = new Set(CATALOG.map((e) => e.key));
    const unknown = EVERYDAY_SEARCHES.flatMap(([, ks]) => ks.filter((k) => !keys.has(k)));
    expect(unknown).toEqual([]);
  });

  it('at least 98 % find what was meant in the top 3', () => {
    const misses: string[] = [];
    for (const [q, want] of EVERYDAY_SEARCHES) {
      const top = search(q).slice(0, 3);
      if (!top.some((r) => want.includes(r.key))) misses.push(`"${q}" → ${top.map((r) => r.name).join(' | ') || 'nothing'}`);
    }
    const found = EVERYDAY_SEARCHES.length - misses.length;
    expect(found / EVERYDAY_SEARCHES.length, misses.join('\n')).toBeGreaterThanOrEqual(0.98);
  });
});

describe('EX-01 the rules', () => {
  it('plurals fold to one word', () => {
    expect(['curls', 'raises', 'presses', 'crunches', 'flyes', 'calves', 'biceps'].map(stem)).toEqual([
      'curl', 'raise', 'press', 'crunch', 'fly', 'calf', 'bicep',
    ]);
  });
  it('one swapped pair of letters is one typo', () => {
    expect(editDistance('pulldwon', 'pulldown')).toBe(1);
    expect(editDistance('squat', 'sqaut')).toBe(1);
  });
  it('no typo is allowed in a short word (3 letters) — "row" never finds "rope"', () => {
    expect(search('row').every((r) => !/^rope/i.test(r.name) || /row/i.test(r.name))).toBe(true);
  });
  it('exact beats starts-with beats every word beats typo', () => {
    const ex = (name: string) => ({ name, aliases: [] as string[] });
    expect(matchRank(ex('Dumbbell Curl'), 'dumbbell curl')).toBe(0);
    expect(matchRank(ex('Dumbbell Curl Hold'), 'dumbbell curl')).toBe(0);
    // (A name the library doesn't know, so only the name itself is searched.)
    expect(matchRank(ex('Cable Wood Chop'), 'chop wood')).toBe(4);
    expect(matchRank(ex('Cable Wood Chop'), 'cable wood chopp')).toBe(7);
    expect(matchRank(ex('Leg Press'), 'chop wood')).toBeNull();
    // The exact name is listed first even among names that start with it.
    const list = [ex('Dumbbell Curl Hold'), ex('Dumbbell Curl')].map((e) => ({ ...e, equipment: 'dumbbell' as const, muscles: { primary: [], secondary: [] } }));
    expect(filterExercises(list, { query: 'Dumbbell Curl', muscle: null, equipment: null })[0].name).toBe('Dumbbell Curl');
  });
  it('a Hevy title finds its library exercise first', () => {
    expect(search('Bench Press (Barbell)')[0].key).toBe('barbell_bench_press');
    expect(search('Bent Over Row (Barbell)')[0].key).toBe('barbell_row');
  });
  it('"Did you mean" offers the best match when the typed name is not an exercise', () => {
    expect(didYouMean('dumbell curl', search('dumbell curl'))?.key).toBe('dumbbell_curl');
    expect(didYouMean('Dumbbell Curl', search('Dumbbell Curl'))).toBeNull();
    expect(didYouMean('zzzz qqqq', search('zzzz qqqq'))).toBeNull();
    // Phone run 38063413760: "pull-up" is the name "Pull Up" — no "Did you mean Pull Up?".
    expect(didYouMean('pull-up', [{ name: 'Pull Up', aliases: [], equipment: 'bodyweight', muscles: { primary: ['lats'], secondary: [] } }])).toBeNull();
  });
  it('a Devanagari word keeps its vowel signs (डंड finds the Hindu push-up)', () => {
    expect(search('डंड')[0]?.key).toBe('hindu_push_up');
  });
});
