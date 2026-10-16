/**
 * What makes a receipt acceptable — PURE (UAT work package 3, 17 Oct 2026; Audit/uat/MONEY-ACCESS.md).
 *
 * One home for the receipt rules, so the sheets (what the person sees), the data layer (local.ts,
 * which the online store runs too) and the server (supabase/migrations/0021_receipt_rules.sql) say
 * the same thing. The server is the last word; these give the plain words first.
 *
 *  - F-02: no receipt is dated in the future, for anyone. The front desk may date one at most
 *    31 days back (the same rule as a desk sale, 0018).
 *  - F-01: a receipt is never more than its membership still owes.
 *  - F-04: an amount is whole paise above zero.
 *  - F-07: a price or joining fee is whole paise, zero or more.
 *  - F-08: a receipt belongs to a membership of the same member.
 *  - F-06: a cancel says why, in at least 3 letters.
 *  - F-11: a receipt number is at most 16 letters, digits, "-" or "/" (GST Rule 46).
 */

import { addDays, type DateISO } from './dates';
import { formatINR, type Paise } from './money';

/** The front desk may date a receipt (or start a plan) at most this many days back. */
export const DESK_BACKDATE_DAYS = 31;

/** A cancel reason shorter than this is not a reason anyone can act on months later. */
export const MIN_VOID_REASON = 3;

/** GST Rule 46: a receipt (invoice) number is at most 16 characters. */
export const MAX_RECEIPT_NO = 16;

export type Role = 'owner' | 'staff';

/** True for a whole number of paise, zero or more. */
export function isWholePaise(n: unknown): n is Paise {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

/** Words for an amount that is not whole paise above zero, or null when it is fine. */
export function receiptAmountProblem(amountP: unknown): string | null {
  if (!isWholePaise(amountP) || amountP <= 0) {
    return 'Type an amount more than zero, with at most two digits after the point.';
  }
  return null;
}

/** Words for a price or fee that is not whole paise (zero is fine), or null. */
export function priceProblem(p: unknown, what: 'price' | 'joining fee'): string | null {
  if (p === null || p === undefined) return what === 'price' ? `Type the ${what}.` : null;
  if (!isWholePaise(p)) return `The ${what} must be zero or more, with at most two digits after the point.`;
  return null;
}

/**
 * Words for a payment date that is not allowed, or null. `today` is India's day (dates.todayISO).
 * The date must already be a real day (local.ts checks that first).
 */
export function receiptDateProblem(paidOn: DateISO, today: DateISO, role: Role): string | null {
  if (paidOn > today) return 'The payment date can’t be in the future.';
  if (role === 'staff' && paidOn < addDays(today, -DESK_BACKDATE_DAYS)) {
    return `The front desk can date a payment at most ${DESK_BACKDATE_DAYS} days back. Ask the owner to enter older payments.`;
  }
  return null;
}

/** Words for a receipt bigger than what its membership still owes, or null. */
export function overDueProblem(amountP: Paise, unpaidP: Paise): string | null {
  if (amountP <= unpaidP) return null;
  if (unpaidP <= 0) return 'This membership is fully paid. Nothing is due on it.';
  return `That is more than the ${formatINR(unpaidP)} due on this membership.`;
}

/** Words for a cancel reason that is too short, or null. */
export function voidReasonProblem(reason: string | null | undefined): string | null {
  if ((reason ?? '').trim().length < MIN_VOID_REASON) {
    return 'Write why this receipt is cancelled (at least 3 letters), so it is clear later.';
  }
  return null;
}

/** True when a receipt number fits GST Rule 46. */
export function fitsRule46(receiptNo: string): boolean {
  return new RegExp(`^[A-Za-z0-9/-]{1,${MAX_RECEIPT_NO}}$`).test(receiptNo);
}
