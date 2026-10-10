/**
 * History helpers. The streak is the app's one streak (`lib/streak`, owner decision D9):
 * consecutive WEEKS with at least one session; a current week with no workout yet does not
 * break it. Read-only, no schema change.
 */
import { getSessionsBetween } from '@/db/repos/workoutRepo';
import { addDays, daysBetween, todayISO } from '@/lib/date';
import { STREAK_LOOKBACK_DAYS, weekStreak } from '@/lib/streak';

export interface WeekStreak {
  /** Consecutive weeks (Mon-anchored) with ≥1 logged session. */
  weeks: number;
  /** Days since the most recent workout (0 = trained today). */
  restDays: number;
}

export async function getWeekStreak(): Promise<WeekStreak> {
  const today = todayISO();
  const sessions = await getSessionsBetween(addDays(today, -STREAK_LOOKBACK_DAYS), today); // asc by date
  if (sessions.length === 0) return { weeks: 0, restDays: 0 };
  const lastDate = sessions[sessions.length - 1].dateISO;
  return { weeks: weekStreak(sessions.map((s) => s.dateISO), today), restDays: Math.max(0, daysBetween(lastDate, today)) };
}
