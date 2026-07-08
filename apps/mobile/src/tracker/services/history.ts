/**
 * History helpers. Weekly streak uses Hevy semantics — consecutive WEEKS with at
 * least one session (an in-progress, not-yet-trained current week doesn't break it),
 * which differs from the frozen day-based `getStreakDays`. Read-only, no schema change.
 */
import { getSessionsBetween } from '@/db/repos/workoutRepo';
import { addDays, daysBetween, todayISO, weekStartISO } from '@/lib/date';

export interface WeekStreak {
  /** Consecutive weeks (Mon-anchored) with ≥1 logged session. */
  weeks: number;
  /** Days since the most recent workout (0 = trained today). */
  restDays: number;
}

export async function getWeekStreak(): Promise<WeekStreak> {
  const today = todayISO();
  // ~3-year window: comfortably covers any realistic unbroken weekly streak.
  const sessions = await getSessionsBetween(addDays(today, -1099), today); // asc by date
  if (sessions.length === 0) return { weeks: 0, restDays: 0 };

  const trainedWeeks = new Set(sessions.map((s) => weekStartISO(s.dateISO)));
  let cursor = weekStartISO(today);
  // A current week with no session yet is "in progress" — skip it without breaking.
  if (!trainedWeeks.has(cursor)) cursor = addDays(cursor, -7);
  let weeks = 0;
  while (trainedWeeks.has(cursor)) {
    weeks += 1;
    cursor = addDays(cursor, -7);
  }

  const lastDate = sessions[sessions.length - 1].dateISO;
  return { weeks, restDays: Math.max(0, daysBetween(lastDate, today)) };
}
