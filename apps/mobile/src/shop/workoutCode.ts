/**
 * "Show my workouts to the desk" (Messages & offers step 1, item 6; OWNER-INBOX #49): which of the
 * last 30 days have a workout that counts for a gym's workout offer, and the claim code that holds
 * them (claimCode.ts). The gym checks each day against its own check-ins; the phone only says which
 * days had a real workout.
 *
 * A workout counts (R-offers-notices §4.3) when it was logged in the app's workout screen (not an
 * import from another app, not demo data, not a chat or photo log), ran 20 minutes or more, and has
 * 6 or more saved sets (warm-ups don't count). At most one a day.
 */
import { getDb } from '@/db';
import { addDays, todayISO } from '@/lib/date';

import { CLAIM_DAYS, encodeClaim } from './claimCode';

export const COUNTED_MIN_MINUTES = 20;
export const COUNTED_MIN_SETS = 6;

/** One saved workout, as the count reads it. */
export interface CountRow {
  dateISO: string;
  source: string;
  startedAt: number;
  endedAt: number | null;
  /** Saved sets that are not warm-ups. */
  workingSets: number;
}

/** The rule for one workout. PURE. */
export function workoutCounts(r: CountRow): boolean {
  return (
    r.source === 'manual' &&
    r.endedAt != null &&
    r.endedAt - r.startedAt >= COUNTED_MIN_MINUTES * 60_000 &&
    r.workingSets >= COUNTED_MIN_SETS
  );
}

/** The days, newest first, of the last 30 (today and the 29 before) with a workout that counts. PURE. */
export function countedDays(rows: readonly CountRow[], today: string): string[] {
  const from = addDays(today, -(CLAIM_DAYS - 1));
  const days = new Set<string>();
  for (const r of rows) if (r.dateISO >= from && r.dateISO <= today && workoutCounts(r)) days.add(r.dateISO);
  return [...days].sort().reverse();
}

export interface WorkoutCode {
  today: string;
  /** Newest first. */
  days: string[];
  code: string;
}

/** Reads the last 30 days' workouts and makes the code. */
export async function getWorkoutCode(today: string = todayISO()): Promise<WorkoutCode> {
  const rows = await getDb().getAllAsync<{ date_iso: string; source: string; started_at: number; ended_at: number | null; working: number }>(
    `SELECT ws.date_iso, ws.source, ws.started_at, ws.ended_at,
            (SELECT COUNT(*) FROM set_entries se WHERE se.session_id = ws.id AND se.is_warmup = 0) AS working
       FROM workout_sessions ws
      WHERE ws.date_iso >= ? AND ws.date_iso <= ?`,
    [addDays(today, -(CLAIM_DAYS - 1)), today],
  );
  const days = countedDays(
    rows.map((r) => ({ dateISO: r.date_iso, source: r.source, startedAt: r.started_at, endedAt: r.ended_at, workingSets: r.working })),
    today,
  );
  return { today, days, code: encodeClaim(today, days) };
}
