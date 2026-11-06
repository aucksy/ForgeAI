/**
 * Billing step 3 (docs/overhaul/BILLING-DESIGN.md; server: supabase/migrations/0063_gym_checkout.sql, NOT
 * APPLIED): the owner buys a MettleUp plan online, gets a numbered receipt for every payment, and sees a
 * reminder on Today in the last 7 days of the paid plan.
 *
 * The SERVER works out every amount (hq_billing_checkout_start); the browser never sends a price. The
 * prices shown here come from the one price list (packages/theme/src/plans.ts).
 *
 * PURE: no React, no network.
 */

import { PACK_PRICES, RECEIPT_GST_LINE } from '@forgeai/theme';

import { formatINR, type Paise } from './money';
import { payDate } from './payMettleUp';

export type BuyPlan = 'starter' | 'pro';
export type BuyBilling = 'monthly' | 'yearly' | 'lifetime';
export type PaymentKind = 'renew' | 'founding' | 'upgrade';

export interface ReceiptLine {
  receiptNo: string;
  issuedAt: string;
  amountPaise: Paise;
  planName: string;
  billing: string;
  kind: PaymentKind;
}

/** owner_billing's answer (0063). */
export interface BillingInfo {
  /** The server's switch: false = no "Pay online" and no reminder. */
  checkoutOn: boolean;
  plan: string | null;
  billing: string | null;
  paidUntil: string | null;
  trialEndsAt: string | null;
  /** India days left of the paid time (ending tonight = 1; 0 = over); null for lifetime or never paid. */
  daysLeft: number | null;
  /** A cheaper plan bought while the dearer one is still paid for: it starts on `from`. */
  scheduled: { plan: string; from: string } | null;
  /** Starter with paid days left: what moving to Pro now costs. */
  upgrade: { amountPaise: Paise; daysLeft: number } | null;
  founding: { open: boolean; left: number };
  /** Newest first. */
  receipts: ReceiptLine[];
}

/** owner_receipt's answer (0063). */
export interface Receipt {
  receiptNo: string;
  issuedAt: string;
  business: string;
  /** From the server's settings row; null when not filled in (never typed in this code). */
  legalName: string | null;
  address: string | null;
  gymName: string;
  gymCode: string;
  planName: string;
  billing: string;
  kind: PaymentKind;
  periodFrom: string | null;
  periodTo: string | null;
  amountPaise: Paise;
  paidVia: string;
  reference: string;
  gstLine: string;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const iso = (v: unknown): string | null => (typeof v === 'string' && v && !Number.isNaN(Date.parse(v)) ? v : null);
const paise = (v: unknown): Paise => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
const obj = (v: unknown): Row | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null);
const kindOf = (v: unknown): PaymentKind => (v === 'founding' || v === 'upgrade' ? v : 'renew');

/** One line of the receipts list; null for a row we cannot read. PURE. */
export function receiptLineFromRow(raw: unknown): ReceiptLine | null {
  const r = obj(raw);
  if (!r) return null;
  const receiptNo = str(r.receiptNo);
  const issuedAt = iso(r.issuedAt);
  if (!/^MU-\d{4}-\d{4,7}$/.test(receiptNo) || !issuedAt) return null;
  return { receiptNo, issuedAt, amountPaise: paise(r.amountPaise), planName: str(r.planName), billing: str(r.billing), kind: kindOf(r.kind) };
}

/** owner_billing's answer, checked field by field. PURE. */
export function billingFromRow(raw: unknown): BillingInfo {
  const r = obj(raw) ?? {};
  const sch = obj(r.scheduled);
  const up = obj(r.upgrade);
  const fd = obj(r.founding);
  const upAmount = up ? paise(up.amountPaise) : 0;
  const upDays = up ? int(up.daysLeft) : null;
  const schFrom = sch ? iso(sch.from) : null;
  return {
    checkoutOn: r.checkoutOn === true,
    plan: str(r.plan) || null,
    billing: str(r.billing) || null,
    paidUntil: iso(r.paidUntil),
    trialEndsAt: iso(r.trialEndsAt),
    daysLeft: int(r.daysLeft),
    scheduled: sch && schFrom && str(sch.plan) ? { plan: str(sch.plan), from: schFrom } : null,
    upgrade: upAmount > 0 && upDays !== null && upDays > 0 ? { amountPaise: upAmount, daysLeft: upDays } : null,
    founding: { open: fd?.open === true, left: Math.max(0, int(fd?.left) ?? 0) },
    receipts: (Array.isArray(r.receipts) ? r.receipts : []).map(receiptLineFromRow).filter((x): x is ReceiptLine => x !== null),
  };
}

/** owner_receipt's answer; null when it is not a receipt. PURE. */
export function receiptFromRow(raw: unknown): Receipt | null {
  const r = obj(raw);
  if (!r) return null;
  const receiptNo = str(r.receiptNo);
  const issuedAt = iso(r.issuedAt);
  if (!/^MU-\d{4}-\d{4,7}$/.test(receiptNo) || !issuedAt) return null;
  return {
    receiptNo,
    issuedAt,
    business: str(r.business) || 'MettleUp',
    legalName: str(r.legalName) || null,
    address: str(r.address) || null,
    gymName: str(r.gymName),
    gymCode: str(r.gymCode),
    planName: str(r.planName),
    billing: str(r.billing),
    kind: kindOf(r.kind),
    periodFrom: iso(r.periodFrom),
    periodTo: iso(r.periodTo),
    amountPaise: paise(r.amountPaise),
    paidVia: str(r.paidVia),
    reference: str(r.reference),
    // The server's own line; the same words if an old answer had none.
    gstLine: str(r.gstLine) || RECEIPT_GST_LINE,
  };
}

