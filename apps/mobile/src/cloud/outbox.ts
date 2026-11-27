import { getDb } from '@/db';

/**
 * R-631 (owner yes, 27 Nov 2026): the old "member summary" upload is gone. It sent one row of totals
 * (name, latest body weight, today's calories and protein, streaks) to the server table
 * member_summary. Nothing read it: the gym dashboard made for it was never switched on, and restore
 * uses the MettleUp account copy (cloud/copyLocal.ts), not this row. The server now refuses the table
 * (supabase/migrations/0102_stop_member_summary.sql).
 *
 * The two names stay so the callers (cloud/sync.ts, cloud/connectivity.ts) need no change. Each one
 * only empties `sync_outbox`, where an older app version may have left a summary waiting.
 * test/cloud/noMemberSummaryUpload.test.ts stops the upload coming back.
 */

export async function enqueueSummary(): Promise<void> {
  await getDb().runAsync('DELETE FROM sync_outbox');
}

export async function drainOutbox(): Promise<void> {
  await getDb().runAsync('DELETE FROM sync_outbox');
}
