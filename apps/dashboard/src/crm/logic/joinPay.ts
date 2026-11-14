/**
 * R-528 (14 Nov 2026): a person who joined online and paid on the join page. The money went straight to the gym's own
 * payment company (or its UPI ID) through F79 (deploy/panel/joinPay.js); the server lists those payments by the
 * request's enquiry id (/api/pay/joins). Today's "Joined online" then says, for each request:
 *   paid     the payment company confirmed it              -> "Approve": member + plan + receipt in one tap
 *   said     a plain UPI payment the person says they made -> "Check your bank before approving", then "Approve"
 *   failed   they tried and it did not go through          -> "Not paid", "Make member" as before (they pay at the desk)
 *   started  they opened the payment and did not finish    -> "Not paid", the same
 *   desk     they chose to pay at the desk (or no online pay) -> as before
 * No member is ever made without the desk's tap, so a payment that fails or is refunded never leaves a member behind.
 *
 * F210 hook (R-524, the trial is NOT built): a small trial fee paid online is a payment like this one; at Approve it
 * is taken off the plan by `collectNowP` being what was really paid (the rest stays due on the plan).
 *
 * PURE (no screen code, no storage).
 */

import type { SellMembershipInput } from '../data/adapter';
import type { JoinPay } from '../pay/payApi';
import type { DateISO, EnquirySelfJoin, PaymentMethod, Plan } from '../types';
import { dateISOFromEpoch } from './dates';
import { sellPlanFor, sellStartFor } from './selfJoin';

export type JoinPayState =
  | { kind: 'paid'; pay: JoinPay }
  | { kind: 'said'; pay: JoinPay }
  | { kind: 'failed'; pay: JoinPay }
  | { kind: 'started'; pay: JoinPay }
  | { kind: 'desk' };

/** Where this request's payment stands. A payment that was closed by the server (no way to pay) reads as desk. PURE. */
export function joinPayFor(enquiryId: string, pays: readonly JoinPay[] | null | undefined): JoinPayState {
  const mine = (pays ?? []).filter((p) => p.kind === 'join' && p.ref === enquiryId);
  const paid = mine.find((p) => p.status === 'paid');
  if (paid) return { kind: 'paid', pay: paid };
  const said = mine.find((p) => p.status === 'open' && p.said && !p.provider);
  if (said) return { kind: 'said', pay: said };
  const open = mine.find((p) => p.status === 'open');
  if (open) return open.failed ? { kind: 'failed', pay: open } : { kind: 'started', pay: open };
  const ranOut = mine.find((p) => p.status === 'expired');
  if (ranOut) return { kind: 'started', pay: ranOut };
  return { kind: 'desk' };
}

/** Can the desk approve in one tap (the money is in, or the person says it is)? PURE. */
export function canApprove(s: JoinPayState): s is { kind: 'paid' | 'said'; pay: JoinPay } {
  return s.kind === 'paid' || s.kind === 'said';
}

/** The receipt's date: the day it was paid (India time), never later than today. PURE. */
export function joinPaidDay(paidAt: string | null, today: DateISO): DateISO {
  const ms = paidAt ? Date.parse(paidAt) : NaN;
  const day = Number.isFinite(ms) ? dateISOFromEpoch(ms) : '';
  return day && day <= today ? day : today;
}

/**
 * The sale Approve makes: the plan and start day they picked, the prices the gym server read when they sent it, and
 * what was really paid collected now, with the company's payment id as the reference. null = the gym no longer
 * sells that plan (the desk uses "Make member" and picks one). PURE.
 */
export function approveSale(o: {
  memberId: string;
  join: EnquirySelfJoin;
  pay: JoinPay;
  plans: readonly Plan[];
  today: DateISO;
  taker: { id: string | null; name: string | null };
}): SellMembershipInput | null {
  const planId = sellPlanFor(o.join, o.plans);
  if (!planId) return null;
  const due = o.join.priceP + o.join.joiningFeeP;
  const paid = o.pay.paidP || o.pay.amountP;
  const method: PaymentMethod = o.pay.method ?? 'upi';
  const reference = [o.pay.providerName, o.pay.paymentId].filter(Boolean).join(' ').slice(0, 60);
  return {
    memberId: o.memberId,
    planId,
    startsOn: sellStartFor(o.join, o.today) ?? o.today,
    priceP: o.join.priceP,
    joiningFeeP: o.join.joiningFeeP,
    notes: o.pay.testMode ? 'Joined online, paid online (test mode)' : 'Joined online, paid online',
    collectNowP: Math.min(paid, due),
    method,
    reference: reference || null,
    paidOn: joinPaidDay(o.pay.paidAt, o.today),
    soldBy: o.taker.id,
    soldByName: o.taker.name,
    // The same payment can never make two receipts (the store's C7-1 rule), however many times Approve is tapped.
    requestId: `pay-${o.pay.id}`,
  };
}
