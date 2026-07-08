import { getDb } from '@/db';
import { addDays, daysBetween, todayISO } from '@/lib/date';
import { getDashboardData } from '@/services/dashboard';

/**
 * The one-row-per-member rollup pushed to the cloud (member_summary). Derived
 * READ-ONLY from existing services/repos — no repo edits, no domain-schema change.
 * snake_case keys match the Supabase column names for a direct upsert.
 */
export interface MemberSummaryRow {
  display_name: string;
  last_active_at: string; // ISO timestamp
  last_workout_at: string | null;
  last_meal_at: string | null;
  workouts_7d: number;
  workouts_30d: number;
  total_workouts: number;
  current_streak: number;
  longest_streak: number;
  weight_kg: number | null;
  calories_today: number;
  protein_today_g: number;
}

function epochToIso(ms: number | null): string | null {
  return ms == null ? null : new Date(ms).toISOString();
}

/** All-time longest workout streak (same rule as getStreakDays: a gap with >= 2
 *  rest days breaks the run; <= 1 rest day continues it). */
async function computeLongestStreak(): Promise<number> {
  const rows = await getDb().getAllAsync<{ date_iso: string }>(
    'SELECT DISTINCT date_iso FROM workout_sessions ORDER BY date_iso ASC',
  );
  if (rows.length === 0) return 0;
  let longest = 1;
  let run = 1;
  for (let i = 1; i < rows.length; i++) {
    // gap<=2 calendar days => at most 1 rest day between workouts => continue.
    run = daysBetween(rows[i - 1].date_iso, rows[i].date_iso) <= 2 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  return longest;
}

export async function buildMemberSummary(displayName: string): Promise<MemberSummaryRow> {
  const db = getDb();
  const today = todayISO();
  const from7 = addDays(today, -6);
  const from30 = addDays(today, -29);

  const [dash, counts, lastWorkout, lastMeal, longestStreak] = await Promise.all([
    getDashboardData(),
    db.getFirstAsync<{ total: number; d7: number; d30: number }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN date_iso >= ? THEN 1 END) AS d7,
         COUNT(CASE WHEN date_iso >= ? THEN 1 END) AS d30
       FROM workout_sessions`,
      [from7, from30],
    ),
    db.getFirstAsync<{ started_at: number }>(
      'SELECT started_at FROM workout_sessions ORDER BY started_at DESC LIMIT 1',
    ),
    db.getFirstAsync<{ logged_at: number }>(
      'SELECT logged_at FROM meals ORDER BY logged_at DESC LIMIT 1',
    ),
    computeLongestStreak(),
  ]);

  return {
    display_name: displayName,
    last_active_at: new Date().toISOString(),
    last_workout_at: epochToIso(lastWorkout?.started_at ?? null),
    last_meal_at: epochToIso(lastMeal?.logged_at ?? null),
    workouts_7d: counts?.d7 ?? 0,
    workouts_30d: counts?.d30 ?? 0,
    total_workouts: counts?.total ?? 0,
    current_streak: dash.streakDays,
    longest_streak: Math.max(longestStreak, dash.streakDays),
    weight_kg: dash.bodyWeightKg,
    calories_today: Math.round(dash.caloriesToday),
    protein_today_g: Math.round(dash.proteinTodayG),
  };
}
