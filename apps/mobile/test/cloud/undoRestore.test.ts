/**
 * Drive "Undo the last restore" (hidden feature, DS-10) on a REAL database.
 *
 *  - A restore made over the demo, undone, brings the demo back AS the demo (before: the flag was
 *    lost, so Arjun's 13 weeks read as the member's own training).
 *  - The copy lasts 24 hours, then it is gone (before: it never expired, and an undo weeks later
 *    silently took every newer workout).
 *  - Until then the confirm names how many workouts saved since the restore an undo takes away.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

const fs = vi.hoisted(() => ({ files: new Map<string, string>() }));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: async (uri: string) => ({ exists: fs.files.has(uri), size: fs.files.get(uri)?.length ?? 0 }),
  writeAsStringAsync: async (uri: string, text: string) => {
    fs.files.set(uri, text);
  },
  readAsStringAsync: async (uri: string) => {
    const t = fs.files.get(uri);
    if (t === undefined) throw new Error('no such file');
    return t;
  },
  deleteAsync: async (uri: string) => {
    fs.files.delete(uri);
  },
}));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: {}, isErrorWithCode: () => false, statusCodes: {} }));

const MEMBER: OnboardingInput = {
  name: 'Backup Owner',
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

async function logWorkout(daysFromNow: number): Promise<string> {
  const { createSession, addSets } = await import('@/db/repos/workoutRepo');
  const { todayISO, addDays } = await import('@/lib/date');
  const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
  const s = await createSession({ dateISO: addDays(todayISO(), daysFromNow), dayType: 'push', source: 'manual' });
  await addSets(s.id, [{ exerciseId: bench, weightKg: 60, reps: 8 }]);
  return s.id;
}

/** A real member's Drive backup (2 workouts), made on another phone. */
async function driveBackupJson(): Promise<string> {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  await logWorkout(-3);
  await logWorkout(-1);
  const { exportSnapshot } = await import('@/cloud/snapshot');
  return exportSnapshot();
}

/** This phone holds the demo; the member restores their Drive backup over it. */
async function demoPhoneRestored() {
  const json = await driveBackupJson();
  db = await bootRealApp();
  const { loadDemoData, isDemoData } = await import('@/onboarding/db/dataActions');
  await loadDemoData();
  expect(await isDemoData()).toBe(true);
  const demoWorkouts = db.count('workout_sessions');
  const { useBackup } = await import('@/store/backupStore');
  const { describeSnapshot, parseSnapshot } = await import('@/cloud/snapshot');
  useBackup.setState({ found: { ...describeSnapshot(parseSnapshot(json)), json } });
  expect(await useBackup.getState().restoreFound()).toBe(true);
  expect(db.count('workout_sessions')).toBe(2);
  expect(await isDemoData()).toBe(false);
  return { useBackup, demoWorkouts, isDemoData };
}

describe('Undo the last restore', () => {
  beforeEach(() => {
    fs.files.clear();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('a restore over the demo, undone: the demo is back AS the demo', async () => {
    const { useBackup, demoWorkouts, isDemoData } = await demoPhoneRestored();
    expect(await useBackup.getState().undoRestoreImpact()).toEqual({ available: true, newerWorkouts: 0 });
    expect(await useBackup.getState().undoRestore()).toBe(true);
    expect(db.count('workout_sessions')).toBe(demoWorkouts);
    expect(await isDemoData()).toBe(true);
    expect(db.all<{ value: string }>("SELECT value FROM meta WHERE key = 'demo_data'")[0]?.value).toBe('1');
    expect(useBackup.getState().canUndoRestore).toBe(false);
  });

  it('the confirm names the workouts saved since the restore that an undo would take away', async () => {
    const { useBackup } = await demoPhoneRestored();
    await logWorkout(1);
    await logWorkout(2);
    const impact = await useBackup.getState().undoRestoreImpact();
    expect(impact).toEqual({ available: true, newerWorkouts: 2 });
    const { undoRestoreBody } = await import('@/store/backupStore');
    expect(undoRestoreBody(2)).toBe(
      'This puts back what was on this phone before the last restore. 2 workouts saved since the restore will be lost.',
    );
    expect(undoRestoreBody(1)).toMatch(/1 workout saved since the restore will be lost\.$/);
    expect(undoRestoreBody(0)).toBe('This puts back what was on this phone before the last restore.');
  });

  it('after 24 hours the copy is gone: no undo is offered and nothing is replaced', async () => {
    const { useBackup } = await demoPhoneRestored();
    const later = Date.now() + 24 * 60 * 60 * 1000 + 1;
    vi.useFakeTimers({ toFake: ['Date'], now: later });
    expect(await useBackup.getState().undoRestoreImpact()).toEqual({ available: false, newerWorkouts: 0 });
    expect(await useBackup.getState().undoRestore()).toBe(false);
    expect(db.count('workout_sessions')).toBe(2); // the restored history stays
    expect(fs.files.size).toBe(0); // the old copy was removed
    expect(useBackup.getState().canUndoRestore).toBe(false);
  });

  it('a copy left by an older version (no time, no demo flags) is treated as expired', async () => {
    db = await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    const { exportSnapshot } = await import('@/cloud/snapshot');
    fs.files.set('file:///docs/forgeai-before-restore.json', await exportSnapshot());
    const { useBackup } = await import('@/store/backupStore');
    expect(await useBackup.getState().undoRestore()).toBe(false);
    expect(fs.files.size).toBe(0);
  });
});
