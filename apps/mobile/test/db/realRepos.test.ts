/**
 * REAL SQL (audit QA-13 / H8): the app's own start-up, repos and workout store running against
 * a real in-memory SQLite (test/helpers/realDb.ts). Nothing here mocks the database — every
 * query is the app's own SQL, executed by SQLite, with foreign keys on.
 *
 * Each test boots a fresh database through the app's real start-up (initDb → tracker schema →
 * member schema → library sync), then imports the modules it drives (see the helper's header
 * for why imports come after the boot).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, runStartup, type RealDb } from '../helpers/realDb';

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

/** Boot, onboard a real member (profile + the whole bundled library), return an exercise id. */
async function onboarded(): Promise<void> {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
}

function exerciseId(name: string): string {
  const row = db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0];
  if (!row) throw new Error(`exercise not in library: ${name}`);
  return row.id;
}

describe('start-up on a fresh install (real schema)', () => {
  beforeEach(async () => {
    db = await bootRealApp();
  });

  it('creates every table the app reads, foreign keys on, versions stamped', () => {
    const tables = db.tables();
    for (const t of [
      'user_profile', 'body_weight', 'exercises', 'workout_sessions', 'set_entries', 'personal_records',
      'workout_plans', 'plan_days', 'plan_exercises', 'meals', 'chat_messages', 'meta', 'sync_outbox',
      'exercise_prefs', 'body_measurements', 'progress_photos',
    ]) {
      expect(tables, t).toContain(t);
    }
    expect(db.all('PRAGMA foreign_keys')[0]).toEqual({ foreign_keys: 1 });
    const meta = Object.fromEntries(db.all<{ key: string; value: string }>('SELECT key, value FROM meta').map((r) => [r.key, r.value]));
    expect(meta.schema_version).toBe('1');
    expect(meta.tracker_schema_version).toBe('8');
    expect(meta.member_schema_version).toBe('1');
  });

  it('a fresh install has no profile and no training — the welcome screen shows', async () => {
    const { hasMemberProfile } = await import('@/onboarding/db/dataActions');
    expect(await hasMemberProfile()).toBe(false);
    expect(db.count('workout_sessions')).toBe(0);
    expect(db.count('exercises')).toBe(0);
  });

  it('start-up run a second time changes nothing (idempotent)', async () => {
    const before = db.all("SELECT type, name, sql FROM sqlite_master ORDER BY name");
    await runStartup();
    const { initTrackerSchema } = await import('@/tracker/db/trackerSchema');
    await initTrackerSchema();
    expect(db.all("SELECT type, name, sql FROM sqlite_master ORDER BY name")).toEqual(before);
  });
});

describe('onboarding (real SQL)', () => {
  beforeEach(onboarded);

  it('writes exactly one profile, the library and the first body weight — no training', async () => {
    expect(db.count('user_profile')).toBe(1);
    expect(db.all('SELECT name, phone FROM user_profile')[0]).toEqual({ name: 'Test Member', phone: '+919876543210' });
    expect(db.count('exercises')).toBeGreaterThan(300);
    expect(db.count('body_weight')).toBe(1);
    for (const t of ['workout_sessions', 'set_entries', 'personal_records', 'meals', 'chat_messages']) {
      expect(db.count(t), t).toBe(0);
    }
    const { hasMemberProfile } = await import('@/onboarding/db/dataActions');
    expect(await hasMemberProfile()).toBe(true);
  });

  it('refuses to run again over an existing member (ExistingDataError), data untouched', async () => {
    const { completeOnboarding, ExistingDataError } = await import('@/onboarding/db/dataActions');
    const n = db.count('exercises');
    await expect(completeOnboarding({ ...MEMBER, name: 'Someone Else' })).rejects.toBeInstanceOf(ExistingDataError);
    expect(db.all('SELECT name FROM user_profile')).toEqual([{ name: 'Test Member' }]);
    expect(db.count('exercises')).toBe(n);
  });

  it('every library row is linked to the bundled catalogue and names are unique', () => {
    expect(db.count('exercises', 'catalog_key IS NULL')).toBe(0);
    const dup = db.all('SELECT name, COUNT(*) AS n FROM exercises GROUP BY name HAVING n > 1');
    expect(dup).toEqual([]);
  });
});

