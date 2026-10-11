/**
 * LW-15: the "Recent" band at the top of the Add exercise picker — the exercises of the
 * member's last few workouts, the newest workout first, each exercise once (Hevy shows the
 * same). Read-only; bounded in SQL (a few sessions, a short list).
 */
import { getDb } from '@/db';

export async function getRecentExerciseIds(sessions = 5, limit = 15): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ id: string }>(
    // Each exercise once, placed by the newest workout it was in and, inside that workout, by
    // the order it was logged.
    `WITH recent AS (SELECT id, started_at FROM workout_sessions ORDER BY started_at DESC LIMIT ?),
          done AS (
            SELECT se.exercise_id AS id, ws.started_at AS t, se.rowid AS r
              FROM set_entries se JOIN recent ws ON ws.id = se.session_id
          ),
          latest AS (SELECT id, MAX(t) AS t FROM done GROUP BY id)
     SELECT l.id AS id
       FROM latest l JOIN done d ON d.id = l.id AND d.t = l.t
      GROUP BY l.id, l.t
      ORDER BY l.t DESC, MIN(d.r) ASC
      LIMIT ?`,
    [sessions, limit],
  );
  return rows.map((r) => r.id);
}

/**
 * Redesign R5 (Profile → Exercises): when each exercise was last done — its newest workout's
 * day and start — for "Last: 12 Oct" and the "Recent" band. One grouped read over every set.
 */
export async function getLastDoneDates(): Promise<Map<string, { dateISO: string; startedAt: number }>> {
  const rows = await getDb().getAllAsync<{ id: string; d: string; t: number }>(
    `SELECT se.exercise_id AS id, MAX(ws.date_iso) AS d, MAX(ws.started_at) AS t
       FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
      GROUP BY se.exercise_id`,
  );
  return new Map(rows.map((r) => [r.id, { dateISO: r.d, startedAt: Number(r.t) }]));
}
