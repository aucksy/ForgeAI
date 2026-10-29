/**
 * "Watch opens when a workout starts" (29 Oct 2026, owner's plan). When the member STARTS a workout
 * on the phone, the phone asks the MettleUp watch app to open (native: WearSync.openWatch, which
 * asks Wear OS to open the screen and, if the watch could not, the watch shows a "Workout started"
 * card; one tap opens it). Settings -> Rest timer and sounds -> "Open MettleUp on my watch" turns it
 * off (on by default).
 *
 * Only a start: never when a saved workout is reopened after the app was closed (its start time is
 * old), never for a correction of a saved workout or a workout logged after the fact. The watch
 * itself also acts on each workout once (by its start time).
 */
import { isCorrecting, useActiveWorkout, type ActiveWorkoutState } from '../store/activeWorkoutStore';
import { useRestAlertPrefs } from '../store/restAlertPrefsStore';
import { openWatchApp } from './restCard';

/** A workout whose start time is older than this when it opens is a resume, not a start. */
export const START_WINDOW_MS = 60_000;

type Live = Pick<ActiveWorkoutState, 'active' | 'startedAt' | 'pastLog' | 'editingSessionId'>;

/**
 * Should the watch be asked to open, given the store before and after a change? True only when a
 * live workout (not a correction, not a past log) has just begun and its start time is within
 * [START_WINDOW_MS] of [now]. PURE.
 */
export function shouldOpenWatch(prev: Live, next: Live, now: number, enabled: boolean): boolean {
  if (!enabled) return false;
  const live = (s: Live): boolean => s.active && !isCorrecting(s);
  if (!live(next) || live(prev)) return false;
  const at = next.startedAt;
  if (typeof at !== 'number' || !Number.isFinite(at)) return false;
  return Math.abs(now - at) <= START_WINDOW_MS;
}

/** Watches the workout store; returns the stop function. */
export function startWatchOpen(): () => void {
  return useActiveWorkout.subscribe((s, prev) => {
    if (!shouldOpenWatch(prev, s, Date.now(), useRestAlertPrefs.getState().watchOpen)) return;
    if (s.startedAt != null) openWatchApp(s.startedAt);
  });
}
