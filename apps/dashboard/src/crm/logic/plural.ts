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

/**
 * Money → Dues (R-450, R-449 fresh eyes): the age-group tiles and each person's line said "3 memberships", a bare
 * number beside an amount. What it counts is memberships sold (R-449's word) that still have money due, so it says
 * so: "3 memberships not fully paid". PURE.
 */
export function unpaidMemberships(n: number): string {
  return countOf(n, 'membership not fully paid', 'memberships not fully paid');
}
