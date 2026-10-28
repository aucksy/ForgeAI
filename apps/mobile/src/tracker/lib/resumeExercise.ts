/**
 * R-145 (owner, 27 Oct 2026): leaving the active workout and coming back ("Resume workout", the
 * workout bar, the notification) opens on the exercise in progress, not the top of the list.
 * That is the first exercise with a set not ticked yet. PURE.
 */
export interface ResumeExercise {
  key: string;
  sets: readonly { done: boolean }[];
}

/**
 * The exercise to bring into view on coming back, or null to stay at the top: when the first
 * exercise is the one in progress (a fresh start), or every set is ticked. PURE.
 */
export function resumeExerciseKey(exercises: readonly ResumeExercise[]): string | null {
  const i = exercises.findIndex((e) => e.sets.some((s) => !s.done));
  return i > 0 ? exercises[i].key : null;
}
