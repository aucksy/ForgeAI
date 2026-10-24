/**
 * The cloud copy's compact format (tracker #50, src/cloud/pack.ts): every kind packs and comes back
 * unchanged, packing is stable (same rows, same text, same hash), and a typical workout stays in the
 * size class the free-plan math in 0032's header counts on.
 */
import { describe, expect, it } from 'vitest';

import {
  exerciseRef,
  MAX_PACKED_CHARS,
  measurementId,
  packBodyWeight,
  packExercise,
  packFolder,
  packHash,
  packPrefs,
  packProfile,
  packWorkout,
  parseRef,
  splitMeasurementId,
  trimEnd,
  unpackBodyWeight,
  unpackExercise,
  unpackFolder,
  unpackPrefs,
  unpackProfile,
  unpackWorkout,
  type SetRow,
  type WorkoutRow,
} from '@/cloud/pack';

const SESSION: WorkoutRow = {
  id: '6f1c2a7e-1111-4d2b-9a1e-2f0c9b7d1a01',
  date_iso: '2026-10-20',
  started_at: 1792476000000,
  ended_at: 1792479900000,
  day_type: 'push',
  notes: null,
  source: 'manual',
  easy_week: null,
  title: 'Push Day A',
  routine_id: '9a3b5c7d-2222-4e6f-8a9b-0c1d2e3f4a5b',
};

const set = (exercise: string, n: number, kg: number, reps: number, extra: Partial<SetRow> = {}): SetRow => ({
  exercise_id: exercise,
  set_number: n,
  weight_kg: kg,
  reps,
  is_warmup: 0,
  rpe: null,
  set_type: null,
  note: null,
  superset_group: null,
  duration_sec: null,
  distance_m: null,
  load_mode: null,
  card_index: null,
  ...extra,
});

/** The owner's history averages 4.4 exercises and 18 sets a workout (#50): 5 exercises, 18 sets. */
function typicalSets(): SetRow[] {
  const out: SetRow[] = [];
  const plan: [string, number, number][] = [
    ['bench', 4, 62.5],
    ['incline', 4, 22.5],
    ['fly', 3, 15],
    ['pushdown', 4, 27.5],
    ['lateral', 3, 8],
  ];
  for (const [ex, sets, kg] of plan) {
    for (let i = 1; i <= sets; i++) out.push(set(ex, i, kg, 8 + (i % 3), i === 1 ? { is_warmup: 1, set_type: 'warmup' } : {}));
  }
  return out;
}

const REFS: Record<string, string> = {
  bench: 'c:barbell_bench_press',
  incline: 'c:incline_dumbbell_press',
  fly: 'c:cable_fly',
  pushdown: 'c:triceps_pushdown',
  lateral: 'c:dumbbell_lateral_raise',
};
const refOf = (id: string): string => REFS[id] ?? `x:${id}`;

describe('workouts', () => {
  it('a typical workout is about 550 characters — the size class 0032 counts on', () => {
    const text = packWorkout(SESSION, typicalSets(), refOf);
    expect(text.length).toBeLessThan(560);
    expect(text.length).toBeGreaterThan(250);
    // A heavy day (60 sets) still fits a row many times over.
    const heavy = Array.from({ length: 60 }, (_, i) => set('bench', i + 1, 100, 5, { note: 'felt strong today' }));
    expect(packWorkout(SESSION, heavy, refOf).length).toBeLessThan(MAX_PACKED_CHARS / 8);
  });

  it('comes back exactly: every set field, the order, the cards and supersets', () => {
    const sets = [
      ...typicalSets(),
      set('bench', 1, 50, 12, { card_index: 1, rpe: 8.5, set_type: 'drop', note: 'back-off' }),
      set('plank', 1, 0, 0, { duration_sec: 60, superset_group: 2 }),
      set('row', 1, 0, 0, { distance_m: 2000, load_mode: 'each' }),
    ];
    const back = unpackWorkout(packWorkout(SESSION, sets, refOf));
    expect(back).not.toBeNull();
    const { id: _id, ...session } = SESSION;
    expect(back!.session).toEqual(session);
    expect(back!.sets.map(({ ref, ...rest }) => ({ ...rest, exercise_id: Object.keys(REFS).find((k) => REFS[k] === ref) ?? ref.slice(2) }))).toEqual(sets);
  });

  it('packing is stable: the same rows give the same text and the same hash', () => {
    const a = packWorkout(SESSION, typicalSets(), refOf);
    const b = packWorkout({ ...SESSION }, typicalSets(), refOf);
    expect(a).toBe(b);
    expect(packHash(a)).toBe(packHash(b));
    expect(packHash(a)).not.toBe(packHash(packWorkout({ ...SESSION, notes: 'x' }, typicalSets(), refOf)));
  });

  it('a damaged record reads as nothing (the caller logs and skips it)', () => {
    expect(unpackWorkout('not json')).toBeNull();
    expect(unpackWorkout('{"a":1}')).toBeNull();
    expect(unpackWorkout('[[],"2026-10-20"]')).toBeNull(); // no start
  });
});

