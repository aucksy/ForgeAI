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
import { getDb, getMeta, setMeta } from '@/db';
import { E1RM_SQL, checkAndRecordPrs } from '@/db/repos/prRepo';
import { deleteSession } from '@/db/queuedWrites';
import { enqueueWrite } from '@/db/writeQueue';
import { phoneAfterDelete } from '@/tracker/phone/phoneSync';

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
       WHERE se.exercise_id = ? AND se.is_warmup = 0 AND COALESCE(ws.easy_week, 0) = 0
       ORDER BY se.weight_kg DESC, ws.started_at ASC LIMIT 1`,
      [exerciseId],
    );
    // …and the earliest holder of the best surviving e1RM (may be a different session).
    const byE1rm = await db.getFirstAsync<{ session_id: string }>(
      `SELECT se.session_id AS session_id
       FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE se.exercise_id = ? AND se.is_warmup = 0 AND COALESCE(ws.easy_week, 0) = 0
       ORDER BY (${E1RM_SQL}) DESC, ws.started_at ASC LIMIT 1`,
      [exerciseId],
    );
    if (byWeight) sessionIds.add(byWeight.session_id);
    if (byE1rm) sessionIds.add(byE1rm.session_id);
  }
  for (const sessionId of sessionIds) {
    await checkAndRecordPrs(sessionId);
  }
}

const SINGLE_FIX_KEY = 'pr_single_e1rm_fix';

/**
 * Once per install (Phase 3 review): an older version stored a single's 1-rep max with the
 * formula (100 kg × 1 as 103.3). Put those rows right, then re-record the leaders of each
 * exercise touched — a set that truly beat the single (95 × 2 = 101.3) was hidden by the
 * inflated number and never got its row. Run it inside the write queue.
 */
export async function fixSingleE1rmRecords(): Promise<void> {
  if ((await getMeta(SINGLE_FIX_KEY)) === '1') return;
  const db = getDb();
  const rows = await db.getAllAsync<{ exercise_id: string }>(
    "SELECT DISTINCT exercise_id FROM personal_records WHERE kind = 'e1rm' AND reps = 1 AND value > weight_kg",
  );
  if (rows.length > 0) {
    await db.runAsync("UPDATE personal_records SET value = weight_kg WHERE kind = 'e1rm' AND reps = 1 AND value > weight_kg");
    await reconcilePrsForExercises(rows.map((r) => r.exercise_id));
  }
  await setMeta(SINGLE_FIX_KEY, '1');
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
  await enqueueWrite(() => reconcilePrsForExercises(exerciseIds));
  // v0.27.0: out of Health Connect too, and the widgets redone.
  void phoneAfterDelete(sessionId);
}