describe('workouts: save, read back, records, delete (real SQL)', () => {
  beforeEach(onboarded);

  it('createSession + addSets numbers sets per exercise and reads back as one session', async () => {
    const repo = await import('@/db/repos/workoutRepo');
    const bench = exerciseId('Barbell Bench Press');
    const s = await repo.createSession({ dateISO: '2026-10-01', dayType: 'push', startedAt: Date.UTC(2026, 9, 1, 5), endedAt: Date.UTC(2026, 9, 1, 6) });
    await repo.addSets(s.id, [
      { exerciseId: bench, weightKg: 40, reps: 10, isWarmup: true },
      { exerciseId: bench, weightKg: 60, reps: 8 },
      { exerciseId: bench, weightKg: 60, reps: 7 },
    ]);
    const detail = await repo.getSessionDetail(s.id);
    expect(detail?.exercises).toHaveLength(1);
    expect(detail!.exercises[0].sets.map((x) => [x.setNumber, x.weightKg, x.reps, x.isWarmup])).toEqual([
      [1, 40, 10, true],
      [2, 60, 8, false],
      [3, 60, 7, false],
    ]);
  });

  it('the first workout on a lift records weight and 1-rep-max records; a lighter one does not', async () => {
    const repo = await import('@/db/repos/workoutRepo');
    const pr = await import('@/db/repos/prRepo');
    const bench = exerciseId('Barbell Bench Press');
    const s1 = await repo.createSession({ dateISO: '2026-10-01', dayType: 'push', startedAt: Date.UTC(2026, 9, 1, 5) });
    await repo.addSets(s1.id, [{ exerciseId: bench, weightKg: 60, reps: 8 }]);
    const s2 = await repo.createSession({ dateISO: '2026-10-03', dayType: 'push', startedAt: Date.UTC(2026, 9, 3, 5) });
    await repo.addSets(s2.id, [{ exerciseId: bench, weightKg: 50, reps: 8 }]);
    const rows = db.all<{ kind: string; session_id: string }>('SELECT kind, session_id FROM personal_records ORDER BY kind');
    expect(rows.every((r) => r.session_id === s1.id)).toBe(true);
    expect(rows.map((r) => r.kind)).toEqual(expect.arrayContaining(['e1rm', 'weight']));
    const all = await pr.getAllPrs();
    expect(all.find((r) => r.kind === 'weight')?.value).toBe(60);
  });

  it('deleteSession removes the workout, its sets (cascade) and the records it earned', async () => {
    const repo = await import('@/db/repos/workoutRepo');
    const bench = exerciseId('Barbell Bench Press');
    const s = await repo.createSession({ dateISO: '2026-10-01', dayType: 'push', startedAt: Date.UTC(2026, 9, 1, 5) });
    await repo.addSets(s.id, [{ exerciseId: bench, weightKg: 60, reps: 8 }]);
    expect(db.count('personal_records')).toBeGreaterThan(0);
    await repo.deleteSession(s.id);
    expect(db.count('workout_sessions')).toBe(0);
    expect(db.count('set_entries')).toBe(0);
    expect(db.count('personal_records')).toBe(0);
  });

  it('a set on an exercise that does not exist is refused by the foreign key', async () => {
    const repo = await import('@/db/repos/workoutRepo');
    const s = await repo.createSession({ dateISO: '2026-10-01', dayType: 'push', startedAt: Date.UTC(2026, 9, 1, 5) });
    await expect(repo.addSets(s.id, [{ exerciseId: 'no-such-exercise', weightKg: 60, reps: 8 }])).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('set details (RPE, drop set, note) persist and read back; a note carries forward', async () => {
    const repo = await import('@/db/repos/workoutRepo');
    const { addSetsWithMeta, getSessionSetMeta } = await import('@/tracker/db/trackerSets');
    const { getCarriedNote } = await import('@/tracker/db/exercisePrefs');
    const bench = exerciseId('Barbell Bench Press');
    const s1 = await repo.createSession({ dateISO: '2026-10-01', dayType: 'push', startedAt: Date.UTC(2026, 9, 1, 5) });
    const created = await addSetsWithMeta(s1.id, [
      { exerciseId: bench, weightKg: 60, reps: 8, rpe: 8, note: 'elbows tucked' },
      { exerciseId: bench, weightKg: 45, reps: 10, setType: 'drop' },
    ]);
    const meta = await getSessionSetMeta(s1.id);
    expect(meta[created[0].id]).toMatchObject({ rpe: 8, note: 'elbows tucked', setType: 'normal' });
    expect(meta[created[1].id]).toMatchObject({ setType: 'drop', rpe: null });
    expect(await getCarriedNote(bench)).toBe('elbows tucked');

    // A later workout with no note on the lift stops the note carrying.
    const s2 = await repo.createSession({ dateISO: '2026-10-03', dayType: 'push', startedAt: Date.UTC(2026, 9, 3, 5) });
    await addSetsWithMeta(s2.id, [{ exerciseId: bench, weightKg: 60, reps: 8 }]);
    expect(await getCarriedNote(bench)).toBeNull();
  });

  it('the live workout store: start, add an exercise, tick a set, finish → one saved session', async () => {
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    const repo = await import('@/db/repos/workoutRepo');
    const bench = (await getExerciseById(exerciseId('Barbell Bench Press')))!;
    const st = useActiveWorkout.getState();
    st.startEmpty();
    await useActiveWorkout.getState().addExercise(bench);
    const card = useActiveWorkout.getState().exercises[0];
    const setKey = card.sets[0].key;
    useActiveWorkout.getState().updateSet(card.key, setKey, { weightKg: 70, reps: 5 });
    useActiveWorkout.getState().toggleDone(card.key, setKey);
    const id = await useActiveWorkout.getState().finish('felt strong');
    expect(id).toBeTruthy();
    const detail = await repo.getSessionDetail(id!);
    expect(detail?.notes).toBe('felt strong');
    expect(detail?.exercises[0].sets.filter((s) => !s.isWarmup).map((s) => [s.weightKg, s.reps])).toContainEqual([70, 5]);
    // The draft is cleared in the same transaction.
    expect(db.all("SELECT value FROM meta WHERE key = 'activeWorkoutDraft'")).toEqual([{ value: '' }]);
    expect(useActiveWorkout.getState().active).toBe(false);
  });

  it('history reads: recent sessions and sessions in a date range come back newest first', async () => {
    const repo = await import('@/db/repos/workoutRepo');
    const { getSessionDetailsBetween } = await import('@/tracker/db/sessionDetails');
    const squat = exerciseId('Barbell Squat');
    for (const [d, w] of [['2026-09-20', 80], ['2026-09-27', 85], ['2026-10-04', 90]] as const) {
      const s = await repo.createSession({ dateISO: d, dayType: 'legs', startedAt: new Date(`${d}T06:00:00Z`).getTime() });
      await repo.addSets(s.id, [{ exerciseId: squat, weightKg: w, reps: 5 }]);
    }
    const recent = await repo.getRecentSessionDetails(2);
    expect(recent.map((s) => s.dateISO)).toEqual(['2026-10-04', '2026-09-27']);
    const range = await getSessionDetailsBetween('2026-09-21', '2026-10-31');
    expect(range.map((s) => s.dateISO).sort()).toEqual(['2026-09-27', '2026-10-04']);
    expect(range.find((s) => s.dateISO === '2026-10-04')?.totalVolumeKg).toBe(450);
  });
});

describe('routines (real SQL)', () => {
  beforeEach(onboarded);

  it('create a routine, add exercises, read it back in order', async () => {
    const r = await import('@/tracker/db/routineRepo');
    const id = await r.createRoutine({ name: 'Push A', dayType: 'push' });
    await r.addExerciseToRoutine(id, exerciseId('Barbell Bench Press'));
    await r.addExerciseToRoutine(id, exerciseId('Dumbbell Shoulder Press'));
    const got = await r.getRoutine(id);
    expect(got?.name).toBe('Push A');
    expect(got?.exercises.map((e) => e.exercise.name)).toEqual(['Barbell Bench Press', 'Dumbbell Shoulder Press']);
    expect((await r.listRoutines()).map((x) => x.id)).toContain(id);
  });

  it('"Save as routine" from a workout keeps exercise order and set counts (createRoutineFromWorkout)', async () => {
    const r = await import('@/tracker/db/routineRepo');
    const bench = exerciseId('Barbell Bench Press');
    const row = exerciseId('Barbell Row');
    const id = await r.createRoutineFromWorkout({
      name: 'From workout',
      dayType: 'upper',
      items: [{ exerciseId: row, workingSets: 4 }, { exerciseId: bench, workingSets: 2 }],
    });
    const got = await r.getRoutine(id);
    expect(got?.exercises.map((e) => [e.exercise.id, e.targetSets])).toEqual([[row, 4], [bench, 2]]);
  });

  it('deleting a routine removes its exercises (cascade) and leaves the library alone', async () => {
    const r = await import('@/tracker/db/routineRepo');
    const n = db.count('exercises');
    const id = await r.createRoutine({ name: 'Temp', dayType: 'full' });
    await r.addExerciseToRoutine(id, exerciseId('Barbell Bench Press'));
    await r.deleteRoutine(id);
    expect(await r.getRoutine(id)).toBeNull();
    expect(db.count('plan_exercises', `plan_day_id = '${id}'`)).toBe(0);
    expect(db.count('exercises')).toBe(n);
  });
});

describe('erase all data (real SQL, foreign keys on)', () => {
  beforeEach(onboarded);

  it('erase leaves every member table empty — the list is derived from the real schema (QA-22)', async () => {
    const repo = await import('@/db/repos/workoutRepo');
    const r = await import('@/tracker/db/routineRepo');
    const bench = exerciseId('Barbell Bench Press');
    const s = await repo.createSession({ dateISO: '2026-10-01', dayType: 'push', startedAt: Date.UTC(2026, 9, 1, 5) });
    await repo.addSets(s.id, [{ exerciseId: bench, weightKg: 60, reps: 8 }]);
    const rid = await r.createRoutine({ name: 'Push A', dayType: 'push' });
    await r.addExerciseToRoutine(rid, bench);

    const { eraseAllData, hasMemberProfile } = await import('@/onboarding/db/dataActions');
    await eraseAllData();
    expect(await hasMemberProfile()).toBe(false);
    // Every table except `meta` (migration versions) must be empty.
    const left = db
      .tables()
      .filter((t) => t !== 'meta')
      .map((t) => [t, db.count(t)] as const)
      .filter(([, n]) => n > 0);
    expect(left).toEqual([]);
  });

  it('QA-22 (fixed): erase also clears per-exercise rest lengths (exercise_prefs)', async () => {
    const { setExerciseRestSec } = await import('@/tracker/db/exercisePrefs');
    await setExerciseRestSec(exerciseId('Barbell Bench Press'), 120);
    const { eraseAllData } = await import('@/onboarding/db/dataActions');
    await eraseAllData();
    expect(db.count('exercise_prefs')).toBe(0);
  });
});
