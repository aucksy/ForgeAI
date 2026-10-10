/**
 * Phase 2, packet A — the calm Finish against REAL SQL (test/helpers/realDb.ts):
 *  - LW-03 a row with numbers that was never ticked is NOT saved, unless the member chose
 *    "Save them";
 *  - LW-07 the end picked for a workout left open is what is saved (kept between start and now);
 *  - LW-10 the workout's own name is saved (tracker schema v9) and read back by history.
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

/** Bench with 3 rows: 70 × 5 ticked, 80 × 3 typed but never ticked, one empty. */
async function workout() {
  const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
  const { getExerciseById } = await import('@/db/repos/exerciseRepo');
  const id = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
  const bench = (await getExerciseById(id))!;
  useActiveWorkout.getState().startEmpty();
  await useActiveWorkout.getState().addExercise(bench);
  const st = useActiveWorkout.getState();
  const card = st.exercises[0];
  st.addSet(card.key);
  st.addSet(card.key);
  const rows = useActiveWorkout.getState().exercises[0].sets;
  st.updateSet(card.key, rows[0].key, { weightKg: 70, reps: 5 });
  st.toggleDone(card.key, rows[0].key);
  st.updateSet(card.key, rows[1].key, { weightKg: 80, reps: 3 });
  return useActiveWorkout;
}

const savedSets = (sessionId: string) =>
  db.all<{ weight_kg: number; reps: number }>('SELECT weight_kg, reps FROM set_entries WHERE session_id = ? ORDER BY set_number', [sessionId]);

describe('LW-03 unticked rows at Finish', () => {
  it('are left out by default — only the ticked set is saved, and no record comes from the 80 kg row', async () => {
    const store = await workout();
    const id = (await store.getState().finish(null))!;
    expect(savedSets(id)).toEqual([{ weight_kg: 70, reps: 5 }]);
    expect(db.count('personal_records', `session_id = '${id}' AND weight_kg = 80`)).toBe(0);
  });

  it('are saved when the member chooses "Save them" (the empty row never is)', async () => {
    const store = await workout();
    const id = (await store.getState().finish(null, { keepUnticked: true }))!;
    expect(savedSets(id)).toEqual([
      { weight_kg: 70, reps: 5 },
      { weight_kg: 80, reps: 3 },
    ]);
  });

  it('a tick is stamped with its time (for "ended at the last tick")', async () => {
    const store = await workout();
    const set0 = store.getState().exercises[0].sets[0];
    expect(set0.done).toBe(true);
    expect(typeof set0.doneAt).toBe('number');
    expect(store.getState().exercises[0].sets[1].doneAt).toBeUndefined();
  });
});

describe('LW-07 / LW-10 end time and name', () => {
  it('saves the picked end (never before the start) and the name; history reads the name back', async () => {
    const store = await workout();
    const startedAt = store.getState().startedAt!;
    const id = (await store.getState().finish('felt strong', { endedAt: startedAt - 5_000, name: '  Evening   workout ' }))!;
    const row = db.all<{ ended_at: number; title: string; notes: string }>('SELECT ended_at, title, notes FROM workout_sessions WHERE id = ?', [id])[0];
    expect(row.ended_at).toBe(startedAt);
    expect(row.title).toBe('Evening workout');
    expect(row.notes).toBe('felt strong');

    const { getRecentSessionDetailsBatched } = await import('@/tracker/db/sessionDetails');
    const { getSessionSummary, sessionTitle } = await import('@/tracker/services/finishSummary');
    const [recent] = await getRecentSessionDetailsBatched(1);
    expect(sessionTitle(recent)).toBe('Evening workout');
    expect(sessionTitle((await getSessionSummary(id))!.session)).toBe('Evening workout');
  });

  it('no name: history keeps showing the day type, as for older workouts', async () => {
    const store = await workout();
    const id = (await store.getState().finish(null, { name: '   ' }))!;
    expect(db.all<{ title: string | null }>('SELECT title FROM workout_sessions WHERE id = ?', [id])[0].title).toBeNull();
  });
});
