/**
 * Audit Phase 4 (EX-02, EX-15) against REAL SQL:
 *  - merging a duplicate moves its history, routine rows, records, rest and photo, then removes it;
 *  - sets keep how they were counted; a workout with both keeps two cards;
 *  - hiding is only for unused library exercises, and is undone from "Hidden exercises";
 *  - a library update restyles names and reads facts from the library on library rows, never on the member's own.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

let db: RealDb;
let seq = 0;

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  db.raw.run('DELETE FROM personal_records');
  db.raw.run('DELETE FROM set_entries');
  db.raw.run('DELETE FROM workout_sessions');
  seq = 0;
});

const idOf = (name: string): string => {
  const row = db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0];
  if (!row) throw new Error(`not in library: ${name}`);
  return row.id;
};

function addWorkout(dateISO: string, sets: { id: string; kg: number; reps: number; card?: number }[]): string {
  seq += 1;
  const id = `w${String(seq).padStart(3, '0')}`;
  const [y, m, d] = dateISO.split('-').map(Number);
  const start = new Date(y, m - 1, d, 18, 0, 0, 0).getTime();
  db.raw.run(
    "INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, notes, source) VALUES (?, ?, ?, ?, 'pull', NULL, 'manual')",
    [id, dateISO, start, start + 3_600_000],
  );
  sets.forEach((s, i) =>
    db.raw.run(
      'INSERT INTO set_entries (id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup, card_index) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      [`${id}-${i}`, id, s.id, i + 1, s.kg, s.reps, s.card ?? null],
    ),
  );
  return id;
}

async function makeOwn(name: string): Promise<string> {
  const { createCustomExercise } = await import('@/tracker/db/customExercise');
  return createCustomExercise(
    {
      name,
      logType: 'weight_reps',
      muscles: { primary: ['biceps'], secondary: [] },
      equipment: 'dumbbell',
      isCompound: false,
      incrementKg: 2.5,
      countsBodyweight: false,
    },
    { uri: 'file:///media/own.jpg', type: 'image' },
  );
}

describe('EX-02 merge a duplicate into the library exercise', () => {
  it('history, routines, records, rest and the photo move; the duplicate is gone; its name still searches', async () => {
    const dup = await makeOwn('Bicep curls');
    const curl = idOf('Dumbbell Curl');
    addWorkout('2026-08-01', [{ id: dup, kg: 12, reps: 10 }, { id: dup, kg: 14, reps: 8 }]);
    addWorkout('2026-08-08', [{ id: curl, kg: 10, reps: 10 }]);
    const both = addWorkout('2026-08-15', [{ id: curl, kg: 15, reps: 8 }, { id: dup, kg: 16, reps: 6 }]);
    // A routine row on the duplicate, and a rest time.
    db.raw.run("INSERT INTO workout_plans (id, name, is_active) VALUES ('p1', 'Arms', 0)");
    db.raw.run("INSERT INTO plan_days (id, plan_id, day_type, day_order, name) VALUES ('d1', 'p1', 'pull', 0, 'Arms A')");
    db.raw.run(
      "INSERT INTO plan_exercises (id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max) VALUES ('pe1', 'd1', ?, 0, 3, 8, 12)",
      [dup],
    );
    db.raw.run('INSERT INTO exercise_prefs (exercise_id, rest_sec) VALUES (?, 75)', [dup]);
    const { checkAndRecordPrs } = await import('@/db/repos/prRepo');
    for (const s of ['w001', 'w002', 'w003']) await checkAndRecordPrs(s);

    const { mergeExercise } = await import('@/tracker/db/exerciseManage');
    const res = await mergeExercise(dup, curl);

    expect(res.movedSets).toBe(3);
    expect(res.orphanMedia).toBeNull(); // the photo moved (Dumbbell Curl had none)
    expect(db.all('SELECT id FROM exercises WHERE id = ?', [dup])).toEqual([]);
    expect(db.all<{ n: number }>('SELECT COUNT(*) AS n FROM set_entries WHERE exercise_id = ?', [curl])[0].n).toBe(5);
    expect(db.all('SELECT exercise_id FROM plan_exercises WHERE id = ?', ['pe1'])).toEqual([{ exercise_id: curl }]);
    expect(db.all('SELECT rest_sec FROM exercise_prefs WHERE exercise_id = ?', [curl])).toEqual([{ rest_sec: 75 }]);
    for (const t of ['set_entries', 'personal_records', 'plan_exercises', 'exercise_prefs']) {
      expect(db.all(`SELECT 1 FROM ${t} WHERE exercise_id = ?`, [dup]), t).toEqual([]);
    }
    // The workout that had both keeps two cards.
    const cards = db.all<{ exercise_id: string; card_index: number | null }>(
      'SELECT exercise_id, card_index FROM set_entries WHERE session_id = ? ORDER BY set_number',
      [both],
    );
    expect(cards.map((c) => c.card_index ?? 0)).toEqual([0, 1]);
    // Records are records of the whole history: 12, 14 (Aug 1) → 15 kg on Aug 15 beats 14; the 10 kg day is no record.
    const weightRecords = db.all<{ value: number; session_id: string }>(
      "SELECT value, session_id FROM personal_records WHERE exercise_id = ? AND kind = 'weight' ORDER BY date_iso",
      [curl],
    );
    expect(weightRecords).toEqual([
      { value: 14, session_id: 'w001' },
      { value: 16, session_id: both },
    ]);
    const { getTrackerExercise } = await import('@/tracker/db/exerciseInfo');
    const kept = (await getTrackerExercise(curl))!;
    expect(kept.mediaUri).toBe('file:///media/own.jpg');
    expect(kept.aliases).toContain('bicep curls');
  });

  it('sets keep their counting: a duplicate typed "as one" merged into a "kg each" exercise', async () => {
    const dup = await makeOwn('My DB Curl');
    const curl = idOf('Dumbbell Curl');
    const { getTrackerExercise } = await import('@/tracker/db/exerciseInfo');
    expect((await getTrackerExercise(curl))!.loadMode).not.toBe('one');
    addWorkout('2026-08-01', [{ id: dup, kg: 24, reps: 10 }]);
    const { mergeExercise } = await import('@/tracker/db/exerciseManage');
    await mergeExercise(dup, curl);
    expect(db.all('SELECT load_mode FROM set_entries WHERE exercise_id = ?', [curl])).toEqual([{ load_mode: 'one' }]);
  });

  it('a library exercise is never merged away, and nor is one in the running workout', async () => {
    const { mergeRefusal } = await import('@/tracker/db/exerciseManage');
    const dup = await makeOwn('Curls again');
    expect(await mergeRefusal(idOf('Barbell Curl'), idOf('Dumbbell Curl'))).toBe('library');
    expect(await mergeRefusal(dup, dup)).toBe('same');
    db.raw.run("INSERT INTO meta (key, value) VALUES ('activeWorkoutDraft', ?)", [JSON.stringify({ exercises: [{ exerciseId: dup }] })]);
    expect(await mergeRefusal(dup, idOf('Dumbbell Curl'))).toBe('in-workout');
  });
});

describe('EX-02 hide library exercises the member never uses', () => {
  it('hides and shows again; never one with history, never the member\'s own', async () => {
    const m = await import('@/tracker/db/exerciseManage');
    const sled = idOf('Sled Push');
    await m.setExerciseHidden(sled, true);
    expect((await m.getHiddenExerciseIds()).has(sled)).toBe(true);
    await m.setExerciseHidden(sled, false);
    expect((await m.getHiddenExerciseIds()).has(sled)).toBe(false);

    const curl = idOf('Dumbbell Curl');
    addWorkout('2026-08-01', [{ id: curl, kg: 10, reps: 10 }]);
    expect(await m.hideRefusal(curl)).toBe('used');
    expect(await m.hideRefusal(await makeOwn('Wall Plank Hold'))).toBe('own');
    await expect(m.setExerciseHidden(curl, true)).rejects.toThrow(/used/);
  });
});

describe('EX-15 library fixes reach existing phones', () => {
  it('a library row takes the new name style and facts; the member\'s own exercise is never linked or changed', async () => {
    const pull = idOf('Pull-Up');
    // An older phone: the old spelling, old search words, and a coarse muscle.
    db.raw.run("UPDATE exercises SET name = 'Pull-up', aliases = '[\"old\"]', equipment = 'other' WHERE id = ?", [pull]);
    // The member's own exercise that happens to be called like a library entry, and one more.
    db.raw.run("DELETE FROM exercises WHERE name = 'Sled Push'");
    const own = await makeOwn('Sled Push');
    const { syncExerciseCatalog } = await import('@/tracker/catalog/catalogSync');
    db.raw.run("UPDATE meta SET value = '1' WHERE key = 'exercise_catalog_version'");
    expect(await syncExerciseCatalog()).toBe(true);

    // The name is restyled in place (the library's own older spelling)…
    const row = db.all<{ name: string }>('SELECT name FROM exercises WHERE id = ?', [pull])[0];
    expect(row.name).toBe('Pull-Up');
    // …and the facts come from the library at run time: gear, and search words.
    const { getTrackerExercise, getAllTrackerExercises } = await import('@/tracker/db/exerciseInfo');
    expect((await getTrackerExercise(pull))!.equipment).toBe('bodyweight');
    const { filterExercises } = await import('@/tracker/services/exerciseSearch');
    const all = await getAllTrackerExercises();
    expect(filterExercises(all, { query: 'Pull Up', muscle: null, equipment: null })[0].id).toBe(pull);
    // The member's own exercise keeps everything it has.
    const mine = db.all<{ catalog_key: string | null; equipment: string; name: string }>('SELECT catalog_key, equipment, name FROM exercises WHERE id = ?', [own])[0];
    expect(mine).toEqual({ catalog_key: null, equipment: 'dumbbell', name: 'Sled Push' });
    expect((await getTrackerExercise(own))!.equipment).toBe('dumbbell');
  });
});
