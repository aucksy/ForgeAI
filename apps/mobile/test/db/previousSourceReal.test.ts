/**
 * 13 Oct 2026 (the owner's Hevy comparison) against REAL SQL (test/helpers/realDb.ts), on the
 * demo's training plus two gyms of the owner's kind (as historyScopeReal.test.ts):
 *   folder Gym A: routines A1 "Gym A Push 1" and A2 "Gym A Push 2"; folder Gym B: routine B1.
 *   Bench logged ONLY from B1 (100 × 5 at RPE 9, the newest Bench of all).
 *  - "Same folder", start A1: nothing in Gym A — PREVIOUS stays empty (no cell, no hint), and the
 *    card says "First time in this folder · last anywhere 100 kg × 5, <today>" from Gym B.
 *  - "Same routine": the same, "…in this routine…".
 *  - "Any workout": PREVIOUS is B1's 100 × 5 (with its RPE), and the card says
 *    "Last: <today> · Gym B Push" — the workout's title, else its routine's name.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PreviousFrom } from '@/tracker/store/trackerPrefsStore';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

let db: RealDb;
let bench: string;
let A1: string;
let B1: string;
let clock: number;

const NAMES = { A1: 'Gym A Push 1', A2: 'Gym A Push 2', B1: 'Gym B Push' } as const;

async function setting(v: PreviousFrom): Promise<void> {
  const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
  useTrackerPrefs.getState().setPreviousFrom(v);
}

/** One workout of Bench, three equal sets at `rpe`, saved as `routineId` with `title`. */
async function logBench(routineId: string | null, title: string | null, weightKg: number, reps: number, rpe: number | null): Promise<string> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { getDb } = await import('@/db');
  const { todayISO } = await import('@/lib/date');
  clock += 60_000;
  const s = await createSession({ dateISO: todayISO(), dayType: 'push', source: 'manual', startedAt: clock });
  await addSetsWithMeta(
    s.id,
    [0, 1, 2].map(() => ({ exerciseId: bench, weightKg, reps, isWarmup: false, rpe })),
  );
  await getDb().runAsync('UPDATE workout_sessions SET routine_id = ?, title = ? WHERE id = ?', [routineId, title, s.id]);
  return s.id;
}

beforeEach(async () => {
  db = await bootRealApp();
  const { loadDemoData } = await import('@/onboarding/db/dataActions');
  await loadDemoData();
  const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
  useTrackerPrefs.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
  const { setDisplayUnits } = await import('@/lib/units');
  setDisplayUnits('metric');
  bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
  const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
  const row = { exerciseId: bench, sets: 3, repMin: 5, repMax: 8 };
  const gymA = await createFolderWithRoutines('Gym A', [
    { name: NAMES.A1, dayType: 'push', exercises: [row] },
    { name: NAMES.A2, dayType: 'push', exercises: [row] },
  ]);
  const gymB = await createFolderWithRoutines('Gym B', [{ name: NAMES.B1, dayType: 'push', exercises: [row] }]);
  const idOf = (plan: string, name: string): string =>
    db.all<{ id: string }>('SELECT id FROM plan_days WHERE plan_id = ? AND name = ?', [plan, name])[0].id;
  A1 = idOf(gymA, NAMES.A1);
  B1 = idOf(gymB, NAMES.B1);
  clock = Number(db.all<{ t: number | null }>('SELECT MAX(started_at) AS t FROM workout_sessions')[0].t ?? Date.now() - 86_400_000);
  await logBench(B1, NAMES.B1, 100, 5, 9);
});

/** Start A1 and return its Bench card, the card's line, and what each row would hint. */
async function startA1() {
  const { useActiveWorkout, fillForSet, prevForSet } = await import('@/tracker/store/activeWorkoutStore');
  const { cardSourceLine } = await import('@/tracker/lib/previousSource');
  await useActiveWorkout.getState().startFromPlanDay(A1);
  const card = useActiveWorkout.getState().exercises[0];
  return {
    card,
    line: cardSourceLine(card, 'metric')?.text ?? null,
    previous: card.sets.map((s) => prevForSet(card, s.key)),
    hints: card.sets.map((s) => fillForSet(card, s.key, null)),
  };
}

async function today(): Promise<string> {
  const { tinyDateWithYear, todayISO } = await import('@/lib/date');
  return tinyDateWithYear(todayISO());
}

describe('first time in a scope (idea 2)', () => {
  it('Same folder, nothing in Gym A: "First time in this folder · last anywhere 100 kg × 5", and no PREVIOUS or hint from it', async () => {
    await setting('folder');
    const { card, line, previous, hints } = await startA1();
    expect(card.previousSets).toEqual([]);
    expect(card.lastFrom).toBeUndefined();
    expect(card.elsewhere).toMatchObject({ scope: 'folder', set: { weightKg: 100, reps: 5 } });
    expect(line).toBe(`First time in this folder · last anywhere 100 kg × 5, ${await today()}`);
    // The numbers stay separate: no PREVIOUS cell and no hint quote Gym B.
    expect(previous.every((p) => p == null)).toBe(true);
    expect(hints.every((h) => h == null)).toBe(true);
    // An exercise added on the spot reads the same way (its own read, not the batch).
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    await useActiveWorkout.getState().addExercise((await getExerciseById(bench))!);
    const added = useActiveWorkout.getState().exercises[1];
    expect(added.previousSets).toEqual([]);
    expect(added.elsewhere).toMatchObject({ scope: 'folder', set: { weightKg: 100, reps: 5 } });
    await useActiveWorkout.getState().discard();
  });

  it('Same routine: "First time in this routine"', async () => {
    await setting('routine');
    const { line } = await startA1();
    expect(line).toBe(`First time in this routine · last anywhere 100 kg × 5, ${await today()}`);
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().discard();
  });

  it('once Gym A has its own Bench, the card says where PREVIOUS is from instead', async () => {
    await setting('folder');
    await logBench(A1, null, 80, 6, null);
    const { card, line } = await startA1();
    expect(card.previousSets[0]).toMatchObject({ weightKg: 80, reps: 6 });
    expect(card.previousSets[0].rpe).toBeUndefined();
    expect(card.elsewhere).toBeUndefined();
    // No title: the routine's name.
    expect(line).toBe(`Last: ${await today()} · ${NAMES.A1}`);
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().discard();
  });
});

describe('where PREVIOUS comes from (idea 1) and its RPE (item 1)', () => {
  it('Any workout: PREVIOUS is Gym B’s 100 × 5 at RPE 9, and "Last: <today> · Gym B Push"', async () => {
    await setting('any');
    const { card, line } = await startA1();
    expect(card.previousSets.map((p) => [p.weightKg, p.reps, p.rpe])).toEqual([
      [100, 5, 9],
      [100, 5, 9],
      [100, 5, 9],
    ]);
    expect(card.elsewhere).toBeUndefined();
    expect(card.lastFrom?.name).toBe(NAMES.B1);
    expect(line).toBe(`Last: ${await today()} · ${NAMES.B1}`);
    // The PREVIOUS cell with Track RPE on.
    const { prevLabel } = await import('@/tracker/components/setRowLayout');
    expect(prevLabel(card.previousSets[0], 'weight_reps', 'km', 'metric', true)).toBe('100 × 5\n@ 9');
    expect(prevLabel(card.previousSets[0], 'weight_reps', 'km', 'metric', false)).toBe('100 × 5');
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().discard();
  });
});
