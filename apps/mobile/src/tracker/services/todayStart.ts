/**
 * Audit Phase 3 (SH-23, RP-03): a Start button that really starts a workout.
 *
 * Home's "Start your first workout" used to open the Workout tab, where the member had to
 * choose again. Now it starts: the routine shown on screen (by its id — never worked out
 * again at the tap, so a screen left open past midnight still starts what its label says),
 * or an empty workout when nothing is shown. A live workout already open (or saved before
 * Android closed the app) is resumed, never replaced.
 *
 * Audit Phase 7 review: an EDIT of a past workout (or a past workout being logged) is not a
 * workout in progress — Home's card says "Next: Pull 1 · Start" over it. Start used to open
 * that editor without a word. Now it asks, exactly like every other Start button
 * (`askAboutOpenWorkout`): "Resume editing" or "Discard changes and start new". Home and the
 * Today page share this, so the two never disagree.
 */
import { useActiveWorkout } from '../store/activeWorkoutStore';
import { ACTIVE_WORKOUT_PATH, askAboutOpenWorkout, openActiveWorkout } from './workoutStart';

type Nav = { push: (path: typeof ACTIVE_WORKOUT_PATH) => void; replace: (path: typeof ACTIVE_WORKOUT_PATH) => void };

/**
 * What a Start on Home or the Today page does with the workout already in the store. PURE.
 *  - 'start': nothing open — start the shown routine (or an empty workout);
 *  - 'resume': a live workout is open — open it (the page already says "Continue" / "Resume");
 *  - 'ask': an edit of a past workout, or a past workout being logged — ask first.
 * 'resume' is exactly when Home's `openWorkout` counts the workout as open.
 */
export type StartMode = 'start' | 'resume' | 'ask';

export function startMode(w: { active: boolean; editingSessionId: string | null; pastLog: boolean }): StartMode {
  if (!w.active) return 'start';
  return w.editingSessionId == null && !w.pastLog ? 'resume' : 'ask';
}

/**
 * Start the routine shown (`routineId`), or an empty workout when null — after asking about an
 * edit left open. `show` opens the workout screen (default: push it once).
 */
export async function startShownWorkout(
  nav: Nav,
  routineId: string | null,
  show: () => void = () => void openActiveWorkout(nav),
): Promise<void> {
  // A workout saved before Android closed the app loads first — Start must not replace it.
  await useActiveWorkout.getState().hydrate();
  const mode = startMode(useActiveWorkout.getState());
  // "Resume editing" (or Back / a tap outside) opens the edit; "Discard changes…" starts new.
  const fresh = mode === 'start' || (mode === 'ask' && (await askAboutOpenWorkout()) === 'replaced');
  if (fresh) {
    if (routineId) await useActiveWorkout.getState().startFromPlanDay(routineId);
    else useActiveWorkout.getState().startEmpty();
  }
  show();
}
