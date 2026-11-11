/**
 * "1 member", "2 members" — a count with its word (UAT U-A8, 17 Oct 2026). PURE.
 *
 * The Members page, the Today "Fees due" tile and Settings' data line said "1 members" and
 * "1 payments" for a gym with one of them, which is the first thing a new owner sees.
 */
export function countOf(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Settings → Sign-in & data, "Your gym’s records" (R-449, R-447 fresh eyes): "0 members · 0 memberships" read as
 * two words for the same thing. A membership is a plan sold to a member (a renewal is another one), so it says
 * "memberships sold", the word of the "Sell membership" button (fresh eyes: owners say "membership"). PURE.
 */
export function recordsLine(c: { members: number; memberships: number; payments: number; visits: number }): string {
  return `${countOf(c.members, 'member')} · ${countOf(c.memberships, 'membership sold', 'memberships sold')} (new and renewals) · ${countOf(c.payments, 'payment')} · ${countOf(c.visits, 'check-in')}.`;
}
