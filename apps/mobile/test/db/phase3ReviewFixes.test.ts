/**
 * Phase 3 review fixes, against REAL SQL (test/helpers/realDb.ts):
 *  1. a logged past workout and a Repeat move "Today" like any workout from the plan;
 *  2. re-saving the same followed folder keeps its routines' ids (Today does not jump back);
 *  3. Counting changed while correcting a workout reaches rows added after the change;
 *  6. a single is its own 1-rep max in the stored records too (and old inflated rows are fixed).
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
  db.raw.run('DELETE FROM personal_records');
  db.raw.run('DELETE FROM set_entries');
  db.raw.run('DELETE FROM workout_sessions');
});

const exId = (name: string): string => {
  const row = db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0];
  if (!row) throw new Error(`not in library: ${name}`);
  return row.id;
};
const BENCH = 'Barbell Bench Press';

// ---------------------------------------------------------------- 6. a single is its own 1RM

describe('6. a single is its own 1-rep max in the stored records', () => {
  async function logSets(dateISO: string, hour: number, sets: { kg: number; reps: number }[]) {
    const { createSession, addSets } = await import('@/db/repos/workoutRepo');
    const [y, m, d] = dateISO.split('-').map(Number);
    const start = new Date(y, m - 1, d, hour, 0, 0).getTime();
    const s = await createSession({ dateISO, dayType: 'push', notes: null, source: 'manual', startedAt: start, endedAt: start + 3_600_000 });
    await addSets(s.id, sets.map((x) => ({ exerciseId: exId(BENCH), weightKg: x.kg, reps: x.reps, isWarmup: false })));
    return s.id;
  }
  const e1rmRows = () =>
    db.all<{ value: number; weight_kg: number; reps: number }>(
      "SELECT value, weight_kg, reps FROM personal_records WHERE kind = 'e1rm' ORDER BY date_iso, rowid",
    );

  it('100 × 1 is recorded as 100 (not 103.3), so a later 95 × 2 (101.3) is a new best — two ways agree', async () => {
    await logSets('2026-09-01', 18, [{ kg: 100, reps: 1 }]);
    await logSets('2026-09-03', 18, [{ kg: 95, reps: 2 }]);
    expect(e1rmRows()).toEqual([
      { value: 100, weight_kg: 100, reps: 1 },
      { value: 101.3, weight_kg: 95, reps: 2 },
    ]);
    // Two ways: the stored record (Progress's Strength trend) = the records engine (Records page).
    const { getAllPrs } = await import('@/db/repos/prRepo');
    const stored = (await getAllPrs()).find((p) => p.kind === 'e1rm')!;
    const { epleyE1rm } = await import('@/engine/overload');
    expect(stored.value).toBe(Math.round(epleyE1rm(95, 2) * 10) / 10);
    expect(epleyE1rm(100, 1)).toBe(100);
  });

  it('the PR rebuild picks the true best when a single is involved', async () => {
    await logSets('2026-09-01', 18, [{ kg: 100, reps: 1 }]);
    const later = await logSets('2026-09-03', 18, [{ kg: 95, reps: 2 }]);
    db.raw.run('DELETE FROM personal_records');
    const { reconcilePrsForExercises } = await import('@/tracker/services/prRebuild');
    await reconcilePrsForExercises([exId(BENCH)]);
    const rows = db.all<{ session_id: string; value: number }>("SELECT session_id, value FROM personal_records WHERE kind = 'e1rm'");
    expect(rows.some((r) => r.session_id === later && r.value === 101.3)).toBe(true);
  });

  it('records an older version inflated (100 × 1 stored as 103.3) are put right once, and the hidden best is recorded', async () => {
    const first = await logSets('2026-09-01', 18, [{ kg: 100, reps: 1 }]);
    const later = await logSets('2026-09-03', 18, [{ kg: 95, reps: 2 }]);
    // As an older version left them: the single at 103.3, the 101.3 never recorded.
    db.raw.run("DELETE FROM personal_records WHERE kind = 'e1rm' AND session_id = ?", [later]);
    db.raw.run("UPDATE personal_records SET value = 103.3 WHERE kind = 'e1rm' AND session_id = ?", [first]);
    const { fixSingleE1rmRecords } = await import('@/tracker/services/prRebuild');
    await fixSingleE1rmRecords();
    expect(e1rmRows()).toEqual([
      { value: 100, weight_kg: 100, reps: 1 },
      { value: 101.3, weight_kg: 95, reps: 2 },
    ]);
    // Once only: a second run changes nothing.
    db.raw.run("UPDATE personal_records SET value = 103.3 WHERE kind = 'e1rm' AND session_id = ?", [first]);
    await fixSingleE1rmRecords();
    expect(e1rmRows()[0].value).toBe(103.3);
  });
});

// ---------------------------------------------------------------- shared: a followed Hevy-like folder

const CURL = 'Dumbbell Curl';
const ROUTINES = (bench: string, curl: string) => {
  const ex = (id: string) => ({ exerciseId: id, sets: 3, repMin: 8, repMax: 12 });
  return [
    { name: 'Push 1', dayType: 'push' as const, exercises: [ex(bench), ex(curl)] },
    { name: 'Pull 1', dayType: 'pull' as const, exercises: [ex(curl)] },
    { name: 'Push 2', dayType: 'push' as const, exercises: [ex(bench)] },
    { name: 'Pull 2', dayType: 'pull' as const, exercises: [ex(curl)] },
  ];
};

const dayIds = (): Record<string, string> =>
  Object.fromEntries(db.all<{ id: string; name: string }>('SELECT id, name FROM plan_days').map((r) => [r.name, r.id]));

/** Push 1, Pull 1, Push 2, Pull 2 — followed since a week ago (so yesterday counts). */
async function followFolder(): Promise<Record<string, string>> {
  const { saveAppFolder } = await import('@/tracker/db/folderRepo');
  const { addDays, todayISO } = await import('@/lib/date');
  await saveAppFolder('hevy', 'From Hevy', ROUTINES(exId(BENCH), exId(CURL)), { follow: true, todayISO: addDays(todayISO(), -7) });
  return dayIds();
}

