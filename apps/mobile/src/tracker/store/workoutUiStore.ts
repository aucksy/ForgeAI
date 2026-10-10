/**
 * Short-lived signals between parts of the workout screen (Phase 1). Not persisted.
 *  - `record`: the "New record" toast — set when a ticked set beats the member's
 *    history, cleared by the toast after a few seconds.
 *  - `scrollTo`: superset hand-off — the exercise the screen should bring into view.
 *  - `rowNote` (Phase 6): a rest card's "Done" could not tick this row — the row says what is
 *    missing ("Add reps first") and puts the cursor there, as a tick on screen would.
 */
import { create } from 'zustand';

import type { TickMissing } from '../services/setTick';

export interface WorkoutUiState {
  record: { id: number; exercise: string; label: string } | null;
  scrollTo: { id: number; exKey: string } | null;
  rowNote: { id: number; exKey: string; setKey: string; missing: TickMissing } | null;
  /** True while the workout screen is mounted — a notification tap must not push a second copy. */
  screenOpen: boolean;
  setScreenOpen: (open: boolean) => void;
  showRecord: (exercise: string, label: string) => void;
  clearRecord: (id: number) => void;
  requestScroll: (exKey: string) => void;
  showRowNote: (exKey: string, setKey: string, missing: TickMissing) => void;
}

let seq = 0;
/**
 * How many workout screens are mounted. Normally 0 or 1; counted (not a flag) so that if a
 * second copy ever mounts, closing one does not mark the screen as gone while the other stays.
 */
let mounted = 0;

export const useWorkoutUi = create<WorkoutUiState>()((set, get) => ({
  record: null,
  scrollTo: null,
  rowNote: null,
  screenOpen: false,
  setScreenOpen: (open) => {
    // The flag may have been set directly (tests): count from what it says.
    if (!get().screenOpen) mounted = 0;
    else if (mounted === 0) mounted = 1;
    mounted = Math.max(0, mounted + (open ? 1 : -1));
    set({ screenOpen: mounted > 0 });
  },
  showRecord: (exercise, label) => set({ record: { id: ++seq, exercise, label } }),
  clearRecord: (id) => {
    if (get().record?.id === id) set({ record: null });
  },
  requestScroll: (exKey) => set({ scrollTo: { id: ++seq, exKey } }),
  showRowNote: (exKey, setKey, missing) => set({ rowNote: { id: ++seq, exKey, setKey, missing } }),
}));
