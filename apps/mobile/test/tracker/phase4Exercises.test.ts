/**
 * Audit Phase 4, packet A — exercises (pure rules; the merge / hide / library refresh run
 * against real SQL in exerciseMerge.test.ts, search in exerciseSearchEveryday.test.ts):
 *  - EX-07 the page leads with "Last time · Best", and a weight move never lifted with added
 *    weight reads as reps (no "0 kg");
 *  - EX-08 the form guesses muscle, gear and type from the name, and says what is missing;
 *  - EX-13 a picture brought back after a restart goes to the exercise it was taken for;
 *  - EX-20 library names are written in one style; old spellings still link;
 *  - EX-12 / EX-17 / EX-19 rows wrap long names, are one big button, and Edit never saves as new.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CATALOG, catalogEntryByName } from '@/tracker/catalog/exerciseCatalog';
import { nameShape, planCatalogSync, type SyncRow } from '@/tracker/catalog/catalogSync';
import { launchFor, takePendingPick, type PickStore } from '@/lib/pendingPick';
import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';
import type { RecordHit } from '@/tracker/engine/records';
import { headlineBest, lastTimeLine, shownLogType } from '@/tracker/services/exerciseHeadline';
import { guessFromName, missingForSave } from '@/tracker/services/exerciseGuess';

const SRC = join(__dirname, '..', '..', 'src');
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');

let n = 0;
function day(dateISO: string, sets: [number, number, boolean?][]): ExerciseHistoryEntry {
  n += 1;
  return {
    sessionId: `s${n}`,
    dateISO,
    volumeKg: 0,
    sets: sets.map(([weightKg, reps, isWarmup], i) => ({
      id: `s${n}-${i}`,
      sessionId: `s${n}`,
      exerciseId: 'x',
      setNumber: i + 1,
      weightKg,
      reps,
      isWarmup: isWarmup ?? false,
    })),
  };
}
const hit = (kind: RecordHit['kind'], value: number): RecordHit => ({ kind, value, sessionId: 's', dateISO: '2026-10-01' }) as RecordHit;

describe('EX-07 the exercise page leads with Last time · Best', () => {
  it('a pull-up always logged at +0 kg reads as reps — never "0 kg" tiles or a flat 0 chart', () => {
    const history = [day('2026-10-08', [[0, 12], [0, 10]]), day('2026-10-01', [[0, 11]])];
    expect(shownLogType('weight_reps', history)).toBe('reps');
    expect(shownLogType('weighted', history)).toBe('reps');
    // One set with real weight keeps it a weight move.
    expect(shownLogType('weight_reps', [...history, day('2026-09-01', [[20, 5]])])).toBe('weight_reps');
    expect(shownLogType('time', history)).toBe('time');
  });
  it('last time lists the newest workout\'s working sets (warm-ups left out)', () => {
    const history = [day('2026-10-08', [[40, 10, true], [60, 8], [60, 8], [62.5, 6]]), day('2026-10-01', [[55, 8]])];
    expect(lastTimeLine(history, 'weight_reps', 'metric', 'km')).toEqual({ dateISO: '2026-10-08', text: '60 × 8, 60 × 8, 62.5 × 6 kg' });
    expect(lastTimeLine([], 'weight_reps', 'metric', 'km')).toBeNull();
  });
  it('best is the record that fits how it is logged, never a 0', () => {
    expect(headlineBest([hit('e1rm', 90), hit('weight', 80)], 'weight_reps')?.kind).toBe('weight');
    expect(headlineBest([hit('weight', 0), hit('reps', 15)], 'reps')?.kind).toBe('reps');
    expect(headlineBest([hit('weight', 0)], 'weight_reps')).toBeNull();
  });
});

describe('EX-08 quick create guesses and says what is missing', () => {
  it('guesses from the library: muscle, gear and how it is logged', () => {
    const plank = guessFromName('Wall Plank Hold');
    expect(plank.muscle).toBe('abs');
    expect(plank.logType).toBe('time');
    const curl = guessFromName('bicep curls');
    expect(curl.muscle).toBe('biceps');
    expect(curl.equipment).not.toBeNull();
    // The gear the member named wins.
    expect(guessFromName('Cable Hammer Curls').equipment).toBe('cable');
  });
  it('guesses nothing from a letter or two', () => {
    expect(guessFromName('ab')).toEqual({ muscle: null, equipment: null, logType: null, from: null });
  });
  it('Save says what is missing', () => {
    expect(missingForSave({ name: '', muscle: null, equipment: null })).toBe('Type a name');
    expect(missingForSave({ name: 'Sled Drag', muscle: null, equipment: 'other' })).toBe('Pick a main muscle');
    expect(missingForSave({ name: 'Sled Drag', muscle: 'quads', equipment: null })).toBe('Pick the equipment');
    expect(missingForSave({ name: 'Sled Drag', muscle: 'quads', equipment: 'other' })).toBeNull();
  });
});

function memoryStore(): PickStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
}
const shot = { canceled: false as const, assets: [{ uri: 'file:///cache/ImagePicker/a.jpg', width: 1080, height: 1440 }] };

describe('EX-13 a photo taken before Android closed the app goes to its own exercise', () => {
  it('exercise B\'s form never takes exercise A\'s photo; A\'s form does', async () => {
    const store = memoryStore();
    void launchFor('exercise-media', () => new Promise<never>(() => undefined), store, 'exercise-A');
    await Promise.resolve();
    const pending = async () => shot;
    expect(await takePendingPick('exercise-media', { store, pending }, 'exercise-B')).toBeNull();
    expect((await takePendingPick('exercise-media', { store, pending }, 'exercise-A'))?.uri).toBe(shot.assets[0].uri);
    expect(await takePendingPick('exercise-media', { store, pending }, 'exercise-A')).toBeNull();
  });
  it('a note from before this version (no exercise on it) still comes back', async () => {
    const store = memoryStore();
    await store.setItem('forgeai.pendingPick', 'exercise-media');
    expect((await takePendingPick('exercise-media', { store, pending: async () => shot }, 'new'))?.uri).toBe(shot.assets[0].uri);
  });
});

describe('EX-20 library names in one style', () => {
  it('"-Up" and hyphenated grips everywhere ("Pull-Up", "Close-Grip Bench Press")', () => {
    const off = CATALOG.filter((e) => /-up\b/.test(e.name) || /\b(Close|Wide|Neutral|Reverse|Narrow) Grip\b/.test(e.name)).map((e) => e.name);
    expect(off).toEqual([]);
  });
  it('the old spellings still mean the same exercise (rows on older phones link and restyle)', () => {
    expect(catalogEntryByName('Close Grip Bench Press')?.key).toBe('close_grip_bench_press');
    expect(catalogEntryByName('Pull-up')?.key).toBe('pull_up');
    expect(nameShape('Pull-up')).toBe(nameShape('Pull-Up'));
  });
  it('a library row is restyled; two rows that would become twins are left alone', () => {
    const row = (id: string, name: string, key: string | null, own = false): SyncRow => ({
      id, name, catalogKey: key, logType: null, loadMode: null, sets: { count: 0, anyPositive: false, anyNegative: false }, own,
    });
    const plan = planCatalogSync([row('a', 'Chin-up', 'chin_up'), row('b', 'Pull Up', 'pull_up'), row('c', 'Pull-up', null)], { demo: false });
    expect(plan.refresh.find((r) => r.id === 'a')?.name).toBe('Chin-Up');
    expect(plan.refresh.find((r) => r.id === 'b')?.name).toBeNull();
    // The member's own exercise is never linked by name.
    const own = planCatalogSync([row('d', 'Sled Push', null, true)], { demo: false });
    expect(own.links).toEqual([]);
  });
});

// [source-text check] Architecture lint over source text — kept on purpose as lint, not a behaviour test (audit QA-12).
describe('[source-text check] rows and forms', () => {
  it('EX-12 / EX-17: a list row is one big button and its name wraps to two lines', () => {
    const row = read('tracker/components/ExerciseListRow.tsx');
    expect(row).toMatch(/<Pressable[\s\S]*minHeight: 64/);
    expect(row).toMatch(/numberOfLines=\{2\}[^>]*>\s*\{ex\.name\}/);
  });
  it('EX-19: Edit never saves as a new exercise when the exercise could not be read', () => {
    expect(read('app/library/new.tsx')).toContain("if (editId && !existing) throw new Error('not-loaded')");
  });
  it('EX-06: the library, the workout, routines and the plan builder share one list', () => {
    expect(read('tracker/components/LibraryList.tsx')).toContain('<ExercisePickerList');
    for (const f of ['app/session/add-exercise.tsx', 'app/routines/add-exercise.tsx', 'app/plan/avoid.tsx']) {
      expect(read(f), f).toContain('<ExercisePickerList');
    }
  });
});
