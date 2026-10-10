/**
 * Phase 1 packet B: one app-wide write queue, and saves you can trust.
 *
 *  - DS-04: a history import still running (after Back) and a Finish / edit save at the same
 *    time nested BEGINs on the one shared connection; the inner ROLLBACK undid the import
 *    half-way. Every transaction now runs through `enqueueWrite`.
 *  - LW-08: a tick during the Finish save could write the draft back after Finish cleared it
 *    → a ghost "workout in progress" that duplicated on the next launch.
 *  - DS-09 / LW-01: the draft was saved on every keystroke, fire-and-forget; a full phone
 *    silently stopped saving. Now debounced, queued, and a failure raises the banner and retries.
 *
 * Real SQLite (test/helpers/realDb.ts): every query is the app's own SQL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

// ---------------------------------------------------------------- the queue itself

describe('enqueueWrite: one FIFO for the whole app', () => {
  beforeEach(() => vi.resetModules());

  it('runs jobs one at a time, in the order they were asked for', async () => {
    const { enqueueWrite, inWriteQueue } = await import('@/db/writeQueue');
    const log: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const job = (name: string, ticks: number) => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      expect(inWriteQueue()).toBe(true);
      log.push(`${name}:start`);
      for (let i = 0; i < ticks; i++) await Promise.resolve();
      log.push(`${name}:end`);
      running--;
      return name;
    };
    const results = await Promise.all([enqueueWrite(job('a', 5)), enqueueWrite(job('b', 1)), enqueueWrite(job('c', 3))]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(maxRunning).toBe(1);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
    expect(inWriteQueue()).toBe(false);
  });

  it('a failing job rejects only its own caller; the next job still runs', async () => {
    const { enqueueWrite } = await import('@/db/writeQueue');
    const bad = enqueueWrite(async () => {
      throw new Error('boom');
    });
    const good = enqueueWrite(async () => 42);
    await expect(bad).rejects.toThrow('boom');
    await expect(good).resolves.toBe(42);
  });

  it('audit Phase 8 review: the quiet mark (null while a job runs, moves when one starts) and failure listeners', async () => {
    const { enqueueWrite, onWriteFailed, quietSince, writeQueueMark, writeQueueIdle } = await import('@/db/writeQueue');
    const failed = vi.fn();
    const stop = onWriteFailed(failed);
    const before = writeQueueMark();
    expect(before).not.toBeNull();
    expect(quietSince(before)).toBe(true);
    let inside: number | null | undefined;
    await enqueueWrite(async () => {
      inside = writeQueueMark();
      expect(quietSince(before)).toBe(false);
    });
    expect(inside).toBeNull();
    // A job started and ended since `before`: whatever was read across it is not kept.
    expect(quietSince(before)).toBe(false);
    expect(quietSince(null)).toBe(false);
    expect(failed).not.toHaveBeenCalled();
    await enqueueWrite(async () => {
      throw new Error('rolled back');
    }).catch(() => undefined);
    await writeQueueIdle();
    expect(failed).toHaveBeenCalledTimes(1);
    stop();
    await enqueueWrite(async () => {
      throw new Error('again');
    }).catch(() => undefined);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('a job calls plain (unqueued) helpers inside it — no deadlock', async () => {
    const { enqueueWrite, writeQueueIdle } = await import('@/db/writeQueue');
    const inner = async () => 'inner';
    const r = await enqueueWrite(async () => `${await inner()}+outer`);
    expect(r).toBe('inner+outer');
    await expect(writeQueueIdle()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------- real database

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

let db: RealDb;

async function onboarded(existing?: RealDb): Promise<void> {
  db = await bootRealApp(existing ? { db: existing } : {});
  if (existing) return;
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
}

function exerciseId(name: string): string {
  const row = db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0];
  if (!row) throw new Error(`exercise not in library: ${name}`);
  return row.id;
}

function draftValue(): string | null {
  const row = db.all<{ value: string }>("SELECT value FROM meta WHERE key = 'activeWorkoutDraft'")[0];
  return row ? row.value : null;
}

/** A Hevy-like history of `n` workouts, one bench set each, in 2025. */
function history(n: number) {
  const workouts = Array.from({ length: n }, (_, i) => {
    const startedAt = Date.UTC(2025, 0, 1 + i, 9, 0, 0);
    return {
      title: `Imported ${i + 1}`,
      dayType: 'push' as const,
      startedAt,
      endedAt: startedAt + 3_600_000,
      dateISO: new Date(startedAt).toISOString().slice(0, 10),
      exercises: [
        {
          title: 'Barbell Bench Press',
          supersetId: null,
          note: null,
          sets: [{ weightKg: 60, reps: 5, isWarmup: false, setType: 'normal' as const, rpe: null, setIndex: 0, durationSec: null, distanceM: null }],
        },
      ],
    };
  });
  return { workouts, distinctExerciseTitles: ['Barbell Bench Press'], skippedRows: 0, totalSetRows: n, timedRows: 0 };
}

