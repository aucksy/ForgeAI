/**
 * Progress → "Any exercise" (audit Phase 5, PG-09): the exercise picked on the shared exercise
 * list, handed back to Progress's "Your lifts". Not persisted — Progress opens on the member's
 * most-trained lift again after a restart.
 */
import { create } from 'zustand';

export interface ProgressPickState {
  /** The exercise picked last (null: none yet). */
  picked: string | null;
  /** Bumps on every pick, so picking the same exercise again still brings it back. */
  seq: number;
  pick: (exerciseId: string) => void;
}

export const useProgressPick = create<ProgressPickState>()((set) => ({
  picked: null,
  seq: 0,
  pick: (exerciseId) => set((s) => ({ picked: exerciseId, seq: s.seq + 1 })),
}));
