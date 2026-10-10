/**
 * Audit Phase 3, packet A — a workout remembers its routine (tracker schema v11), against REAL
 * SQL (test/helpers/realDb.ts):
 *  - Finish saves the routine the workout was started from; an empty workout saves "none";
 *  - a Hevy import names the routine by the workout's title ("Push 2"), and a merge re-run
 *    fills it (and the name) in on workouts imported before — never over a saved name;
 *  - "Today" read from the database tells Push 1 from Push 2 and ignores an empty workout;
 *  - RP-22: a bounded exercise-history read returns exactly what the full read did.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

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

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
});

function exerciseId(name: string): string {
  const row = db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0];
  if (!row) throw new Error(`exercise not in library: ${name}`);
  return row.id;
}

/** The owner's Hevy folder shape, followed today: Push 1, Pull 1, Push 2 (⊂ Push 1), Pull 2. */
async function followHevyFolder(): Promise<Record<string, string>> {
  const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
  const { todayISO } = await import('@/lib/date');
  const bench = exerciseId('Barbell Bench Press');
  const curl = exerciseId('Dumbbell Curl');
  const ex = (id: string) => ({ exerciseId: id, sets: 3, repMin: 8, repMax: 12 });
  await createFolderWithRoutines(
    'From Hevy',
    [
      { name: 'Push 1', dayType: 'push', exercises: [ex(bench), ex(curl)] },
      { name: 'Pull 1', dayType: 'pull', exercises: [ex(curl)] },
      { name: 'Push 2', dayType: 'push', exercises: [ex(bench)] },
      { name: 'Pull 2', dayType: 'pull', exercises: [ex(curl)] },
    ],
    { follow: true, todayISO: todayISO() },
  );
  const rows = db.all<{ id: string; name: string }>('SELECT id, name FROM plan_days');
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
}

/** Tick the first set of the open workout (70 × 5) so Finish has a working set. */
async function tickFirstSet() {
  const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
  const st = useActiveWorkout.getState();
  const card = st.exercises[0];
  st.updateSet(card.key, card.sets[0].key, { weightKg: 70, reps: 5 });
  st.toggleDone(card.key, card.sets[0].key);
  return useActiveWorkout;
}

const routineOf = (sessionId: string) =>
  db.all<{ routine_id: string | null }>('SELECT routine_id FROM workout_sessions WHERE id = ?', [sessionId])[0]?.routine_id;

describe('Finish remembers the routine (schema v11)', () => {
  it('a workout started from Push 2 is saved as Push 2, and Today moves to Pull 2 — not Pull 1', async () => {
    const ids = await followHevyFolder();
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    expect((await getTodayPlan()).next?.name).toBe('Push 1');

    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().startFromPlanDay(ids['Push 2']);
    await tickFirstSet();
    const sessionId = (await useActiveWorkout.getState().finish(null, { name: 'Push 2' }))!;
    expect(routineOf(sessionId)).toBe(ids['Push 2']);

    const tp = await getTodayPlan();
    expect(tp.status).toBe('doneToday');
    expect(tp.doneToday?.name).toBe('Push 2');
    expect(tp.next?.name).toBe('Pull 2');
    expect(tp.words.title).toBe('Done today: Push 2');
    expect(tp.words.line).toBe('Next: Pull 2');
  });

  it('an empty workout is saved with no routine and never moves or hides Today (RP-01)', async () => {
    await followHevyFolder();
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    useActiveWorkout.getState().startEmpty();
    // It even holds Push 1's lift — still not Push 1.
    await useActiveWorkout.getState().addExercise((await getExerciseById(exerciseId('Barbell Bench Press')))!);
    await tickFirstSet();
    const sessionId = (await useActiveWorkout.getState().finish(null))!;
    expect(routineOf(sessionId)).toBe('');

    const { getTodayPlan } = await import('@/tracker/services/todayService');
    const tp = await getTodayPlan();
    expect(tp.status).toBe('next');
    expect(tp.next?.name).toBe('Push 1');
  });

  it('the store’s Start-from-plan starts the routine Today names', async () => {
    const ids = await followHevyFolder();
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().startFromPlan();
    expect(useActiveWorkout.getState().planDayId).toBe(ids['Push 1']);
  });

  it('with no plan, Today says so plainly (SH-03)', async () => {
    db.raw.run('DELETE FROM workout_plans');
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    const tp = await getTodayPlan();
    expect(tp.status).toBe('noPlan');
    expect(tp.words.sentence).toBe('No plan yet · Pick a program or build one');
    const { getTodaysWorkout } = await import('@/services/coach');
    const tw = await getTodaysWorkout();
    expect(tw.headline).not.toMatch(/split/);
    expect(tw.today?.status).toBe('noPlan');
  });
});

