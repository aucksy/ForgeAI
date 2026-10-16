/**
 * 16 Oct 2026 backup review, three restore defects. REAL database; made-up data.
 *
 *  1. The one-time record fixes and the Hevy-link folder repair kept their "done" marks across a
 *     restore, so a backup made before those fixes brought back bad record rows (an 85 kg x 12
 *     lighter-set 1-rep max) that were never put right.
 *  2. A backup always said version 1 and a restore copied only the columns this app knows: a
 *     backup made by a NEWER app silently lost its new columns, and the "made by a newer ForgeAI"
 *     words could never show.
 *  3. A small clean-up failing AFTER the data swap told the member "Could not restore. Nothing
 *     was changed." (untrue), and tapping Restore again overwrote the copy that Undo needs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  experience: 'intermediate',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

const MARKS = ['pr_single_e1rm_fix', 'pr_long_set_e1rm_fix', 'pr_lighter_set_e1rm_fix', 'link_folder_repair_v1'];
const SAFETY = 'file:///docs/forgeai-before-restore.json';

let db: RealDb;

beforeEach(() => {
  fs.files.clear();
  vi.resetModules();
});

const benchId = (): string => db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
const e1rmRows = (): string[] =>
  db
    .all<{ weight_kg: number; reps: number }>(
      "SELECT pr.weight_kg, pr.reps FROM personal_records pr JOIN workout_sessions ws ON ws.id = pr.session_id WHERE pr.exercise_id = ? AND pr.kind = 'e1rm' ORDER BY ws.started_at",
      [benchId()],
    )
    .map((r) => `${r.weight_kg}x${r.reps}`);
const markValue = (key: string): string | undefined => db.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])[0]?.value;
const setMark = (key: string): void => {
  db.raw.run("INSERT INTO meta(key, value) VALUES(?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'", [key]);
};

/** A backup made by an older app: 100 x 5, 85 x 12, 110 x 2 — with the 85 x 12 stored as a record. */
async function oldBackupWithLighterRecord(): Promise<string> {
  db = await bootRealApp();
  await (await import('@/onboarding/db/dataActions')).completeOnboarding(MEMBER);
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const bench = benchId();
  const ids: string[] = [];
  let t = Date.UTC(2026, 9, 1, 6);
  for (const [w, r, d] of [
    [100, 5, '2026-10-01'],
    [85, 12, '2026-10-03'],
    [110, 2, '2026-10-05'],
  ] as [number, number, string][]) {
    t += 86_400_000;
    const s = await createSession({ dateISO: d, dayType: 'push', source: 'manual', startedAt: t });
    await addSetsWithMeta(s.id, [{ exerciseId: bench, weightKg: w, reps: r, isWarmup: false }]);
    ids.push(s.id);
  }
  // As an older version left the log: a record for the lighter 85 x 12 set, none for 110 x 2.
  db.raw.run('DELETE FROM personal_records');
  db.raw.run(
    "INSERT INTO personal_records(id, exercise_id, kind, value, weight_kg, reps, date_iso, session_id) VALUES ('a', ?, 'e1rm', 116.7, 100, 5, '2026-10-01', ?), ('b', ?, 'e1rm', 119, 85, 12, '2026-10-03', ?)",
    [bench, ids[0], bench, ids[1]],
  );
  const { exportSnapshot } = await import('@/cloud/snapshot');
  const env = JSON.parse(await exportSnapshot()) as Record<string, unknown>;
  // An older app wrote none of the newer keys.
  delete env.tracker_schema_version;
  delete env.member_schema_version;
  env.meta = {};
  return JSON.stringify(env);
}

/** This phone: a member whose one-time fixes have all run (every mark set). */
async function repairedPhone(): Promise<void> {
  db = await bootRealApp();
  await (await import('@/onboarding/db/dataActions')).completeOnboarding(MEMBER);
  for (const k of MARKS) setMark(k);
}

describe('1. a backup made before the one-time fixes: its bad records are put right', () => {
  it('the restore clears every one-time repair mark, so the repairs run again', async () => {
    const json = await oldBackupWithLighterRecord();
    await repairedPhone();
    const { importSnapshot, parseSnapshot } = await import('@/cloud/snapshot');
    await importSnapshot(parseSnapshot(json));
    for (const k of MARKS) expect(markValue(k), k).toBeUndefined();
    // …and the next start's repair removes the lighter-set record.
    const { fixLighterSetE1rmRecords } = await import('@/tracker/services/prRebuild');
    await fixLighterSetE1rmRecords();
    expect(e1rmRows()).toEqual(['100x5', '110x2']);
  });

  it('a Drive restore puts the records right straight away', async () => {
    const json = await oldBackupWithLighterRecord();
    await repairedPhone();
    const { describeSnapshot, parseSnapshot } = await import('@/cloud/snapshot');
    const { useBackup } = await import('@/store/backupStore');
    useBackup.setState({ found: { ...describeSnapshot(parseSnapshot(json)), json } });
    expect(await useBackup.getState().restoreFound()).toBe(true);
    expect(e1rmRows()).toEqual(['100x5', '110x2']);
    expect(markValue('pr_lighter_set_e1rm_fix')).toBe('1');
  });

  it('the marks named in the backup code are the real ones', async () => {
    const { RERUN_AFTER_RESTORE } = await import('@/cloud/snapshot');
    const pr = await import('@/tracker/services/prRebuild');
    const link = await import('@/tracker/services/linkFolderRepair');
    expect([...RERUN_AFTER_RESTORE].sort()).toEqual(
      [pr.SINGLE_FIX_KEY, pr.LONG_SET_FIX_KEY, pr.LIGHTER_SET_FIX_KEY, link.LINK_REPAIR_KEY].sort(),
    );
  });
});

