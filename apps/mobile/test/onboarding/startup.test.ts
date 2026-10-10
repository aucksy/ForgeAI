/**
 * Start-up that always recovers (audit DS-08 / SH-11).
 *
 *  - A failed upgrade step must land on the error screen, never open the app half-upgraded.
 *  - "Try again" must REALLY retry: reopen the database and re-run every upgrade step.
 *  - The words on that screen depend on what failed (storage full vs anything else).
 *
 * Real SQLite (sql.js) through test/helpers/realDb.ts; the store is imported AFTER each boot so
 * it shares the fresh `@/db` module instance.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// The in-memory caches the store clears after an erase — not part of start-up, and they pull in
// network/native modules the node lane cannot load.
vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/store/dashboardStore', () => ({ useDashboard: { getState: () => ({ refresh: async () => undefined }) } }));
vi.mock('@/tracker/store/activeWorkoutStore', () => ({ useActiveWorkout: { getState: () => ({ discard: async () => undefined }) } }));
vi.mock('@/tracker/store/restTimerStore', () => ({ useRestTimer: { getState: () => ({ skip: () => undefined }) } }));
vi.mock('@/tracker/store/trackerPrefsStore', () => ({ useTrackerPrefs: { getState: () => ({ setBodyFigure: () => undefined }) } }));
vi.mock('@/tracker/phone/phoneSync', () => ({ phoneAfterErase: async () => undefined }));

import type { OnboardingInput } from '@/onboarding/form';
import { bootFailureFrom, bootMessage, isStorageFull } from '@/onboarding/bootFailure';
import { StartupError } from '@/db/startupError';

import { bootRealApp, installRealDb, openRealDb, uninstallRealDb, type RealDb } from '../helpers/realDb';

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 30,
  heightCm: 175,
  gymName: '',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

afterEach(() => uninstallRealDb());

describe('what the error screen says (pure)', () => {
  it('spots a full phone in every shape SQLite / Android report it', () => {
    expect(isStorageFull(new Error('SQLITE_FULL: database or disk is full'))).toBe(true);
    expect(isStorageFull(new Error('Call to function NativeStatement.runAsync has been rejected. → Caused by: database or disk is full (code 13)'))).toBe(true);
    expect(isStorageFull(new Error('ENOSPC: no space left on device'))).toBe(true);
    expect(isStorageFull(new Error('database is locked'))).toBe(false);
    expect(isStorageFull('not an error')).toBe(false);
  });

  it('storage full → free some space, whatever step failed', () => {
    for (const stage of ['open', 'upgrade', 'read'] as const) {
      const f = bootFailureFrom(new StartupError(stage, new Error('database or disk is full')));
      expect(f.stage).toBe(stage);
      expect(f.storageFull).toBe(true);
      expect(bootMessage(f).body).toBe("Your phone's storage is full. Free some space, then tap Try again.");
    }
  });

  it('anything else → the data is still on this phone, tap Try again; details carry the error', () => {
    const open = bootFailureFrom(new StartupError('open', new Error('unable to open database file')));
    expect(open.stage).toBe('open');
    expect(bootMessage(open).body).toBe(
      "ForgeAI couldn't open your data. Your workouts are still on this phone. Tap Try again.",
    );
    expect(open.detail).toContain('unable to open database file');

    const upgrade = bootFailureFrom(new StartupError('upgrade', new Error('no such table: x')));
    expect(bootMessage(upgrade).body).toMatch(/Your workouts are still on this phone\. Tap Try again\.$/);
    expect(bootMessage(upgrade).body).not.toBe(bootMessage(open).body); // the step is told apart

    const read = bootFailureFrom(new StartupError('read', new Error('database is locked')));
    expect(bootMessage(read).body).toMatch(/Your workouts are still on this phone\. Tap Try again\.$/);
  });

  it('an untagged error is a read failure, except "DB not initialised", which means it never opened', () => {
    expect(bootFailureFrom(new Error('database is locked')).stage).toBe('read');
    expect(bootFailureFrom(new Error('DB not initialised — initDb() must be awaited first')).stage).toBe('open');
  });
});

/** A member who has trained on this phone, then an app update that must re-run the tracker upgrade. */
async function trainedPhoneNeedingUpgrade(): Promise<RealDb> {
  const db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  db.raw.run("UPDATE meta SET value = '0' WHERE key = 'tracker_schema_version'");
  return db;
}

