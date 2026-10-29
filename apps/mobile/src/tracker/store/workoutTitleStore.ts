/**
 * R-198: the open workout's routine name, read once per routine and shared by the workout
 * screen, the minimised bar and the Workout tab (`useLiveWorkoutTitle`). Kept apart from the
 * active workout store (no draft field, nothing saved): it is filled by `workoutTitleSync`
 * and by `updateRoutine` when that routine is renamed while the workout is open.
 */
import { create } from 'zustand';

export interface WorkoutTitleState {
  /** The routine whose name is held; null = none. */
  routineId: string | null;
  /** Its name: a string once read, null when the routine has none (deleted), undefined while reading. */
  name: string | null | undefined;
  /** Start holding `routineId` (its name not read yet). */
  track: (routineId: string | null) => void;
  /** The name read (ignored when another routine is held by then). */
  setName: (routineId: string, name: string | null) => void;
}

export const useWorkoutTitle = create<WorkoutTitleState>((set, get) => ({
  routineId: null,
  name: undefined,
  track: (routineId) => set({ routineId, name: routineId ? undefined : null }),
  setName: (routineId, name) => {
    if (get().routineId !== routineId) return;
    set({ name: name?.trim() ? name.trim() : null });
  },
}));

/** A routine was renamed: the open workout's name follows when it is that routine. */
export function noteRoutineRenamed(routineId: string, name: string): void {
  useWorkoutTitle.getState().setName(routineId, name);
}
