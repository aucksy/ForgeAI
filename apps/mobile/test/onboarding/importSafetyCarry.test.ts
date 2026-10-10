/**
 * Putting the import's safety copy back never takes a workout saved since the copy (real SQLite).
 *
 * The copy is the whole database from just before an import. A live workout finished WHILE the
 * import ran (or after it, before Undo) is not in it. Before: restoring the copy — after a failed
 * import over the demo, or on "Undo import" — replaced everything and that workout was gone.
 * Now every workout that is neither in the copy nor written by the import is carried forward.
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

const idOf = (name: string): string => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0].id;

/** A file of `n` workouts in 2025: bench, plus one exercise ForgeAI does not have yet. */
function file(n: number) {
  const workouts = Array.from({ length: n }, (_, i) => {
    const startedAt = Date.UTC(2025, 0, 1 + i, 9, 0, 0);
    return {
      title: `Imported ${i + 1}`,
      dayType: 'push' as const,
      startedAt,
      endedAt: startedAt + 3_600_000,
      dateISO: new Date(startedAt).toISOString().slice(0, 10),
      exercises: ['Barbell Bench Press', 'Sled Drag Home'].map((title) => ({
        title,
        supersetId: null,
        note: null,
        sets: [{ weightKg: 60, reps: 5, isWarmup: false, setType: 'normal' as const, rpe: null, setIndex: 0, durationSec: null, distanceM: null }],
      })),
    };
  });
  return { workouts, distinctExerciseTitles: ['Barbell Bench Press', 'Sled Drag Home'], skippedRows: 0, totalSetRows: 2 * n, timedRows: 0 };
}

/** What Finish writes: a workout with sets (and its records). */
async function finishWorkout(exerciseName: string, weightKg: number): Promise<string> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { todayISO } = await import('@/lib/date');
  const start = Date.now();
  const s = await createSession({ dateISO: todayISO(), dayType: 'push', notes: 'Live', source: 'manual', startedAt: start, endedAt: start + 3_600_000 });
  await addSetsWithMeta(s.id, [
    { exerciseId: idOf(exerciseName), weightKg, reps: 5 },
    { exerciseId: idOf(exerciseName), weightKg, reps: 4 },
  ]);
  return s.id;
}

describe('restoring the import safety copy keeps workouts saved since', () => {
  beforeEach(() => vi.resetModules());

  it('a failed import over the demo: the demo comes back AND the workout finished meanwhile stays', async () => {
    db = await bootRealApp();
    const { loadDemoData, prepareImportOverDemo, isDemoData } = await import('@/onboarding/db/dataActions');
    await loadDemoData();
    const { takeSafetyCopy, restoreSafetyCopy } = await import('@/onboarding/db/importSafety');
    const demoWorkouts = db.count('workout_sessions');

    const copy = await takeSafetyCopy();
    await prepareImportOverDemo('Priya Nair'); // the demo goes first…
    const live = await finishWorkout('Barbell Bench Press', 300); // …a workout is finished while the import runs…
    // …and the import fails (it is one transaction: it wrote nothing). The screen puts the copy back.
    const r = await restoreSafetyCopy(copy);

    expect(r.keptNewer).toBe(1);
    expect(db.count('workout_sessions')).toBe(demoWorkouts + 1);
    expect(db.count('workout_sessions', `id = '${live}'`)).toBe(1);
    expect(db.count('set_entries', `session_id = '${live}'`)).toBe(2);
    // Its 300 kg is a record the copy never had — worked out again.
    expect(db.count('personal_records', `session_id = '${live}'`)).toBeGreaterThan(0);
    expect(await isDemoData()).toBe(true);
  });

  it('Undo import: the imported workouts go, the copy comes back, the workout saved after the import stays', async () => {
    db = await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    const before = await finishWorkout('Barbell Bench Press', 80);
    const { takeSafetyCopy, restoreSafetyCopy } = await import('@/onboarding/db/importSafety');
    const { runImport } = await import('@/tracker/services/hevyImport');

    const copy = await takeSafetyCopy();
    const result = await runImport(file(3), { mode: 'replace' });
    expect(result.createdSessionIds).toHaveLength(3);
    expect(db.count('workout_sessions', `id = '${before}'`)).toBe(0); // Replace deleted it
    // After the import: a workout with the exercise the IMPORT created (not in the copy).
    const live = await finishWorkout('Sled Drag Home', 100);

    const r = await restoreSafetyCopy(copy, { importedSessionIds: result.createdSessionIds });

    expect(r.keptNewer).toBe(1);
    const ids = db.all<{ id: string }>('SELECT id FROM workout_sessions ORDER BY started_at').map((x) => x.id);
    expect(ids.sort()).toEqual([before, live].sort());
    expect(db.count('set_entries', `session_id = '${live}'`)).toBe(2);
    expect(db.count('exercises', "name = 'Sled Drag Home'")).toBe(1); // came along with its workout
    expect(db.count('set_entries', `session_id = '${before}'`)).toBe(2);
  });

  it('nothing saved since: the copy comes back exactly (the import’s workouts and exercises go)', async () => {
    db = await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    await finishWorkout('Barbell Bench Press', 80);
    const { takeSafetyCopy, restoreSafetyCopy } = await import('@/onboarding/db/importSafety');
    const { runImport } = await import('@/tracker/services/hevyImport');
    const copy = await takeSafetyCopy();
    const exercisesBefore = db.count('exercises');
    const result = await runImport(file(2), { mode: 'merge' });
    const r = await restoreSafetyCopy(copy, { importedSessionIds: result.createdSessionIds });
    expect(r.keptNewer).toBe(0);
    expect(db.count('workout_sessions')).toBe(1);
    expect(db.count('exercises')).toBe(exercisesBefore);
  });
});