/** Start a live workout with one bench set of 70 × 5, ticked. */
async function liveWorkoutWithOneSet() {
  const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
  const { getExerciseById } = await import('@/db/repos/exerciseRepo');
  const bench = (await getExerciseById(exerciseId('Barbell Bench Press')))!;
  useActiveWorkout.getState().startEmpty();
  await useActiveWorkout.getState().addExercise(bench);
  const card = useActiveWorkout.getState().exercises[0];
  useActiveWorkout.getState().updateSet(card.key, card.sets[0].key, { weightKg: 70, reps: 5 });
  useActiveWorkout.getState().toggleDone(card.key, card.sets[0].key);
  return { useActiveWorkout, card };
}

describe('DS-04: a long import and a save at the same time — both fully saved', () => {
  beforeEach(async () => {
    await onboarded();
  });

  it('Finish during a history import (after Back): all imported workouts AND the live one are saved', async () => {
    const { runImport } = await import('@/tracker/services/hevyImport');
    const { useActiveWorkout } = await liveWorkoutWithOneSet();
    const before = db.count('workout_sessions');

    let finishing: Promise<string | null> | null = null;
    const importing = runImport(history(30), {
      mode: 'merge',
      onProgress: (done) => {
        // Half-way through the import's transaction, the member finishes their workout.
        if (done === 10 && !finishing) finishing = useActiveWorkout.getState().finish('live');
      },
    });
    const result = await importing;
    expect(finishing).not.toBeNull();
    const liveId = await finishing!;

    expect(result.imported).toBe(30);
    expect(liveId).toBeTruthy();
    expect(db.count('workout_sessions')).toBe(before + 31);
    expect(db.count('workout_sessions', "notes = 'live'")).toBe(1);
    expect(db.count('set_entries', `session_id = '${liveId}'`)).toBe(1);
    expect(draftValue()).toBe('');
  });

  it('a past-workout edit saved during an import: the edit and the whole import land', async () => {
    const { runImport } = await import('@/tracker/services/hevyImport');
    const { useActiveWorkout } = await liveWorkoutWithOneSet();
    const repo = await import('@/db/repos/workoutRepo');
    const sessionId = (await useActiveWorkout.getState().finish(null))!;
    const detail = (await repo.getSessionDetail(sessionId))!;
    await useActiveWorkout.getState().startEditingSession(detail);
    const card = useActiveWorkout.getState().exercises[0];
    useActiveWorkout.getState().updateSet(card.key, card.sets[0].key, { weightKg: 72.5 });

    let saving: Promise<string | null> | null = null;
    const result = await runImport(history(20), {
      mode: 'merge',
      onProgress: (done) => {
        if (done === 7 && !saving) saving = useActiveWorkout.getState().saveEdits();
      },
    });
    expect(await saving!).toBe(sessionId);
    expect(result.imported).toBe(20);
    expect(db.count('workout_sessions', "notes LIKE 'Imported %'")).toBe(20);
    expect(db.all<{ weight_kg: number }>(`SELECT weight_kg FROM set_entries WHERE session_id = '${sessionId}'`)).toEqual([{ weight_kg: 72.5 }]);
    expect(draftValue()).toBe('');
  });

  it('a routine reorder during an import does not roll the import back', async () => {
    const { runImport } = await import('@/tracker/services/hevyImport');
    const r = await import('@/tracker/db/routineRepo');
    const a = await r.createRoutine({ name: 'A', dayType: 'push' });
    const b = await r.createRoutine({ name: 'B', dayType: 'pull' });
    let reordering: Promise<void> | null = null;
    const result = await runImport(history(15), {
      mode: 'merge',
      onProgress: (done) => {
        if (done === 3 && !reordering) reordering = r.reorderRoutines([b, a]);
      },
    });
    await reordering!;
    expect(result.imported).toBe(15);
    expect(db.count('workout_sessions', "notes LIKE 'Imported %'")).toBe(15);
    expect(db.all<{ id: string }>(`SELECT id FROM plan_days WHERE id IN ('${a}', '${b}') ORDER BY day_order`).map((x) => x.id)).toEqual([b, a]);
  });
});

