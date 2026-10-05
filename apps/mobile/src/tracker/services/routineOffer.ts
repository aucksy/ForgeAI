/**
 * "Update routine?" at the end of a workout started from a routine (Phase 1).
 * Reads the routine, compares it with what was on screen at finish (pure diff in
 * routineDiff), and returns the prompt text — or null when nothing changed, the
 * workout was not from a routine, or the routine has since been deleted.
 */
import type { DraftExercise } from '../store/activeWorkoutStore';
import { getRoutine, syncRoutineToWorkout } from '../db/routineRepo';
import { describeDiff, diffRoutine } from './routineDiff';

export interface RoutineOffer {
  dayId: string;
  name: string;
  text: string;
  items: { exerciseId: string; workingSets: number }[];
}

function setRowsIfEdited(e: DraftExercise): number {
  const rows = e.sets.filter((s) => !s.isWarmup).length;
  if (e.startRows == null) return 0; // draft from an older app version: assume unchanged
  return rows !== e.startRows ? rows : 0;
}

export function workoutItems(exercises: DraftExercise[]): { exerciseId: string; name: string; workingSets: number }[] {
  return exercises.map((e) => ({
    exerciseId: e.exerciseId,
    name: e.name,
    // A set count is only reported when the member ADDED or REMOVED set rows. Rows
    // left blank are skipped sets, not a new plan; 0 means "keep the routine's count".
    workingSets: setRowsIfEdited(e),
  }));
}

export async function routineUpdateOffer(planDayId: string | null, exercises: DraftExercise[]): Promise<RoutineOffer | null> {
  if (!planDayId) return null;
  const day = await getRoutine(planDayId).catch(() => null);
  if (!day) return null;
  const items = workoutItems(exercises);
  const diff = diffRoutine(
    day.exercises.map((pe) => ({ exerciseId: pe.exerciseId, name: pe.exercise.name, targetSets: pe.targetSets })),
    items,
  );
  if (!diff.changed) return null;
  return {
    dayId: day.id,
    name: day.name,
    text: describeDiff(diff),
    items: items.map(({ exerciseId, workingSets }) => ({ exerciseId, workingSets })),
  };
}

export function applyRoutineOffer(offer: RoutineOffer): Promise<void> {
  return syncRoutineToWorkout(offer.dayId, offer.items);
}
