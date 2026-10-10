/**
 * HI-01 — History's index (additive, idempotent; no schema version bump).
 *
 * History pages newest-first by (date_iso, started_at, id) and the calendar counts workouts per
 * month and per day. `idx_sessions_date` (frozen base schema) already serves the day ranges;
 * this composite index lets the paged list walk the exact sort order without a temp sort, so
 * page 11 of a 509-workout history costs the same as page 1.
 *
 * Safe to run on every start-up: `CREATE INDEX IF NOT EXISTS` is a no-op once it exists, and a
 * failure only means History sorts in memory (a few ms at 500 workouts) — never wrong answers.
 */
import { getDb } from '@/db';

export async function ensureHistoryIndexes(): Promise<void> {
  await getDb().execAsync(
    'CREATE INDEX IF NOT EXISTS idx_sessions_date_start_id ON workout_sessions(date_iso, started_at, id)',
  );
}
