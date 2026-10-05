/**
 * Short-lived signals between parts of the workout screen (Phase 1). Not persisted.
 *  - `record`: the "New record" toast — set when a ticked set beats the member's
 *    history, cleared by the toast after a few seconds.
 *  - `scrollTo`: superset hand-off — the exercise the screen should bring into view.
 */
import { create } from 'zustand';

export interface WorkoutUiState {
  record: { id: number; exercise: string; label: string } | null;
  scrollTo: { id: number; exKey: string } | null;
  /** True while the workout screen is mounted — a notification tap must not push a second copy. */
  screenOpen: boolean;
  setScreenOpen: (open: boolean) => void;
  showRecord: (exercise: string, label: string) => void;
  clearRecord: (id: number) => void;
  requestScroll: (exKey: string) => void;
}

let seq = 0;

export const useWorkoutUi = create<WorkoutUiState>()((set, get) => ({
  record: null,
  scrollTo: null,
  screenOpen: false,
  setScreenOpen: (screenOpen) => set({ screenOpen }),
  showRecord: (exercise, label) => set({ record: { id: ++seq, exercise, label } }),
  clearRecord: (id) => {
    if (get().record?.id === id) set({ record: null });
  },
  requestScroll: (exKey) => set({ scrollTo: { id: ++seq, exKey } }),
}));
