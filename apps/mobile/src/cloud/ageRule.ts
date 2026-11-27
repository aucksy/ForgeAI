/**
 * R-630 (No Gaps, design note docs/designs/R-630.md section 3a-3c): the age rule. PURE.
 *
 * The member types an age, not a birthday. The phone keeps the age AND the moment it was typed, and the age grows by
 * one on each anniversary of that day, counted in India's calendar. It never grows early: a member counts as 18 only
 * a full year after typing 17 (at most a year late, which is the safe side for a 18+ product). An old phone that
 * never kept the moment counts from now (also the safe side). An unknown age (null or 0) is not blocked.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The India calendar day of `ms` as [year, month 1-12, day]. */
function istDay(ms: number): [number, number, number] {
  const d = new Date(ms + IST_OFFSET_MS);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

/** The age now: the typed age plus the full years since the day it was typed. null = unknown. */
export function ageNow(typedAge: number | null | undefined, typedAtMs: number | null | undefined, nowMs: number): number | null {
  if (typeof typedAge !== 'number' || !Number.isFinite(typedAge) || typedAge <= 0) return null;
  if (typeof typedAtMs !== 'number' || !Number.isFinite(typedAtMs) || typedAtMs > nowMs) return Math.floor(typedAge);
  const [y0, m0, d0] = istDay(typedAtMs);
  const [y1, m1, d1] = istDay(nowMs);
  let years = y1 - y0;
  if (m1 < m0 || (m1 === m0 && d1 < d0)) years -= 1;
  return Math.floor(typedAge) + Math.max(0, years);
}

export const MIN_AGE = 18;

/** True only for a known age under 18. */
export function isUnder18(typedAge: number | null | undefined, typedAtMs: number | null | undefined, nowMs: number): boolean {
  const a = ageNow(typedAge, typedAtMs, nowMs);
  return a !== null && a < MIN_AGE;
}

/**
 * Must the sheet ask before this age is saved? Only for a known age under 18, and only when the member has not
 * already confirmed one (an under-18 delete job exists). The age is typed today, so no growth applies. PURE.
 */
export function ageNeedsAsk(newAge: number | null | undefined, alreadyConfirmed: boolean): boolean {
  return typeof newAge === 'number' && newAge > 0 && newAge < MIN_AGE && !alreadyConfirmed;
}

/** Where the under-18 delete stands, for the backup line. */
export type Under18DeleteState = 'pending' | 'offline' | 'signInNeeded' | 'deleted' | 'failed';

/**
 * The backup line for each state. "Deleted" only once the server confirmed it. Words need the owner's yes before
 * release (R-630 HIM question 3).
 */
export function under18DeleteWords(s: Under18DeleteState): string {
  switch (s) {
    case 'deleted':
      return 'Deleted. MettleUp no longer keeps your workouts or account. Your gym still keeps its own member record of you. Your workouts are only on this phone.';
    case 'offline':
      return 'Waiting for internet to delete your saved copy.';
    case 'signInNeeded':
      return 'Sign in once to delete your saved copy.';
    case 'failed':
      return "We couldn't delete your saved copy yet. We will try again the next time you open the app.";
    case 'pending':
    default:
      return 'Deleting your saved copy on MettleUp’s server…';
  }
}
