/**
 * R-123 (coordinator, 25 Oct 2026: "Switch Drive backup and Drive restore to your new full backup ZIP,
 * so Drive holds exactly what 'Export backup' makes"): Settings → Backup → "Back up now" uploads the
 * SAME file "Save a backup" makes (photos and settings included), and "Restore from Drive" puts it
 * back the same way — then "Undo the last restore" takes all of it away again. Real database
 * (sql.js); Google Drive and the phone's files are in-memory stand-ins. Made-up data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';
import { fakePicture, MemIo } from './memIo';

vi.setConfig({ testTimeout: 60_000 });

const h = vi.hoisted(() => ({
  io: null as unknown as MemIo,
  store: new Map<string, string>(),
  drive: [] as { name: string; bytes: Uint8Array; workouts?: number }[],
  docs: new Map<string, string>(),
}));

// AsyncStorage and the legacy file system share one stub module (vitest.config.ts): both shapes here.
vi.mock('@react-native-async-storage/async-storage', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: async (uri: string) => ({ exists: h.docs.has(uri), size: h.docs.get(uri)?.length ?? 0 }),
  writeAsStringAsync: async (uri: string, text: string) => void h.docs.set(uri, text),
  readAsStringAsync: async (uri: string) => {
    const t = h.docs.get(uri);
    if (t === undefined) throw new Error('no such file');
    return t;
  },
  deleteAsync: async (uri: string) => void h.docs.delete(uri),
  readDirectoryAsync: async () => [],
  default: {
    getItem: async (k: string) => h.store.get(k) ?? null,
    setItem: async (k: string, v: string) => void h.store.set(k, v),
    removeItem: async (k: string) => void h.store.delete(k),
  },
}));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '0.57.0', extra: {} } } }));
vi.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: {}, isErrorWithCode: () => false, statusCodes: {} }));
// The phone's files: the test's in-memory stand-in.
vi.mock('@/backup/backupIo', () => ({
  deviceBackupIo: new Proxy(
    {},
    {
      get: (_t, k) => {
        const v = (h.io as unknown as Record<string | symbol, unknown>)[k];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(h.io) : v;
      },
    },
  ),
}));
// Google Drive: keeps what is uploaded, newest last.
vi.mock('@/cloud/drive', async () => {
  const words = await import('@/cloud/backupWords');
  return {
    DriveError: words.DriveError,
    isDriveConfigured: () => true,
    getCurrentDriveUser: async () => 'member@example.com',
    signInToDrive: async () => 'member@example.com',
    signOutDrive: async () => undefined,
    refuseEmptyOverwrite: () => null,
    newestDriveBackup: async () => null,
    uploadBackupFile: async (uri: string, size: number, workouts?: number) => {
      const bytes = h.io.files.get(uri);
      if (!bytes || bytes.length !== size) throw new Error('upload: the file is not there');
      h.drive.push({ name: `mettleup-backup-${h.drive.length}.zip`, bytes: bytes.slice(), workouts });
      return new Date().toISOString();
    },
    downloadNewestBackup: async (dir: string) => {
      const newest = h.drive[h.drive.length - 1];
      if (!newest) return null;
      const uri = `${dir}drive-${newest.name}`;
      h.io.files.set(uri, newest.bytes.slice());
      return { uri, name: newest.name, old: false };
    },
  };
});

const MEMBER: OnboardingInput = {
  name: 'Drive Owner',
  phoneE164: '+919876500002',
  goal: 'muscle',
  experience: 'intermediate',
  age: 29,
  heightCm: 172,
  gymName: '',
  bodyWeightKg: 74,
  targets: { calorieTarget: 2500, proteinTargetG: 140, carbsTargetG: 300, fatTargetG: 70 },
};

let db: RealDb;
const T = Date.UTC(2026, 8, 1, 1, 30);

async function phone(name: string): Promise<void> {
  h.store.clear();
  h.docs.clear();
  h.io = new MemIo();
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding({ ...MEMBER, name });
}

const dump = (): unknown => ({
  folders: db.all('SELECT id, name, is_active, folder_order FROM workout_plans ORDER BY folder_order'),
  days: db.all('SELECT id, plan_id, day_order, name FROM plan_days ORDER BY plan_id, day_order'),
  workouts: db.all('SELECT id, started_at, title, routine_id FROM workout_sessions ORDER BY started_at'),
  sets: db.count('set_entries'),
  photos: db.all('SELECT id, date_iso FROM progress_photos ORDER BY id'),
  profile: db.all('SELECT name, bio FROM user_profile'),
});

beforeEach(() => {
  h.drive = [];
});

describe('Google Drive backup is the backup file', () => {
  it('"Back up now" uploads the full file; "Restore from Drive" brings everything back; Undo takes it all away', async () => {
    // Phone A: routines in their own order, a workout, a progress photo, next-weight rules changed.
    await phone('Drive Owner');
    const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
    db.raw.run("INSERT INTO workout_plans (id, name, is_active, folder_order) VALUES ('f-1', 'My split', 1, 0)");
    db.raw.run("INSERT INTO plan_days (id, plan_id, day_type, day_order, name) VALUES ('d-b', 'f-1', 'pull', 1, 'Pull'), ('d-a', 'f-1', 'push', 0, 'Push')");
    db.raw.run(`INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, source, title, routine_id) VALUES ('w-1', '2026-09-01', ${T}, ${T + 3600_000}, 'push', 'manual', 'Push', 'd-a')`);
    db.raw.run("INSERT INTO set_entries (id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup) VALUES ('s-1', 'w-1', ?, 1, 90, 5, 0)", [bench]);
    db.raw.run(`INSERT INTO progress_photos (id, date_iso, uri, created_at) VALUES ('pp-1', '2026-09-02', 'file:///docs/progress-photos/pp-1.jpg', ${T})`);
    db.raw.run("UPDATE user_profile SET bio = 'Morning lifter'");
    h.io.put('file:///docs/progress-photos/pp-1.jpg', fakePicture(7));
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    useTrackerPrefs.getState().setWeightJump('large');
    useTrackerPrefs.getState().setRepRange('higher');
    const fromA = dump();

    const { useBackup } = await import('@/store/backupStore');
    await useBackup.getState().backupNow();
    expect(h.drive).toHaveLength(1);
    expect(h.drive[0].workouts).toBe(1);
    // What Drive holds is the backup file: it opens with the app's own reader, photo and settings in it.
    h.io.put('file:///cache/check.zip', h.drive[0].bytes);
    const { openBackup } = await import('@/backup/backupOpen');
    const opened = await openBackup(h.io, 'file:///cache/check.zip');
    expect(opened.ok && opened.backup.summary).toMatch(/^1 workout, 2 routines, 1 measurement and 1 photo, saved on .* by MettleUp 0\.57\.0$/);
    expect(opened.ok && opened.backup.file.settings['forgeai-tracker-prefs']).toMatchObject({ weightJump: 'large', repRange: 'higher' });
    // The local copy made for the upload is gone.
    expect([...h.io.files.keys()].filter((k) => /mettleup-backup-.*\.zip$/.test(k) && !k.includes('check'))).toEqual([]);

    // Phone B: its own little history, then "Restore from Drive".
    const zip = h.drive[0];
    await phone('Second Phone');
    h.drive = [zip];
    db.raw.run(`INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, source) VALUES ('mine', '2026-10-01', ${T + 30 * 86_400_000}, NULL, 'legs', 'manual')`);
    const { useTrackerPrefs: prefsB } = await import('@/tracker/store/trackerPrefsStore');
    prefsB.getState().setWeightJump('small');
    const beforeB = dump();
    const { useBackup: storeB } = await import('@/store/backupStore');
    expect(await storeB.getState().checkForBackup()).toEqual({ found: true });
    expect(storeB.getState().found?.summary).toMatch(/^1 workout, 2 routines/);
    expect(await storeB.getState().foundRemoves()).toBe(1);
    expect(await storeB.getState().restoreFound()).toBe(true);
    expect(dump()).toEqual(fromA);
    expect(prefsB.getState()).toMatchObject({ weightJump: 'large', repRange: 'higher' });
    const photo = db.all<{ uri: string }>("SELECT uri FROM progress_photos WHERE id = 'pp-1'")[0];
    expect(Buffer.compare(Buffer.from(h.io.files.get(photo.uri)!), Buffer.from(fakePicture(7)))).toBe(0);
    expect(storeB.getState().canUndoRestore).toBe(true);

    // Undo: the database, the photo and the settings are this phone's own again.
    expect(await storeB.getState().undoRestore()).toBe(true);
    expect(dump()).toEqual(beforeB);
    expect(prefsB.getState().weightJump).toBe('small');
    expect(h.io.files.has(photo.uri)).toBe(false);
  });
});
