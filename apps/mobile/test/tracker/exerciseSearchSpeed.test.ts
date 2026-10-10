/**
 * Review fix (Phase 4, search BLOCKER): the exercise search runs on every keystroke on a phone
 * (Hermes, no JIT — several times slower than this desktop). Budget on THIS machine: a mixed set
 * of 50 searches (whole names, words in any order, plurals, typos, run-together words, no-hit
 * nonsense) averages under 3 ms a search, and building the search index for the whole library
 * takes under 30 ms — about ten times headroom for the phone.
 *
 * Each timing is the best of several runs, so a garbage-collection pause or the rest of the
 * suite running alongside does not fail the build; a real slowdown fails every run.
 */
import { describe, expect, it } from 'vitest';

import { CATALOG } from '@/tracker/catalog/exerciseCatalog';
import { buildSearchIndex, clearSearchCaches, filterExercises } from '@/tracker/services/exerciseSearch';

const libraryCopy = () =>
  CATALOG.map((e) => ({
    key: e.key,
    name: e.name,
    aliases: [...e.aliases],
    equipment: e.equipment,
    muscles: { primary: [...e.primary], secondary: [...e.secondary] },
    catalogKey: e.key,
  }));

const QUERIES = [
  // whole names and starts of names
  'bench press', 'barbell squat', 'deadlift', 'lat pulldown', 'dumbbell curl', 'leg press', 'plank', 'pull up',
  'b', 'be', 'ben', 'benc', 'dumb', 'dumbb', 'cable', 'smith machine',
  // any order, plurals, slang
  'curl dumbbell', 'press incline', 'calf raises', 'skull crushers', 'flyes', 'db row', 'bb squat', 'kb swing',
  'Squat (Barbell)', 'Bench Press (Dumbbell)', 'bicep curls', 'tricep pushdowns', 'hip thrusts', 'face pulls',
  // run-together words
  'benchpress', 'pullups', 'situps', 'skullcrusher', 'pulldown',
  // typos
  'lat pulldwon', 'romanain deadlift', 'sqaut', 'dumbell curl', 'incline bech press', 'shoulder pres', 'tricpe extension', 'hamer curl',
  // nothing like it
  'zzzz qqqq', 'xylophone', 'qwertyuiop', 'my own thing', 'kettlebell banana', 'asdfgh jkl', 'vvvvvvvv wwwwww',
];

/** Best-of-N wall time of `fn`, in ms. */
function bestOf(n: number, fn: () => void): number {
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe('exercise search speed (phone budget)', () => {
  it('the query set has 50 searches', () => {
    expect(QUERIES.length).toBe(50);
  });

  it('building the index for the whole library takes under 30 ms', () => {
    // Warm the code paths (the JIT on this machine; Hermes has none, hence the headroom).
    for (let i = 0; i < 3; i++) {
      clearSearchCaches();
      buildSearchIndex(libraryCopy());
    }
    // A cold build each time: the library titles and the word list are made again too.
    const ms = bestOf(15, () => {
      clearSearchCaches();
      buildSearchIndex(libraryCopy());
    });
    expect(ms, `index build ${ms.toFixed(1)} ms`).toBeLessThan(30);
  });

  it('50 mixed searches average under 3 ms each', () => {
    const lib = libraryCopy();
    const run = () => {
      for (const q of QUERIES) filterExercises(lib, { query: q, muscle: null, equipment: null });
    };
    run(); // index built once, as the open list does
    const ms = bestOf(8, run) / QUERIES.length;
    expect(ms, `average ${ms.toFixed(2)} ms per search`).toBeLessThan(3);
  });

  it('a typo still finds its exercise when few exact matches exist', () => {
    const lib = libraryCopy();
    const s = (q: string) => filterExercises(lib, { query: q, muscle: null, equipment: null });
    expect(s('lat pulldwon')[0]?.key).toMatch(/pulldown/);
    expect(s('romanain deadlift')[0]?.key).toBe('romanian_deadlift');
    expect(s('zzzz qqqq')).toEqual([]);
  });
});