describe('LW-08: typing or ticking during the Finish save leaves no ghost workout', () => {
  beforeEach(async () => {
    await onboarded();
  });

  it('a tick and typing while Finish runs → draft stays cleared; next launch has no workout in progress', async () => {
    const { flushDraft } = await import('@/tracker/store/activeWorkoutStore');
    const { writeQueueIdle } = await import('@/db/writeQueue');
    const { useActiveWorkout, card } = await liveWorkoutWithOneSet();
    useActiveWorkout.getState().addSet(card.key);
    const second = useActiveWorkout.getState().exercises[0].sets[1].key;
    await flushDraft();

    // The member taps at the worst moment: right after Finish has cleared the draft, before
    // it has closed the workout.
    const real = db.runAsync.bind(db);
    let tapped = false;
    vi.spyOn(db, 'runAsync').mockImplementation(async (sql: string, ...params: unknown[]) => {
      const r = await real(sql, ...params);
      const p = JSON.stringify(params);
      if (!tapped && p.includes('activeWorkoutDraft') && p.includes('""')) {
        tapped = true;
        useActiveWorkout.getState().updateSet(card.key, second, { weightKg: 80, reps: 3 });
        useActiveWorkout.getState().toggleDone(card.key, second);
      }
      return r;
    });
    const id = await useActiveWorkout.getState().finish(null);
    await flushDraft();
    await writeQueueIdle();
    await new Promise((r) => setTimeout(r, 0));

    expect(tapped).toBe(true);
    expect(id).toBeTruthy();
    expect(draftValue()).toBe('');

    // Next launch, same database: no ghost "workout in progress".
    vi.restoreAllMocks();
    await onboarded(db);
    const next = await import('@/tracker/store/activeWorkoutStore');
    await next.useActiveWorkout.getState().hydrate();
    expect(next.useActiveWorkout.getState().active).toBe(false);
    expect(db.count('workout_sessions', "id = '" + id + "'")).toBe(1);
  });
});

