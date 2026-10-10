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
import { isLoadMode, type LoadMode } from '@/tracker/engine/logTypes';
import type { ProgSession, ProgSet, ProgSetType } from '@/tracker/engine/progression';

interface Row {
  session_id: string;
  date_iso: string;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  set_type: string | null;
  duration_sec?: number | null;
  /** TG-03: the counting the set was logged with (NULL = the exercise's current one). */
  load_mode?: string | null;
}

const TYPES: readonly ProgSetType[] = ['normal', 'warmup', 'drop', 'failure'];

export async function getProgressionHistory(
  exerciseId: string,
  limit: number,
  /**
   * TG-05 (schema v10): only the sets of this card of the lift (heavy Bench = 0, back-off = 1),
   * so each card gets its own Target. Older sets count as the first card. Absent = every set.
   *
   * Review fix (#11): a later card (1, 2…) with no history of its own — every set saved before
   * cards were numbered reads as card 0 — falls back to the lift's first-card history, so the
   * first back-off card after the update gets a real Target, not "first time".
   */
  opts: { card?: number } = {},
): Promise<ProgSession[]> {
  if (limit <= 0) return [];
  if (opts.card != null && opts.card > 0) {
    const own = await readHistory(exerciseId, limit, opts.card);
    return own.length > 0 ? own : readHistory(exerciseId, limit, 0);
  }
  return readHistory(exerciseId, limit, opts.card);
}

async function readHistory(exerciseId: string, limit: number, cardIndex: number | undefined): Promise<ProgSession[]> {
  const opts = { card: cardIndex };
  const card = opts.card != null ? 'AND COALESCE(se.card_index, 0) = ?' : '';
  const card2 = opts.card != null ? 'AND COALESCE(s2.card_index, 0) = ?' : '';
  const args: (string | number)[] =
    opts.card != null ? [exerciseId, opts.card, exerciseId, opts.card, limit] : [exerciseId, exerciseId, limit];
  // Phase 4: easy-week workouts never move the Target (half the sets, the same weight, reps
  // left in the tank) — next week picks up from the last normal week.
  const rows = await getDb().getAllAsync<Row>(
    `SELECT se.session_id, ws.date_iso AS date_iso, se.weight_kg, se.reps, se.rpe, se.set_type, se.duration_sec, se.load_mode
       FROM set_entries se
       JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE se.exercise_id = ? ${card} AND se.is_warmup = 0 AND COALESCE(ws.easy_week, 0) = 0
        AND se.session_id IN (
          SELECT s2.session_id
            FROM set_entries s2
            JOIN workout_sessions w2 ON w2.id = s2.session_id
           WHERE s2.exercise_id = ? ${card2} AND s2.is_warmup = 0 AND COALESCE(w2.easy_week, 0) = 0
           GROUP BY s2.session_id
           ORDER BY MAX(w2.started_at) DESC, MAX(w2.date_iso) DESC
           LIMIT ?
        )
      ORDER BY ws.started_at DESC, ws.date_iso DESC, se.set_number ASC`,
    args,
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
    if (isLoadMode(r.load_mode)) set.loadMode = r.load_mode;
    s.sets.push(set);
  }
  return out;
}

/** One weight the member has logged on an exercise, with the counting it was logged in. */
export interface LadderWeight {
  weightKg: number;
  loadMode: LoadMode | null;
}

/**
 * TG-01: every distinct weight the member has logged on this exercise — ALL history, working
 * sets (no warm-ups), with reps — for "your own weight ladder". Easy weeks count: those are
 * weights he really loads. One row per weight and counting, so it stays small on 5 years.
 */
export async function getWeightLadder(exerciseId: string): Promise<LadderWeight[]> {
  const rows = await getDb().getAllAsync<{ weight_kg: number; load_mode: string | null }>(
    `SELECT DISTINCT weight_kg, load_mode
       FROM set_entries
      WHERE exercise_id = ? AND is_warmup = 0 AND COALESCE(set_type, 'normal') <> 'warmup'
        AND reps > 0 AND weight_kg > 0`,
    [exerciseId],
  );
  return rows.map((r) => ({ weightKg: Number(r.weight_kg), loadMode: isLoadMode(r.load_mode) ? r.load_mode : null }));
}
