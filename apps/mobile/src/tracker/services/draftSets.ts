/**
 * Draft → committable rows. PURE (no DB, no store) so both write paths share one
 * definition of "what actually gets logged": `finish()` for a new workout and
 * `saveEdits()` for a corrected one (Phase W4).
 *
 * Extracted verbatim from activeWorkoutStore.finish so an edit can never disagree
 * with the original save about which sets count, where a per-exercise note lands,
 * or whether a warm-up carries RPE.
 */
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';
import type { RichSet } from '@/tracker/db/trackerSets';

/** A row worth writing: a real rep count and a weight (0 kg = bodyweight). */
export function isCommittable(s: DraftSet): boolean {
  return s.reps != null && s.reps > 0 && s.weightKg != null && s.weightKg >= 0;
}

/**
 * Flatten the draft to the rows that will be written, in order. A per-exercise
 * note rides on that exercise's FIRST committed set (Phase 5c convention).
 */
export function draftToRichSets(exercises: DraftExercise[]): RichSet[] {
  const flat: RichSet[] = [];
  for (const ex of exercises) {
    const exNote = ex.note?.trim() ? ex.note.trim() : null;
    let firstOfExercise = true;
    for (const st of ex.sets) {
      if (!isCommittable(st)) continue;
      flat.push({
        exerciseId: ex.exerciseId,
        weightKg: st.weightKg as number,
        reps: st.reps as number,
        isWarmup: st.isWarmup,
        rpe: st.isWarmup ? null : st.rpe ?? null,
        setType: st.isWarmup ? undefined : st.setType ?? 'normal',
        supersetGroup: ex.supersetGroup ?? null,
        note: firstOfExercise ? exNote : null,
      });
      firstOfExercise = false;
    }
  }
  return flat;
}

/**
 * A session must contain at least one WORKING set. A warm-up-only session is
 * invisible to history and to the PREVIOUS column (both exclude warm-ups), so it
 * would look like a workout that silently vanished.
 */
export function hasWorkingSet(rows: RichSet[]): boolean {
  return rows.some((r) => !r.isWarmup);
}