const sessionRow = (id: string) =>
  db.all<{ routine_id: string | null; title: string | null; day_type: string }>(
    'SELECT routine_id, title, day_type FROM workout_sessions WHERE id = ?',
    [id],
  )[0];

/** A workout from a routine, saved directly (as Finish would) — `daysAgo` days back, early morning. */
async function savedWorkout(daysAgo: number, routineId: string, title: string, exercises: string[]): Promise<string> {
  const { createSession, addSets } = await import('@/db/repos/workoutRepo');
  const { addDays, todayISO, fromISO } = await import('@/lib/date');
  const day = addDays(todayISO(), -daysAgo);
  const d = fromISO(day);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6, 0, 0, 7).getTime();
  const s = await createSession({ dateISO: day, dayType: 'push', notes: null, source: 'manual', startedAt: start, endedAt: start + 3_600_000 });
  await addSets(s.id, exercises.map((name) => ({ exerciseId: exId(name), weightKg: 50, reps: 8, isWarmup: false })));
  db.raw.run('UPDATE workout_sessions SET routine_id = ?, title = ? WHERE id = ?', [routineId, title, s.id]);
  return s.id;
}

// ---------------------------------------------------------------- 1. past log and Repeat move Today

describe('1. a logged past workout and a Repeat move Today', () => {
  async function logYesterday(
    routine: { id: string; name: string; dayType: 'push' | 'pull' } | 'none' | undefined,
    exercises: string[],
    dayType?: 'push',
  ) {
    const { addDays, todayISO } = await import('@/lib/date');
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    expect(useActiveWorkout.getState().startPastWorkout({ dateISO: addDays(todayISO(), -1), hour: 7, minute: 0, minutes: 60, routine })).toBeNull();
    if (dayType) useActiveWorkout.getState().setEditDayType(dayType);
    for (const name of exercises) await useActiveWorkout.getState().addExercise((await getExerciseById(exId(name)))!);
    for (const card of useActiveWorkout.getState().exercises) {
      useActiveWorkout.getState().updateSet(card.key, card.sets[0].key, { weightKg: 50, reps: 8 });
    }
    return (await useActiveWorkout.getState().saveEdits())!;
  }

  it('past-log Push 1 yesterday (picked) → Today says Pull 1; the routine, day type and name are saved', async () => {
    const ids = await followFolder();
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    expect((await getTodayPlan()).next?.name).toBe('Push 1');
    const id = await logYesterday({ id: ids['Push 1'], name: 'Push 1', dayType: 'push' }, [BENCH]);
    expect(sessionRow(id)).toEqual({ routine_id: ids['Push 1'], title: 'Push 1', day_type: 'push' });
    expect((await getTodayPlan()).next?.name).toBe('Pull 1');
  });

  it('not picked → saved as "not known" (NULL), and its exercises still place it: Today moves', async () => {
    await followFolder();
    const id = await logYesterday(undefined, [BENCH, CURL], 'push'); // the day type set in the editor
    expect(sessionRow(id).routine_id).toBeNull();
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    expect((await getTodayPlan()).next?.name).toBe('Pull 1');
  });

  it('"None" picked → saved as no routine (empty), and Today does not move', async () => {
    await followFolder();
    const id = await logYesterday('none', [BENCH, CURL]);
    expect(sessionRow(id).routine_id).toBe('');
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    expect((await getTodayPlan()).next?.name).toBe('Push 1');
  });

  it('Repeat of Push 1 → saved as Push 1 (routine and name), and Today moves to Pull 1', async () => {
    const ids = await followFolder();
    const source = await savedWorkout(3, ids['Push 1'], 'Push 1', [BENCH, CURL]);
    await savedWorkout(2, ids['Pull 1'], 'Pull 1', [CURL]);
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    expect((await getTodayPlan()).next?.name).toBe('Push 2');

    const { getSessionSummary } = await import('@/tracker/services/finishSummary');
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const data = (await getSessionSummary(source))!;
    await useActiveWorkout.getState().startFromSession(data.session);
    expect(useActiveWorkout.getState().workoutName).toBe('Push 1');
    const card = useActiveWorkout.getState().exercises[0];
    useActiveWorkout.getState().updateSet(card.key, card.sets[0].key, { weightKg: 60, reps: 8 });
    useActiveWorkout.getState().toggleDone(card.key, card.sets[0].key);
    const id = (await useActiveWorkout.getState().finish(null))!;
    expect(sessionRow(id)).toMatchObject({ routine_id: ids['Push 1'], title: 'Push 1' });
    const tp = await getTodayPlan();
    expect(tp.status).toBe('doneToday');
    expect(tp.doneToday?.name).toBe('Push 1');
    expect(tp.next?.name).toBe('Pull 1');
  });
});