describe('DS-09 / LW-01: draft saves are debounced, queued, and a failure is never silent', () => {
  beforeEach(async () => {
    await onboarded();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function draftWrites(spy: { mock: { calls: unknown[][] } }): number {
    return spy.mock.calls.filter((c) => JSON.stringify(c[1] ?? '').includes('activeWorkoutDraft')).length;
  }

  it('ten keystrokes → one draft write after the typing pause', async () => {
    const { useActiveWorkout, card } = await liveWorkoutWithOneSet();
    const { DRAFT_SAVE_DEBOUNCE_MS } = await import('@/tracker/store/activeWorkoutStore');
    const { writeQueueIdle } = await import('@/db/writeQueue');
    await writeQueueIdle();
    vi.useFakeTimers();
    const spy = vi.spyOn(db, 'runAsync');
    useActiveWorkout.getState().addSet(card.key);
    const key = useActiveWorkout.getState().exercises[0].sets[1].key;
    for (const w of ['1', '10', '100', '100.', '100.5']) useActiveWorkout.getState().updateSet(card.key, key, { weightKg: Number(w) });
    for (const r of ['1', '12', '1', '10', '8']) useActiveWorkout.getState().updateSet(card.key, key, { reps: Number(r) });
    expect(draftWrites(spy)).toBe(0);
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS + 10);
    vi.useRealTimers();
    await writeQueueIdle();
    expect(draftWrites(spy)).toBe(1);
    const saved = JSON.parse(draftValue()!);
    expect(saved.exercises[0].sets[1]).toMatchObject({ weightKg: 100.5, reps: 8 });
  });

  it('phone storage full → the banner names it, the app retries, and the banner goes once a save works', async () => {
    const { useActiveWorkout, card } = await liveWorkoutWithOneSet();
    const { writeQueueIdle } = await import('@/db/writeQueue');
    const banner = await import('@/components/saveProblemStore');
    await writeQueueIdle();
    expect(banner.useSaveProblem.getState().message).toBeNull();

    vi.useFakeTimers();
    let full = true;
    const real = db.runAsync.bind(db);
    vi.spyOn(db, 'runAsync').mockImplementation(async (sql: string, ...params: unknown[]) => {
      if (full && JSON.stringify(params).includes('activeWorkoutDraft')) throw new Error('database or disk is full (code 13)');
      return real(sql, ...params);
    });
    useActiveWorkout.getState().updateSet(card.key, card.sets[0].key, { reps: 6 });
    await vi.advanceTimersByTimeAsync(400);
    expect(banner.useSaveProblem.getState().message).toBe(banner.STORAGE_FULL_MESSAGE);

    full = false; // the member frees some space
    await vi.advanceTimersByTimeAsync(2100); // the automatic retry
    vi.useRealTimers();
    await writeQueueIdle();
    expect(banner.useSaveProblem.getState().message).toBeNull();
    expect(JSON.parse(draftValue()!).exercises[0].sets[0].reps).toBe(6);
  });

  it('a failed Finish keeps the workout open and on disk, and shows the banner', async () => {
    const { useActiveWorkout } = await liveWorkoutWithOneSet();
    const { writeQueueIdle } = await import('@/db/writeQueue');
    const banner = await import('@/components/saveProblemStore');
    const real = db.runAsync.bind(db);
    let fail = true;
    vi.spyOn(db, 'runAsync').mockImplementation(async (sql: string, ...params: unknown[]) => {
      if (fail && sql.includes('INSERT INTO workout_sessions')) throw new Error('SQLITE_FULL: database or disk is full');
      return real(sql, ...params);
    });
    const before = db.count('workout_sessions');
    await expect(useActiveWorkout.getState().finish(null)).rejects.toThrow(/full/);
    await writeQueueIdle();
    await new Promise((r) => setTimeout(r, 0));
    expect(useActiveWorkout.getState().active).toBe(true);
    expect(useActiveWorkout.getState().committing).toBe(false);
    expect(db.count('workout_sessions')).toBe(before);
    expect(JSON.parse(draftValue()!).exercises[0].sets[0]).toMatchObject({ weightKg: 70, reps: 5, done: true });
    // Finish is not retried by itself: the line asks for another tap, never "we'll keep trying" —
    // and the draft save that worked right after it neither cleared that line nor counted as an
    // autosave failure (the autosave's back-off stays at zero).
    expect(banner.useSaveProblem.getState().message).toBe(banner.FINISH_STORAGE_FULL_MESSAGE);
    expect(banner.useSaveProblem.getState().message).not.toMatch(/keep trying/i);
    expect(banner.useSaveProblem.getState().failures).toBe(0);

    fail = false; // retry works → banner goes
    expect(await useActiveWorkout.getState().finish(null)).toBeTruthy();
    expect(banner.useSaveProblem.getState().message).toBeNull();
    expect(draftValue()).toBe('');
  });

  it('a failed Finish (any error) says: still open — tap Finish again; later autosaves keep that line', async () => {
    const { useActiveWorkout, card } = await liveWorkoutWithOneSet();
    const { writeQueueIdle } = await import('@/db/writeQueue');
    const banner = await import('@/components/saveProblemStore');
    const real = db.runAsync.bind(db);
    vi.spyOn(db, 'runAsync').mockImplementation(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('INSERT INTO workout_sessions')) throw new Error('UNIQUE constraint failed');
      return real(sql, ...params);
    });
    await expect(useActiveWorkout.getState().finish(null)).rejects.toThrow(/UNIQUE/);
    await writeQueueIdle();
    await new Promise((r) => setTimeout(r, 0));
    expect(banner.useSaveProblem.getState().message).toBe("Couldn't finish your workout. It's still open — tap Finish again.");

    // The member keeps typing; the autosave works — the workout is still not finished, so the line stays.
    useActiveWorkout.getState().updateSet(card.key, card.sets[0].key, { reps: 6 });
    await new Promise((r) => setTimeout(r, 400));
    await writeQueueIdle();
    expect(JSON.parse(draftValue()!).exercises[0].sets[0].reps).toBe(6);
    expect(banner.useSaveProblem.getState().message).toBe(banner.FINISH_FAILED_MESSAGE);
    expect(banner.useSaveProblem.getState().failures).toBe(0);

    // Discarding the workout: nothing is waiting any more.
    await useActiveWorkout.getState().discard();
    expect(banner.useSaveProblem.getState().message).toBeNull();
  });
});

describe('save-problem wording', () => {
  it('storage-full errors get the storage words; anything else the general line', async () => {
    const b = await import('@/components/saveProblemStore');
    for (const e of [
      new Error('database or disk is full'),
      new Error('Call to function NativeStatement.finalizeAsync has been rejected. → Caused by: SQLITE_FULL'),
      Object.assign(new Error('write failed'), { code: 'ENOSPC' }),
      'ENOSPC: no space left on device',
    ]) {
      expect(b.saveProblemMessage(e)).toBe(b.STORAGE_FULL_MESSAGE);
    }
    expect(b.saveProblemMessage(new Error('UNIQUE constraint failed'))).toBe(b.GENERIC_SAVE_MESSAGE);
    expect(b.saveProblemMessage(undefined)).toBe(b.GENERIC_SAVE_MESSAGE);
  });

  it('retries back off from 2 s to at most 30 s', async () => {
    const { retryDelayMs } = await import('@/components/saveProblemStore');
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
  });
});
