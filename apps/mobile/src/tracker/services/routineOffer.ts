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

/**
 * Rows that are routine sets: not warm-ups, and (#3) not drop sets — a drop set hangs off the
 * set before it; the routine counts sets. `startRows` counts the same way.
 */
function routineRows(e: DraftExercise): number {
  return e.sets.filter((s) => !s.isWarmup && s.setType !== 'drop').length;
}

function setRowsIfEdited(e: DraftExercise, extraRows = 0): number {
  const rows = routineRows(e) + extraRows;
  if (e.startRows == null) return 0; // draft from an older app version: assume unchanged
  return rows !== e.startRows ? rows : 0;
}

export function workoutItems(exercises: DraftExercise[]): { exerciseId: string; name: string; workingSets: number }[] {
  // LW-31: a swap mid-exercise leaves the ticked sets on the old card and puts the open rows on
  // a card that continues it (`splitFrom`). The two (and any further continuations) are ONE
  // routine exercise: the continuation is not "added", and its rows count toward the original.
  const keys = new Set(exercises.map((e) => e.key));
  const continues = (e: DraftExercise): boolean => e.splitFrom != null && keys.has(e.splitFrom);
  const continuationRows = (key: string, seen: Set<string> = new Set()): number => {
    if (seen.has(key)) return 0;
    seen.add(key);
    return exercises
      .filter((c) => c.splitFrom === key)
      .reduce((n, c) => n + routineRows(c) + continuationRows(c.key, seen), 0);
  };
  return exercises.filter((e) => !continues(e)).map((e) => ({
    // LW-09: a swap is "for this workout only. Your routine stays." — compare (and, on a yes
    // to a real change, keep) the routine's own exercise, never the stand-in.
    exerciseId: e.swappedFrom?.exerciseId ?? e.exerciseId,
    name: e.swappedFrom?.name ?? e.name,
    // A set count is only reported when the member ADDED or REMOVED set rows. Rows
    // left blank are skipped sets, not a new plan; 0 means "keep the routine's count".
    workingSets: setRowsIfEdited(e, continuationRows(e.key)),
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

// LW-11: Finish goes straight to the summary; the summary asks "Update routine?". The offer is
// worked out while the workout is still on screen and handed over here, by the saved workout's id.
const pending = new Map<string, RoutineOffer>();

/** Hand an offer to the summary of workout `sessionId`. */
export function holdRoutineOffer(sessionId: string, offer: RoutineOffer): void {
  pending.set(sessionId, offer);
}

/** The offer for `sessionId`, once — a second read (a re-render, coming back) gets null. */
export function takeRoutineOffer(sessionId: string): RoutineOffer | null {
  const offer = pending.get(sessionId) ?? null;
  pending.delete(sessionId);
  return offer;
}
