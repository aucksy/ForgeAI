/**
 * Phase 4 review, round 2 — the fixes against REAL SQLite (test/helpers/realDb.ts). Every
 * workout and routine here is made up.
 *  2. one Hevy routine copied into a folder whose routine of that name the member built by hand:
 *     their sets, reps and extra exercises stay; only Hevy's new exercise is added.
 *  6. two 30-minute "Cardio" workouts on one day, the morning one imported before: importing the
 *     file again brings the evening one in (it was skipped as "already here").
 *  7. a workout ending at a real moment is never moved by the old-import clock repair.
 *  9. merging an exercise rebuilds records by the app's own rule: an easy-week workout sets no
 *     record, but a later workout still has to beat it.
 *  +  a backup carries which routine rows were copied and which exercises are hidden.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

let db: RealDb;
beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
});

const idOf = (name: string): string => {
  const row = db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0];
  if (!row) throw new Error(`not in library: ${name}`);
  return row.id;
};

describe('2 · a hand-built routine is never overwritten by a copy of the same name', () => {
  it('sets, reps and extra exercises stay; Hevy’s new exercise is added', async () => {
    const { createFolder, listFolders } = await import('@/tracker/db/folderRepo');
    const { createRoutine, addExerciseToRoutine } = await import('@/tracker/db/routineRepo');
    const folderId = await createFolder('Mine');
    const day = await createRoutine({ name: 'Legs', dayType: 'legs', folderId });
    const squat = idOf('Barbell Squat');
    const lunge = idOf('Walking Lunge');
    const press = idOf('Leg Press');
    await addExerciseToRoutine(day, squat, { targetSets: 5, repRangeMin: 5, repRangeMax: 5 });
    await addExerciseToRoutine(day, lunge, { targetSets: 3, repRangeMin: 12, repRangeMax: 12 });

    const target = (await listFolders()).find((f) => f.id === folderId)!;
    const { saveImportedFolder } = await import('@/tracker/services/routineMerge');
    const res = await saveImportedFolder(
      target,
      target.name,
      [{ name: 'Legs', dayType: 'legs', exercises: [{ exerciseId: squat, sets: 3, repMin: 8, repMax: 8 }, { exerciseId: press, sets: 3, repMin: 10, repMax: 10 }] }],
      {},
      { follow: false, todayISO: '2026-10-10', addOnly: true },
    );
    const rows = db.all<{ exercise_id: string; target_sets: number; rep_range_min: number }>(
      'SELECT exercise_id, target_sets, rep_range_min FROM plan_exercises WHERE plan_day_id = ? ORDER BY ex_order',
      [day],
    );
    expect(rows).toEqual([
      { exercise_id: squat, target_sets: 5, rep_range_min: 5 },
      { exercise_id: press, target_sets: 3, rep_range_min: 10 },
      { exercise_id: lunge, target_sets: 3, rep_range_min: 12 },
    ]);
    expect(res.keptEdits).toEqual(['Legs']);
    expect(db.count('plan_days', "name = 'Legs'")).toBe(1);
  });
});

describe('6 · two 30-minute "Cardio" workouts on one day', () => {
  const HEAD = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe';
  const cardio = (h: number) => `"Cardio","7 Jul 2026, ${h}:00","7 Jul 2026, ${h}:30","","Treadmill",,"",0,normal,,,4,1800,`;
  const importCsv = async (lines: string[]) => {
    const { parseHevyBase64, runImport } = await import('@/tracker/services/hevyImport');
    const parsed = parseHevyBase64(Buffer.from([HEAD, ...lines].join('\n'), 'utf8').toString('base64'));
    return runImport(parsed, { mode: 'merge' });
  };
  it('the morning one imported before: importing both brings the evening one in', async () => {
    await importCsv([cardio(7)]);
    expect(db.count('workout_sessions', "title = 'Cardio'")).toBe(1);
    const r = await importCsv([cardio(7), cardio(18)]);
    expect(r.imported).toBe(1);
    expect(r.skippedExisting).toBe(1);
    expect(db.count('workout_sessions', "title = 'Cardio'")).toBe(2);
  });
});

describe('7 · the old-import clock repair', () => {
  it('a whole-second start that ends at a real moment (logged in ForgeAI) is left alone', async () => {
    const { setMeta } = await import('@/db');
    const { createSession } = await import('@/db/repos/workoutRepo');
    await setMeta('import_clock_real_v1', '');
    const start = Date.UTC(2026, 6, 7, 21, 0);
    const live = await createSession({ dateISO: '2026-07-07', dayType: 'push', notes: null, source: 'manual', startedAt: start, endedAt: start + 3_600_000 + 417 });
    const old = await createSession({ dateISO: '2026-07-07', dayType: 'push', notes: null, source: 'manual', startedAt: start, endedAt: start + 3_600_000 });
    const { repairImportedClockTimes } = await import('@/tracker/services/importClockRepair');
    // On a UTC phone the wall clock and UTC agree, so the old import needs no move (0 changed).
    const shifts = new Date(2026, 6, 7, 21, 0).getTime() !== start ? 1 : 0;
    expect(await repairImportedClockTimes()).toBe(shifts);
    const at = (id: string) => db.all<{ s: number }>('SELECT started_at AS s FROM workout_sessions WHERE id = ?', [id])[0].s;
    expect(at(live.id)).toBe(start);
    expect(at(old.id)).toBe(new Date(2026, 6, 7, 21, 0).getTime());
  });
});

describe('9 · merge rebuilds records by the app’s own rule', () => {
  it('an easy-week workout sets no record, but a later lighter workout is no record either', async () => {
    const curl = idOf('Dumbbell Curl');
    const { createCustomExercise } = await import('@/tracker/db/customExercise');
    const dup = await createCustomExercise({
      name: 'My Curl',
      logType: 'weight_reps',
      muscles: { primary: ['biceps'], secondary: [] },
      equipment: 'dumbbell',
      isCompound: false,
      incrementKg: 2.5,
      countsBodyweight: false,
    }, { uri: null, type: null });
    const add = (id: string, day: number, ex: string, kg: number, easy: boolean) => {
      const start = new Date(2026, 7, day, 18, 0, 0, 0).getTime() + 123;
      db.raw.run(
        "INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, notes, source, easy_week) VALUES (?, ?, ?, ?, 'pull', NULL, 'manual', ?)",
        [id, `2026-08-0${day}`, start, start + 3_600_000, easy ? 1 : 0],
      );
      db.raw.run('INSERT INTO set_entries (id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup) VALUES (?, ?, ?, 1, ?, 8, 0)', [`${id}-s`, id, ex, kg]);
    };
    add('easy', 1, curl, 20, true);
    add('later', 8, dup, 18, false);
    const { mergeExercise } = await import('@/tracker/db/exerciseManage');
    await mergeExercise(dup, curl);
    // The frozen detector, logging the same two workouts live, records nothing for either.
    expect(db.all("SELECT session_id FROM personal_records WHERE exercise_id = ? AND kind IN ('weight', 'e1rm')", [curl])).toEqual([]);
  });
});

describe('a backup carries copied-routine marks and hidden exercises', () => {
  it('both come back on restore', async () => {
    const { setMeta, getMeta } = await import('@/db');
    await setMeta('routine_import_marks', JSON.stringify({ d1: ['x|3|8|10||||'] }));
    await setMeta('hidden_exercises', JSON.stringify(['e1']));
    const { exportSnapshot, importSnapshot, parseSnapshot } = await import('@/cloud/snapshot');
    const json = await exportSnapshot();
    db.raw.run("DELETE FROM meta WHERE key IN ('routine_import_marks', 'hidden_exercises')");
    await importSnapshot(parseSnapshot(json));
    expect(await getMeta('routine_import_marks')).toBe(JSON.stringify({ d1: ['x|3|8|10||||'] }));
    expect(await getMeta('hidden_exercises')).toBe(JSON.stringify(['e1']));
  });
});
