/**
 * Phase 1 packet D — demo data is a sandbox, and destructive actions have a way back.
 * Real SQL (test/helpers/realDb.ts): the app's own seed, repos and data actions on SQLite.
 *
 *   DS-06  "Remove demo data" keeps every workout the member logged themselves.
 *   DS-05 / IM-01  an import over the demo removes the WHOLE demo, profile name included.
 *   DS-05  a pre-v0.20 seeded install (only `seeded`, Arjun's profile) is flagged as demo once.
 *   IM-05  a safety copy put back restores the database exactly; Replace's counts.
 *   HI-12  a workout delete is never "failed" when it worked.
 *   DS-13  erase clears files, keys and settings, every step tried.
 *   IM-20  a failed link save says what was already written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { fileEraseSteps, isExportFile, isPrivateCacheEntry, runEraseSteps } from '@/onboarding/eraseDevice';
import { onlyInForgeAI, replaceConfirmBody } from '@/onboarding/db/importSafety';
import { RoutineSaveError, routineSaveFailureText } from '@/tracker/services/routineImport';
import { deleteWorkout, type DeleteDeps } from '@/tracker/services/workoutDelete';
import { removeDemoBody } from '@/onboarding/demoText';

import { bootRealApp, type RealDb } from '../helpers/realDb';

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

/** A fresh install with the Arjun demo loaded, plus one workout the member logged themselves. */
async function demoWithOwnWorkout(): Promise<string> {
  db = await bootRealApp();
  const { loadDemoData } = await import('@/onboarding/db/dataActions');
  await loadDemoData();
  const repo = await import('@/db/repos/workoutRepo');
  const { todayISO, addDays } = await import('@/lib/date');
  const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
  const s = await repo.createSession({ dateISO: addDays(todayISO(), 1), dayType: 'push', source: 'manual' });
  await repo.addSets(s.id, [{ exerciseId: bench, weightKg: 60, reps: 8 }]);
  return s.id;
}

describe('DS-06: Remove demo data keeps the member’s own workouts', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('removes every demo row and keeps the member’s workout with its sets', async () => {
    const own = await demoWithOwnWorkout();
    expect(db.count('workout_sessions')).toBeGreaterThan(30);
    expect(db.count('meals')).toBeGreaterThan(0);
    expect(db.count('chat_messages')).toBeGreaterThan(0);

    const { removeDemoData, isDemoData, hasMemberProfile } = await import('@/onboarding/db/dataActions');
    const r = await removeDemoData();

    expect(r.keptWorkouts).toBe(1);
    expect(db.all<{ id: string }>('SELECT id FROM workout_sessions')).toEqual([{ id: own }]);
    expect(db.count('set_entries', `session_id = '${own}'`)).toBe(1);
    expect(db.count('set_entries')).toBe(1);
    for (const t of ['meals', 'chat_messages', 'body_weight', 'body_measurements', 'workout_plans', 'plan_days', 'plan_exercises']) {
      expect(db.count(t), t).toBe(0);
    }
    expect(db.count('personal_records', `session_id <> '${own}'`)).toBe(0);
    expect(await hasMemberProfile()).toBe(false); // the welcome screen asks for their details
    expect(await isDemoData()).toBe(false);
    expect(db.count('exercises')).toBeGreaterThan(100); // the library stays
  });

  it('the welcome screen then keeps those workouts: onboarding adds the profile around them', async () => {
    const own = await demoWithOwnWorkout();
    const { removeDemoData, completeOnboarding } = await import('@/onboarding/db/dataActions');
    await removeDemoData();
    await completeOnboarding(MEMBER);
    expect(db.all<{ name: string }>('SELECT name FROM user_profile')).toEqual([{ name: 'Rahul Sharma' }]);
    expect(db.all<{ id: string }>('SELECT id FROM workout_sessions')).toEqual([{ id: own }]);
    expect(db.count('set_entries')).toBe(1);
  });

  it('the confirm names how many own workouts stay', () => {
    expect(removeDemoBody(0)).not.toMatch(/stay/);
    expect(removeDemoBody(1)).toMatch(/Your own workout stays/);
    expect(removeDemoBody(12)).toMatch(/Your own 12 workouts stay/);
  });
});

