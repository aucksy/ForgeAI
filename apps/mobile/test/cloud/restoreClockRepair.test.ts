/**
 * Review fix (IM-07): restoring a Drive backup made before Phase 4 brings workouts imported the
 * old way (clock time written as UTC). The restore clears the repair's mark AND runs the repair
 * on the restored workouts at once — not only at the next start. REAL database; made-up data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

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

beforeEach(() => {
  fs.files.clear();
  vi.resetModules();
});

describe('a pre-Phase-4 backup restored', () => {
  it('its old-way imported workout is put right straight away', async () => {
    // The backup: made on a phone before Phase 4 — an import stored the old way, no repair mark.
    db = await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    const start = Date.UTC(2026, 6, 7, 21, 0);
    db.raw.run(
      "INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, notes, source) VALUES ('old', '2026-07-07', ?, ?, 'push', 'Push 1', 'manual')",
      [start, start + 3_600_000],
    );
    const { exportSnapshot, describeSnapshot, parseSnapshot } = await import('@/cloud/snapshot');
    const env = JSON.parse(await exportSnapshot()) as { meta?: Record<string, string> };
    env.meta = {}; // an older app carried none of the newer keys
    const json = JSON.stringify(env);

    // This phone: already repaired (mark set), then the member restores that backup.
    db = await bootRealApp();
    await (await import('@/onboarding/db/dataActions')).completeOnboarding(MEMBER);
    db.raw.run("INSERT INTO meta(key, value) VALUES('import_clock_real_v1', '1') ON CONFLICT(key) DO UPDATE SET value = '1'");
    const { useBackup } = await import('@/store/backupStore');
    useBackup.setState({ found: { ...describeSnapshot(parseSnapshot(json)), json } });
    expect(await useBackup.getState().restoreFound()).toBe(true);

    expect(db.all<{ s: number }>("SELECT started_at AS s FROM workout_sessions WHERE id = 'old'")[0].s).toBe(new Date(2026, 6, 7, 21, 0).getTime());
    expect(db.all<{ value: string }>("SELECT value FROM meta WHERE key = 'import_clock_real_v1'")[0]?.value).toBe('1');
  });
});
