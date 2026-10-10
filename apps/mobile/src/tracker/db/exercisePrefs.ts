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
import { getPriorRecordBests, getPriorRecordBestsMany } from '@/tracker/services/recordsService';

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

// ------------------------------------------------------------------ audit Phase 8: every card at once

const CHUNK = 400;

/** `getExerciseRestSec` for many exercises: one statement (per 400). Absent = default rest. */
export async function getExerciseRestSecs(exerciseIds: readonly string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const unique = [...new Set(exerciseIds)];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const rows = await getDb().getAllAsync<{ exercise_id: string; rest_sec: number | null }>(
      `SELECT exercise_id, rest_sec FROM exercise_prefs WHERE exercise_id IN (${chunk.map(() => '?').join(', ')})`,
      chunk,
    );
    for (const r of rows) out.set(r.exercise_id, r.rest_sec ?? null);
  }
  return out;
}

/**
 * `getCarriedNote` for many exercises: one statement (per 400). Each exercise's newest workout
 * (by start) is ranked with a window function; its first non-empty note (in saved order) carries.
 */
export async function getCarriedNotes(exerciseIds: readonly string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = [...new Set(exerciseIds)];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const rows = await getDb().getAllAsync<{ ex: string; note: string | null }>(
      `WITH latest AS (
         SELECT ex, sid FROM (
           SELECT s2.exercise_id AS ex, ws.id AS sid,
                  ROW_NUMBER() OVER (PARTITION BY s2.exercise_id ORDER BY ws.started_at DESC) AS rn
             FROM set_entries s2
             JOIN workout_sessions ws ON ws.id = s2.session_id
            WHERE s2.exercise_id IN (${chunk.map(() => '?').join(', ')})
         ) WHERE rn = 1
       )
       SELECT l.ex AS ex, se.note AS note
         FROM latest l
         JOIN set_entries se ON se.session_id = l.sid AND se.exercise_id = l.ex
        WHERE se.note IS NOT NULL AND TRIM(se.note) <> ''
        ORDER BY l.ex, se.rowid`,
      chunk,
    );
    for (const r of rows) {
      if (out.has(r.ex)) continue;
      const n = r.note?.trim();
      if (n) out.set(r.ex, n);
    }
  }
  return out;
}

/** `getPriorBests` for many exercises (one records read for the lot). */
export async function getPriorBestsMany(exerciseIds: readonly string[]): Promise<Map<string, PriorBests | null>> {
  return getPriorRecordBestsMany(exerciseIds);
}
