/**
 * Photos on a workout (15 Oct 2026), against REAL SQL (test/helpers/realDb.ts): the additive
 * table, the 4-photo limit, the feed's read, a workout delete taking its photos (rows AND
 * files), the start-up sweep of photos whose workout is gone, and "Erase all data".
 * Plus the pure parts: keeping a picked photo, the words on screen, the erase step.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';

import { bootRealApp, type RealDb } from '../helpers/realDb';

// The phone's files, as stand-ins: which paths were deleted.
const files = vi.hoisted(() => ({ deleted: [] as string[] }));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: async (uri: string) => {
    files.deleted.push(uri);
  },
  readDirectoryAsync: async () => [],
  makeDirectoryAsync: async () => undefined,
  copyAsync: async () => undefined,
  getInfoAsync: async () => ({ exists: true }),
}));

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

beforeEach(async () => {
  files.deleted.length = 0;
  db = await bootRealApp();
});

async function newWorkout(dateISO = '2026-10-01'): Promise<string> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  return (await createSession({ dateISO, dayType: 'push', source: 'manual' })).id;
}

async function addRow(sessionId: string, n: number) {
  const { insertWorkoutPhoto } = await import('@/tracker/db/workoutPhotoRepo');
  return insertWorkoutPhoto({ id: `${sessionId}-p${n}`, sessionId, uri: `file:///docs/workout-photos/${sessionId}-p${n}.jpg`, createdAt: 1000 + n });
}

describe('the table (additive, made at start-up)', () => {
  it('exists after start-up with its columns, and a second start-up changes nothing', async () => {
    expect(db.tables()).toContain('workout_photos');
    expect(db.columns('workout_photos').map((c) => c.name)).toEqual(['id', 'session_id', 'uri', 'position', 'created_at']);
    const s = await newWorkout();
    await addRow(s, 1);
    db = await bootRealApp({ db });
    expect(db.count('workout_photos')).toBe(1);
  });
});

describe('adding: up to 4, in order, only on a saved workout', () => {
  it('positions run 0..3 and the 5th is refused as "limit"', async () => {
    const s = await newWorkout();
    for (const n of [1, 2, 3, 4]) await addRow(s, n);
    const { getWorkoutPhotos, WorkoutPhotoRefused } = await import('@/tracker/db/workoutPhotoRepo');
    expect((await getWorkoutPhotos(s)).map((p) => p.position)).toEqual([0, 1, 2, 3]);
    const fifth = await addRow(s, 5).catch((e: unknown) => e);
    expect(fifth).toBeInstanceOf(WorkoutPhotoRefused);
    expect((fifth as InstanceType<typeof WorkoutPhotoRefused>).why).toBe('limit');
    expect(db.count('workout_photos')).toBe(4);
  });

  it('after a removal the next photo goes to the end, and the limit counts what is there', async () => {
    const s = await newWorkout();
    for (const n of [1, 2, 3, 4]) await addRow(s, n);
    const { deleteWorkoutPhotoRow, getWorkoutPhotos } = await import('@/tracker/db/workoutPhotoRepo');
    await deleteWorkoutPhotoRow(`${s}-p2`);
    const added = await addRow(s, 5);
    expect(added.position).toBe(4);
    expect((await getWorkoutPhotos(s)).map((p) => p.id)).toEqual([`${s}-p1`, `${s}-p3`, `${s}-p4`, `${s}-p5`]);
  });

  it('a workout that no longer exists gets no row ("gone")', async () => {
    const { WorkoutPhotoRefused } = await import('@/tracker/db/workoutPhotoRepo');
    const e = await addRow('no-such-workout', 1).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(WorkoutPhotoRefused);
    expect((e as InstanceType<typeof WorkoutPhotoRefused>).why).toBe('gone');
    expect(db.count('workout_photos')).toBe(0);
  });

  it('each workout has its own 4', async () => {
    const a = await newWorkout('2026-10-01');
    const b = await newWorkout('2026-10-02');
    for (const n of [1, 2, 3, 4]) await addRow(a, n);
    await expect(addRow(b, 1)).resolves.toMatchObject({ position: 0 });
  });
});

describe('the feed read', () => {
  it('maps each workout to its photo paths in order; workouts without photos are absent', async () => {
    const a = await newWorkout('2026-10-01');
    const b = await newWorkout('2026-10-02');
    const c = await newWorkout('2026-10-03');
    await addRow(a, 1);
    await addRow(a, 2);
    await addRow(c, 1);
    const { getWorkoutPhotoUris } = await import('@/tracker/db/workoutPhotoRepo');
    const map = await getWorkoutPhotoUris([a, b, c]);
    expect(map.get(a)).toEqual([`file:///docs/workout-photos/${a}-p1.jpg`, `file:///docs/workout-photos/${a}-p2.jpg`]);
    expect(map.has(b)).toBe(false);
    expect(map.get(c)).toHaveLength(1);
  });

  it('the Profile feed page carries them', async () => {
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    const s = await newWorkout();
    await addRow(s, 1);
    const { getFeedPage } = await import('@/tracker/services/profileService');
    const page = await getFeedPage();
    expect(page.photos.get(s)).toEqual([`file:///docs/workout-photos/${s}-p1.jpg`]);
  });
});

describe('deleting a workout deletes its photos, rows and files', () => {
  it('deleteWorkout takes the rows and the files; another workout keeps its own', async () => {
    const s = await newWorkout('2026-10-01');
    const other = await newWorkout('2026-10-02');
    await addRow(s, 1);
    await addRow(s, 2);
    await addRow(other, 1);
    const { deleteWorkout } = await import('@/tracker/services/workoutDelete');
    expect((await deleteWorkout(s)).deleted).toBe(true);
    expect(db.all('SELECT session_id FROM workout_photos')).toEqual([{ session_id: other }]);
    expect(files.deleted).toEqual([`file:///docs/workout-photos/${s}-p1.jpg`, `file:///docs/workout-photos/${s}-p2.jpg`]);
  });

  it('removing one photo deletes its row and file only', async () => {
    const s = await newWorkout();
    const p = await addRow(s, 1);
    await addRow(s, 2);
    const { deleteWorkoutPhoto } = await import('@/tracker/services/workoutPhotos');
    await deleteWorkoutPhoto(p);
    expect(db.count('workout_photos')).toBe(1);
    expect(files.deleted).toEqual([p.uri]);
  });

  it('never deletes a file outside the app’s workout-photos folder', async () => {
    const s = await newWorkout();
    db.raw.run("INSERT INTO workout_photos(id, session_id, uri, position, created_at) VALUES('x', ?, 'file:///sdcard/DCIM/mine.jpg', 0, 1)", [s]);
    const { removeWorkoutPhotos } = await import('@/tracker/services/workoutPhotos');
    await removeWorkoutPhotos(s);
    expect(db.count('workout_photos')).toBe(0);
    expect(files.deleted).toEqual([]);
  });

  it('start-up sweep: a photo whose workout went another way (import Replace, demo removal) goes', async () => {
    const s = await newWorkout('2026-10-01');
    const kept = await newWorkout('2026-10-02');
    await addRow(s, 1);
    await addRow(kept, 1);
    db.raw.run('DELETE FROM set_entries WHERE session_id = ?', [s]);
    db.raw.run('DELETE FROM workout_sessions WHERE id = ?', [s]);
    const { sweepOrphanWorkoutPhotos } = await import('@/tracker/services/workoutPhotos');
    await sweepOrphanWorkoutPhotos();
    expect(db.all('SELECT session_id FROM workout_photos')).toEqual([{ session_id: kept }]);
    expect(files.deleted).toEqual([`file:///docs/workout-photos/${s}-p1.jpg`]);
  });
});

describe('Erase all data', () => {
  it('wipes the rows and deletes the folder', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { completeOnboarding, eraseAllData } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    const s = await newWorkout();
    await addRow(s, 1);
    await eraseAllData();
    expect(db.count('workout_photos')).toBe(0);
    expect(files.deleted).toContain('file:///docs/workout-photos/');
    warn.mockRestore();
  });

  it('the erase step is named in plain words when it fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { fileEraseSteps, runEraseSteps, eraseLeftBehindText } = await import('@/onboarding/eraseDevice');
    const steps = fileEraseSteps({
      documentDirectory: 'file:///docs/',
      cacheDirectory: null,
      deleteAsync: async (uri) => {
        if (uri.endsWith('workout-photos/')) throw new Error('stuck');
      },
      readDirectoryAsync: async () => [],
    });
    const failed = await runEraseSteps(steps);
    expect(failed).toEqual(['workout-photos']);
    expect(eraseLeftBehindText(failed)).toBe('Your workouts were erased, but not your workout photos. Tap Erase all data to try again.');
    warn.mockRestore();
  });
});

describe('keeping a picked photo (pure order)', () => {
  const deps = (over: Partial<import('@/tracker/services/workoutPhotos').KeepWorkoutPhotoDeps> = {}) => {
    const log: string[] = [];
    return {
      log,
      d: {
        dir: 'file:///docs/workout-photos/',
        cacheDir: 'file:///cache/',
        mkdir: async () => void log.push('mkdir'),
        copy: async (from: string, to: string) => void log.push(`copy ${from} -> ${to}`),
        remove: async (uri: string) => void log.push(`remove ${uri}`),
        insert: async (p: { id: string; sessionId: string; uri: string; createdAt: number }) => {
          log.push(`insert ${p.uri}`);
          return { ...p, position: 0 };
        },
        newId: () => 'new',
        now: 5,
        warn: () => undefined,
        ...over,
      },
    };
  };

  it('copies into the app, saves the row, then removes the picker’s cache copy', async () => {
    const { keepWorkoutPhoto } = await import('@/tracker/services/workoutPhotos');
    const { log, d } = deps();
    const p = await keepWorkoutPhoto('s1', { uri: 'file:///cache/ImagePicker/a.png' }, d);
    expect(p).toMatchObject({ id: 'new', sessionId: 's1', uri: 'file:///docs/workout-photos/new.png' });
    expect(log).toEqual([
      'mkdir',
      'copy file:///cache/ImagePicker/a.png -> file:///docs/workout-photos/new.png',
      'insert file:///docs/workout-photos/new.png',
      'remove file:///cache/ImagePicker/a.png',
    ]);
  });

  it('a refused row (5th photo) removes the app’s copy and keeps the gallery picture', async () => {
    const { keepWorkoutPhoto } = await import('@/tracker/services/workoutPhotos');
    const { WorkoutPhotoRefused } = await import('@/tracker/db/workoutPhotoRepo');
    const { log, d } = deps({ insert: async () => Promise.reject(new WorkoutPhotoRefused('limit')) });
    await expect(keepWorkoutPhoto('s1', { uri: 'content://gallery/7' }, d)).rejects.toBeInstanceOf(WorkoutPhotoRefused);
    expect(log).toEqual(['mkdir', 'copy content://gallery/7 -> file:///docs/workout-photos/new.jpg', 'remove file:///docs/workout-photos/new.jpg']);
  });

  it('no documents folder: refuses before copying anything', async () => {
    const { keepWorkoutPhoto } = await import('@/tracker/services/workoutPhotos');
    const { log, d } = deps({ dir: null });
    await expect(keepWorkoutPhoto('s1', { uri: 'content://x' }, d)).rejects.toThrow();
    expect(log).toEqual([]);
  });
});

describe('the words and the pure rules', () => {
  it('counts and slots', async () => {
    const m = await import('@/tracker/services/workoutPhotos');
    expect(m.WORKOUT_PHOTO_LIMIT).toBe(4);
    expect([0, 1, 3, 4, 7].map(m.photoSlotsLeft)).toEqual([4, 3, 1, 0, 0]);
    expect(m.workoutPhotoCountText(2)).toBe('2 of 4');
  });

  it('only paths directly inside the app’s folder are its own', async () => {
    const m = await import('@/tracker/services/workoutPhotos');
    const dir = m.workoutPhotoDir('file:///docs/');
    expect(dir).toBe('file:///docs/workout-photos/');
    expect(m.workoutPhotoDir(null)).toBeNull();
    expect(m.isOwnWorkoutPhotoPath('file:///docs/workout-photos/a.jpg', dir)).toBe(true);
    expect(m.isOwnWorkoutPhotoPath('file:///docs/workout-photos/', dir)).toBe(false);
    expect(m.isOwnWorkoutPhotoPath('file:///docs/workout-photos/x/a.jpg', dir)).toBe(false);
    expect(m.isOwnWorkoutPhotoPath('file:///docs/progress-photos/a.jpg', dir)).toBe(false);
    expect(m.isOwnWorkoutPhotoPath('file:///docs/workout-photos/a.jpg', null)).toBe(false);
  });

  it('plain words for each failure; a refused camera reads exactly as on Progress photos', async () => {
    const m = await import('@/tracker/services/workoutPhotos');
    const { WorkoutPhotoRefused } = await import('@/tracker/db/workoutPhotoRepo');
    expect(m.workoutPhotoProblem(new Error('camera-denied'))).toBe('camera-denied');
    expect(m.workoutPhotoProblem(new WorkoutPhotoRefused('limit'))).toBe('limit');
    expect(m.workoutPhotoProblem(new WorkoutPhotoRefused('gone'))).toBe('gone');
    expect(m.workoutPhotoProblem(new Error('disk full'))).toBe('other');
    // The camera picker itself refusing (phone test, 16 Oct 2026) is the same refused camera.
    const pickerRefusal = new Error("Call to function 'ExponentImagePicker.launchCameraAsync' has been rejected.\n→ Caused by: User rejected permissions");
    expect(m.workoutPhotoProblem(pickerRefusal)).toBe('camera-denied');
    expect(m.addPhotoErrorText('limit')).toBe('This workout already has 4 photos. Remove one to add another.');
    expect(m.addPhotoErrorText('other')).toBe('Couldn’t add the photo. Please try again.');
    const progressScreen = readFileSync('src/app/photos/index.tsx', 'utf8');
    expect(progressScreen).toContain(m.addPhotoErrorText('camera-denied'));
  });

  it('a refused camera is logged as info, never [ForgeErr]; a real failure still is', async () => {
    const m = await import('@/tracker/services/workoutPhotos');
    const info = vi.fn();
    const warn = vi.fn();
    const refusal = new Error("Call to function 'ExponentImagePicker.launchCameraAsync' has been rejected.\n→ Caused by: User rejected permissions");
    expect(m.reportWorkoutPhotoProblem(refusal, { info, warn })).toBe('camera-denied');
    expect(m.reportWorkoutPhotoProblem(new Error('camera-denied'), { info, warn })).toBe('camera-denied');
    expect(warn).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(2);
    expect(info.mock.calls.every((c) => !String(c[0]).includes('[ForgeErr]'))).toBe(true);

    const broken = new Error('disk full');
    expect(m.reportWorkoutPhotoProblem(broken, { info, warn })).toBe('other');
    expect(warn).toHaveBeenCalledWith('[ForgeErr] workout photo', broken);
    expect(info).toHaveBeenCalledTimes(2);
  });

  it('a photo Android left behind is only adopted by the workout that asked for it', async () => {
    const { takePendingPick } = await import('@/lib/pendingPick');
    const note = new Map<string, string>([['forgeai.pendingPick', 'workout-photo|s1']]);
    const store = {
      getItem: async (k: string) => note.get(k) ?? null,
      setItem: async (k: string, v: string) => void note.set(k, v),
      removeItem: async (k: string) => void note.delete(k),
    };
    const pending = async () => ({ canceled: false as const, assets: [{ uri: 'file:///cache/ImagePicker/z.jpg', width: 1, height: 1 }] });
    expect(await takePendingPick('workout-photo', { store, pending }, 's2')).toBeNull();
    expect(await takePendingPick('workout-photo', { store, pending }, 's1')).toMatchObject({ uri: 'file:///cache/ImagePicker/z.jpg' });
  });
});
