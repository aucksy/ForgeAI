/**
 * PR reconciliation after a session delete.
 *
 * Personal records are an EVENT log: `personal_records` gets a row only when a
 * lift FIRST beats the prior best (frozen `checkAndRecordPrs`), and the frozen
 * `deleteSession` drops the rows tied to the deleted session. That can leave the
 * PR list understating reality: a lower — but still record-worthy — set that was
 * logged AFTER a higher (now-deleted) PR never earned its own row, so once the
 * higher session is gone, `getAllPrs` (a MAX over surviving rows) reports a value
 * below the true best still present in `set_entries`.
 *
 * Fix, without touching the frozen repos: for each affected exercise, find the
 * session that holds the best SURVIVING working set (by weight, and by e1RM) and
 * re-run the frozen, idempotent `checkAndRecordPrs` on it. That session's top now
 * leads all history before it, so a correct PR row is (re)recorded — and because
 * `checkAndRecordPrs` upserts per (session, exercise, kind), a re-run is a no-op
 * when the list is already correct. Bounded: ≤2 sessions re-checked per exercise.
 */
import { getDb } from '@/db';
import { checkAndRecordPrs } from '@/db/repos/prRepo';
import { deleteSession } from '@/db/repos/workoutRepo';

/** Re-record leading PRs for these exercises from their surviving working sets. */
export async function reconcilePrsForExercises(exerciseIds: string[]): Promise<void> {
  const db = getDb();
  const sessionIds = new Set<string>();
  const seen = new Set<string>();
  for (const exerciseId of exerciseIds) {
    if (seen.has(exerciseId)) continue;
    seen.add(exerciseId);
    // Session holding the heaviest surviving working set. Tie-break on the
    // EARLIEST session (started_at ASC): checkAndRecordPrs only records on a
    // STRICT beat of prior history, so the earliest holder of the max value is
    // the one whose prior sits strictly below it — a later tied holder would
    // see an equal prior and record nothing, leaving the PR uncorrected.
    const byWeight = await db.getFirstAsync<{ session_id: string }>(
      `SELECT se.session_id AS session_id
       FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE se.exercise_id = ? AND se.is_warmup = 0
       ORDER BY se.weight_kg DESC, ws.started_at ASC LIMIT 1`,
      [exerciseId],
    );
    // …and the earliest holder of the best surviving e1RM (may be a different session).
    const byE1rm = await db.getFirstAsync<{ session_id: string }>(
      `SELECT se.session_id AS session_id
       FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE se.exercise_id = ? AND se.is_warmup = 0
       ORDER BY (se.weight_kg * (1 + se.reps / 30.0)) DESC, ws.started_at ASC LIMIT 1`,
      [exerciseId],
    );
    if (byWeight) sessionIds.add(byWeight.session_id);
    if (byE1rm) sessionIds.add(byE1rm.session_id);
  }
  for (const sessionId of sessionIds) {
    await checkAndRecordPrs(sessionId);
  }
}

/** Delete a session, then reconcile PR rows for the exercises it contained. */
export async function deleteSessionAndReconcile(sessionId: string): Promise<void> {
  const db = getDb();
  const rows = await db.getAllAsync<{ exercise_id: string }>(
    'SELECT DISTINCT exercise_id FROM set_entries WHERE session_id = ? AND is_warmup = 0',
    [sessionId],
  );
  const exerciseIds = rows.map((r) => r.exercise_id);
  await deleteSession(sessionId);
  await reconcilePrsForExercises(exerciseIds);
}
