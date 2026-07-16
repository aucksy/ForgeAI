/**
 * Bounded exercise history — the same read as the frozen `workoutRepo.getExerciseHistory`,
 * with the `limit` pushed into SQL instead of applied in JS.
 *
 * The frozen fn SELECTs a lift's ENTIRE working-set history (Bench ≈ hundreds of rows
 * after the 8.8k-row Hevy import), then trims to `limit` sessions while grouping. This
 * module bounds the SESSION LIST in SQL (`session_id IN (SELECT … LIMIT ?)`) instead.
 * The frozen `workoutRepo` is UNTOUCHED and its callers keep working; only non-frozen
 * tracker callers point here.
 *
 * Be precise about the win — it is NOT "fewer rows read":
 *  - SQLite still range-scans the lift's rows via `idx_sets_exercise`; in fact it now
 *    scans them TWICE (once in the ranking subquery, once in the outer query) and builds
 *    temp B-trees for the GROUP BY + ORDER BY. An index that would avoid this
 *    (`set_entries(exercise_id, session_id)`) is a schema change, so it's out.
 *  - What's saved is everything downstream: only the surviving sessions' rows cross the
 *    JS↔native bridge, become JS objects, and get walked by the grouping loop. On RN that
 *    crossing dominates, so the doubled index walk still nets out ~1.7× faster even
 *    measured inside SQLite alone (limit=1: ~361µs/4 rows vs ~634µs/232 rows @ 600
 *    sessions), and the 12 repointed calls drop from ~2,800 row objects to ~144.
 *
 * Scope of the fix on the start-from-plan tap (don't over-read it): the tap issues 18
 * exercise-history reads for the same 6 lifts, and this bounds 12 of them —
 * `buildDraftExercise (id, 1)` × 6 + `coachTargets (id, 5)` × 6. The other 6 (plus a
 * 21-round-trip `getRecentSessionDetails(10)` N+1) live inside the FROZEN
 * `services/coach.ts → getTodaysWorkout()`, which `startFromPlan` calls only to read
 * `planDayId`. Bounding those needs either an unfreeze of `services/*` or a re-implementation
 * of the frozen plan-day rotation here — the latter would fork business logic away from the
 * Coach tab, which is exactly the divergence this module is written to avoid. Left as-is,
 * deliberately: ~2/3 of the tap, not all of it.
 *
 * PARITY with the frozen fn (byte-identical shape + semantics):
 *  - working sets only (`is_warmup = 0`), sessions newest-first, sets `set_number` ASC;
 *  - identical row shape (`sessionId`/`dateISO`/`sets: SetEntry[]`/`volumeKg`);
 *  - `volumeKg` = Σ weight × reps over the session's working sets;
 *  - `limit` omitted → the full history (the exact frozen query, unbounded);
 *  - `limit <= 0` → `[]` (the frozen JS trim breaks before pushing a group).
 *
 * The ONE deliberate divergence is a frozen edge-case bug, not a behaviour change: when two
 * sessions share an EXACT `(started_at, date_iso)` the frozen loop's `break` can truncate a
 * session mid-way (its remaining rows are dropped once `out.length >= limit`). Bounding in
 * SQL returns whole sessions instead. Unreachable in practice for the callers here (both
 * ties would have to be the same lift on the same backdated day) and strictly more correct.
 */
import { getDb } from '@/db';
import type { SetEntry } from '@/types/models';

export interface ExerciseHistoryEntry {
  sessionId: string;
  dateISO: string;
  sets: SetEntry[];
  volumeKg: number;
}

interface HistoryRow {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_warmup: number;
  date_iso: string;
}

function mapSet(r: HistoryRow): SetEntry {
  return {
    id: r.id,
    sessionId: r.session_id,
    exerciseId: r.exercise_id,
    setNumber: r.set_number,
    weightKg: r.weight_kg,
    reps: r.reps,
    isWarmup: r.is_warmup === 1,
  };
}

/** Columns of the frozen `SetRow` shape, plus the session's date. */
const COLS = `se.id, se.session_id, se.exercise_id, se.set_number, se.weight_kg, se.reps,
              se.is_warmup, ws.date_iso AS date_iso`;

const ORDER = 'ORDER BY ws.started_at DESC, ws.date_iso DESC, se.set_number ASC';

/**
 * Working sets only, grouped per session, newest first — the frozen
 * `getExerciseHistory` contract with the limit resolved in SQLite.
 */
export async function getBoundedExerciseHistory(
  exerciseId: string,
  limit?: number,
): Promise<ExerciseHistoryEntry[]> {
  // The frozen fn's JS trim yields nothing for a non-positive limit; don't emit
  // `LIMIT 0`/`LIMIT -1` (SQLite reads a negative limit as "no limit").
  if (limit != null && limit <= 0) return [];

  const db = getDb();
  const rows =
    limit == null
      ? await db.getAllAsync<HistoryRow>(
          `SELECT ${COLS}
             FROM set_entries se
             JOIN workout_sessions ws ON ws.id = se.session_id
            WHERE se.exercise_id = ? AND se.is_warmup = 0
            ${ORDER}`,
          [exerciseId],
        )
      : await db.getAllAsync<HistoryRow>(
          // Bound the SESSION list first, then read only those sessions' sets. The
          // subquery ranks by the same keys the frozen loop walks, so it picks the
          // same `limit` newest sessions that the JS trim would have kept.
          `SELECT ${COLS}
             FROM set_entries se
             JOIN workout_sessions ws ON ws.id = se.session_id
            WHERE se.exercise_id = ? AND se.is_warmup = 0
              AND se.session_id IN (
                SELECT s2.session_id
                  FROM set_entries s2
                  JOIN workout_sessions w2 ON w2.id = s2.session_id
                 WHERE s2.exercise_id = ? AND s2.is_warmup = 0
                 GROUP BY s2.session_id
                 ORDER BY MAX(w2.started_at) DESC, MAX(w2.date_iso) DESC
                 LIMIT ?
              )
            ${ORDER}`,
          [exerciseId, exerciseId, limit],
        );

  // Group exactly like the frozen fn — minus its `break`, since SQL already bounded us.
  const out: ExerciseHistoryEntry[] = [];
  const bySession = new Map<string, ExerciseHistoryEntry>();
  for (const r of rows) {
    let group = bySession.get(r.session_id);
    if (!group) {
      group = { sessionId: r.session_id, dateISO: r.date_iso, sets: [], volumeKg: 0 };
      bySession.set(r.session_id, group);
      out.push(group);
    }
    const set = mapSet(r);
    group.sets.push(set);
    group.volumeKg += set.weightKg * set.reps;
  }
  return out;
}
