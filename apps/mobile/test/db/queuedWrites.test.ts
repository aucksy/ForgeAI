/**
 * A member's single writes made WHILE a long queued transaction is open (a history import still
 * running after Back) must survive that transaction rolling back (real SQLite).
 *
 * Every statement shares one connection. An unqueued `runAsync` issued mid-import runs INSIDE the
 * import's transaction; when the import fails and rolls back, the member's delete or body weight
 * is rolled back with it — silently. Routed through the write queue, it waits for the import.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: null,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

let db: RealDb;

async function setUp(): Promise<{ workout: string; routine: string; pe: string; bench: string }> {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  const { createSession, addSets } = await import('@/db/repos/workoutRepo');
  const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
  const s = await createSession({ dateISO: '2026-10-01', dayType: 'push', source: 'manual' });
  await addSets(s.id, [{ exerciseId: bench, weightKg: 60, reps: 8 }]);
  const { createRoutine, addExerciseToRoutine } = await import('@/tracker/db/routineRepo');
  const routine = await createRoutine({ name: 'Push A', dayType: 'push' });
  const pe = await addExerciseToRoutine(routine, bench);
  return { workout: s.id, routine, pe, bench };
}

/** A long queued transaction (an import) that writes, waits, then FAILS and rolls back. */
async function failingImport(): Promise<{ done: Promise<unknown>; fail: () => void }> {
  const { enqueueWrite } = await import('@/db/writeQueue');
  const { getDb } = await import('@/db');
  let fail!: () => void;
  const gate = new Promise<void>((r) => (fail = r));
  let started!: () => void;
  const running = new Promise<void>((r) => (started = r));
  const done = enqueueWrite(() =>
    getDb().withTransactionAsync(async () => {
      await getDb().runAsync("INSERT INTO workout_sessions (id, date_iso, started_at, day_type, source) VALUES ('imp', '2025-01-01', 1, 'push', 'manual')");
      started();
      await gate;
      throw new Error('import failed');
    }),
  );
  await running;
  return { done, fail };
}

describe('single writes during a long import survive its rollback', () => {
  beforeEach(() => vi.resetModules());

  it('control: a plain unqueued write made mid-import IS rolled back with it (the hazard is real)', async () => {
    await setUp();
    const imp = await failingImport();
    const { logBodyWeight } = await import('@/db/repos/userRepo'); // the raw repo write
    await logBodyWeight('2026-10-02', 81);
    imp.fail();
    await expect(imp.done).rejects.toThrow('import failed');
    expect(db.count('body_weight', "date_iso = '2026-10-02'")).toBe(0);
  });

  it('workout delete, body weight, meal, routine edits, rest, folder: all still stand after the rollback', async () => {
    const { workout, routine, pe, bench } = await setUp();
    const imp = await failingImport();

    const { deleteWorkout } = await import('@/tracker/services/workoutDelete');
    const q = await import('@/db/queuedWrites');
    const routines = await import('@/tracker/db/routineRepo');
    const { setExerciseRestSec } = await import('@/tracker/db/exercisePrefs');
    const { createFolder, renameFolder } = await import('@/tracker/db/folderRepo');

    // Issued while the import's transaction is open.
    const writes = Promise.all([
      deleteWorkout(workout),
      q.logBodyWeight('2026-10-02', 81),
      q.logMeal({ dateISO: '2026-10-02', description: 'Rice', calories: 500, proteinG: 10, carbsG: 100, fatG: 5 }),
      routines.updateRoutineExercise(pe, { targetSets: 5 }),
      routines.addExerciseToRoutine(routine, bench),
      routines.updateRoutine(routine, { name: 'Push B' }),
      setExerciseRestSec(bench, 150),
      createFolder('My folder').then((id) => renameFolder(id, 'My folder 2')),
    ]);
    imp.fail();
    await expect(imp.done).rejects.toThrow('import failed');
    const [deleted] = await writes;

    expect(deleted).toMatchObject({ deleted: true });
    expect(db.count('workout_sessions', `id = '${workout}'`)).toBe(0);
    expect(db.count('workout_sessions', "id = 'imp'")).toBe(0); // the import really rolled back
    expect(db.all<{ weight_kg: number }>("SELECT weight_kg FROM body_weight WHERE date_iso = '2026-10-02'")).toEqual([{ weight_kg: 81 }]);
    expect(db.count('meals', "description = 'Rice'")).toBe(1);
    expect(db.all<{ target_sets: number }>('SELECT target_sets FROM plan_exercises WHERE id = ?', [pe])).toEqual([{ target_sets: 5 }]);
    expect(db.count('plan_exercises', `plan_day_id = '${routine}'`)).toBe(2);
    expect(db.all<{ name: string }>('SELECT name FROM plan_days WHERE id = ?', [routine])).toEqual([{ name: 'Push B' }]);
    expect(db.all<{ rest_sec: number }>('SELECT rest_sec FROM exercise_prefs WHERE exercise_id = ?', [bench])).toEqual([{ rest_sec: 150 }]);
    expect(db.count('workout_plans', "name = 'My folder 2'")).toBe(1);
  });

  it('removing a routine exercise and the routine itself also wait for the import', async () => {
    const { routine, pe } = await setUp();
    const imp = await failingImport();
    const routines = await import('@/tracker/db/routineRepo');
    const writes = routines.removeRoutineExercise(pe).then(() => routines.deleteRoutine(routine));
    imp.fail();
    await expect(imp.done).rejects.toThrow();
    await writes;
    expect(db.count('plan_days', `id = '${routine}'`)).toBe(0);
  });

  it('duplicating a routine (a queued job that creates one inside it) does not wait for itself', async () => {
    const { routine } = await setUp();
    const { duplicateRoutine } = await import('@/tracker/db/routineRepo');
    const copy = await duplicateRoutine(routine);
    expect(db.count('plan_exercises', `plan_day_id = '${copy}'`)).toBe(1);
  });
});