describe('DS-05 / IM-01: an import over the demo removes the whole demo', () => {
  it('prepareImportOverDemo: no demo row is left, and the profile is the member’s name, not Arjun’s', async () => {
    const own = await demoWithOwnWorkout();
    const { prepareImportOverDemo, isDemoData } = await import('@/onboarding/db/dataActions');
    await prepareImportOverDemo('  Priya   Nair ');
    const p = db.all<{ name: string; age: number; height_cm: number; gym_name: string }>(
      'SELECT name, age, height_cm, gym_name FROM user_profile',
    );
    expect(p).toEqual([{ name: 'Priya Nair', age: 0, height_cm: 0, gym_name: '' }]);
    expect(db.all<{ id: string }>('SELECT id FROM workout_sessions')).toEqual([{ id: own }]);
    for (const t of ['meals', 'chat_messages', 'body_weight', 'body_measurements', 'workout_plans']) {
      expect(db.count(t), t).toBe(0);
    }
    expect(await isDemoData()).toBe(false);
  });

  it('a pre-v0.20 seeded install (only `seeded`, Arjun’s profile) counts as demo — once', async () => {
    db = await bootRealApp();
    const { loadDemoData, isDemoData, clearDemoFlag } = await import('@/onboarding/db/dataActions');
    await loadDemoData();
    // What an old auto-seeded install looks like: no demo flag, no demo_until, no check yet.
    db.raw.run("DELETE FROM meta WHERE key IN ('demo_data', 'demo_until', 'demo_legacy_checked')");
    expect(await isDemoData()).toBe(true);
    await clearDemoFlag();
    expect(await isDemoData()).toBe(false); // checked once; never re-flagged
  });

  it('a real member is never flagged by the legacy check', async () => {
    db = await bootRealApp();
    const { completeOnboarding, isDemoData } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    db.raw.run("INSERT INTO meta(key, value) VALUES('seeded', '1')");
    expect(await isDemoData()).toBe(false);
  });
});

describe('IM-05: the way back from Replace', () => {
  it('a safety copy put back restores every workout and the demo flags', async () => {
    await demoWithOwnWorkout();
    const before = db.count('workout_sessions');
    const { takeSafetyCopy, restoreSafetyCopy } = await import('@/onboarding/db/importSafety');
    const { prepareImportOverDemo, isDemoData } = await import('@/onboarding/db/dataActions');
    const copy = await takeSafetyCopy();
    await prepareImportOverDemo('Priya Nair');
    db.raw.run('DELETE FROM set_entries');
    db.raw.run('DELETE FROM personal_records');
    db.raw.run('DELETE FROM workout_sessions');
    await restoreSafetyCopy(copy);
    expect(db.count('workout_sessions')).toBe(before);
    expect(db.all<{ name: string }>('SELECT name FROM user_profile')).toEqual([{ name: 'Arjun Mehra' }]);
    expect(await isDemoData()).toBe(true);
  });

  it('replaceImpact counts the member’s workouts and those only in ForgeAI (the demo’s are not counted)', async () => {
    const own = await demoWithOwnWorkout();
    const row = db.all<{ date_iso: string; started_at: number }>('SELECT date_iso, started_at FROM workout_sessions WHERE id = ?', [own])[0];
    const { replaceImpact } = await import('@/onboarding/db/importSafety');
    expect(await replaceImpact([])).toEqual({ removed: 1, onlyHere: 1 });
    expect(await replaceImpact([{ dateISO: row.date_iso, startedAt: Number(row.started_at) }])).toEqual({ removed: 1, onlyHere: 0 });
  });

  it('onlyInForgeAI / the confirm line', () => {
    const a = { dateISO: '2026-10-01', startedAt: Date.UTC(2026, 9, 1, 7) };
    const b = { dateISO: '2026-10-02', startedAt: Date.UTC(2026, 9, 2, 7) };
    expect(onlyInForgeAI([a, b], [a])).toEqual([b]);
    expect(replaceConfirmBody(0)).toMatch(/in this file too/);
    expect(replaceConfirmBody(1)).toMatch(/^1 of them is only in ForgeAI/);
    expect(replaceConfirmBody(5)).toMatch(/^5 of them are only in ForgeAI.*undo/);
  });
});

