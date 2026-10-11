/**
 * The ONE streak (owner decision D9 = A, audit PG-12 / SH-07): weeks in a row with at least
 * one workout, like Hevy. A week runs Monday to Sunday in the member's own time, so a
 * weekend off never breaks it. The current week counts as alive while it has no workout
 * yet, as long as last week had one. Home, Progress, History and the year review all read
 * this rule. PURE.
 */
import { addDays, weekStartISO } from './date';

/** Weeks in a row with ≥1 workout, ending this week (or last week, while this one is empty). */
export function weekStreak(dates: readonly string[], today: string): number {
  if (dates.length === 0) return 0;
  const trained = new Set(dates.map(weekStartISO));
  let cursor = weekStartISO(today);
  if (!trained.has(cursor)) cursor = addDays(cursor, -7);
  let weeks = 0;
  while (trained.has(cursor)) {
    weeks += 1;
    cursor = addDays(cursor, -7);
  }
  return weeks;
}

/** "5 weeks in a row" — the same words as Home and Progress (Phase 7, one word per idea). */
export function streakText(weeks: number): string {
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} in a row`;
}

/** How far back a streak read looks: ~3 years covers any realistic unbroken run. */
export const STREAK_LOOKBACK_DAYS = 1099;
