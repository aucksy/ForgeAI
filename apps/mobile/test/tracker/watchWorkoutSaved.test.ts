/**
 * R-269 (1 Nov 2026): after Finish on the phone, the MettleUp watch app shows "Workout saved" for
 * about 4 s instead of jumping straight back. The phone tells it by clearing the live card with
 * saved = true (native clearWorkoutCardSaved -> /forge/workout {active: false, saved: true}); a
 * discard clears it with saved = false.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clears: boolean[] = [];

vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async () => undefined,
  cancelRestEnd: async () => undefined,
  showWorkoutOngoing: async () => undefined,
  clearWorkoutOngoing: async () => undefined,
}));
vi.mock('@/tracker/services/restCard', () => ({
  onRestCardChange: () => () => undefined,
  readRestCard: () => undefined,
  reconcileWithCard: () => ({ do: 'nothing' }),
  restCardHolds: () => false,
  showRestCard: () => true,
  phoneUses24Hour: () => true,
  setRestQuiet: () => undefined,
  setRestRingThroughDnd: () => undefined,
  setRestSoundNative: () => undefined,
  dismissRestOver: () => undefined,
  liveWorkoutCardAvailable: () => true,
  showLiveWorkoutCard: () => true,
  hideLiveWorkoutCard: () => true,
  clearLiveWorkoutCard: (saved?: boolean) => {
    clears.push(saved === true);
  },
}));
vi.mock('@/tracker/services/restDoneRun', () => ({ rowFill: () => ({ weightKg: 72.5, reps: 8 }) }));
vi.mock('@/tracker/services/liveCardImage', () => ({ liveCardImage: () => null }));
vi.mock('@/db', () => ({ getMeta: async () => null, setMeta: async () => undefined }));
vi.mock('@/tracker/store/activeWorkoutStore', async () => {
  const { create } = await import('zustand');
  const useActiveWorkout = create(() => ({
    active: true,
    hydrated: true,
    committing: false,
    editingSessionId: null as string | null,
    pastLog: false,
    startedAt: 1_760_000_000_000,
    workoutName: 'Push 1',
    exercises: [] as unknown[],
  }));
  return { useActiveWorkout, prevForSet: () => null };
});
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
  Platform: { OS: 'test' },
}));

import { startWorkoutPresence, workoutJustSaved } from '@/tracker/services/workoutPresence';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';

const bench = {
  key: 'b',
  exerciseId: 'bench',
  name: 'Barbell Bench Press',
  muscleGroup: 'chest',
  equipment: 'barbell',
  previousSets: [],
  sets: [{ key: 's0', weightKg: 72.5, reps: 8, isWarmup: false, done: true, doneAt: 100 }],
};

describe('workoutJustSaved (pure)', () => {
  it('Finish: committing, then closed', () => {
    expect(workoutJustSaved({ active: true, committing: true }, { active: false })).toBe(true);
  });
  it('a discard never set committing', () => {
    expect(workoutJustSaved({ active: true, committing: false }, { active: false })).toBe(false);
  });
  it('a failed Finish keeps the workout open', () => {
    expect(workoutJustSaved({ active: true, committing: true }, { active: true, committing: false })).toBe(false);
  });
  it('saving an edit or a past workout is not a live workout', () => {
    expect(workoutJustSaved({ active: true, committing: true, editingSessionId: 's1' }, { active: false })).toBe(false);
    expect(workoutJustSaved({ active: true, committing: true, pastLog: true }, { active: false })).toBe(false);
  });
  it('nothing open before: nothing saved', () => {
    expect(workoutJustSaved({ active: false, committing: true }, { active: false })).toBe(false);
  });
});

describe('the phone tells the watch', () => {
  let stop: () => void = () => undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    clears.length = 0;
    useRestTimer.setState({ endsAt: null, startedAt: null, source: null });
    useActiveWorkout.setState({ active: true, committing: false, exercises: [bench] } as never);
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('Finish clears the live card as saved', () => {
    stop = startWorkoutPresence();
    useActiveWorkout.setState({ committing: true } as never);
    useActiveWorkout.setState({ active: false, committing: false, exercises: [] } as never);
    expect(clears).toEqual([true]);
  });

  it('a discard clears it as not saved', () => {
    stop = startWorkoutPresence();
    useActiveWorkout.setState({ active: false, committing: false, exercises: [] } as never);
    expect(clears).toEqual([false]);
  });

  it('the next workout after a Finish starts clean (its discard is not "saved")', () => {
    stop = startWorkoutPresence();
    useActiveWorkout.setState({ committing: true } as never);
    useActiveWorkout.setState({ active: false, committing: false, exercises: [] } as never);
    useActiveWorkout.setState({ active: true, exercises: [bench] } as never);
    vi.advanceTimersByTime(1000);
    useActiveWorkout.setState({ active: false, exercises: [] } as never);
    expect(clears).toEqual([true, false]);
  });
});
