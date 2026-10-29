/**
 * R-198: the open workout's name for a screen (`liveWorkoutTitle`), re-rendering when the
 * routine's name arrives or the routine is renamed.
 */
import { useActiveWorkout } from '../store/activeWorkoutStore';
import { useWorkoutTitle } from '../store/workoutTitleStore';
import { liveWorkoutTitle } from './workoutTitle';

export function useLiveWorkoutTitle(): string | null {
  const routineId = useActiveWorkout((s) => s.planDayId || s.routineId || null);
  const workoutName = useActiveWorkout((s) => s.workoutName);
  const startedAt = useActiveWorkout((s) => s.startedAt);
  const routineName = useWorkoutTitle((s) => (routineId && s.routineId === routineId ? s.name : undefined));
  return liveWorkoutTitle({ routineId, routineName, workoutName, startedAt });
}