describe('the other kinds come back unchanged', () => {
  it('a routine folder with its routines and exercises', () => {
    const folder = { id: 'f1', name: 'Push Pull Legs', is_active: 1, folder_order: 2, source: 'program', settings: '{"easy":true}' };
    const days = [
      { id: 'd1', plan_id: 'f1', day_type: 'push', day_order: 0, name: 'Push' },
      { id: 'd2', plan_id: 'f1', day_type: 'pull', day_order: 1, name: 'Pull' },
    ];
    const exs = [
      { plan_day_id: 'd1', exercise_id: 'bench', ex_order: 0, target_sets: 4, rep_range_min: 6, rep_range_max: 10, sets_json: '[{"t":"normal"}]', rest_sec: 150, superset_group: null, note: 'pause' },
      { plan_day_id: 'd2', exercise_id: 'my-own', ex_order: 0, target_sets: 3, rep_range_min: 8, rep_range_max: 12, sets_json: null, rest_sec: null, superset_group: 1, note: null },
    ];
    const back = unpackFolder(packFolder(folder, days, exs, refOf))!;
    expect(back.folder).toEqual({ name: 'Push Pull Legs', is_active: 1, folder_order: 2, source: 'program', settings: '{"easy":true}' });
    expect(back.days.map((d) => [d.id, d.name, d.exercises.map((e) => e.ref)])).toEqual([
      ['d1', 'Push', ['c:barbell_bench_press']],
      ['d2', 'Pull', ['x:my-own']],
    ]);
    expect(back.days[0].exercises[0]).toMatchObject({ target_sets: 4, rep_range_min: 6, rest_sec: 150, note: 'pause' });
  });

  it('an own exercise, preferences, body weight, a measurement, the profile', () => {
    const ex = { name: 'Landmine Press', muscle_group: 'shoulders', equipment: 'barbell', is_compound: 1, increment_kg: 2.5, aliases: '[]', secondary_muscles: '["triceps"]', log_type: 'weight_reps', load_mode: null, bw_share: 0, muscles: '{"primary":["front_delts"],"secondary":[]}', dist_unit: null };
    expect(unpackExercise(packExercise(ex))).toEqual(ex);
    const prefs = [
      { ref: 'x:b', rest_sec: 90, records_from: null },
      { ref: 'c:a', rest_sec: null, records_from: '2026-09-01' },
    ];
    expect(unpackPrefs(packPrefs(prefs))).toEqual([prefs[1], prefs[0]]); // sorted by ref
    expect(packPrefs(prefs)).toBe(packPrefs([...prefs].reverse()));
    expect(unpackBodyWeight(packBodyWeight(78.4))).toBe(78.4);
    expect(splitMeasurementId(measurementId('2026-10-20', 'waist'))).toEqual({ dateISO: '2026-10-20', kind: 'waist' });
    const profile = { name: 'Rahul', age: 31, height_cm: 176, goal: 'muscle', experience: 'intermediate', gym_name: 'Iron Temple', member_since_iso: '2026-01-02', calorie_target: 2600, protein_target_g: 140, carbs_target_g: 320, fat_target_g: 80, unit_system: 'metric', language: 'en', bio: null, link: null };
    expect(unpackProfile(packProfile(profile))).toEqual(profile);
  });

  it('the profile never carries a phone number', () => {
    const p = packProfile({ name: 'R', age: 1, height_cm: 1, goal: 'g', experience: 'e', gym_name: '', member_since_iso: '', calorie_target: 0, protein_target_g: 0, carbs_target_g: 0, fat_target_g: 0, unit_system: null, language: null, bio: null, link: null, ...({ phone: '+919876543210' } as object) } as Parameters<typeof packProfile>[0]);
    expect(p).not.toContain('9876543210');
  });
});

describe('helpers', () => {
  it('library exercises go by their key, the member’s own by id', () => {
    expect(exerciseRef('row-1', 'barbell_row')).toBe('c:barbell_row');
    expect(exerciseRef('row-1', null)).toBe('x:row-1');
    expect(parseRef('c:barbell_row')).toEqual({ library: true, key: 'barbell_row' });
    expect(parseRef('x:row-1')).toEqual({ library: false, id: 'row-1' });
    expect(parseRef('zz')).toBeNull();
  });

  it('trailing empty places are dropped, inner ones kept', () => {
    expect(trimEnd([1, null, 2, null, undefined])).toEqual([1, null, 2]);
    expect(trimEnd([null])).toEqual([]);
  });
});
