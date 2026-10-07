/**
 * History read for the progression engine (`tracker/engine/progression.ts`).
 *
 * Same session bounding as `getBoundedExerciseHistory` (working sets only, newest
 * sessions first, the limit applied in SQL), plus the tracker columns the engine
 * needs: `set_type` (drop sets are ignored), `rpe` (effort credit) and, since Phase 2,
 * `duration_sec` (timed holds). Older rows that predate those columns read as
 * 'normal' / no RPE / no time.
 */
import { getDb } from '@/db';
import type { ProgSession, ProgSet, ProgSetType } from '@/tracker/engine/progression';

interface Row {
  session_id: string;
  date_iso: string;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  set_type: string | null;
  duration_sec?: number | null;
}

const TYPES: readonly ProgSetType[] = ['normal', 'warmup', 'drop', 'failure'];

export async function getProgressionHistory(exerciseId: string, limit: number): Promise<ProgSession[]> {
  if (limit <= 0) return [];
  // Phase 4: easy-week workouts never move the Target (half the sets, the same weight, reps
  // left in the tank) — next week picks up from the last normal week.
  const rows = await getDb().getAllAsync<Row>(
    `SELECT se.session_id, ws.date_iso AS date_iso, se.weight_kg, se.reps, se.rpe, se.set_type, se.duration_sec
       FROM set_entries se
       JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE se.exercise_id = ? AND se.is_warmup = 0 AND COALESCE(ws.easy_week, 0) = 0
        AND se.session_id IN (
          SELECT s2.session_id
            FROM set_entries s2
            JOIN workout_sessions w2 ON w2.id = s2.session_id
           WHERE s2.exercise_id = ? AND s2.is_warmup = 0 AND COALESCE(w2.easy_week, 0) = 0
           GROUP BY s2.session_id
           ORDER BY MAX(w2.started_at) DESC, MAX(w2.date_iso) DESC
           LIMIT ?
        )
      ORDER BY ws.started_at DESC, ws.date_iso DESC, se.set_number ASC`,
    [exerciseId, exerciseId, limit],
  );
  return groupRows(rows);
}

/** Pure grouping (exported for tests): rows in session order → sessions with typed sets. */
export function groupRows(rows: Row[]): ProgSession[] {
  const out: ProgSession[] = [];
  const bySession = new Map<string, ProgSession>();
  for (const r of rows) {
    let s = bySession.get(r.session_id);
    if (!s) {
      s = { dateISO: r.date_iso, sets: [] };
      bySession.set(r.session_id, s);
      out.push(s);
    }
    const t = (r.set_type ?? 'normal') as ProgSetType;
    const set: ProgSet = {
      weightKg: r.weight_kg,
      reps: r.reps,
      rpe: r.rpe == null ? null : Number(r.rpe),
      setType: TYPES.includes(t) ? t : 'normal',
    };
    if (r.duration_sec != null) set.durationSec = Number(r.duration_sec);
    s.sets.push(set);
  }
  return out;
}