// ---------------------------------------------------------------- 2. re-saving the followed folder

describe('2. re-saving the same followed folder keeps Today where it was', () => {
  it('a second Hevy import mid-rotation keeps the routines’ ids, so Today still names the next routine', async () => {
    const ids = await followFolder();
    await savedWorkout(2, ids['Push 1'], 'My Monday', [BENCH, CURL]);
    await savedWorkout(1, ids['Pull 1'], 'My Tuesday', [CURL]);
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    expect((await getTodayPlan()).next?.name).toBe('Push 2');

    const { saveAppFolder } = await import('@/tracker/db/folderRepo');
    const { todayISO } = await import('@/lib/date');
    await saveAppFolder('hevy', 'From Hevy', ROUTINES(exId(BENCH), exId(CURL)), { follow: true, todayISO: todayISO() });
    expect(dayIds()).toEqual(ids);
    expect((await getTodayPlan()).next?.name).toBe('Push 2');
    expect(db.count('plan_exercises')).toBe(5);
  });

  it('a renamed routine keeps its id by position; a removed one goes; nothing is duplicated', async () => {
    const ids = await followFolder();
    const { saveAppFolder } = await import('@/tracker/db/folderRepo');
    const { todayISO } = await import('@/lib/date');
    const r = ROUTINES(exId(BENCH), exId(CURL));
    await saveAppFolder('hevy', 'From Hevy', [r[0], { ...r[1], name: 'Pull A' }, r[2]], { follow: true, todayISO: todayISO() });
    const now = dayIds();
    expect(now['Push 1']).toBe(ids['Push 1']);
    expect(now['Pull A']).toBe(ids['Pull 1']);
    expect(now['Push 2']).toBe(ids['Push 2']);
    expect(now['Pull 2']).toBeUndefined();
    expect(db.count('plan_days')).toBe(3);
    expect(db.all<{ name: string }>('SELECT name FROM plan_days ORDER BY day_order').map((x) => x.name)).toEqual(['Push 1', 'Pull A', 'Push 2']);
  });
});

