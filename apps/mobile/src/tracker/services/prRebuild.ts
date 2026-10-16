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
import { E1RM_MAX_REPS } from '@/lib/e1rm';
import { rebuildRecordLog } from '@/tracker/db/exerciseManage';
import { phoneAfterDelete } from '@/tracker/phone/phoneSync';

/** Of these exercises, the ones whose records count from a day (tracker schema v14). */
export async function exercisesWithRecordStart(exerciseIds: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const unique = [...new Set(exerciseIds)];
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    const rows = await getDb()
      .getAllAsync<{ exercise_id: string }>(
        `SELECT exercise_id FROM exercise_prefs WHERE records_from IS NOT NULL AND exercise_id IN (${chunk.map(() => '?').join(', ')})`,
        chunk,
      )
      .catch(() => [] as { exercise_id: string }[]); // a database before v14 has no such column
    for (const r of rows) out.add(r.exercise_id);
  }
  return out;
}

/**
 * Re-record leading PRs for these exercises from their surviving working sets.
 *
 * v14 ("Start records fresh"): an exercise whose records count from a day has its record log
 * rebuilt from that day on instead — the frozen detector compares with ALL history, so a lighter
 * best at the new gym would otherwise never get its row (and an old row would linger).
 */
export async function reconcilePrsForExercises(exerciseIds: string[]): Promise<void> {
  const db = getDb();
  const sessionIds = new Set<string>();
  const seen = new Set<string>();
  const fresh = await exercisesWithRecordStart(exerciseIds);
  for (const exerciseId of exerciseIds) {
    if (seen.has(exerciseId)) continue;
    seen.add(exerciseId);
    if (fresh.has(exerciseId)) {
      await rebuildRecordLog(exerciseId);
      continue;
    }
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

const LONG_SET_FIX_KEY = 'pr_long_set_e1rm_fix';

/**
 * Once per install — 13 Oct 2026 audit (B1): an older version stored a long set's 1-rep max with
 * every rep counted (70 kg × 25 as 128.3 kg, over 100 kg × 5's 116.7), so Home's strength numbers
 * and the coach named a lighter set as the member's best, and a truly heavier later set (105 × 5 =
 * 122.5) was hidden behind it and never got its row. Reps above 12 now count as 12 (`lib/e1rm`).
 * Each exercise with such a row has its record log rebuilt from its sets by today's rule. Run it
 * inside the write queue.
 */
export async function fixLongSetE1rmRecords(): Promise<void> {
  if ((await getMeta(LONG_SET_FIX_KEY)) === '1') return;
  const rows = await getDb().getAllAsync<{ exercise_id: string }>(
    `SELECT DISTINCT exercise_id FROM personal_records WHERE kind = 'e1rm' AND reps > ${E1RM_MAX_REPS}`,
  );
  for (const r of rows) await rebuildRecordLog(r.exercise_id);
  await setMeta(LONG_SET_FIX_KEY, '1');
}

const LIGHTER_SET_FIX_KEY = 'pr_lighter_set_e1rm_fix';

/**
 * Once per install — 16 Oct 2026 (owner rule, wave-1 review item 2): an older version stored a
 * 1-rep-max record for a LIGHTER set (85 kg × 12 after 100 kg × 5), which then hid a truly
 * heavier record (110 × 2) from Home's strength numbers and the coach. Each exercise with such a
 * row has its record log rebuilt by today's rule (`e1rmRecordOf`). Run it inside the write queue.
 */
export async function fixLighterSetE1rmRecords(): Promise<void> {
  if ((await getMeta(LIGHTER_SET_FIX_KEY)) === '1') return;
  const rows = await getDb().getAllAsync<{ exercise_id: string }>(
    `SELECT DISTINCT a.exercise_id AS exercise_id
       FROM personal_records a JOIN workout_sessions sa ON sa.id = a.session_id
      WHERE a.kind = 'e1rm' AND EXISTS (
            SELECT 1 FROM personal_records b JOIN workout_sessions sb ON sb.id = b.session_id
             WHERE b.exercise_id = a.exercise_id AND b.kind = 'e1rm' AND sb.started_at < sa.started_at AND b.weight_kg > a.weight_kg)`,
  );
  // Wave-2 review: each lift in its own transaction (a crash mid-lift keeps its old rows), and the
  // "done" mark only after every lift — a failure tries again next launch.
  const db = getDb();
  for (const r of rows) await db.withTransactionAsync(() => rebuildRecordLog(r.exercise_id));
  await setMeta(LIGHTER_SET_FIX_KEY, '1');
}

/**
 * After a workout is saved or edited (v14): the frozen detector that ran inside the save compares
 * with every workout ever, so an exercise whose records count from a day may be missing a row.
 * Rebuild those exercises' logs. Queued — never call it from inside an `enqueueWrite` job.
 */
export async function reconcileRecordStartsForSession(sessionId: string): Promise<void> {
  const rows = await getDb()
    .getAllAsync<{ exercise_id: string }>(
      `SELECT DISTINCT se.exercise_id AS exercise_id
         FROM set_entries se JOIN exercise_prefs p ON p.exercise_id = se.exercise_id
        WHERE se.session_id = ? AND se.is_warmup = 0 AND p.records_from IS NOT NULL`,
      [sessionId],
    )
    .catch(() => [] as { exercise_id: string }[]);
  if (rows.length === 0) return;
  await enqueueWrite(() => reconcilePrsForExercises(rows.map((r) => r.exercise_id)));
}

/**
 * Audit Phase 9 review: every exercise whose records count from a day gets its record log rebuilt
 * (after an import, whose own record pass compares with every workout ever). Queued — never call
 * it from inside an `enqueueWrite` job. Nothing to do (the usual case) costs one read.
 */
export async function reconcileAllRecordStarts(): Promise<void> {
  const rows = await getDb()
    .getAllAsync<{ exercise_id: string }>('SELECT exercise_id FROM exercise_prefs WHERE records_from IS NOT NULL')
    .catch(() => [] as { exercise_id: string }[]); // a database before v14 has no such column
  if (rows.length === 0) return;
  await enqueueWrite(() => reconcilePrsForExercises(rows.map((r) => r.exercise_id)));
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
