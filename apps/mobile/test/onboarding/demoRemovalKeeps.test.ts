/**
 * Removing the demo keeps everything the member made themselves, and never runs on real data
 * (real SQLite).
 *
 *  - The welcome screen after "Remove demo data" (no own workout) used to wipe EVERY table, so
 *    the folder, routine, body weight and measurements the member added over the demo went too.
 *  - Onboarding next to kept workouts inserted the library by exact name only: the demo's linked
 *    "Pull Up" got a second row "Pull-up" for the same library entry, and the version stamp then
 *    stopped the sync from ever repairing it.
 *  - Remove demo / prepare-import trusted the screen's cached demo flag: on a real install they
 *    would delete the member's history. Inside the job the stored flag is read again.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

const MEMBER: OnboardingInput = {
  name: 'Rahul Sharma',
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

function duplicateKeys(): { catalog_key: string; n: number }[] {
  return db.all<{ catalog_key: string; n: number }>(
    'SELECT catalog_key, COUNT(*) AS n FROM exercises WHERE catalog_key IS NOT NULL GROUP BY catalog_key HAVING COUNT(*) > 1',
  );
}

describe('Remove demo data, then the welcome screen', () => {
  beforeEach(() => vi.resetModules());

  it('no own workout: the member’s folder, routine, body weight and measurements stay', async () => {
    db = await bootRealApp();
    const { loadDemoData, removeDemoData, completeOnboarding } = await import('@/onboarding/db/dataActions');
    await loadDemoData();
    // The member's own things, added over the demo (dated after the demo's last day).
    const { todayISO, addDays } = await import('@/lib/date');
    const tomorrow = addDays(todayISO(), 1);
    const { createFolder } = await import('@/tracker/db/folderRepo');
    const { createRoutine, addExerciseToRoutine } = await import('@/tracker/db/routineRepo');
    const { logBodyWeight } = await import('@/db/queuedWrites');
    const { logMeasurements } = await import('@/tracker/db/measurementRepo');
    const folder = await createFolder('My plan');
    const routine = await createRoutine({ name: 'My push', dayType: 'push', folderId: folder });
    const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
    await addExerciseToRoutine(routine, bench);
    await logBodyWeight(tomorrow, 82.5);
    await logMeasurements(tomorrow, { waist: 84 });

    const r = await removeDemoData();
    expect(r).toMatchObject({ removed: true, keptWorkouts: 0 });
    await completeOnboarding(MEMBER);

    expect(db.count('workout_plans', `id = '${folder}'`)).toBe(1);
    expect(db.count('plan_days', `id = '${routine}'`)).toBe(1);
    expect(db.count('plan_exercises', `plan_day_id = '${routine}'`)).toBe(1);
    expect(db.all<{ weight_kg: number }>('SELECT weight_kg FROM body_weight WHERE date_iso = ?', [tomorrow])).toEqual([{ weight_kg: 82.5 }]);
    expect(db.count('body_measurements', `date_iso = '${tomorrow}'`)).toBe(1);
    expect(db.count('user_profile')).toBe(1);
    expect(duplicateKeys()).toEqual([]);
  });

  it('with kept workouts: no library entry gets a second row (Pull Up / Pull-up, Dips / Chest Dip)', async () => {
    db = await bootRealApp();
    const { loadDemoData, removeDemoData, completeOnboarding } = await import('@/onboarding/db/dataActions');
    await loadDemoData();
    expect(duplicateKeys()).toEqual([]);
    const { createSession, addSets } = await import('@/db/repos/workoutRepo');
    const { todayISO, addDays } = await import('@/lib/date');
    const pull = db.all<{ id: string; catalog_key: string | null }>("SELECT id, catalog_key FROM exercises WHERE name = 'Pull Up'")[0];
    expect(pull?.catalog_key).toBe('pull_up');
    const s = await createSession({ dateISO: addDays(todayISO(), 1), dayType: 'pull', source: 'manual' });
    await addSets(s.id, [{ exerciseId: pull.id, weightKg: 0, reps: 10 }]);

    expect((await removeDemoData()).keptWorkouts).toBe(1);
    const library = db.count('exercises');
    await completeOnboarding(MEMBER);

    expect(duplicateKeys()).toEqual([]);
    expect(db.count('exercises', "catalog_key = 'pull_up'")).toBe(1);
    expect(db.count('exercises', "catalog_key = 'chest_dip'")).toBeLessThanOrEqual(1);
    expect(db.count('exercises')).toBe(library); // the library was already whole
    expect(db.count('set_entries', `session_id = '${s.id}'`)).toBe(1);
  });
});

describe('Demo actions refuse on a real install (the stored flag is read inside the job)', () => {
  beforeEach(() => vi.resetModules());

  async function realInstall(): Promise<string> {
    db = await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    const { createSession, addSets } = await import('@/db/repos/workoutRepo');
    const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
    const s = await createSession({ dateISO: '2026-01-05', dayType: 'push', source: 'seed' }); // even a seed-looking row
    await addSets(s.id, [{ exerciseId: bench, weightKg: 60, reps: 8 }]);
    const { logBodyWeight } = await import('@/db/queuedWrites');
    await logBodyWeight('2026-01-05', 80);
    return s.id;
  }

  it('Remove demo data: nothing deleted, and it says why', async () => {
    const own = await realInstall();
    const { removeDemoData, NOT_DEMO_REASON } = await import('@/onboarding/db/dataActions');
    const r = await removeDemoData();
    expect(r).toEqual({ removed: false, keptWorkouts: 1, reason: NOT_DEMO_REASON });
    expect(db.count('workout_sessions', `id = '${own}'`)).toBe(1);
    expect(db.count('user_profile')).toBe(1);
    expect(db.count('body_weight')).toBe(1);
  });

  it('Import over the demo: the profile and history stay as they are', async () => {
    const own = await realInstall();
    const { prepareImportOverDemo } = await import('@/onboarding/db/dataActions');
    const r = await prepareImportOverDemo('Someone Else');
    expect(r.prepared).toBe(false);
    expect(db.count('workout_sessions', `id = '${own}'`)).toBe(1);
    expect(db.all<{ name: string; age: number }>('SELECT name, age FROM user_profile')).toEqual([{ name: 'Rahul Sharma', age: 30 }]);
    expect(db.count('body_weight')).toBe(1);
  });
});
