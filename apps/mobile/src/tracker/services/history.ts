/**
 * History helpers. The streak is the app's one streak (`lib/streak`, owner decision D9):
 * consecutive WEEKS with at least one session; a current week with no workout yet does not
 * break it. Read-only, no schema change.
 */
import { getSessionsBetween } from '@/db/repos/workoutRepo';
import { daysBetween, todayISO } from '@/lib/date';
import { weekStreak } from '@/lib/streak';

export interface WeekStreak {
  /** Consecutive weeks (Mon-anchored) with ≥1 logged session. */
  weeks: number;
  /** Days since the most recent workout (0 = trained today). */
  restDays: number;
}

export async function getWeekStreak(): Promise<WeekStreak> {
  const today = todayISO();
  // C2-7 (16 Oct 2026 audit): every workout day, with no window. A ~3-year window said "Rest days
  // 0" to a member whose imported history ended over 3 years ago, and capped the streak at 157.
  const sessions = await getSessionsBetween('0000-01-01', today); // asc by date
  if (sessions.length === 0) return { weeks: 0, restDays: 0 };
  const lastDate = sessions[sessions.length - 1].dateISO;
  return { weeks: weekStreak(sessions.map((s) => s.dateISO), today), restDays: Math.max(0, daysBetween(lastDate, today)) };
}
