/**
 * 16 Oct 2026 end-to-end audit, C3 (routines) — against REAL SQLite (test/helpers/realDb.ts).
 * Audit/e2e-v2/C3-routines-suggestions.md. Each test failed on the code before its fix.
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

const repo = () => import('@/tracker/db/routineRepo');

describe('C3-21: "Follow it" on a program already in the routines keeps the member\'s edits', () => {
  it('sets, notes and an added exercise survive Follow it', async () => {
    const { addProgram } = await import('@/tracker/services/plansService');
    const folderId = await addProgram('gym_full_body_beginner', { follow: false, easyWeeks: false });
    const day = db.all<{ id: string }>('SELECT id FROM plan_days WHERE plan_id = ? ORDER BY day_order LIMIT 1', [folderId])[0].id;
    const r = await repo();
    const before = (await r.getRoutine(day))!;
    const first = before.exercises[0];
    await r.updateRoutineExercise(first.id, { targetSets: 5, note: 'Slow down' });
    const extra = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Cable Fly'")[0].id;
    await r.addExerciseToRoutine(day, extra, { targetSets: 2 });

    const again = await addProgram('gym_full_body_beginner', { follow: true, easyWeeks: false, existing: 'update' });
    expect(again).toBe(folderId);
    expect(db.all('SELECT is_active FROM workout_plans WHERE id = ?', [folderId])).toEqual([{ is_active: 1 }]);
    const after = (await r.getRoutine(day))!;
    expect(after.exercises).toHaveLength(before.exercises.length + 1);
    expect(after.exercises[0].targetSets).toBe(5);
    expect(after.exercises[0].note).toBe('Slow down');
  });
});

describe('C3-22: opening the same routine file again keeps the member\'s edits', () => {
  it('an edited row keeps the member\'s version; an untouched one takes the file\'s', async () => {
    const { makeRoutineFile } = await import('@/tracker/plans/routineFile');
    const { importRoutineFile } = await import('@/tracker/services/plansService');
    const bench = { name: 'Barbell Bench Press', catalogKey: 'barbell_bench_press', logType: 'weight_reps' as const, sets: 3, repMin: 8, repMax: 12, primary: [] };
    const squat = { name: 'Barbell Back Squat', catalogKey: 'barbell_back_squat', logType: 'weight_reps' as const, sets: 3, repMin: 5, repMax: 8, primary: [] };
    const file = makeRoutineFile('From Sam', [{ name: 'Upper', dayType: 'upper', exercises: [bench, squat] }]);
    const first = await importRoutineFile(file);
    const day = db.all<{ id: string }>("SELECT id FROM plan_days WHERE name = 'Upper'")[0].id;
    const r = await repo();
    const got = (await r.getRoutine(day))!;
    await r.updateRoutineExercise(got.exercises[0].id, { targetSets: 5, note: 'My cue' });

    const again = await importRoutineFile(file, { existing: 'update' });
    expect(again).toMatchObject({ folderId: first.folderId, updated: true });
    const after = (await r.getRoutine(day))!;
    expect(after.exercises.map((x) => x.targetSets)).toEqual([5, 3]);
    expect(after.exercises[0].note).toBe('My cue');
    expect(again.keptEdits).toEqual(['Upper']);
  });
});

describe('C3-11: Home and the coach read each card of a lift listed twice on its own', () => {
  it('Bench heavy (100 x 5) and Bench back-off (80 x 8): the second row\'s Target is about 80, not 100', async () => {
    const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
    const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
    await createFolderWithRoutines(
      'Mine',
      [
        {
          name: 'Bench Day',
          dayType: 'push',
          exercises: [
            { exerciseId: bench, sets: 3, repMin: 3, repMax: 6 },
            { exerciseId: bench, sets: 3, repMin: 8, repMax: 12 },
          ],
        },
      ],
      { follow: true, todayISO: '2026-01-01' },
    );
    const { createSession } = await import('@/db/repos/workoutRepo');
    const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
    const { getDb } = await import('@/db');
    const day = db.all<{ id: string }>("SELECT id FROM plan_days WHERE name = 'Bench Day'")[0].id;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const s = await createSession({ dateISO: yesterday, dayType: 'push', source: 'manual', startedAt: Date.now() - 86_400_000 });
    await addSetsWithMeta(s.id, [
      ...[0, 1, 2].map(() => ({ exerciseId: bench, weightKg: 100, reps: 5, isWarmup: false })),
      ...[0, 1, 2].map(() => ({ exerciseId: bench, weightKg: 80, reps: 8, isWarmup: false, cardIndex: 1 })),
    ]);
    await getDb().runAsync('UPDATE workout_sessions SET routine_id = ?, title = ? WHERE id = ?', [day, 'Bench Day', s.id]);
    const { getTodaysWorkoutWithTargets } = await import('@/tracker/services/coachTargets');
    const tw = await getTodaysWorkoutWithTargets();
    expect(tw.planDayId).toBe(day);
    expect(tw.targets).toHaveLength(2);
    expect(tw.targets[0].last?.weightKg).toBe(100);
    expect(tw.targets[1].last?.weightKg).toBe(80);
  });
});

describe('C3-24: "Duplicate to My routines" lands in My routines', () => {
  it('no My routines folder yet: the copy goes to a new My routines, not next to the original', async () => {
    const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
    const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
    const gym = await createFolderWithRoutines('Gym A', [{ name: 'Push A', dayType: 'push', exercises: [{ exerciseId: bench, sets: 3, repMin: 6, repMax: 8 }] }]);
    const day = db.all<{ id: string }>("SELECT id FROM plan_days WHERE name = 'Push A'")[0].id;
    const { duplicateRoutineTo } = await import('@/tracker/db/routineRepo');
    const copy = await duplicateRoutineTo(day, null);
    const where = db.all<{ name: string; id: string }>('SELECT wp.name, wp.id FROM plan_days pd JOIN workout_plans wp ON wp.id = pd.plan_id WHERE pd.id = ?', [copy])[0];
    expect(where.id).not.toBe(gym);
    expect(where.name).toBe('My routines');
  });
});
