/**
 * Phase 3 packet C — editing the past safely, and "Log a past workout", against REAL SQL.
 *
 *  - HI-16 an old workout's PREVIOUS is the workout before it, however much came after;
 *  - HI-02 an exercise added while editing quotes the workout BEFORE, never a later one;
 *  - HI-08 Counting / Rest changed while editing stay in that workout, and go with Discard;
 *  - HI-07 an edit is never kept as "a workout in progress" (not written to disk, not restored);
 *  - HI-03 a moved imported workout is not brought back by a re-import;
 *  - the start time can be edited, keeping the length;
 *  - a past workout is saved as a manual workout on its day, with its length.
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
let seq = 0;

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  db.raw.run('DELETE FROM personal_records');
  db.raw.run('DELETE FROM set_entries');
  db.raw.run('DELETE FROM workout_sessions');
  seq = 0;
});

const exId = (name: string): string => {
  const row = db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0];
  if (!row) throw new Error(`not in library: ${name}`);
  return row.id;
};

function addWorkout(dateISO: string, sets: { ex: string; kg: number; reps: number }[]): string {
  seq += 1;
  const id = `w${String(seq).padStart(3, '0')}`;
  const [y, m, d] = dateISO.split('-').map(Number);
  const start = new Date(y, m - 1, d, 18, 0, 0, 7).getTime();
  db.raw.run(
    "INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, notes, source) VALUES (?, ?, ?, ?, 'push', NULL, 'manual')",
    [id, dateISO, start, start + 3_600_000],
  );
  sets.forEach((s, i) =>
    db.raw.run(
      'INSERT INTO set_entries (id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup) VALUES (?, ?, ?, ?, ?, ?, 0)',
      [`${id}-${i}`, id, exId(s.ex), i + 1, s.kg, s.reps],
    ),
  );
  return id;
}

async function openEditor(sessionId: string) {
  const { getSessionDetail } = await import('@/db/repos/workoutRepo');
  const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
  const detail = (await getSessionDetail(sessionId))!;
  await useActiveWorkout.getState().startEditingSession(detail);
  return useActiveWorkout;
}

const BENCH = 'Barbell Bench Press';
const ROW = 'Barbell Row';

describe('HI-16 / HI-02 an old workout quotes the workout BEFORE it', () => {
  it('PREVIOUS is the workout before, even with 12 newer ones; an added exercise reads before too', async () => {
    addWorkout('2026-07-20', [{ ex: ROW, kg: 40, reps: 10 }]);
    addWorkout('2026-07-25', [{ ex: BENCH, kg: 55, reps: 5 }]);
    const old = addWorkout('2026-08-01', [{ ex: BENCH, kg: 60, reps: 5 }]);
    for (let i = 0; i < 12; i += 1) addWorkout(`2026-09-${String(i + 1).padStart(2, '0')}`, [{ ex: BENCH, kg: 80, reps: 5 }]);
    addWorkout('2026-10-01', [{ ex: ROW, kg: 70, reps: 10 }]);

    const store = await openEditor(old);
    expect(store.getState().exercises[0].previousSets.map((p) => p.weightKg)).toEqual([55]);

    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    await store.getState().addExercise((await getExerciseById(exId(ROW)))!);
    const added = store.getState().exercises[1];
    expect(added.previousSets.map((p) => p.weightKg)).toEqual([40]); // not last week's 70
    expect(added.bests ?? null).toBeNull();
    await store.getState().discard();
  });
});

describe('HI-08 Counting and Rest changed while editing', () => {
  it('stay in that workout only, and vanish with Discard', async () => {
    const old = addWorkout('2026-08-01', [{ ex: BENCH, kg: 60, reps: 5 }]);
    const benchId = exId(BENCH);
    const modeBefore = db.all<{ load_mode: string | null }>('SELECT load_mode FROM exercises WHERE id = ?', [benchId])[0].load_mode;

    let store = await openEditor(old);
    let card = store.getState().exercises[0];
    store.getState().setLoadMode(card.key, 'both');
    expect(await store.getState().setRestSec(card.key, 30)).toBe(true);
    await store.getState().discard();
    expect(db.all<{ load_mode: string | null }>('SELECT load_mode FROM exercises WHERE id = ?', [benchId])[0].load_mode).toBe(modeBefore);
    expect(db.count('exercise_prefs', `exercise_id = '${benchId}'`)).toBe(0);
    expect(db.all<{ load_mode: string | null }>('SELECT load_mode FROM set_entries WHERE session_id = ?', [old])[0].load_mode).toBeNull();

    store = await openEditor(old);
    card = store.getState().exercises[0];
    store.getState().setLoadMode(card.key, 'both');
    await store.getState().saveEdits();
    // Saved with THIS workout's sets; the exercise (every future workout) keeps its own.
    expect(db.all<{ load_mode: string | null }>('SELECT load_mode FROM set_entries WHERE session_id = ?', [old])[0].load_mode).toBe('both');
    expect(db.all<{ load_mode: string | null }>('SELECT load_mode FROM exercises WHERE id = ?', [benchId])[0].load_mode).toBe(modeBefore);
  });
});

describe('HI-07 an edit is never "a workout in progress"', () => {
  it('is not written to disk, and an old edit draft is not restored', async () => {
    const old = addWorkout('2026-08-01', [{ ex: BENCH, kg: 60, reps: 5 }]);
    const store = await openEditor(old);
    const { flushDraft } = await import('@/tracker/store/activeWorkoutStore');
    const card = store.getState().exercises[0];
    store.getState().addSet(card.key);
    await flushDraft();
    const draft = db.all<{ value: string }>("SELECT value FROM meta WHERE key = 'activeWorkoutDraft'")[0]?.value ?? '';
    expect(draft).toBe('');

    // A draft an older version left behind for an edit: not brought back.
    db.raw.run("INSERT INTO meta(key, value) VALUES('activeWorkoutDraft', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
      JSON.stringify({ startedAt: 1, dayType: 'push', planDayId: null, exercises: [], editingSessionId: old }),
    ]);
    store.setState({ active: false, hydrated: false, editingSessionId: null, pastLog: false, exercises: [] });
    await store.getState().hydrate();
    expect(store.getState().active).toBe(false);
  });
});

describe('the start time and the length', () => {
  it('a new start time keeps the length; Minutes refuses 0 and 999 without changing anything', async () => {
    const old = addWorkout('2026-08-01', [{ ex: BENCH, kg: 60, reps: 5 }]);
    const store = await openEditor(old);
    expect(store.getState().setEditStartTime(7, 30)).toBeNull();
    store.getState().setEditDuration(0);
    store.getState().setEditDuration(999);
    await store.getState().saveEdits();
    const row = db.all<{ started_at: number; ended_at: number; date_iso: string }>('SELECT started_at, ended_at, date_iso FROM workout_sessions WHERE id = ?', [old])[0];
    const d = new Date(row.started_at);
    expect([d.getHours(), d.getMinutes()]).toEqual([7, 30]);
    expect(row.ended_at - row.started_at).toBe(3_600_000);
    expect(row.date_iso).toBe('2026-08-01');
  });

  it('a start still to come today is refused', async () => {
    const { checkStartTime } = await import('@/tracker/services/editFields');
    const now = new Date(2026, 9, 10, 9, 0).getTime();
    expect(checkStartTime('2026-10-10', 18, 0, now)).toMatch(/hasn't come yet/);
    expect(checkStartTime('2026-10-10', 8, 0, now)).toBeNull();
    expect(checkStartTime('2026-10-10', 24, 0, now)).toMatch(/00:00 to 23:59/);
  });

  it('a past log for today that would end after now is refused with a message — never slid back silently', async () => {
    const { checkStartTime } = await import('@/tracker/services/editFields');
    const now = new Date(2026, 9, 10, 9, 0).getTime();
    // 08:30 + 60 minutes = 09:30, after 09:00.
    expect(checkStartTime('2026-10-10', 8, 30, now, 60)).toMatch(/end after now/);
    expect(checkStartTime('2026-10-10', 8, 0, now, 60)).toBeNull(); // ends 09:00 exactly
    expect(checkStartTime('2026-10-09', 23, 30, now, 120)).toBeNull(); // yesterday, ends 01:30 today
    // The store refuses it too, and opens nothing.
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { todayISO } = await import('@/lib/date');
    const in10 = new Date(Date.now() - 10 * 60_000);
    if (in10.getDate() !== new Date().getDate()) return; // just after midnight
    expect(
      useActiveWorkout.getState().startPastWorkout({ dateISO: todayISO(), hour: in10.getHours(), minute: in10.getMinutes(), minutes: 60 }),
    ).toMatch(/end after now/);
    expect(useActiveWorkout.getState().active).toBe(false);
  });
});

describe('HI-03 a moved imported workout stays one workout', () => {
  function file(n: number) {
    const workouts = Array.from({ length: n }, (_, i) => {
      const startedAt = Date.UTC(2025, 0, 1 + i * 2, 9, 0, 0);
      return {
        title: `Imported ${i + 1}`,
        dayType: 'push' as const,
        startedAt,
        endedAt: startedAt + 3_600_000,
        dateISO: new Date(startedAt).toISOString().slice(0, 10),
        exercises: [
          {
            title: BENCH,
            supersetId: null,
            note: null,
            sets: [{ weightKg: 60, reps: 5, isWarmup: false, setType: 'normal' as const, rpe: null, setIndex: 0, durationSec: null, distanceM: null }],
          },
        ],
      };
    });
    return { workouts, distinctExerciseTitles: [BENCH], skippedRows: 0, totalSetRows: n, timedRows: 0 };
  }

  it('moving it a day earlier, then importing the same file again, adds nothing', async () => {
    const { runImport, previewImport } = await import('@/tracker/services/hevyImport');
    await runImport(file(3) as never, { mode: 'merge' });
    expect(db.count('workout_sessions')).toBe(3);
    const second = db.all<{ id: string; date_iso: string }>('SELECT id, date_iso FROM workout_sessions ORDER BY date_iso')[1];

    const store = await openEditor(second.id);
    const { addDays } = await import('@/lib/date');
    store.getState().setEditDate(addDays(second.date_iso, -1));
    await store.getState().saveEdits();
    expect(db.all<{ date_iso: string }>('SELECT date_iso FROM workout_sessions WHERE id = ?', [second.id])[0].date_iso).toBe(addDays(second.date_iso, -1));

    expect((await previewImport(file(3) as never)).alreadyHere).toBe(3);
    const again = await runImport(file(3) as never, { mode: 'merge' });
    expect(again.imported).toBe(0);
    expect(db.count('workout_sessions')).toBe(3);
  });
});

describe('Log a past workout', () => {
  it('opens the editor for a day gone by and saves a manual workout on that day, with its length', async () => {
    const { addDays, todayISO } = await import('@/lib/date');
    const day = addDays(todayISO(), -9);
    addWorkout(addDays(day, -3), [{ ex: BENCH, kg: 50, reps: 5 }]);
    addWorkout(todayISO(), [{ ex: BENCH, kg: 90, reps: 5 }]);
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    const store = useActiveWorkout;
    expect(store.getState().startPastWorkout({ dateISO: day, hour: 7, minute: 15, minutes: 45 })).toBeNull();
    expect(store.getState().pastLog).toBe(true);
    await store.getState().addExercise((await getExerciseById(exId(BENCH)))!);
    const card = store.getState().exercises[0];
    // PREVIOUS is the workout before that day, never today's 90 kg.
    expect(card.previousSets.map((p) => p.weightKg)).toEqual([50]);
    store.getState().updateSet(card.key, card.sets[0].key, { weightKg: 62.5, reps: 5 }); // typed, not ticked
    expect(await store.getState().finish(null)).toBeNull(); // a past log never goes through Finish
    const id = await store.getState().saveEdits();
    expect(id).toBeTruthy();
    const row = db.all<{ date_iso: string; started_at: number; ended_at: number; source: string }>(
      'SELECT date_iso, started_at, ended_at, source FROM workout_sessions WHERE id = ?',
      [id as string],
    )[0];
    expect(row.date_iso).toBe(day);
    expect(row.source).toBe('manual');
    expect(row.ended_at - row.started_at).toBe(45 * 60_000);
    expect([new Date(row.started_at).getHours(), new Date(row.started_at).getMinutes()]).toEqual([7, 15]);
    expect(db.all<{ weight_kg: number }>('SELECT weight_kg FROM set_entries WHERE session_id = ?', [id as string])).toEqual([{ weight_kg: 62.5 }]);
    expect(store.getState().active).toBe(false);
    expect(store.getState().pastLog).toBe(false);
  });

  it('refuses a start still to come', async () => {
    const { todayISO } = await import('@/lib/date');
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const later = new Date(Date.now() + 2 * 3_600_000);
    if (later.getDate() !== new Date().getDate()) return; // near midnight: nothing later today
    expect(useActiveWorkout.getState().startPastWorkout({ dateISO: todayISO(), hour: later.getHours(), minute: 59, minutes: 30 })).toMatch(/hasn't come yet/);
    expect(useActiveWorkout.getState().active).toBe(false);
  });
});
