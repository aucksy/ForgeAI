/**
 * "Update routine?" at the end of a workout started from a routine (Phase 1).
 * Reads the routine, compares it with what was on screen at finish (pure diff in
 * routineDiff), and returns the prompt text — or null when nothing changed, the
 * workout was not from a routine, or the routine has since been deleted.
 */
import type { DraftExercise } from '../store/activeWorkoutStore';
import { getRoutine, syncRoutineToWorkout, type RoutineSyncItem } from '../db/routineRepo';
import type { PlanSetType } from '../plans/routineSets';
import { describeDiff, diffRoutine } from './routineDiff';

export interface RoutineOffer {
  dayId: string;
  name: string;
  text: string;
  items: RoutineSyncItem[];
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

/** A row's type as a routine keeps it. */
function rowType(s: DraftExercise['sets'][number]): PlanSetType {
  if (s.isWarmup) return 'warmup';
  return s.setType === 'drop' ? 'drop' : s.setType === 'failure' ? 'failure' : 'normal';
}

const sameTypes = (a: readonly PlanSetType[], b: readonly PlanSetType[]): boolean => a.length === b.length && a.every((t, i) => t === b[i]);

/** One finished card as the routine sees it (see `workoutItems`). */
export type WorkoutItem = RoutineSyncItem & {
  name: string;
  typesChanged: boolean;
  restChanged: boolean;
  noteChanged: boolean;
};

export function workoutItems(exercises: DraftExercise[]): WorkoutItem[] {
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
  const continuationTypes = (key: string, seen: Set<string> = new Set()): PlanSetType[] => {
    if (seen.has(key)) return [];
    seen.add(key);
    return exercises.filter((c) => c.splitFrom === key).flatMap((c) => [...c.sets.map(rowType), ...continuationTypes(c.key, seen)]);
  };
  return exercises.filter((e) => !continues(e)).map((e) => {
    const types = [...e.sets.map(rowType), ...continuationTypes(e.key)];
    const fromRoutine = e.startTypes != null;
    // RP-19: types, rest and note are only "changed" against what the card STARTED with — a card
    // opened with last time's drop sets did not change the plan. A card the routine did not have
    // (added) brings its types as done (RP-20: its real row count).
    const typesChanged = fromRoutine && !sameTypes(types, e.startTypes ?? []);
    const restChanged = e.startRestSec !== undefined && (e.restSec ?? null) !== e.startRestSec;
    const note = e.note?.trim() ? e.note.trim() : null;
    const noteChanged = e.startNote !== undefined && note !== (e.startNote?.trim() ? e.startNote.trim() : null);
    return {
      // LW-09: a swap is "for this workout only. Your routine stays." — compare (and, on a yes
      // to a real change, keep) the routine's own exercise, never the stand-in.
      exerciseId: e.swappedFrom?.exerciseId ?? e.exerciseId,
      name: e.swappedFrom?.name ?? e.name,
      // A set count is only reported when the member ADDED or REMOVED set rows. Rows
      // left blank are skipped sets, not a new plan; 0 means "keep the routine's count".
      workingSets: setRowsIfEdited(e, continuationRows(e.key)),
      rows: routineRows(e) + continuationRows(e.key),
      // The rows' types: written for an exercise the routine did not have, and for a routine
      // exercise only when they changed (`typesChanged`). A swapped card (LW-09) brings none.
      ...(e.swappedFrom ? {} : { types }),
      ...(restChanged ? { restSec: e.restSec ?? null } : {}),
      ...(noteChanged ? { note } : {}),
      supersetGroup: e.supersetGroup ?? null,
      typesChanged,
      restChanged,
      noteChanged,
    };
  });
}

export async function routineUpdateOffer(planDayId: string | null, exercises: DraftExercise[]): Promise<RoutineOffer | null> {
  if (!planDayId) return null;
  const day = await getRoutine(planDayId).catch(() => null);
  if (!day) return null;
  const items = workoutItems(exercises);
  const diff = diffRoutine(
    day.exercises.map((pe) => ({ exerciseId: pe.exerciseId, name: pe.exercise.name, targetSets: pe.targetSets, supersetGroup: pe.supersetGroup ?? null })),
    items,
  );
  if (!diff.changed) return null;
  return {
    dayId: day.id,
    name: day.name,
    text: describeDiff(diff),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    items: items.map(({ name: _n, restChanged: _r, noteChanged: _o, ...item }) => item),
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
