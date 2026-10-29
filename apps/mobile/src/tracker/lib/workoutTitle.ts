/**
 * R-198 (owner, 30 Oct 2026): the open workout's name, shown under WORKOUT DURATION on the
 * workout screen, on the bar that brings a minimised workout back, and in the Workout tab's
 * "Workout in progress" card. PURE.
 *
 * The same name Finish saves by default (`defaultWorkoutName`): the routine's own name (it
 * follows a rename of the routine while the workout is open), else the workout's own name (a
 * Repeat keeps its source's), else the time-of-day name ("Evening workout"). Never blank.
 * While a routine's name is still being read (`routineName` undefined, a few milliseconds) the
 * workout's own name shows if it has one, else null: the caller keeps its line empty rather than
 * flash "Evening workout" before "Pull 2".
 */
import { defaultWorkoutName } from '../services/finishCheck';

export interface WorkoutTitleInput {
  /** The routine this workout came from (`planDayId || routineId`); null/'' = none. */
  routineId: string | null | undefined;
  /** That routine's name: a string once read, null when it has none (deleted), undefined while reading. */
  routineName: string | null | undefined;
  /** The workout's own name (a Repeat: its source's). */
  workoutName: string | null | undefined;
  startedAt: number | null | undefined;
}

/** One line: runs of spaces and line breaks become one space. */
function oneLine(s: string | null | undefined): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
}

/** The open workout's name (one line, never blank), or null only while its routine's name loads. PURE. */
export function liveWorkoutTitle(i: WorkoutTitleInput): string | null {
  const routine = oneLine(i.routineName);
  const own = oneLine(i.workoutName);
  if (i.routineId && i.routineName === undefined) return own;
  return defaultWorkoutName(routine ?? own, i.startedAt ?? Date.now());
}
