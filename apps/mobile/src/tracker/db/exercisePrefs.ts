/**
 * Per-exercise facts the workout screen needs when an exercise is added (Phase 1):
 *  - its own rest length (new `exercise_prefs` table, tracker schema v3);
 *  - the note from the last workout that had it (notes carry forward, Hevy-style);
 *  - the member's best weight and best e1RM so far (for live record alerts).
 *
 * Reads only; the frozen tables are untouched. The best-so-far query is the same
 * one the frozen record detector runs (`prRepo.checkAndRecordPrs`), so a live alert
 * and the saved record agree.
 */
import { getDb } from '@/db';
import type { PriorBests } from '@/tracker/services/liveRecords';

/** NULL = default rest, 0 = off, >0 = seconds. */
export async function getExerciseRestSec(exerciseId: string): Promise<number | null> {
  const row = await getDb().getFirstAsync<{ rest_sec: number | null }>(
    'SELECT rest_sec FROM exercise_prefs WHERE exercise_id = ?',
    [exerciseId],
  );
  return row?.rest_sec ?? null;
}

export async function setExerciseRestSec(exerciseId: string, restSec: number | null): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO exercise_prefs(exercise_id, rest_sec) VALUES(?, ?)
     ON CONFLICT(exercise_id) DO UPDATE SET rest_sec = excluded.rest_sec`,
    [exerciseId, restSec],
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

/** Best working-set weight and e1RM before now; null when there is no history. */
export async function getPriorBests(exerciseId: string): Promise<PriorBests | null> {
  const row = await getDb().getFirstAsync<{ best_weight: number | null; best_e1rm: number | null }>(
    `SELECT MAX(se.weight_kg) AS best_weight,
            MAX(se.weight_kg * (1 + se.reps / 30.0)) AS best_e1rm
       FROM set_entries se
      WHERE se.exercise_id = ? AND se.is_warmup = 0`,
    [exerciseId],
  );
  if (row?.best_weight == null || row.best_e1rm == null) return null;
  return { weightKg: row.best_weight, e1rm: row.best_e1rm };
}
