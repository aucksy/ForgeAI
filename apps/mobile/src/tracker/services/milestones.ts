/**
 * Audit Phase 9 (#4): workout milestones — "Your 100th workout". The most-shared moments on
 * r/Hevy all year.
 *
 * A workout's number is its place among the member's workouts in the order they were done
 * (start time, then id — the same order History uses), so it never changes when the app is
 * reopened, and an import that adds older workouts moves later numbers the way a member would
 * count them. The demo's workouts are never counted, and a demo workout has no number.
 */
import { getDb } from '@/db';
import { fmtInt } from '@/lib/format';
import { demoSessionIds } from '@/onboarding/db/dataActions';

const FIXED = [1, 10, 25, 50, 100, 250, 500, 750, 1000] as const;

/** The numbers worth a line: 1, 10, 25, 50, 100, 250, 500, 750, 1,000, then every 500. PURE. */
export function isMilestone(n: number): boolean {
  if (!Number.isInteger(n) || n < 1) return false;
  return (FIXED as readonly number[]).includes(n) || (n > 1000 && n % 500 === 0);
}

/** "1st", "2nd", "3rd", "11th", "1,000th". PURE. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${fmtInt(n)}${suffix}`;
}

/** "Your first workout" / "Your 100th workout", or null when the number is not a milestone. PURE. */
export function milestoneText(n: number | null): string | null {
  if (n == null || !isMilestone(n)) return null;
  return n === 1 ? 'Your first workout' : `Your ${ordinal(n)} workout`;
}

/** The workout's number among the member's own workouts (null: not found, or the demo's). */
export async function workoutNumber(sessionId: string): Promise<number | null> {
  const db = getDb();
  const me = await db.getFirstAsync<{ started_at: number }>('SELECT started_at FROM workout_sessions WHERE id = ?', [sessionId]);
  if (!me) return null;
  const demo = await demoSessionIds().catch(() => new Set<string>());
  if (demo.has(sessionId)) return null;
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM workout_sessions WHERE started_at < ? OR (started_at = ? AND id <= ?)',
    [me.started_at, me.started_at, sessionId],
  );
  return rows.filter((r) => !demo.has(r.id)).length;
}

/** The milestone line for a workout, or null. Never throws (the summary must always show). */
export async function workoutMilestone(sessionId: string): Promise<string | null> {
  try {
    return milestoneText(await workoutNumber(sessionId));
  } catch {
    return null;
  }
}
