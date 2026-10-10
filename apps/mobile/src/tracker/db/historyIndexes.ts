/**
 * HI-01 — History's index (additive, idempotent; no schema version bump).
 *
 * History pages newest-first by (date_iso, started_at, id) and the calendar counts workouts per
 * month and per day. `idx_sessions_date` (frozen base schema) already serves the day ranges;
 * this composite index lets the paged list walk the exact sort order without a temp sort, so
 * page 11 of a 509-workout history costs the same as page 1.
 *
 * Audit Phase 8 (five years of data, 31,869 sets) adds the indexes the measured slow reads need.
 * Each was checked with EXPLAIN QUERY PLAN and timed (test/tracker/phase8Indexes.test.ts,
 * test/perf/phase8a.perf.ts):
 *  - `idx_sets_ex_work` (exercise_id, is_warmup, session_id, weight_kg, reps): "this lift's
 *    working sets" — the record check each saved set runs (every row of an import), the bounded
 *    history reads and Targets — answered from the index alone, without visiting each set row;
 *  - `idx_sets_load_mode` (partial, load_mode IS NOT NULL): "sets with their own counting" are
 *    few; without it History and Progress walked every set of their lifts to find none;
 *  - `idx_pr_session` (personal_records.session_id): deleting or re-saving a workout's records
 *    scanned every record.
 * `workout_sessions(started_at)` was measured too and is NOT added: SQLite never picked it for
 * these reads (they find sets by exercise first), so it would only slow every save.
 *
 * Safe to run on every start-up: `CREATE INDEX IF NOT EXISTS` is a no-op once it exists, and a
 * failure only means a slower read — never wrong answers.
 */
import { getDb } from '@/db';

export const HISTORY_INDEXES: readonly string[] = [
  'CREATE INDEX IF NOT EXISTS idx_sessions_date_start_id ON workout_sessions(date_iso, started_at, id)',
  'CREATE INDEX IF NOT EXISTS idx_sets_ex_work ON set_entries(exercise_id, is_warmup, session_id, weight_kg, reps)',
  'CREATE INDEX IF NOT EXISTS idx_sets_load_mode ON set_entries(exercise_id) WHERE load_mode IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_pr_session ON personal_records(session_id)',
];

export async function ensureHistoryIndexes(): Promise<void> {
  // One at a time: a failure of one (a full disk) still leaves the others.
  let failed: unknown = null;
  for (const sql of HISTORY_INDEXES) {
    try {
      await getDb().execAsync(sql);
    } catch (e) {
      failed ??= e;
    }
  }
  if (failed) throw failed;
}
