/**
 * Draft → committable rows. PURE (no DB, no store) so both write paths share one
 * definition of "what actually gets logged": `finish()` for a new workout and
 * `saveEdits()` for a corrected one (Phase W4).
 *
 * Extracted verbatim from activeWorkoutStore.finish so an edit can never disagree
 * with the original save about which sets count, where a per-exercise note lands,
 * or whether a warm-up carries RPE.
 *
 * Phase 2: what "logged" means depends on the exercise's type (time, distance, reps
 * only…), and the TYPED weight becomes the stored one here — help on an assisted move is
 * typed as 20 and stored as −20 (see engine/logTypes).
 */
import { isLoggable, storedWeight, type LogType } from '@/tracker/engine/logTypes';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';
import type { RichSet } from '@/tracker/db/trackerSets';

/** The exercise's log type (drafts saved before Phase 2 have none: weight × reps). */
export function draftLogType(ex: Pick<DraftExercise, 'logType'>): LogType {
  return ex.logType ?? 'weight_reps';
}

/** A row worth writing for this exercise's type (weight × reps: a real rep count and a weight, 0 kg = bodyweight). */
export function isCommittable(s: DraftSet, logType: LogType = 'weight_reps'): boolean {
  return isLoggable(logType, s);
}

/**
 * Flatten the draft to the rows that will be written, in order. A per-exercise
 * note rides on that exercise's FIRST committed set (Phase 5c convention).
 *
 * Phase 2 (LW-03): `tickedOnly` writes only ticked rows — Finish leaves rows that hold
 * numbers but were never ticked out unless the member chooses "Save them". An edit of a
 * saved workout loads every row ticked, so it keeps the default.
 */
export function draftToRichSets(exercises: readonly DraftExercise[], opts: { tickedOnly?: boolean } = {}): RichSet[] {
  const flat: RichSet[] = [];
  // LW-28: each card's number among the cards of the same exercise (heavy Bench 0, back-off 1),
  // saved with its sets so the two cards stay two after saving. #10: the number the card was
  // given when it was made — moving back-off above heavy keeps both numbers. A card from an
  // older draft (no number) takes its place among them, as before.
  const seen = new Map<string, number>();
  for (const ex of exercises) {
    const place = seen.get(ex.exerciseId) ?? 0;
    seen.set(ex.exerciseId, place + 1);
    const cardIndex = ex.card ?? place;
    const exNote = ex.note?.trim() ? ex.note.trim() : null;
    const lt = draftLogType(ex);
    const timed = lt === 'time' || lt === 'distance' || lt === 'time_distance';
    let firstOfExercise = true;
    for (const st of ex.sets) {
      if (opts.tickedOnly && !st.done) continue;
      if (!isCommittable(st, lt)) {
        // Editing: a saved row that doesn't fit the type goes back exactly as it was.
        if (st.keep) {
          const kept: RichSet = {
            exerciseId: ex.exerciseId,
            weightKg: st.keep.weightKg,
            reps: st.keep.reps,
            isWarmup: st.isWarmup,
            rpe: st.isWarmup ? null : st.rpe ?? null,
            setType: st.isWarmup ? undefined : st.setType ?? 'normal',
            supersetGroup: ex.supersetGroup ?? null,
            note: firstOfExercise ? exNote : null,
          };
          if (st.keep.durationSec != null) kept.durationSec = st.keep.durationSec;
          if (st.keep.distanceM != null) kept.distanceM = st.keep.distanceM;
          if (st.loadMode != null) kept.loadMode = st.loadMode;
          if (cardIndex > 0) kept.cardIndex = cardIndex;
          flat.push(kept);
          firstOfExercise = false;
        }
        continue;
      }
      const row: RichSet = {
        exerciseId: ex.exerciseId,
        weightKg: storedWeight(lt, st.weightKg),
        reps: timed ? 0 : (st.reps as number),
        isWarmup: st.isWarmup,
        rpe: st.isWarmup ? null : st.rpe ?? null,
        setType: st.isWarmup ? undefined : st.setType ?? 'normal',
        supersetGroup: ex.supersetGroup ?? null,
        note: firstOfExercise ? exNote : null,
      };
      // On the types that use them — and whenever a saved row carries one (a Hevy run with
      // time AND distance on a timed exercise keeps both) — so a plain weight × reps row
      // keeps its exact shape.
      if (lt === 'time' || lt === 'time_distance' || st.durationSec != null) row.durationSec = st.durationSec ?? null;
      if (lt === 'distance' || lt === 'time_distance' || st.distanceM != null) row.distanceM = st.distanceM ?? null;
      if (st.loadMode != null) row.loadMode = st.loadMode;
      if (cardIndex > 0) row.cardIndex = cardIndex;
      flat.push(row);
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
