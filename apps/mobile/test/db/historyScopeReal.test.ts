/**
 * "Previous values" (13 Oct 2026) against REAL SQL (test/helpers/realDb.ts), on the demo's
 * training plus two gyms of the owner's kind:
 *   folder Gym A: routines A1 "Gym A Push 1" and A2 "Gym A Push 2"; folder Gym B: routine B1.
 *   Bench logged 100×5 from A1, then 80×6 from A2, then 60×8 from B1 (newest).
 *  - Any workout: everyone reads 60×8 (today's behaviour);
 *  - Same folder: A1 and A2 read 80×6, B1 reads 60×8;
 *  - Same routine: A1 100×5, A2 80×6, B1 60×8;
 * for PREVIOUS, the Target's history (and the Target itself), and the carried note. An empty
 * workout always reads every workout; a remembered Target never crosses a setting change; older
 * workouts with no known routine count by their name.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PreviousFrom } from '@/tracker/store/trackerPrefsStore';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

let db: RealDb;
let bench: string;
let A1: string;
let A2: string;
let B1: string;
/** Start times after everything the demo holds, so the gyms' workouts are the newest. */
let clock: number;

const NAMES = { A1: 'Gym A Push 1', A2: 'Gym A Push 2', B1: 'Gym B Push' } as const;

async function setting(v: PreviousFrom): Promise<void> {
  const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
  useTrackerPrefs.getState().setPreviousFrom(v);
}

/** One workout of Bench (three equal sets, the note on the first), saved as `routineId` with `title`. */
async function logBench(
  routineId: string | null,
  title: string | null,
  weightKg: number,
  reps: number,
  note: string,
  notes: string | null = null,
): Promise<string> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { getDb } = await import('@/db');
  const { todayISO } = await import('@/lib/date');
  clock += 60_000;
  const s = await createSession({ dateISO: todayISO(), dayType: 'push', source: 'manual', startedAt: clock, notes });
  await addSetsWithMeta(
    s.id,
    [0, 1, 2].map((i) => ({ exerciseId: bench, weightKg, reps, isWarmup: false, ...(i === 0 ? { note } : {}) })),
  );
  await getDb().runAsync('UPDATE workout_sessions SET routine_id = ?, title = ? WHERE id = ?', [routineId, title, s.id]);
  return s.id;
}

beforeEach(async () => {
  db = await bootRealApp();
  const { loadDemoData } = await import('@/onboarding/db/dataActions');
  await loadDemoData();
  const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
  // The setting is persisted; here it is kept in memory (no phone storage in a unit test).
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
  A2 = idOf(gymA, NAMES.A2);
  B1 = idOf(gymB, NAMES.B1);
  clock = Number(db.all<{ t: number | null }>('SELECT MAX(started_at) AS t FROM workout_sessions')[0].t ?? Date.now() - 86_400_000);
  await logBench(A1, NAMES.A1, 100, 5, 'note from A1');
  await logBench(A2, NAMES.A2, 80, 6, 'note from A2');
  await logBench(B1, NAMES.B1, 60, 8, 'note from B1');
});

/** What a workout of `routineId` reads now: PREVIOUS, the Target's history, the Target, the note. */
async function readsFor(routineId: string | null) {
  const { historyScopeFor } = await import('@/tracker/db/historyScope');
  const { getBoundedExerciseHistories, getBoundedExerciseHistory } = await import('@/tracker/db/exerciseHistory');
  const { getProgressionHistoryMany } = await import('@/tracker/db/progressionHistory');
  const { getCarriedNote, getCarriedNotes } = await import('@/tracker/db/exercisePrefs');
  const { getTargetsForCards } = await import('@/tracker/services/coachTargets');
  const scope = await historyScopeFor(routineId);
  const prev = (await getBoundedExerciseHistories([bench], 1, { skipEasy: true, scope })).get(bench)![0].sets[0];
  const prevOne = (await getBoundedExerciseHistory(bench, 1, { skipEasy: true, scope }))[0].sets[0];
  const prog = (await getProgressionHistoryMany([{ exerciseId: bench }], 13, { scope }))[0][0].sets[0];
  const note = (await getCarriedNotes([bench], { scope })).get(bench) ?? null;
  const noteOne = await getCarriedNote(bench, { scope });
  const target = routineId ? (await getTargetsForCards(routineId, [{ key: 'c', exerciseId: bench }])).get('c') : undefined;
  // The single and batched reads always agree.
  expect([prevOne.weightKg, prevOne.reps]).toEqual([prev.weightKg, prev.reps]);
  expect(noteOne).toBe(note);
  return {
    previous: `${prev.weightKg}×${prev.reps}`,
    history: `${prog.weightKg}×${prog.reps}`,
    target: target?.last ? `${target.last.weightKg}×${target.last.topReps}` : null,
    note,
  };
}

const sees = (w: number, r: number, from: 'A1' | 'A2' | 'B1') => ({
  previous: `${w}×${r}`,
  history: `${w}×${r}`,
  target: `${w}×${r}`,
  note: `note from ${from}`,
});