/** Hevy-like parsed workouts, one bench set each, on 2025 days. */
function parsed(titles: string[]) {
  const workouts = titles.map((title, i) => {
    const startedAt = Date.UTC(2025, 0, 1 + i, 9, 0, 0);
    return {
      title,
      dayType: 'push' as const,
      startedAt,
      endedAt: startedAt + 3_600_000,
      dateISO: new Date(startedAt).toISOString().slice(0, 10),
      exercises: [
        {
          title: 'Barbell Bench Press',
          supersetId: null,
          note: null,
          sets: [{ weightKg: 60 + i, reps: 5, isWarmup: false, setType: 'normal' as const, rpe: null, setIndex: 0, durationSec: null, distanceM: null }],
        },
      ],
    };
  });
  return { workouts, distinctExerciseTitles: ['Barbell Bench Press'], skippedRows: 0, totalSetRows: titles.length, timedRows: 0 };
}

const sessionsByDay = () =>
  db.all<{ date_iso: string; title: string | null; routine_id: string | null }>(
    'SELECT date_iso, title, routine_id FROM workout_sessions ORDER BY date_iso',
  );

describe('a Hevy import remembers the routine by name', () => {
  it('"Push 2" is the Push 2 routine; "Morning workout" keeps its name and no routine', async () => {
    const ids = await followHevyFolder();
    const { runImport } = await import('@/tracker/services/hevyImport');
    const res = await runImport(parsed(['Push 2', 'Morning workout']), { mode: 'merge' });
    expect(res.imported).toBe(2);
    expect(sessionsByDay()).toEqual([
      { date_iso: '2025-01-01', title: 'Push 2', routine_id: ids['Push 2'] },
      { date_iso: '2025-01-02', title: 'Morning workout', routine_id: null },
    ]);
  });

  it('a merge re-run fills the name and routine of workouts imported before — never over a saved name', async () => {
    const { runImport } = await import('@/tracker/services/hevyImport');
    await runImport(parsed(['Pull 1', 'Push 1']), { mode: 'merge' });
    // As an import before this release left them: no name, no routine.
    db.raw.run('UPDATE workout_sessions SET title = NULL, routine_id = NULL');
    db.raw.run("UPDATE workout_sessions SET title = 'My own name' WHERE date_iso = '2025-01-02'");
    const ids = await followHevyFolder();
    const res = await runImport(parsed(['Pull 1', 'Push 1']), { mode: 'merge' });
    expect(res.imported).toBe(0);
    expect(sessionsByDay()).toEqual([
      { date_iso: '2025-01-01', title: 'Pull 1', routine_id: ids['Pull 1'] },
      { date_iso: '2025-01-02', title: 'My own name', routine_id: ids['Push 1'] },
    ]);
  });
});

describe('RP-22: the exercise-history read is bounded and returns the same', () => {
  it('getExerciseHistory(id, 3) equals the first 3 of the full read', async () => {
    const { runImport } = await import('@/tracker/services/hevyImport');
    await runImport(parsed(['A', 'B', 'C', 'D', 'E', 'F', 'G']), { mode: 'merge' });
    const { getExerciseHistory } = await import('@/db/repos/workoutRepo');
    const bench = exerciseId('Barbell Bench Press');
    const full = await getExerciseHistory(bench);
    expect(full).toHaveLength(7);
    expect(await getExerciseHistory(bench, 3)).toEqual(full.slice(0, 3));
    expect(await getExerciseHistory(bench, 0)).toEqual([]);
  });
});
