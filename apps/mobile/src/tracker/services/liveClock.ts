/**
 * R-55 (22 Oct 2026, owner backlog "Workout time on the notification card"): the live workout
 * card shows how long the workout has run, in its header ("ForgeAI · Workout · 42:15";
 * WorkoutCard.kt). PURE.
 *
 * Running: `{ base }`, the moment the clock would have read 0:00 with paused time left out. It
 * stays the same second after second, so the card is not re-posted to tick: Android's own
 * chronometer counts up from it, with the app closed too. Paused: `{ paused }`, the time trained
 * so far, standing still (the card's text already starts "Paused · "). The same numbers as the
 * in-app WORKOUT DURATION (workoutPause.activeMs).
 */
import { activeMs, type PauseState } from './workoutPause';

export type LiveClock = { base: number } | { paused: number };

export function liveClock(startedAt: number | null | undefined, pause: PauseState, now: number): LiveClock | null {
  if (startedAt == null || !Number.isFinite(startedAt) || !Number.isFinite(now)) return null;
  const ms = activeMs(startedAt, pause, now);
  return pause.pausedAt != null ? { paused: ms } : { base: now - ms };
}