describe('2. a backup from a newer app is refused, not half-restored', () => {
  it('a backup carries this app’s tracker and member versions', async () => {
    db = await bootRealApp();
    await (await import('@/onboarding/db/dataActions')).completeOnboarding(MEMBER);
    const { exportSnapshot } = await import('@/cloud/snapshot');
    const { TRACKER_SCHEMA_VERSION } = await import('@/tracker/db/trackerSchema');
    const { MEMBER_SCHEMA_VERSION } = await import('@/onboarding/db/memberSchema');
    const env = JSON.parse(await exportSnapshot()) as Record<string, unknown>;
    expect(env.tracker_schema_version).toBe(TRACKER_SCHEMA_VERSION);
    expect(env.member_schema_version).toBe(MEMBER_SCHEMA_VERSION);
    expect(TRACKER_SCHEMA_VERSION).toBe(14);
    expect(MEMBER_SCHEMA_VERSION).toBe(2);
  });

  it('newer tracker or member version: the update words; older or absent: restores', async () => {
    const { parseSnapshot } = await import('@/cloud/snapshot');
    const { PlainError } = await import('@/cloud/backupWords');
    const env = (extra: Record<string, unknown>): string =>
      JSON.stringify({ app: 'forgeai', schema_version: 1, ...extra, exported_at: '2026-10-16T00:00:00Z', tables: {} });
    expect(() => parseSnapshot(env({ tracker_schema_version: 15, member_schema_version: 2 }))).toThrow('This backup was made by a newer ForgeAI');
    expect(() => parseSnapshot(env({ tracker_schema_version: 14, member_schema_version: 3 }))).toThrow(PlainError);
    expect(() => parseSnapshot(env({ tracker_schema_version: 14, member_schema_version: 3 }))).toThrow('Update ForgeAI from the Play Store');
    expect(() => parseSnapshot(env({ tracker_schema_version: '14' }))).toThrow('damaged');
    expect(parseSnapshot(env({ tracker_schema_version: 14, member_schema_version: 2 })).app).toBe('forgeai');
    expect(parseSnapshot(env({ tracker_schema_version: 9, member_schema_version: 1 })).app).toBe('forgeai');
    expect(parseSnapshot(env({})).app).toBe('forgeai');
  });
});

describe('3. a clean-up failing after the swap: the words are true and Undo still works', () => {
  it('says it restored, and a second restore keeps the copy from before the first', async () => {
    const json = await oldBackupWithLighterRecord();
    db = await bootRealApp();
    const { loadDemoData } = await import('@/onboarding/db/dataActions');
    await loadDemoData();
    const demoWorkouts = db.count('workout_sessions');
    expect(demoWorkouts).toBeGreaterThan(3);
    // Clearing the demo badge fails (e.g. a full disk) — after the data was swapped.
    db.raw.run("CREATE TRIGGER boom BEFORE DELETE ON meta WHEN OLD.key = 'demo_data' BEGIN SELECT RAISE(ABORT, 'disk full'); END");
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { describeSnapshot, parseSnapshot } = await import('@/cloud/snapshot');
    const { useBackup } = await import('@/store/backupStore');
    const { PlainError } = await import('@/cloud/backupWords');
    const found = { ...describeSnapshot(parseSnapshot(json)), json };
    useBackup.setState({ found });
    const err = await useBackup.getState().restoreFound().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(PlainError);
    const words = (err as Error).message;
    expect(words).toMatch(/^Restored\./);
    expect(words).not.toMatch(/Nothing was changed/);
    expect(db.count('workout_sessions')).toBe(3); // the data really was replaced
    expect(useBackup.getState().found).toBeNull();
    expect(log.mock.calls.some((c) => String(c[0]).includes('[ForgeErr]'))).toBe(true);

    // The member taps Restore again (the same backup, downloaded again).
    useBackup.setState({ found });
    await useBackup.getState().restoreFound().catch(() => undefined);
    const copy = JSON.parse(fs.files.get(SAFETY)!) as { snapshot: string };
    const saved = JSON.parse(copy.snapshot) as { tables: Record<string, unknown[]> };
    expect(saved.tables.workout_sessions.length).toBe(demoWorkouts); // still the phone's own data

    // Undo still brings back what was there before the first restore.
    db.raw.run('DROP TRIGGER boom');
    expect(await useBackup.getState().undoRestore()).toBe(true);
    expect(db.count('workout_sessions')).toBe(demoWorkouts);
    log.mockRestore();
  });

  // [source-text check] Reads source text, not behaviour: passes on dead code, fails on a harmless rename (audit QA-12).
  it('[source-text check] the Backup card shows a done-but-tidy-up-failed restore as a restore', () => {
    const src = readFileSync(join(__dirname, '../../src/components/settings/BackupCard.tsx'), 'utf8');
    expect(src).toMatch(/instanceof RestoredUntidyError/);
  });
});
