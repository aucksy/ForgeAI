/**
 * Phase 2, packet E — starting a workout.
 *
 * LW-24: starting a second workout while one is open is never a dead end. The member is asked
 *   "Resume workout" or "Discard and start new" (the app's own ConfirmSheet). Back or a tap
 *   outside means Resume — the safe answer never throws work away.
 * RP-25: a double tap never opens two workout screens. Every path that opens the workout
 *   screen goes through `openActiveWorkout`, which does nothing while the screen is already
 *   open, or within a moment of the last open (the screen mounts a few frames later).
 */
import { askConfirm } from '@/components/ui/confirmStore';

import { useActiveWorkout } from '../store/activeWorkoutStore';
import { useWorkoutUi } from '../store/workoutUiStore';

const OPEN_GUARD_MS = 1000;
let lastOpen = Number.NEGATIVE_INFINITY;

export const ACTIVE_WORKOUT_PATH = '/session/active';

/** Open the workout screen once. Returns false when a second tap was ignored. */
export function openActiveWorkout(
  nav: { push: (path: typeof ACTIVE_WORKOUT_PATH) => void; replace: (path: typeof ACTIVE_WORKOUT_PATH) => void },
  how: 'push' | 'replace' = 'push',
  now: number = Date.now(),
): boolean {
  if (useWorkoutUi.getState().screenOpen) return false;
  if (now - lastOpen < OPEN_GUARD_MS) return false;
  lastOpen = now;
  if (how === 'replace') nav.replace(ACTIVE_WORKOUT_PATH);
  else nav.push(ACTIVE_WORKOUT_PATH);
  return true;
}

/**
 * Show the workout after a start or a Resume from another screen (a routine, a past workout).
 * Review fix: that screen may sit ON TOP of the open workout screen (workout → exercise page →
 * past workout → Repeat → Resume). Replacing it then stacked a second workout screen over the
 * first, and when one ended, the other raced it back to the Workout tab. So: when the workout
 * screen is already open underneath, go BACK to it (`dismissTo` pops everything above it, or
 * replaces when it is not in this stack); otherwise replace this screen with it, as before.
 */
export function showActiveWorkout(nav: {
  replace: (path: typeof ACTIVE_WORKOUT_PATH) => void;
  dismissTo: (path: typeof ACTIVE_WORKOUT_PATH) => void;
}): 'back' | 'opened' {
  if (useWorkoutUi.getState().screenOpen) {
    nav.dismissTo(ACTIVE_WORKOUT_PATH);
    return 'back';
  }
  lastOpen = Date.now();
  nav.replace(ACTIVE_WORKOUT_PATH);
  return 'opened';
}

/**
 * The workout screen with no workout (finished / discarded elsewhere, or deep-linked with no
 * draft) goes to the Workout tab — but only while it is the screen in front. Underneath another
 * screen (a "Discard and start new" in progress, a copy below a newer one) it must not navigate:
 * that would pull the member away from the screen they are on. PURE.
 */
export function bounceEmptyWorkout(p: { active: boolean; leaving: boolean; focused: boolean }): boolean {
  return !p.active && !p.leaving && p.focused;
}

export function resetOpenGuardForTests(): void {
  lastOpen = Number.NEGATIVE_INFINITY;
}

/**
 * Before starting a workout: is one already open? Loads a saved one first (it only loads on
 * the Workout tab), then asks. 'none' = nothing open, start; 'resume' = open the one in
 * progress; 'replaced' = it was discarded, start the new one.
 */
export async function askAboutOpenWorkout(opts: { startLabel?: string } = {}): Promise<'none' | 'resume' | 'replaced'> {
  const store = useActiveWorkout.getState();
  await store.hydrate();
  const s = useActiveWorkout.getState();
  if (!s.active) return 'none';
  const editing = s.editingSessionId != null || s.pastLog;
  const ticked = s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done && !x.isWarmup).length, 0);
  const discard = await askConfirm(
    editing
      ? {
          title: 'You are editing a saved workout',
          body: 'Resume editing, or discard your changes (the saved workout stays as it was) and go on.',
          confirmLabel: opts.startLabel ?? 'Discard changes and start new',
          cancelLabel: 'Resume editing',
          destructive: true,
        }
      : {
          title: 'A workout is already open',
          body:
            ticked > 0
              ? `Resume it, or discard it and start this one. Discarding deletes its ${ticked} ${ticked === 1 ? 'set' : 'sets'}.`
              : 'Resume it, or discard it and start this one.',
          confirmLabel: opts.startLabel ?? 'Discard and start new',
          cancelLabel: 'Resume workout',
          destructive: true,
        },
  );
  if (!discard) return 'resume';
  await useActiveWorkout.getState().discard();
  return 'replaced';
}
