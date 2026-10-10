/**
 * Audit Phase 6 (PH-07, PH-09): is a workout open right now? The reminders skip today while
 * one is, and the Today widget says "Resume". Set by the presence host from the workout store
 * (a correction of a saved workout, or a past log, is never "open" here). Plain module state:
 * the phone pieces read it without importing the workout store (which imports them).
 */
export interface LiveWorkout {
  /** The name the widget shows ("Push 1"); "Workout" for an empty one. */
  name: string;
}

let live: LiveWorkout | null = null;

export function setLiveWorkout(w: LiveWorkout | null): void {
  live = w;
}

export function liveWorkout(): LiveWorkout | null {
  return live;
}
