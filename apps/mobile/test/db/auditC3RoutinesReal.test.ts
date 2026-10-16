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
