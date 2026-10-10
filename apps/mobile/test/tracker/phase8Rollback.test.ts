/**
 * Audit Phase 8 review — a write that ROLLS BACK must never leave its rows on screen.
 *
 * Every transaction shares one SQLite connection, so a screen that reads while an import, a
 * Finish, an edit or a merge is open sees its uncommitted rows (and a higher training version).
 * When that write fails and rolls back, the rows and the version go away again — but a kept
 * read did not: Progress kept a 200 kg "record" that never happened, and a real 70 kg workout
 * afterwards (fewer row changes than the import) still showed 200. Home's and History's stamps
 * could not see the rollback at all (SQLite's write counters never go back).
 *
 * Real SQLite (sql.js), the real services. The reviewer's scenario first, exactly as found
 * (a bare transaction), then the app's own path (the write queue) for records, Targets, Home
 * and History.
 */
import { describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/cloud/sync', () => ({ maybeSync: async () => undefined }));

const MEMBER: OnboardingInput = {
  name: 'Rollback Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 80,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

const DAY = 86_400_000;
let db: RealDb;
let n = 0;

/** A finished workout of one exercise, `daysAgo` days before today, with `sets` working sets. */
function addWorkout(daysAgo: number, exerciseId: string, weightKg: number, reps: number, sets = 1): string {
  n += 1;
  const sid = `rb-s${n}`;
  const at = Date.now() - daysAgo * DAY;
  db.raw.run(
    "INSERT INTO workout_sessions(id, date_iso, started_at, ended_at, day_type, source) VALUES(?, ?, ?, ?, 'push', 'manual')",
    [sid, new Date(at).toISOString().slice(0, 10), at, at + 3_600_000],
  );
  for (let i = 1; i <= sets; i++) {
    db.raw.run(
      'INSERT INTO set_entries(id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup) VALUES(?, ?, ?, ?, ?, ?, 0)',
      [`rb-e${n}-${i}`, sid, exerciseId, i, weightKg, reps],
    );
  }
  return sid;
}

function id(name: string): string {
  const row = db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0];
  if (!row) throw new Error(`not in library: ${name}`);
  return row.id;
}

async function boot(): Promise<string> {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  return id('Barbell Bench Press');
}

/** The heaviest bench on Progress (the kept records). */
async function heaviest(exerciseId: string): Promise<number | undefined> {
  const rs = await import('@/tracker/services/recordsService');
  return (await rs.getRecordsByExercise()).get(exerciseId)?.records.bests.find((b) => b.kind === 'weight')?.value;
}

/** The same, worked out from the database now (nothing kept). */
async function truth(exerciseId: string): Promise<number | undefined> {
  const rs = await import('@/tracker/services/recordsService');
  return (await rs.computeRecords([exerciseId])).get(exerciseId)?.records.bests.find((b) => b.kind === 'weight')?.value;
}

/** A write that fails after `body` ran — through the app's write queue, or (as the reviewer found it) bare. */
async function failingWrite(how: 'queued' | 'bare', body: () => Promise<void>): Promise<void> {
  const { getDb } = await import('@/db');
  const { enqueueWrite, writeQueueIdle } = await import('@/db/writeQueue');
  const tx = (): Promise<void> =>
    getDb().withTransactionAsync(async () => {
      await body();
      throw new Error('import failed');
    });
  await (how === 'queued' ? enqueueWrite(tx) : tx()).catch(() => undefined);
  await writeQueueIdle();
}

describe('a rolled-back write leaves nothing behind (audit Phase 8 review)', () => {
  for (const how of ['bare', 'queued'] as const) {
    it(`records (${how}): bench 60 → an import of 200 read mid-way, rolled back → 60; a real 70 → 70`, async () => {
      const bench = await boot();
      addWorkout(30, bench, 60, 8);
      expect(await heaviest(bench)).toBe(60);
      await failingWrite(how, async () => {
        for (let i = 0; i < 5; i++) addWorkout(20 - i, bench, 200, 1);
        // Progress (or Home) reads while the import's transaction is open: it sees the rows.
        expect(await heaviest(bench)).toBe(200);
      });
      expect(await heaviest(bench)).toBe(60);
      // A real workout with fewer row changes than the rolled-back import.
      addWorkout(2, bench, 70, 5);
      expect(await heaviest(bench)).toBe(70);
      expect(await truth(bench)).toBe(70);
    });
  }

  it('records (queued): a real workout right after the rollback, with no read in between, still shows', async () => {
    const bench = await boot();
    addWorkout(30, bench, 60, 8);
    expect(await heaviest(bench)).toBe(60);
    // One set inside: the version moves by exactly as much as the real workout's one set will.
    await failingWrite('queued', async () => {
      addWorkout(10, bench, 200, 1);
      expect(await heaviest(bench)).toBe(200);
    });
    addWorkout(2, bench, 70, 5);
    expect(await heaviest(bench)).toBe(70);
  });

  it('records: a read while a queued write runs is never kept, even when the write succeeds', async () => {
    const bench = await boot();
    addWorkout(30, bench, 60, 8);
    const { forgetRecordCache } = await import('@/tracker/services/recordsService');
    forgetRecordCache();
    const { enqueueWrite } = await import('@/db/writeQueue');
    const { getDb } = await import('@/db');
    await enqueueWrite(() =>
      getDb().withTransactionAsync(async () => {
        addWorkout(5, bench, 65, 5);
        expect(await heaviest(bench)).toBe(65);
      }),
    );
    // Committed: the next read is right (worked out again, not taken from the read inside).
    expect(await heaviest(bench)).toBe(65);
    addWorkout(1, bench, 90, 1);
    expect(await heaviest(bench)).toBe(90);
  });

  for (const how of ['bare', 'queued'] as const) {
    it(`Targets (${how}): the rolled-back workouts never reach a Target`, async () => {
      const bench = await boot();
      addWorkout(14, bench, 60, 8, 3);
      addWorkout(10, bench, 60, 8, 3);
      const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
      const { todayISO, addDays } = await import('@/lib/date');
      await createFolderWithRoutines(
        'Rollback',
        [{ name: 'Push', dayType: 'push' as never, exercises: [{ exerciseId: bench, sets: 3, repMin: 6, repMax: 10 }] }],
        { follow: true, todayISO: addDays(todayISO(), -35) },
      );
      const { getActivePlan } = await import('@/db/repos/planRepo');
      const dayId = (await getActivePlan())!.days[0].id;
      const ct = await import('@/tracker/services/coachTargets');
      const targets = async (): Promise<string> => JSON.stringify([...(await ct.getTargetsForPlanDay(dayId))]);
      const fresh = async (): Promise<string> => {
        ct.forgetTargetMemo();
        return targets();
      };
      const before = await targets();
      expect(before).toContain('targetWeightKg');
      await failingWrite(how, async () => {
        addWorkout(3, bench, 200, 10, 3);
        expect(await targets()).not.toBe(before);
      });
      expect(await targets()).toBe(before);
      addWorkout(2, bench, 70, 8, 3);
      const now = await targets();
      expect(now).toBe(await fresh());
      expect(now).not.toBe(before);
    });
  }

  it('Home: no stamp while a queued write runs; after its rollback Home shows what is really saved', async () => {
    const bench = await boot();
    addWorkout(3, bench, 60, 8);
    const { homeStamp, getDashboardDataPhase2 } = await import('@/tracker/services/dashboardPhase2');
    const { useDashboard } = await import('@/store/dashboardStore');
    const { writeQueueIdle } = await import('@/db/writeQueue');
    await useDashboard.getState().refresh();
    const before = JSON.stringify(useDashboard.getState().data);
    const stampBefore = await homeStamp();
    expect(stampBefore).not.toBeNull();
    expect(useDashboard.getState().stamp).toBe(stampBefore);

    let mid: string | null | undefined;
    await failingWrite('queued', async () => {
      addWorkout(0, bench, 200, 10, 4);
      mid = await homeStamp();
      // Home reads while the write is open: it sees the rows, but never marks them as read.
      await useDashboard.getState().refresh();
      expect(JSON.stringify(useDashboard.getState().data)).not.toBe(before);
      expect(useDashboard.getState().stamp).toBeNull();
    });
    expect(mid).toBeNull();
    // The failed write made Home read again at once.
    await writeQueueIdle();
    await vi.waitFor(() => expect(useDashboard.getState().loading).toBe(false));
    expect(JSON.stringify(useDashboard.getState().data)).toBe(before);
    // Coming back to the tab: the stamp moved (the rolled-back rows still count as writes), so
    // nothing read under the old one is trusted either.
    expect(await homeStamp()).not.toBe(stampBefore);
    await useDashboard.getState().refreshIfChanged();
    expect(JSON.stringify(useDashboard.getState().data)).toBe(before);
    expect(JSON.stringify(useDashboard.getState().data)).toBe(JSON.stringify(await getDashboardDataPhase2()));
  });

  it('History: no stamp while a queued write runs; the stamp read before it never matches after it', async () => {
    const bench = await boot();
    addWorkout(3, bench, 60, 8);
    const { historyStamp } = await import('@/tracker/services/historyFeed');
    const before = await historyStamp();
    expect(before).not.toBeNull();
    let mid: string | null | undefined;
    await failingWrite('queued', async () => {
      addWorkout(0, bench, 200, 10);
      mid = await historyStamp();
    });
    expect(mid).toBeNull();
    const after = await historyStamp();
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it('the volume context (body weight, exercises) read while a queued write runs is not kept', async () => {
    const bench = await boot();
    addWorkout(3, bench, 60, 8);
    const { getVolumeContext } = await import('@/tracker/services/volumeService');
    const read = async (): Promise<string> => {
      const ctx = await getVolumeContext([bench]);
      return JSON.stringify([ctx.bw, ctx.exercises.get(bench)?.name]);
    };
    const before = await read();
    await failingWrite('queued', async () => {
      db.raw.run('UPDATE body_weight SET weight_kg = 140');
      db.raw.run("UPDATE exercises SET name = 'Phantom Press' WHERE id = ?", [bench]);
      // Read twice inside: the second must not be served a kept copy of the first either.
      const mid = await read();
      expect(mid).toContain('140');
      expect(mid).toContain('Phantom Press');
      expect(await read()).toBe(mid);
    });
    expect(await read()).toBe(before);
    expect(await read()).toBe(before);
  });
});
