/**
 * Per-exercise facts the workout screen needs when an exercise is added (Phase 1):
 *  - its own rest length (new `exercise_prefs` table, tracker schema v3);
 *  - the note from the last workout that had it (notes carry forward, Hevy-style);
 *  - the member's bests so far (for live record alerts; Phase 3: every record kind).
 *
 * Reads only; the frozen tables are untouched.
 */
import { getDb } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import type { PriorBests } from '@/tracker/services/liveRecords';
import { getPriorRecordBests } from '@/tracker/services/recordsService';

/** NULL = default rest, 0 = off, >0 = seconds. */
export async function getExerciseRestSec(exerciseId: string): Promise<number | null> {
  const row = await getDb().getFirstAsync<{ rest_sec: number | null }>(
    'SELECT rest_sec FROM exercise_prefs WHERE exercise_id = ?',
    [exerciseId],
  );
  return row?.rest_sec ?? null;
}

/** Queued (DS-04): never call it from inside an `enqueueWrite` job. */
export async function setExerciseRestSec(exerciseId: string, restSec: number | null): Promise<void> {
  await enqueueWrite(() =>
    getDb().runAsync(
      `INSERT INTO exercise_prefs(exercise_id, rest_sec) VALUES(?, ?)
       ON CONFLICT(exercise_id) DO UPDATE SET rest_sec = excluded.rest_sec`,
      [exerciseId, restSec],
    ),
  );
}

/**
 * The note left on this exercise in the MOST RECENT workout that included it.
 * Clearing a note in a workout therefore stops it carrying forward.
 */
export async function getCarriedNote(exerciseId: string): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ note: string | null }>(
    `SELECT se.note AS note
       FROM set_entries se
      WHERE se.session_id = (
              SELECT ws.id FROM set_entries s2
                JOIN workout_sessions ws ON ws.id = s2.session_id
               WHERE s2.exercise_id = ?
               ORDER BY ws.started_at DESC
               LIMIT 1)
        AND se.exercise_id = ?
        AND se.note IS NOT NULL AND TRIM(se.note) <> ''
      LIMIT 1`,
    [exerciseId, exerciseId],
  );
  const n = row?.note?.trim();
  return n ? n : null;
}

/**
 * The best of every record kind before now (Phase 3: heaviest, 1-rep max, best set, best
 * session, most reps, longest time and distance); null when there is no history. Built by
 * the same record rule as the finish screen, so the live pop-up and the saved record agree.
 */
export async function getPriorBests(exerciseId: string): Promise<PriorBests | null> {
  return getPriorRecordBests(exerciseId);
}
