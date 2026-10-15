/**
 * The open workout on an exercise's History tab (15 Oct 2026, owner in the gym: "if I want to
 * compare from the history section my current workout and the last, we do need to show what is
 * ongoing, the current workout as well, and highlight it as a current workout"). PURE.
 *
 * The History tab reads SAVED workouts only, so the one in progress was missing. This turns the
 * open workout's sets of this exercise into the History card's shape: the TICKED working sets,
 * in order, across every card of the exercise (a heavy card and a back-off card both count) —
 * warm-ups left out, as History leaves them out. Null when no workout is open or this exercise is
 * not in it; an empty list when it is in it but nothing is ticked yet (the card still shows, so
 * the member sees where today's sets will land).
 */
import type { TrackedSetEntry } from '../db/exerciseHistory';
import type { DraftExercise } from '../store/activeWorkoutStore';

export const CURRENT_SESSION_ID = 'current-workout';

export function currentWorkoutSets(
  active: boolean,
  exercises: readonly DraftExercise[],
  exerciseId: string | null | undefined,
): TrackedSetEntry[] | null {
  if (!active || !exerciseId) return null;
  const cards = exercises.filter((e) => e.exerciseId === exerciseId);
  if (cards.length === 0) return null;
  const out: TrackedSetEntry[] = [];
  cards.forEach((card, cardIndex) => {
    for (const s of card.sets) {
      if (!s.done || s.isWarmup) continue;
      out.push({
        id: `${card.key}:${s.key}`,
        sessionId: CURRENT_SESSION_ID,
        exerciseId,
        setNumber: out.length + 1,
        weightKg: s.weightKg ?? 0,
        reps: s.reps ?? 0,
        isWarmup: false,
        durationSec: s.durationSec ?? null,
        distanceM: s.distanceM ?? null,
        ...(s.setType === 'drop' || s.setType === 'failure' ? { setType: s.setType } : {}),
        ...(cardIndex > 0 ? { cardIndex } : {}),
        ...(s.rpe != null ? { rpe: s.rpe } : {}),
      });
    }
  });
  return out;
}
