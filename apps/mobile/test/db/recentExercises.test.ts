/**
 * LW-15 on a REAL database: the "Recent" band of the Add exercise picker — the exercises of the
 * last few workouts, newest workout first, each once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

let db: RealDb;
beforeEach(async () => {
  db = await bootRealApp();
});

const idOf = (name: string): string => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0].id;

async function ensureExercise(name: string): Promise<void> {
  if (db.all('SELECT id FROM exercises WHERE name = ?', [name]).length > 0) return;
  const { getDb } = await import('@/db');
  await getDb().runAsync(
    "INSERT INTO exercises(id, name, muscle_group, equipment) VALUES(?, ?, 'chest', 'barbell')",
    [`ex-${name}`, name],
  );
}

async function logWorkout(dateISO: string, names: string[]): Promise<void> {
  const { createSession, addSets } = await import('@/db/repos/workoutRepo');
  for (const n of names) await ensureExercise(n);
  const s = await createSession({ dateISO, dayType: 'full', source: 'manual', startedAt: Date.parse(`${dateISO}T07:00:00`) });
  await addSets(
    s.id,
    names.map((n) => ({ exerciseId: idOf(n), weightKg: 50, reps: 8 })),
  );
}

describe('getRecentExerciseIds', () => {
  it('lists the last workouts’ exercises, newest workout first, without repeats', async () => {
    const { getRecentExerciseIds } = await import('@/tracker/db/recentExercises');
    expect(await getRecentExerciseIds()).toEqual([]);
    await logWorkout('2026-10-01', ['Barbell Bench Press', 'Barbell Squat']);
    await logWorkout('2026-10-03', ['Deadlift', 'Barbell Bench Press']);
    const ids = await getRecentExerciseIds();
    expect(ids).toEqual([idOf('Deadlift'), idOf('Barbell Bench Press'), idOf('Barbell Squat')]);
  });

  it('looks back only a few workouts', async () => {
    const { getRecentExerciseIds } = await import('@/tracker/db/recentExercises');
    await logWorkout('2026-09-01', ['Barbell Squat']);
    for (let d = 2; d <= 6; d++) await logWorkout(`2026-09-0${d}`, ['Barbell Bench Press']);
    expect(await getRecentExerciseIds(5)).toEqual([idOf('Barbell Bench Press')]);
  });
});

describe('getLastDoneDates (redesign R5: Profile → Exercises, "Last: 12 Oct")', () => {
  it('each done exercise with its newest workout; a never-done one is absent', async () => {
    const { getLastDoneDates } = await import('@/tracker/db/recentExercises');
    await logWorkout('2026-10-01', ['Barbell Bench Press', 'Barbell Squat']);
    await logWorkout('2026-10-03', ['Barbell Bench Press']);
    const last = await getLastDoneDates();
    expect(last.get(idOf('Barbell Bench Press'))?.dateISO).toBe('2026-10-03');
    expect(last.get(idOf('Barbell Squat'))?.dateISO).toBe('2026-10-01');
    expect(last.get(idOf('Barbell Squat'))?.startedAt).toBe(Date.parse('2026-10-01T07:00:00'));
    await ensureExercise('Deadlift');
    expect(last.has(idOf('Deadlift'))).toBe(false);
  });
});

describe('getWorkoutNames (redesign R5: the exercise page’s History tab)', () => {
  it('the saved name, else the day type', async () => {
    await logWorkout('2026-10-01', ['Barbell Bench Press']);
    const { getDb } = await import('@/db');
    const [s] = db.all<{ id: string }>("SELECT id FROM workout_sessions WHERE date_iso = '2026-10-01'");
    const { getWorkoutNames } = await import('@/tracker/db/workoutNames');
    const before = await getWorkoutNames([s.id, 'missing']);
    expect(before.get(s.id)).toBe('Full Body');
    expect(before.has('missing')).toBe(false);
    await getDb().runAsync('UPDATE workout_sessions SET title = ? WHERE id = ?', ['Push 1', s.id]);
    expect((await getWorkoutNames([s.id])).get(s.id)).toBe('Push 1');
  });
});
