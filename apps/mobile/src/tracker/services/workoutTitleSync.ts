/**
 * R-198: keeps `useWorkoutTitle` on the open workout's routine. Started once beside the
 * navigator (WorkoutPresenceHost), so the minimised bar and the Workout tab have the name even
 * when the workout screen was never opened in this app run (a workout restored on launch).
 * `refreshWorkoutTitle` reads it again (the workout screen calls it when it comes into view).
 */
import { getRoutine } from '../db/routineRepo';
import { useActiveWorkout, type ActiveWorkoutState } from '../store/activeWorkoutStore';
import { useWorkoutTitle } from '../store/workoutTitleStore';

/** The routine the open workout came from, or null. PURE. */
export function ownRoutineIdOf(s: Pick<ActiveWorkoutState, 'active' | 'planDayId' | 'routineId'>): string | null {
  return s.active ? s.planDayId || s.routineId || null : null;
}

/** Read the held routine's name (again). */
export function refreshWorkoutTitle(): Promise<void> {
  const id = useWorkoutTitle.getState().routineId;
  if (!id) return Promise.resolve();
  return getRoutine(id)
    .then((r) => useWorkoutTitle.getState().setName(id, r?.name ?? null))
    .catch(() => {
      // A failed read: the workout's own / time-of-day name shows instead of an empty line.
      useWorkoutTitle.getState().setName(id, null);
    });
}

let started = false;

export function startWorkoutTitleSync(): () => void {
  if (started) return () => undefined;
  started = true;
  const follow = (s: ActiveWorkoutState): void => {
    const id = ownRoutineIdOf(s);
    if (id === useWorkoutTitle.getState().routineId) return;
    useWorkoutTitle.getState().track(id);
    void refreshWorkoutTitle();
  };
  follow(useActiveWorkout.getState());
  const unsub = useActiveWorkout.subscribe(follow);
  return () => {
    unsub();
    started = false;
  };
}
