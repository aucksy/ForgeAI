/**
 * Audit Phase 3 (SH-23, RP-03): a Start button that really starts a workout.
 *
 * Home's "Start your first workout" used to open the Workout tab, where the member had to
 * choose again. Now it starts: the routine shown on screen (by its id — never worked out
 * again at the tap, so a screen left open past midnight still starts what its label says),
 * or an empty workout when nothing is shown. A workout already open (or saved before Android
 * closed the app) is resumed, never replaced.
 */
import { useActiveWorkout } from '../store/activeWorkoutStore';
import { ACTIVE_WORKOUT_PATH, openActiveWorkout } from './workoutStart';

type Nav = { push: (path: typeof ACTIVE_WORKOUT_PATH) => void; replace: (path: typeof ACTIVE_WORKOUT_PATH) => void };

export async function startShownWorkout(nav: Nav, routineId: string | null): Promise<void> {
  await useActiveWorkout.getState().hydrate();
  if (!useActiveWorkout.getState().active) {
    if (routineId) await useActiveWorkout.getState().startFromPlanDay(routineId);
    else useActiveWorkout.getState().startEmpty();
  }
  openActiveWorkout(nav);
}
