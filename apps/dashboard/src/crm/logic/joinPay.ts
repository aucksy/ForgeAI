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

/**
 * Payment sweep (R-542): is this payment real money the gym may count? A test-mode payment is not: the payment company's
 * test page lets ANYONE "pay" with a test card or a "Success" button, so it never becomes a receipt, anywhere (Approve,
 * the desk's payment link, the receipts sweep). PURE.
 */
export function isRealMoney(p: { testMode: boolean }): boolean {
  return p.testMode !== true;
}

/**
 * What Approve must ask first, or null to go ahead: a plain UPI payment nobody confirmed ("I have paid"), or a payment
 * that is not the amount the plan costs. Amounts in paise. PURE.
 */
export function approveQuestion(s: JoinPayState): { kind: 'bank' | 'amount'; paidP: number; askedP: number } | null {
  if (s.kind === 'said') return { kind: 'bank', paidP: s.pay.amountP, askedP: s.pay.amountP };
  if (s.kind === 'paid' && isRealMoney(s.pay) && (s.pay.paidP || s.pay.amountP) !== s.pay.amountP) {
    return { kind: 'amount', paidP: s.pay.paidP, askedP: s.pay.amountP };
  }
  return null;
}

/**
 * Payment sweep (R-542): a join payment the server says is paid with no receipt yet, as the receipts sweep sees it:
 *   waiting  its request is still on Today's "Joined online": Approve makes the receipt (nothing to do here)
 *   saved    a receipt for this payment already exists (an Approve that stopped before telling the server): tell it
 *   stuck    nobody approved it (the request was closed, removed or made a member another way, or a second payment
 *            landed on the same request): the desk must see it, or the gym holds money with no receipt.
 * PURE.
 */
export type JoinLeftover = { kind: 'waiting' } | { kind: 'saved'; receiptNo: string } | { kind: 'stuck'; why: 'TEST_MODE' | 'JOIN_NOT_APPROVED' };

export function joinLeftover(
  p: Pick<JoinPay, 'id' | 'ref' | 'testMode'>,
  waitingIds: ReadonlySet<string>,
  payments: readonly { requestId?: string | null; receiptNo: string }[],
): JoinLeftover {
  const saved = payments.find((x) => x.requestId === `pay-${p.id}`);
  if (saved) return { kind: 'saved', receiptNo: saved.receiptNo };
  if (waitingIds.has(p.ref)) return { kind: 'waiting' };
  return { kind: 'stuck', why: isRealMoney(p) ? 'JOIN_NOT_APPROVED' : 'TEST_MODE' };
}

/**
 * Review round 2 (R-542): the join payments still open for this request. "Make member" closes each first (the server
 * asks the company, keeps a payment just made, and cancels the link there), so nobody pays online after paying at the
 * desk. PURE.
 */
export function openJoinPays(enquiryId: string, pays: readonly JoinPay[] | null | undefined): JoinPay[] {
  return (pays ?? []).filter((p) => p.kind === 'join' && p.ref === enquiryId && p.status === 'open');
}

/** After closing them: did one turn out paid a moment ago? Then it is Approve, never Make member. PURE. */
export function paidWhileClosing(closed: readonly ({ status?: string } | null | undefined)[]): boolean {
  return closed.some((r) => r?.status === 'paid');
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
  // Payment sweep (R-542): a TEST-mode payment is never money. Anyone can "pay" a test link with a test card, so
  // Approve makes the member and the plan with nothing collected (the whole fee stays due, to pay at the desk).
  const real = isRealMoney(o.pay);
  return {
    memberId: o.memberId,
    planId,
    startsOn: sellStartFor(o.join, o.today) ?? o.today,
    priceP: o.join.priceP,
    joiningFeeP: o.join.joiningFeeP,
    notes: real ? 'Joined online, paid online' : 'Joined online, paid in test mode (no real money, nothing collected)',
    collectNowP: real ? Math.min(paid, due) : 0,
    method,
    reference: reference || null,
    paidOn: joinPaidDay(o.pay.paidAt, o.today),
    soldBy: o.taker.id,
    soldByName: o.taker.name,
    // The same payment can never make two receipts (the store's C7-1 rule), however many times Approve is tapped.
    requestId: `pay-${o.pay.id}`,
  };
}
