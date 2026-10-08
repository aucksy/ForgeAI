/**
 * Calories for Health Connect (v0.27.0). PURE.
 *
 * ForgeAI has no heart rate, so a workout's calories are an ESTIMATE from its length and the
 * member's body weight, by MET values from the Compendium of Physical Activities:
 *  - weight training (multiple exercises, 8–15 reps, rests between sets): 3.5 MET;
 *  - cardio sets (runs, rows, bikes — the time logged on them): about 7 MET.
 * Health Connect's "active calories" are the calories ABOVE resting, so 1 MET (resting) is taken
 * off: 2.5 and 6.0. A 60-minute weight session at 75 kg ≈ 190 kcal. This is the owner's open
 * choice (Phase 5): the rule is one place, here.
 */
export const STRENGTH_ACTIVE_MET = 2.5;
export const CARDIO_ACTIVE_MET = 6.0;
/** Body weight used when the member has never logged one. */
export const DEFAULT_BODY_KG = 70;
/** A workout with no end time (imported without one) counts this long per set. */
export const MINUTES_PER_SET = 2.5;
/** Longer than this is a workout left open by mistake — it is counted as this long. */
export const MAX_MINUTES = 180;

export interface WorkoutForCalories {
  startedAt: number;
  endedAt: number | null;
  /** Working sets in it (for a workout with no end time). */
  sets: number;
  /** Seconds logged on cardio sets (distance, or distance + time). */
  cardioSec: number;
}

/** Minutes the workout lasted (its end time, else MINUTES_PER_SET a set), capped. */
export function workoutMinutes(w: WorkoutForCalories): number {
  const byClock = w.endedAt != null && w.endedAt > w.startedAt ? (w.endedAt - w.startedAt) / 60000 : 0;
  const mins = byClock > 0 ? byClock : w.sets * MINUTES_PER_SET;
  return Math.min(MAX_MINUTES, Math.max(0, mins));
}

/** Estimated active kcal, whole number. */
export function activeKcal(w: WorkoutForCalories, bodyKg: number | null): number {
  const kg = bodyKg != null && bodyKg >= 25 && bodyKg <= 300 ? bodyKg : DEFAULT_BODY_KG;
  const total = workoutMinutes(w);
  const cardio = Math.min(total, Math.max(0, w.cardioSec / 60));
  const strength = total - cardio;
  return Math.round(((STRENGTH_ACTIVE_MET * strength + CARDIO_ACTIVE_MET * cardio) / 60) * kg);
}

/** The end time Health Connect gets: the real one, else start + the estimated length. */
export function endFor(w: WorkoutForCalories): number {
  return w.endedAt != null && w.endedAt > w.startedAt
    ? Math.min(w.endedAt, w.startedAt + MAX_MINUTES * 60000)
    : w.startedAt + Math.max(1, workoutMinutes(w)) * 60000;
}
