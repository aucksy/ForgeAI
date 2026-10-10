/**
 * Backups that keep a member's data (audit DS-01, DS-10).
 *
 *  1. Android's own restore puts back a database from whatever version the old phone ran. The
 *     app must open it like an update: every upgrade step runs, the history is there, and a
 *     restored profile skips the welcome screen. (Real SQLite, an old release's schema.)
 *  2. The (still hidden) Google Drive backup keeps 5 dated copies and never lets an empty phone
 *     back up over a real history. (The pure rules behind it.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {},
  isErrorWithCode: () => false,
  statusCodes: {},
}));

import { bootRealApp, uninstallRealDb } from '../helpers/realDb';

afterEach(() => uninstallRealDb());

describe('Android restored an older phone\'s database before the first launch', () => {
  it('v0.21.0 database: upgrade steps run, workouts are there, the welcome screen is skipped', async () => {
    const db = await bootRealApp({
      before: (d) => {
        d.raw.exec(readFileSync(join(__dirname, '../fixtures/db/schema-v0.21.0.sql'), 'utf8'));
        d.raw.run(
          `INSERT INTO user_profile (id, name, age, height_cm, goal, experience, gym_name, member_since_iso,
             calorie_target, protein_target_g, carbs_target_g, fat_target_g, unit_system, language)
           VALUES ('p1', 'Restored Member', 31, 176, 'muscle', 'intermediate', 'Iron', '2025-11-02', 2600, 150, 300, 70, 'metric', 'en')`,
        );
        d.raw.run("INSERT INTO workout_sessions (id, date_iso, started_at, day_type, source) VALUES ('s1', '2026-03-01', 1772339400000, 'push', 'manual')");
      },
    });
    const { hasMemberProfile } = await import('@/onboarding/db/dataActions');
    const { TRACKER_SCHEMA_VERSION } = await import('@/tracker/db/trackerSchema');
    expect(await hasMemberProfile()).toBe(true); // → status 'ready', not 'welcome'
    expect(db.count('workout_sessions')).toBe(1);
    const meta = Object.fromEntries(db.all<{ key: string; value: string }>('SELECT key, value FROM meta').map((r) => [r.key, r.value]));
    expect(meta.tracker_schema_version).toBe(String(TRACKER_SCHEMA_VERSION));
    expect(db.columns('set_entries').map((c) => c.name)).toContain('distance_m');
  }, 30_000);
});

describe('Google Drive backup keeps 5 copies and refuses an empty overwrite (DS-10)', () => {
  const file = (day: number, workouts: number | null = 10) => ({
    id: `f${day}`,
    name: `forgeai-backup-2026-10-${String(day).padStart(2, '0')}-180000.json`,
    modifiedTime: `2026-10-${String(day).padStart(2, '0')}T12:30:00.000Z`,
    workouts,
  });

  it('names each backup by its date and time, so a new one never overwrites the last', async () => {
    const { backupFileName, isBackupFileName } = await import('@/cloud/drive');
    const name = backupFileName(new Date(2026, 9, 10, 18, 4, 9));
    expect(name).toBe('forgeai-backup-2026-10-10-180409.json');
    expect(isBackupFileName(name)).toBe(true);
    expect(isBackupFileName('forgeai-backup.json')).toBe(true); // older versions' single file
    expect(isBackupFileName('forgeai-before-restore.json')).toBe(false);
    expect(isBackupFileName('notes.txt')).toBe(false);
  });

  it('keeps the newest 5 and deletes only older ones', async () => {
    const { backupsToPrune, KEEP_BACKUPS } = await import('@/cloud/drive');
    expect(KEEP_BACKUPS).toBe(5);
    const files = [3, 7, 1, 9, 5, 8, 2].map((d) => file(d));
    expect(backupsToPrune(files).map((f) => f.id).sort()).toEqual(['f1', 'f2']);
    expect(backupsToPrune(files.slice(0, 5))).toEqual([]);
    expect(backupsToPrune([])).toEqual([]);
  });

  it('an empty phone may not back up over a backup with workouts — it is told to restore instead', async () => {
    const { refuseEmptyOverwrite } = await import('@/cloud/drive');
    expect(refuseEmptyOverwrite(0, file(3, 412))).toMatch(/412 workouts.*Restore it instead/);
    // An older backup has no count: treat it as a real history.
    expect(refuseEmptyOverwrite(0, file(3, null))).toMatch(/Restore it instead/);
    // Fine: the phone has workouts, Drive has nothing, or Drive's newest is empty too.
    expect(refuseEmptyOverwrite(5, file(3, 412))).toBeNull();
    expect(refuseEmptyOverwrite(0, null)).toBeNull();
    expect(refuseEmptyOverwrite(0, file(3, 0))).toBeNull();
  });
});