describe('the three settings, on PREVIOUS, the Target and the carried note', () => {
  it('Any workout: every routine reads the newest Bench (60×8 from Gym B)', async () => {
    await setting('any');
    expect(await readsFor(A1)).toEqual(sees(60, 8, 'B1'));
    expect(await readsFor(A2)).toEqual(sees(60, 8, 'B1'));
    expect(await readsFor(B1)).toEqual(sees(60, 8, 'B1'));
  });

  it('Same folder: Gym A’s routines share 80×6, Gym B keeps 60×8', async () => {
    await setting('folder');
    expect(await readsFor(A1)).toEqual(sees(80, 6, 'A2'));
    expect(await readsFor(A2)).toEqual(sees(80, 6, 'A2'));
    expect(await readsFor(B1)).toEqual(sees(60, 8, 'B1'));
  });

  it('Same routine: each routine reads its own last time', async () => {
    await setting('routine');
    expect(await readsFor(A1)).toEqual(sees(100, 5, 'A1'));
    expect(await readsFor(A2)).toEqual(sees(80, 6, 'A2'));
    expect(await readsFor(B1)).toEqual(sees(60, 8, 'B1'));
  });

  it('no fallback: a routine never done reads nothing — PREVIOUS empty, the first-time Target', async () => {
    await setting('routine');
    const { addExerciseToRoutine, createRoutine } = await import('@/tracker/db/routineRepo');
    const fresh = await createRoutine({ name: 'Gym A Push 3', dayType: 'push' });
    await addExerciseToRoutine(fresh, bench, { targetSets: 3, repRangeMin: 5, repRangeMax: 8 });
    const { historyScopeFor } = await import('@/tracker/db/historyScope');
    const { getBoundedExerciseHistories } = await import('@/tracker/db/exerciseHistory');
    const scope = await historyScopeFor(fresh);
    expect((await getBoundedExerciseHistories([bench], 1, { skipEasy: true, scope })).get(bench)).toEqual([]);
    const { getTargetsForCards } = await import('@/tracker/services/coachTargets');
    const t = (await getTargetsForCards(fresh, [{ key: 'c', exerciseId: bench }])).get('c')!;
    expect(t.rule).toBe('R0');
    expect(t.last).toBeNull();
  });
});

describe('the live workout', () => {
  it('a routine started under Same folder: its card’s PREVIOUS, note and Target come from Gym A', async () => {
    await setting('folder');
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { useTargets } = await import('@/tracker/store/targetStore');
    await useActiveWorkout.getState().startFromPlanDay(A1);
    const card = useActiveWorkout.getState().exercises[0];
    expect(card.previousSets.map((p) => `${p.weightKg}×${p.reps}`)).toEqual(['80×6', '80×6', '80×6']);
    expect(card.note).toBe('note from A2');
    expect(useTargets.getState().targets.get(card.key)?.last?.weightKg).toBe(80);
    // An exercise added on the spot reads the same scope.
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    await useActiveWorkout.getState().addExercise((await getExerciseById(bench))!);
    expect(useActiveWorkout.getState().exercises[1].previousSets[0]).toMatchObject({ weightKg: 80, reps: 6 });
    await useActiveWorkout.getState().discard();
  });

  it('an empty workout (no routine) always reads every workout', async () => {
    await setting('routine');
    const { historyScopeFor } = await import('@/tracker/db/historyScope');
    expect(await historyScopeFor('')).toBeNull();
    expect(await historyScopeFor(null)).toBeNull();
    expect(await historyScopeFor('no-such-routine')).toBeNull();
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    useActiveWorkout.getState().startEmpty();
    await useActiveWorkout.getState().addExercise((await getExerciseById(bench))!);
    const card = useActiveWorkout.getState().exercises[0];
    expect(card.previousSets[0]).toMatchObject({ weightKg: 60, reps: 8 });
    expect(card.note).toBe('note from B1');
    await useActiveWorkout.getState().discard();
  });

  it('a remembered Target never crosses a setting change (and the screen’s query changes with it)', async () => {
    const { getTargetsForCards } = await import('@/tracker/services/coachTargets');
    const last = async () => (await getTargetsForCards(A1, [{ key: 'c', exerciseId: bench }])).get('c')!.last!.weightKg;
    await setting('any');
    expect(await last()).toBe(60);
    expect(await last()).toBe(60); // from memory
    await setting('routine');
    expect(await last()).toBe(100);
    await setting('folder');
    expect(await last()).toBe(80);
    await setting('any');
    expect(await last()).toBe(60);
    const { querySignature, targetQuery } = await import('@/tracker/store/targetStore');
    const sig = (previousFrom: PreviousFrom) => querySignature(targetQuery(A1, [], { easy: false, effort: false, previousFrom }));
    expect(new Set([sig('any'), sig('routine'), sig('folder')]).size).toBe(3);
    // Without an explicit choice the query reads the setting now.
    await setting('folder');
    expect(querySignature(targetQuery(A1, [], { easy: false, effort: false }))).toBe(sig('folder'));
  });
});

describe('older workouts with no known routine count by their name', () => {
  it('NULL routine by title (case and spaces ignored), a gone routine by title, an old import by its notes; never an empty workout', async () => {
    await setting('routine');
    // Each newer than the gyms' workouts, so each one is "last time" wherever it counts.
    await logBench(null, '  gym a   PUSH 1 ', 90, 4, 'imported A1');
    await logBench('deleted-routine', NAMES.A2, 70, 7, 'gone A2');
    await logBench(null, null, 50, 9, 'old import B1', `${NAMES.B1}\nfelt strong`);
    await logBench('', NAMES.A1, 40, 10, 'empty workout'); // '' = no routine: never in a routine's scope
    expect((await readsFor(A1)).previous).toBe('90×4');
    expect((await readsFor(A2)).previous).toBe('70×7');
    expect((await readsFor(B1)).previous).toBe('50×9');
    expect((await readsFor(B1)).note).toBe('old import B1');
    // A workout of an existing routine of another folder never counts by its name.
    await logBench(B1, NAMES.A1, 30, 12, 'B1 named like A1');
    expect((await readsFor(A1)).previous).toBe('90×4');
    // Same folder: Gym A's newest is the gone-routine workout named "Gym A Push 2".
    await setting('folder');
    expect((await readsFor(A1)).previous).toBe('70×7');
    // Any workout: the newest of all.
    await setting('any');
    expect((await readsFor(A1)).previous).toBe('30×12');
  });
});