// ---------------------------------------------------------------- words

/** "Pro, 1 month · ₹1,499" for a buy button. PURE. */
export function buyLabel(plan: BuyPlan, billing: 'monthly' | 'yearly'): string {
  const name = plan === 'pro' ? 'Pro' : 'Starter';
  const rupees = PACK_PRICES[plan][billing] * 100;
  return `${name}, ${billing === 'yearly' ? '1 year' : '1 month'} · ${formatINR(rupees)}`;
}

/** "Move to Pro now · ₹250 for 15 days". PURE. */
export function upgradeLabel(u: { amountPaise: Paise; daysLeft: number }): string {
  return `Move to Pro now · ${formatINR(u.amountPaise)} for ${u.daysLeft} ${u.daysLeft === 1 ? 'day' : 'days'}`;
}

/** The line under the upgrade button. PURE. */
export const UPGRADE_NOTE = 'You pay only the difference for the days left. Your plan end date stays the same.';

/** A planned move to a cheaper plan, in words; null when none. PURE. */
export function scheduledLine(info: BillingInfo): string | null {
  if (!info.scheduled) return null;
  const name = info.scheduled.plan === 'starter' ? 'Starter' : info.scheduled.plan === 'pro' ? 'Pro' : info.scheduled.plan;
  return `${name} starts when your paid Pro days end on ${payDate(info.scheduled.from)}. No money back for the days left.`;
}

/** The line that explains a downgrade before the owner buys Starter while on Pro. PURE. */
export function downgradeNote(info: BillingInfo): string | null {
  if (!((info.plan === 'pro' || info.plan === 'ai') && (info.daysLeft ?? 0) > 0 && info.paidUntil)) return null;
  return `Buying Starter now? It starts when your paid Pro days end on ${payDate(info.paidUntil)}. No money back for the days left.`;
}

/**
 * Should Today show the plan-end reminder? Only with the switch on, from 7 days before the plan ends.
 * daysLeft counts today too (ending tonight = 1), so 7 days before is daysLeft 8. PURE.
 */
export function showReminder(info: BillingInfo | null): boolean {
  return !!info && info.checkoutOn && info.daysLeft !== null && info.daysLeft >= 1 && info.daysLeft <= 8;
}

/** The plan-end reminder's words (the "Pay now" link sits next to them); null when not shown. PURE. */
export function reminderText(info: BillingInfo | null): string | null {
  if (!showReminder(info) || !info || info.daysLeft === null) return null;
  if (info.daysLeft === 1) return 'Your MettleUp plan ends tonight.';
  const on = info.paidUntil ? `, on ${payDate(info.paidUntil)}` : '';
  if (info.daysLeft === 2) return `Your MettleUp plan ends tomorrow${on}.`;
  return `Your MettleUp plan ends in ${info.daysLeft - 1} days${on}.`;
}

const CHECKOUT_WORDS: Readonly<Record<string, string>> = {
  NOT_SET_UP: 'Paying online is not switched on yet. You can still pay by UPI or bank transfer below.',
  NOT_OPEN: 'Paying online is not switched on yet. You can still pay by UPI or bank transfer below.',
  LIFETIME: 'Your gym already has Pro for life. There is nothing more to pay.',
  FOUNDING_CLOSED: 'The founding offer has ended.',
  FOUNDING_FULL: 'All founding places are taken.',
  BAD_PLAN: 'That plan cannot be bought here.',
  BAD_DATE: 'Your plan is already paid far ahead. You cannot pay for more yet.',
  TOO_MANY: 'Too many tries today. Try again tomorrow, or message MettleUp.',
  OWNER_ONLY: 'Only the gym owner can pay MettleUp.',
  BAD_KEY: 'Your sign-in has ended. Sign in again, then try.',
  LINK_REFUSED: 'The payment page could not be opened. Try again in a minute.',
  UNREACHABLE: 'Could not reach the payment company. Check the internet and try again.',
};

/** Plain words for a refused checkout. PURE. */
export function checkoutErrorWords(code: string | null | undefined): string {
  return CHECKOUT_WORDS[code ?? ''] ?? 'Could not open the payment page. Check the internet and try again.';
}

/** "Pro, 1 month" / "Pro for life" / "Pro, from Starter" for a receipt or a list line. PURE. */
export function receiptPlanText(r: { planName: string; billing: string; kind: PaymentKind }): string {
  if (r.kind === 'founding' || r.billing === 'lifetime') return `${r.planName || 'Pro'} for life`;
  if (r.kind === 'upgrade') return `${r.planName || 'Pro'}, moved up from Starter`;
  if (r.billing === 'yearly') return `${r.planName}, 1 year`;
  if (r.billing === 'monthly') return `${r.planName}, 1 month`;
  return r.planName;
}

/** "6 Nov 2026 to 6 Dec 2026", "From 6 Nov 2026, for life". PURE. */
export function receiptPeriod(r: Pick<Receipt, 'periodFrom' | 'periodTo' | 'kind' | 'billing'>): string {
  const from = r.periodFrom ? payDate(r.periodFrom) : null;
  if (r.kind === 'founding' || r.billing === 'lifetime') return from ? `From ${from}, for life` : 'For life';
  const to = r.periodTo ? payDate(r.periodTo) : null;
  if (from && to) return `${from} to ${to}`;
  return to ? `Until ${to}` : from ?? '';
}

/** The route of one receipt. PURE. */
export function receiptPath(receiptNo: string): string {
  return `/settings/mettleup/receipt/${encodeURIComponent(receiptNo)}`;
}
