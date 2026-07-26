/**
 * Save corrections to an already-logged workout — Phase W4.
 *
 * A session's sets are REPLACED wholesale (the draft the user just edited is the
 * truth) rather than diffed: set ids are internal, `addSets` renumbers per
 * (session, exercise) anyway, and a diff would have to reproduce that numbering by
 * hand. Replacing reuses the frozen write path exactly as a fresh save does.
 *
 * PERSONAL RECORDS are the subtle part. `personal_records` is an EVENT log: a row
 * exists only where a lift first beat everything before it. So an edit has to undo
 * and redo that judgement in both directions:
 *   1. drop this session's PR rows — otherwise correcting 100 kg down to 90 kg
 *      leaves a row still claiming 100;
 *   2. re-run the frozen `checkAndRecordPrs` (via addSets) against history strictly
 *      before the session's — which is why the session row is updated FIRST, so a
 *      changed date is already in effect when the comparison runs;
 *   3. reconcile every exercise the edit touched (added OR removed), because a
 *      lowered set can promote a later, smaller lift that never earned its own row
 *      — the same hole `deleteSessionAndReconcile` fixes after a delete.
 *
 * No frozen file is edited: `addSetsWithMeta` → frozen `addSets` keeps set
 * numbering and PR detection, and `reconcilePrsForExercises` is reused as-is.
 */
import { getDb } from '@/db';
import { addSetsWithMeta } from '@/tracker/db/trackerSets';
import type { RichSet } from '@/tracker/db/trackerSets';
import { reconcilePrsForExercises } from '@/tracker/services/prRebuild';
import type { DayType } from '@/types/models';

export interface SessionEdits {
  dateISO: string;
  dayType: DayType;
  notes: string | null;
  /** Epoch ms. Moved with the date so the session sorts on the day it now claims. */
  startedAt: number;
  endedAt: number | null;
  /** The complete new set list, in display order. */
  sets: RichSet[];
}

export class SessionGoneError extends Error {
  constructor() {
    super('That workout no longer exists.');
    this.name = 'SessionGoneError';
  }
}

/** Exercise ids affected by the edit: everything it removed plus everything it now has. */
async function affectedExerciseIds(sessionId: string, next: RichSet[]): Promise<string[]> {
  const before = await getDb().getAllAsync<{ exercise_id: string }>(
    'SELECT DISTINCT exercise_id FROM set_entries WHERE session_id = ? AND is_warmup = 0',
    [sessionId],
  );
  const ids = new Set(before.map((r) => r.exercise_id));
  for (const s of next) if (!s.isWarmup) ids.add(s.exerciseId);
  return [...ids];
}

export interface SaveResult {
  /**
   * False when the edit COMMITTED but the record reconciliation that follows it
   * failed. The workout is saved either way; only the PR list may lag, so the
   * caller must not report this as "nothing was saved".
   */
  reconciled: boolean;
}

/**
 * Apply the edit. Throws `SessionGoneError` if the session was deleted meanwhile
 * (e.g. from another screen while a draft sat open), rather than resurrecting it.
 */
export async function saveSessionEdits(
  sessionId: string,
  edits: SessionEdits,
): Promise<SaveResult> {
  const db = getDb();
  const exists = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM workout_sessions WHERE id = ?',
    [sessionId],
  );
  if (!exists) throw new SessionGoneError();

  const affected = await affectedExerciseIds(sessionId, edits.sets);

  // ONE transaction on the SHARED connection (non-exclusive, like hevyImport and
  // finish()) so the frozen repos join it: a failure rolls the whole edit back
  // rather than leaving a session stripped of its sets.
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE workout_sessions
         SET date_iso = ?, day_type = ?, notes = ?, started_at = ?, ended_at = ?
       WHERE id = ?`,
      [edits.dateISO, edits.dayType, edits.notes, edits.startedAt, edits.endedAt, sessionId],
    );
    await db.runAsync('DELETE FROM personal_records WHERE session_id = ?', [sessionId]);
    await db.runAsync('DELETE FROM set_entries WHERE session_id = ?', [sessionId]);
    // Frozen path: auto set_number per (session, exercise) + PR detection, then the
    // additive rpe/set_type/note/superset columns.
    await addSetsWithMeta(sessionId, edits.sets);
  });

  // Outside the transaction: reconciliation re-runs checkAndRecordPrs on OTHER
  // sessions. It is idempotent, so a failure is recoverable — and it must NOT
  // propagate, because the edit itself has already committed and the caller would
  // otherwise tell the member their workout wasn't saved.
  try {
    await reconcilePrsForExercises(affected);
  } catch {
    return { reconciled: false };
  }
  return { reconciled: true };
}