describe('HI-12: a delete is never "failed" when it worked', () => {
  const deps = (over: Partial<DeleteDeps>): DeleteDeps => ({
    exerciseIds: async () => ['e1'],
    deleteSession: async () => undefined,
    stillThere: async () => false,
    afterDelete: async () => undefined,
    reconcile: async () => undefined,
    ...over,
  });

  it('a record reconcile that throws after the delete is "deleted, records catch up"', async () => {
    const afterDelete = vi.fn(async () => undefined);
    const out = await deleteWorkout('s1', deps({ reconcile: async () => Promise.reject(new Error('db')), afterDelete }));
    expect(out).toEqual({ deleted: true, recordsCatchUp: true });
    expect(afterDelete).toHaveBeenCalledWith('s1'); // Health Connect and widgets still told
  });

  it('an error after the commit, with the workout gone, is still a delete', async () => {
    const out = await deleteWorkout('s1', deps({ deleteSession: async () => Promise.reject(new Error('late')) }));
    expect(out.deleted).toBe(true);
  });

  it('only a workout that is still there is a failed delete', async () => {
    const out = await deleteWorkout('s1', deps({ deleteSession: async () => Promise.reject(new Error('x')), stillThere: async () => true }));
    expect(out).toEqual({ deleted: false });
  });

  it('real SQL: the workout and its sets go', async () => {
    db = await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    const repo = await import('@/db/repos/workoutRepo');
    const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
    const s = await repo.createSession({ dateISO: '2026-10-01', dayType: 'push', source: 'manual' });
    await repo.addSets(s.id, [{ exerciseId: bench, weightKg: 60, reps: 8 }]);
    const mod = await import('@/tracker/services/workoutDelete');
    const out = await mod.deleteWorkout(s.id);
    expect(out.deleted).toBe(true);
    expect(db.count('workout_sessions')).toBe(0);
    expect(db.count('set_entries')).toBe(0);
  });
});

describe('DS-13 / EX-04: erase clears what lives outside the database', () => {
  it('deletes the exercise media folder, exports and the member’s cache files — not Expo’s own', async () => {
    const deleted: string[] = [];
    const steps = fileEraseSteps({
      documentDirectory: 'file:///docs/',
      cacheDirectory: 'file:///cache/',
      deleteAsync: async (uri) => {
        deleted.push(uri);
      },
      readDirectoryAsync: async (uri) =>
        uri === 'file:///docs/'
          ? ['forgeai-workouts-2026-10-01.xlsx', 'SQLite', 'progress-photos', 'exercise-media']
          : ['DocumentPicker', 'ExponentAsset-abc.wav', 'forgeai-data-2026.db', 'hevy.csv', 'share'],
    });
    expect(await runEraseSteps(steps)).toEqual([]);
    expect(deleted).toEqual([
      'file:///docs/exercise-media/',
      'file:///docs/forgeai-workouts-2026-10-01.xlsx',
      'file:///cache/DocumentPicker',
      'file:///cache/forgeai-data-2026.db',
      'file:///cache/hevy.csv',
      'file:///cache/share',
    ]);
  });

  it('every step is tried even when one fails', async () => {
    const ran: string[] = [];
    const failed = await runEraseSteps([
      { name: 'a', run: async () => Promise.reject(new Error('stuck')) },
      { name: 'b', run: async () => void ran.push('b') },
    ]);
    expect(failed).toEqual(['a']);
    expect(ran).toEqual(['b']);
  });

  it('names', () => {
    expect(isExportFile('forgeai-workouts-2026-10-01.xlsx')).toBe(true);
    expect(isExportFile('notes.xlsx')).toBe(false);
    expect(isPrivateCacheEntry('ExponentAsset-1.ttf')).toBe(false);
    expect(isPrivateCacheEntry('ImagePicker/')).toBe(true);
  });
});

describe('IM-20: a failed link save is honest about what was written', () => {
  it('names the new exercises that stay; "Nothing was changed" only when nothing was written', () => {
    expect(routineSaveFailureText(new RoutineSaveError(2))).toMatch(/2 new exercises were added to your library/);
    expect(routineSaveFailureText(new RoutineSaveError(1))).toMatch(/1 new exercise was added/);
    expect(routineSaveFailureText(new Error('db'))).toBe('Nothing was changed. Please try again.');
  });
});
