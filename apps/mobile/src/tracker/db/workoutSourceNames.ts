/**
 * The name a workout is known by, for the live card's "Last: 3 Oct · Push 1A" line (13 Oct 2026).
 * Kept apart from `workoutNames.ts` (which follows the History rule, day type included) so the
 * live workout's store reads it with nothing else attached.
 */
import { getDb } from '@/db';

/**
 * 13 Oct 2026 (the live card's "Last: 3 Oct · Push 1A"): the name a workout is known by — its
 * title, else the name of the routine it was started from (while that routine exists), else
 * null (the line then shows the day alone; never the day type). Read in pieces of 500.
 */
export async function getWorkoutSourceNames(ids: readonly string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const rows = await getDb().getAllAsync<{ id: string; title: string | null; routine_name: string | null }>(
      `SELECT ws.id AS id, ws.title AS title, pd.name AS routine_name
         FROM workout_sessions ws
         LEFT JOIN plan_days pd ON pd.id = ws.routine_id
        WHERE ws.id IN (${chunk.map(() => '?').join(', ')})`,
      chunk,
    );
    for (const r of rows) out.set(r.id, sourceName(r.title, r.routine_name));
  }
  return out;
}

/** Its title, else its routine's name, else null — trimmed, runs of spaces kept as typed. PURE. */
export function sourceName(title: string | null | undefined, routineName: string | null | undefined): string | null {
  const t = title?.trim();
  if (t) return t;
  const r = routineName?.trim();
  return r ? r : null;
}