async function freshStore(db: RealDb) {
  await bootRealApp({ db, startup: false }); // a relaunch: fresh modules on the same file
  const { useOnboarding } = await import('@/onboarding/store/onboardingStore');
  return useOnboarding;
}

describe('start-up (real SQLite)', () => {
  it('a failed upgrade step lands on the error screen — never the app over a half-upgraded database', async () => {
    const db = await trainedPhoneNeedingUpgrade();
    const store = await freshStore(db);

    // The phone fills up during the upgrade: every column check fails.
    const realGetAll = db.getAllAsync.bind(db);
    db.getAllAsync = (async (sql: string, ...p: unknown[]) => {
      if (sql.includes('PRAGMA table_info')) throw new Error('database or disk is full');
      return realGetAll(sql, ...p);
    }) as typeof db.getAllAsync;

    await store.getState().start();
    expect(store.getState().status).toBe('error');
    expect(store.getState().bootError?.stage).toBe('upgrade');
    expect(store.getState().bootError?.storageFull).toBe(true);

    // Space freed → Try again re-runs the upgrade for real and opens the app.
    // On a phone, closing and reopening the file keeps its rows; in memory a close would drop
    // them, so this close only counts.
    let closes = 0;
    db.closeAsync = async () => {
      closes += 1;
    };
    db.getAllAsync = realGetAll as typeof db.getAllAsync;
    await store.getState().retry();
    expect(closes).toBe(1); // the old handle was let go before reopening
    expect(store.getState().status).toBe('ready');
    expect(store.getState().bootError).toBeNull();
    expect(db.all<{ value: string }>("SELECT value FROM meta WHERE key = 'tracker_schema_version'")[0].value).toBe('13');
  });

  it('a database that would not open: Try again really reopens it', async () => {
    const db = await trainedPhoneNeedingUpgrade();
    const store = await freshStore(db);

    let opens = 0;
    (globalThis as Record<string, unknown>).__forgeaiOpenDatabase = async () => {
      opens += 1;
      if (opens === 1) throw new Error('unable to open database file');
      return db;
    };

    await store.getState().start();
    expect(store.getState().status).toBe('error');
    expect(store.getState().bootError?.stage).toBe('open');
    expect(store.getState().bootError?.storageFull).toBe(false);

    await store.getState().retry();
    expect(opens).toBe(2);
    expect(store.getState().status).toBe('ready');
  });

  it('resetDb closes the old handle and the next initDb opens a new one', async () => {
    const first = await openRealDb();
    await bootRealApp({ db: first });
    const dbMod = await import('@/db');
    let closed = 0;
    const realClose = first.closeAsync.bind(first);
    first.closeAsync = async () => {
      closed += 1;
      await realClose();
    };

    await dbMod.resetDb();
    expect(closed).toBe(1);
    expect(() => dbMod.getDb()).toThrow(/not initialised/);

    const second = await openRealDb();
    installRealDb(second);
    expect(await dbMod.initDb()).toBe(second);
    expect(dbMod.getDb()).toBe(second);
  });

  it('a failed open is not remembered: the next initDb tries again by itself', async () => {
    await bootRealApp({ startup: false });
    const dbMod = await import('@/db');
    const db = await openRealDb();
    let opens = 0;
    (globalThis as Record<string, unknown>).__forgeaiOpenDatabase = async () => {
      opens += 1;
      if (opens === 1) throw new Error('unable to open database file');
      return db;
    };
    await expect(dbMod.initDb()).rejects.toMatchObject({ stage: 'open' });
    expect(await dbMod.initDb()).toBe(db);
  });
});
