/**
 * Launch audit, 3 Nov 2026 (member app idea "plan-ends banner on the Workout tab"): a gym member whose
 * plan ends within a week sees one small card on the Workout tab, "Your plan ends on Friday. Renew at
 * the front desk." Only when the gym's own records are known on this phone (the "My membership" answer
 * kept by MembershipCard, membershipKept.ts) and no renewal is already on record (`next`).
 * The window is membership.ts RENEW_SOON_DAYS (7), the same one the Gym tab's card turns amber in.
 * PURE.
 */
import { dayName, daysBetween, tinyDate } from '@/lib/date';

import { RENEW_SOON_DAYS, type MembershipAnswer } from './membership';

/** Days from `today` to the plan's end, when the card should show; null otherwise. PURE. */
export function planEndsInDays(a: MembershipAnswer | null | undefined, today: string): number | null {
  if (!a || !a.ok || !a.current || a.next) return null;
  const left = daysBetween(today, a.current.endsOn);
  if (!Number.isFinite(left) || left < 0 || left > RENEW_SOON_DAYS) return null;
  return left;
}

/**
 * "Your plan ends today." / "... tomorrow." / "... on Friday, 6 Nov." (a fresh reader asked "which
 * Friday?", so the date always comes with the day). PURE.
 */
export function planEndsWords(endsOn: string, left: number): string {
  const when = left <= 0 ? 'today' : left === 1 ? 'tomorrow' : `on ${dayName(endsOn)}, ${tinyDate(endsOn)}`;
  return `Your plan ends ${when}. Renew at the front desk.`;
}
