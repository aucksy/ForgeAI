/**
 * The words of "Show my workouts to the desk" (WorkoutCodeSheet.tsx). PURE, tested.
 * Member words: never "volume", "PR" or "session".
 */
import { COUNTED_MIN_MINUTES, COUNTED_MIN_SETS } from './workoutCode';

export const WORKOUT_CODE_WORDS = {
  button: 'Show my workouts to the desk',
  title: 'My workouts for the desk',
  how: "For your gym's workout offer. The desk types this code in and checks the days against the gym's check-ins. Nothing is sent from your phone.",
  rule: `A workout counts when you logged it here, it ran ${COUNTED_MIN_MINUTES} minutes or more, and it has ${COUNTED_MIN_SETS} or more sets (warm-ups don't count). One a day.`,
  failed: "Couldn't read your workouts. Close this and try again.",
} as const;

/** "9 workouts in the last 30 days count." PURE. */
export function workoutCodeCount(n: number): string {
  if (n === 0) return 'No workout in the last 30 days counts yet.';
  return `${n} ${n === 1 ? 'workout' : 'workouts'} in the last 30 days ${n === 1 ? 'counts' : 'count'}.`;
}
