/**
 * Pause the workout (15 Oct 2026, Hevy's "Pause Workout Timer") against REAL SQL: the store keeps
 * the pause in the saved draft (a restart stays paused), a tick while paused resumes, and the
 * saved workout's `ended_at − started_at` is the time trained — so history, the summary, Health
 * Connect and the share picture all read the real duration without any change of their own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const MIN = 60_000;
let db: RealDb;
let clock = new Date(2026, 9, 15, 18, 0, 0, 0).getTime();
const at = (ms: number): void => {
  clock = ms;
  vi.setSystemTime(ms);
};

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  vi.useFakeTimers({ toFake: ['Date'] });
  at(new Date(2026, 9, 15, 18, 0, 0, 0).getTime());
});

afterEach(() => {
  vi.useRealTimers();
});

/** Bench with 3 rows; the first ticked at once. */
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
  for (const r of rows) st.updateSet(card.key, r.key, { weightKg: 70, reps: 5 });
  st.toggleDone(card.key, rows[0].key);
  return { store: useActiveWorkout, card: card.key, rows: rows.map((r) => r.key) };
}

const savedLength = (id: string): number => {
  const r = db.all<{ started_at: number; ended_at: number }>('SELECT started_at, ended_at FROM workout_sessions WHERE id = ?', [id])[0];
  return r.ended_at - r.started_at;
};

describe('pausing a live workout', () => {
  it('the saved workout is the time trained; its start stays the real start', async () => {
    const { store } = await workout();
    const startedAt = store.getState().startedAt!;
    at(clock + 20 * MIN);
    store.getState().pauseWorkout();
    at(clock + 15 * MIN);
    store.getState().resumeWorkout();
    at(clock + 10 * MIN);
    const id = (await store.getState().finish(null))!;
    const row = db.all<{ started_at: number; date_iso: string }>('SELECT started_at, date_iso FROM workout_sessions WHERE id = ?', [id])[0];
    expect(row.started_at).toBe(startedAt);
    expect(row.date_iso).toBe('2026-10-15');
    expect(Math.round(savedLength(id) / 1000)).toBe(30 * 60);
    // The finished workout's page reads the same length (no reader was changed).
    const { getSessionSummary } = await import('@/tracker/services/finishSummary');
    expect((await getSessionSummary(id))!.durationSec).toBe(30 * 60);
    expect(store.getState().pausedAt).toBeNull();
    expect(store.getState().pausedTotalMs).toBe(0);
  });

  it('finish while paused saves the frozen duration', async () => {
    const { store } = await workout();
    at(clock + 42 * MIN);
    store.getState().pauseWorkout();
    at(clock + 2 * 60 * MIN);
    const id = (await store.getState().finish(null))!;
    expect(Math.round(savedLength(id) / 1000)).toBe(42 * 60);
  });

  it('a tick while paused resumes the workout at the tick', async () => {
    const { store, card, rows } = await workout();
    at(clock + 10 * MIN);
    store.getState().pauseWorkout();
    at(clock + 5 * MIN);
    store.getState().toggleDone(card, rows[1]);
    expect(store.getState().pausedAt).toBeNull();
    expect(store.getState().pausedTotalMs).toBe(5 * MIN);
    // An untick does not pause or resume anything.
    store.getState().pauseWorkout();
    store.getState().toggleDone(card, rows[1]);
    expect(store.getState().pausedAt).not.toBeNull();
  });

  it('a tick the phone kept with the app closed resumes at ITS moment', async () => {
    const { store, card, rows } = await workout();
    const base = clock; // (the start itself is 1 ms off a whole second — liveStart)
    at(clock + 10 * MIN);
    store.getState().pauseWorkout();
    const tickAt = clock + 3 * MIN;
    at(clock + 20 * MIN); // the app wakes much later
    store.getState().toggleDone(card, rows[1], undefined, tickAt);
    expect(store.getState().pauses).toEqual([{ from: base + 10 * MIN, to: tickAt }]);
  });

  it('a restart while paused stays paused, with the same frozen time', async () => {
    const { store } = await workout();
    const { flushDraft } = await import('@/tracker/store/activeWorkoutStore');
    const { activeMs } = await import('@/tracker/services/workoutPause');
    const startedAt = store.getState().startedAt!;
    const base = clock;
    at(clock + 5 * MIN);
    store.getState().pauseWorkout();
    at(clock + 2 * MIN);
    store.getState().resumeWorkout();
    at(clock + 8 * MIN);
    store.getState().pauseWorkout();
    await flushDraft();
    const { writeQueueIdle } = await import('@/db/writeQueue');
    await writeQueueIdle();

    // The app is killed: nothing in memory, the draft only on disk. Hours pass.
    store.setState({ hydrated: false, active: false, exercises: [], pausedAt: null, pausedTotalMs: 0, pauses: [] });
    at(clock + 3 * 60 * MIN);
    await store.getState().hydrate();
    const s = store.getState();
    expect(s.active).toBe(true);
    expect(s.pausedAt).toBe(base + 15 * MIN);
    expect(Math.round(activeMs(startedAt, s, clock) / 1000)).toBe(13 * 60);
    const id = (await store.getState().finish(null))!;
    expect(Math.round(savedLength(id) / 1000)).toBe(13 * 60);
  });

  it('a new workout after a paused one starts unpaused; discard clears it too', async () => {
    const { store } = await workout();
    store.getState().pauseWorkout();
    await store.getState().discard();
    expect(store.getState().pausedAt).toBeNull();
    store.getState().startEmpty();
    expect(store.getState().pausedAt).toBeNull();
    expect(store.getState().pauses).toEqual([]);
  });

  it('an edit of a saved workout has no timer to pause', async () => {
    const { store } = await workout();
    const id = (await store.getState().finish(null))!;
    const { getSessionDetail } = await import('@/db/repos/workoutRepo');
    const detail = await getSessionDetail(id);
    await store.getState().startEditingSession(detail!);
    store.getState().pauseWorkout();
    expect(store.getState().pausedAt).toBeNull();
  });
});
