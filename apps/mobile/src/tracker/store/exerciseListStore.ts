/**
 * Audit Phase 4 (EX-03): every exercise list re-reads when the member's exercises change.
 *
 * The library and the pickers read the exercises once and keep the search and filters while
 * they are open. Anything that creates, renames, edits, merges, hides or gives an exercise a
 * photo calls `exercisesChanged()`; the lists watch `version` and read again in place (the
 * typed search and the chips stay), so a just-made exercise is there when the member goes back.
 */
import { create } from 'zustand';

interface ExerciseListState {
  version: number;
  bump: () => void;
}

export const useExerciseList = create<ExerciseListState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

/** Call after any change to the member's exercises. */
export function exercisesChanged(): void {
  useExerciseList.getState().bump();
}
