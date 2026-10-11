/**
 * "Start records fresh" — one exercise's records count from a day (tracker schema v14).
 *
 * A new gym, a new machine, a reset of form: the member's old numbers are no longer the ones to
 * beat. The day is kept in `exercise_prefs.records_from` ('YYYY-MM-DD'; NULL = every workout
 * counts). Sets on earlier days stay in History and the charts; only the records leave them out:
 *  - the record screens, Progress, the finish screen and the live pop-up (recordsService reads
 *    only sets from that day on — its triggers move the training change counter, so every kept
 *    record is worked out again at once);
 *  - the exercise page's record numbers (exerciseStats);
 *  - the stored record log (Home's record count, the strength score, the coach) — rebuilt here,
 *    in the same transaction, from that day on.
 * A DAY, not a moment: a workout earlier that day — or the one being logged — still counts.
 *
 * Writes go through the one app-wide write queue (DS-04); never call them from inside a job.
 */
import { getDb } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { todayISO } from '@/lib/date';

import { rebuildRecordLog } from './exerciseManage';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day this exercise's records count from, or null when every workout counts. */
export async function getRecordsFrom(exerciseId: string): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ records_from: string | null }>(
    'SELECT records_from FROM exercise_prefs WHERE exercise_id = ?',
    [exerciseId],
  );
  const v = row?.records_from ?? null;
  return v && ISO_DAY.test(v) ? v : null;
}

/**
 * Count this exercise's records from `fromISO` (default today), or from every workout again
 * (`null`). Keeps the exercise's rest length; a settings row left with nothing in it is removed.
 * The record log is rebuilt in the same transaction, so a failure changes nothing.
 */
export async function setRecordsFrom(exerciseId: string, fromISO: string | null = todayISO()): Promise<void> {
  if (fromISO != null && !ISO_DAY.test(fromISO)) throw new Error(`records-from: not a day: ${fromISO}`);
  const db = getDb();
  await enqueueWrite(() =>
    db.withTransactionAsync(async () => {
      const ex = await db.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE id = ?', [exerciseId]);
      if (!ex) throw new Error('records-from: exercise not found');
      if (fromISO != null) {
        await db.runAsync(
          `INSERT INTO exercise_prefs (exercise_id, rest_sec, records_from) VALUES (?, NULL, ?)
           ON CONFLICT(exercise_id) DO UPDATE SET records_from = excluded.records_from`,
          [exerciseId, fromISO],
        );
      } else {
        await db.runAsync('UPDATE exercise_prefs SET records_from = NULL WHERE exercise_id = ?', [exerciseId]);
        await db.runAsync('DELETE FROM exercise_prefs WHERE exercise_id = ? AND rest_sec IS NULL AND records_from IS NULL', [exerciseId]);
      }
      await rebuildRecordLog(exerciseId);
    }),
  );
}
