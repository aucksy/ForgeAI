/** Reads for the Calendar page (R3). */
import { getDb } from '@/db';

/** Workouts per day over all history ("2026-10-09" → 1): one small read for every month at once. */
export async function getAllWorkoutDays(): Promise<Record<string, number>> {
  const rows = await getDb().getAllAsync<{ d: string; n: number }>('SELECT date_iso AS d, COUNT(*) AS n FROM workout_sessions GROUP BY date_iso');
  const out: Record<string, number> = {};
  for (const r of rows) out[r.d] = Number(r.n);
  return out;
}