describe('2. a saved routine id that no longer exists falls back to the workout’s name', () => {
  it('routine_id dangling (the routine was re-made) → placed by its name, not dropped as "another folder"', async () => {
    const { todayPlan } = await import('@/tracker/plans/todayPlan');
    const r = (id: string, name: string, dayType: 'push' | 'pull') => ({ id, name, dayType, exerciseIds: ['x'] });
    const folder = { id: 'f', name: 'F', startISO: null, routines: [r('a', 'Push 1', 'push'), r('b', 'Pull 1', 'pull'), r('c', 'Push 2', 'push')] };
    const s = { id: 's', dateISO: '2026-10-09', startedAt: 1, dayType: 'pull' as const, routineId: 'gone', routineGone: true, title: 'Pull 1', exerciseIds: [] };
    expect(todayPlan({ todayISO: '2026-10-10', folder, sessions: [s] }).routine?.name).toBe('Push 2');
    // A routine of ANOTHER folder (it still exists) stays off this plan.
    expect(todayPlan({ todayISO: '2026-10-10', folder, sessions: [{ ...s, routineGone: false }] }).routine?.name).toBe('Push 1');
  });

  it('from the database: a workout whose routine was deleted is placed by its name', async () => {
    const ids = await followFolder();
    await savedWorkout(1, 'deleted-routine-id', 'Pull 1', [CURL]);
    void ids;
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    expect((await getTodayPlan()).next?.name).toBe('Push 2');
  });
});

// ---------------------------------------------------------------- 3. Counting while correcting

describe('3. Counting changed while correcting reaches rows added after the change', () => {
  const modes = (sessionId: string) =>
    db.all<{ load_mode: string | null }>('SELECT load_mode FROM set_entries WHERE session_id = ? ORDER BY set_number', [sessionId]).map((r) => r.load_mode);

  it('editing: a row added after switching to "each" is saved as "each" too', async () => {
    const { createSession, addSets, getSessionDetail } = await import('@/db/repos/workoutRepo');
    const start = new Date(2026, 7, 1, 18, 0, 0, 7).getTime();
    const s = await createSession({ dateISO: '2026-08-01', dayType: 'push', notes: null, source: 'manual', startedAt: start, endedAt: start + 3_600_000 });
    await addSets(s.id, [{ exerciseId: exId(BENCH), weightKg: 60, reps: 5, isWarmup: false }]);
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().startEditingSession((await getSessionDetail(s.id))!);
    const card = useActiveWorkout.getState().exercises[0];
    useActiveWorkout.getState().setLoadMode(card.key, 'both');
    useActiveWorkout.getState().addSet(card.key);
    const added = useActiveWorkout.getState().exercises[0].sets[1];
    useActiveWorkout.getState().updateSet(card.key, added.key, { weightKg: 30, reps: 5 });
    await useActiveWorkout.getState().saveEdits();
    expect(modes(s.id)).toEqual(['both', 'both']);
  });

  it('past log: rows typed after switching to "each" are saved as "each"', async () => {
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    expect(useActiveWorkout.getState().startPastWorkout({ dateISO: '2026-08-01', hour: 7, minute: 0, minutes: 45 })).toBeNull();
    await useActiveWorkout.getState().addExercise((await getExerciseById(exId(BENCH)))!);
    const card = useActiveWorkout.getState().exercises[0];
    useActiveWorkout.getState().setLoadMode(card.key, 'both');
    useActiveWorkout.getState().addSet(card.key);
    for (const st of useActiveWorkout.getState().exercises[0].sets) useActiveWorkout.getState().updateSet(card.key, st.key, { weightKg: 20, reps: 10 });
    const id = (await useActiveWorkout.getState().saveEdits())!;
    expect(modes(id)).toEqual(['both', 'both']);
  });
});
