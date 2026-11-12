/**
 * T79 "Pay MettleUp" (owner R-380/R-381, 6 Nov 2026; server: supabase/migrations/0060_pay_mettleup.sql,
 * NOT APPLIED). The gym owner pays MettleUp for a plan from Settings -> Pay MettleUp: picks Starter or Pro,
 * monthly or yearly, pays by UPI (a QR code made in this browser, or a tap on a phone) or bank transfer,
 * then sends the reference number (UTR) and the amount. MettleUp checks it against the bank in HQ and
 * confirms it (the plan is then paid until a date) or says why not.
 *
 * MettleUp's own UPI ID and bank account are NEVER in this code (the repository is public): the server
 * sends them only to a signed-in gym owner (owner_pay_mettleup). With none saved, the screen says payment
 * is not available yet and shows no QR code.
 *
 * PURE: no React, no network.
 */

import { PACK_PRICES, packName } from '@forgeai/theme';

import { formatINR, rupeesToPaise, type Paise } from './money';
import { upiPayLink, validUpiId } from './upiPay';

export type PayPlan = 'starter' | 'pro';
export type PayBilling = 'monthly' | 'yearly';
export type PayMethod = 'upi' | 'bank';
export type PayStatus = 'pending' | 'confirmed' | 'rejected';

/**
 * The approved prices for ONE branch, in paise. Billing step 1 (R-385): read from the one price list,
 * packages/theme/src/plans.ts (PACK_PRICES); never typed here. The server keeps the same list (0060
 * _mettleup_price) and a test checks they agree (test/crm/pricesOneSource.test.ts). Only Starter and Pro
 * are sold; the retired 'ai' pack is never offered (the AI Assistant is sold as credits instead, F201).
 */
const paiseOf = (p: PayPlan): Readonly<Record<PayBilling, Paise>> => ({
  monthly: rupeesToPaise(PACK_PRICES[p].monthly),
  yearly: rupeesToPaise(PACK_PRICES[p].yearly),
});
export const PRICES: Readonly<Record<PayPlan, Readonly<Record<PayBilling, Paise>>>> = {
  starter: paiseOf('starter'),
  pro: paiseOf('pro'),
};

export const PLAN_NAMES: Readonly<Record<PayPlan, string>> = { starter: 'Starter', pro: 'Pro' };

/** MettleUp's payment details, as the server sent them to the owner. */
export interface PayTo {
  /** A usable UPI ID, or null (bank transfer only). */
  upiId: string | null;
  payeeName: string;
  /** Bank transfer (NEFT): all three, or none. */
  bank: { accountName: string; accountNumber: string; ifsc: string; bankName: string | null } | null;
}

export interface MettleUpPayment {
  id: string;
  plan: PayPlan;
  billing: PayBilling;
  pricePaise: Paise;
  amountPaise: Paise;
  reference: string;
  method: PayMethod;
  status: PayStatus;
  reportedAt: string;
  decidedAt: string | null;
  rejectReason: string | null;
  paidUntil: string | null;
}

export interface PayOverview {
  payTo: PayTo | null;
  gymName: string;
  /** The gym's short code (its join code): goes in the UPI note so MettleUp knows who paid. */
  gymCode: string;
  plan: string | null;
  billing: string | null;
  paidUntil: string | null;
  trialEndsAt: string | null;
  /** Newest first. */
  payments: MettleUpPayment[];
}

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const iso = (v: unknown): string | null => (typeof v === 'string' && v && !Number.isNaN(Date.parse(v)) ? v : null);
const paise = (v: unknown): Paise => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** The price of a plan; null for anything not on sale here. PURE. */
export function priceOf(plan: string, billing: string): Paise | null {
  const p = (PRICES as Record<string, Record<string, Paise> | undefined>)[plan];
  return p?.[billing] ?? null;
}

/** MettleUp's details as the server sent them; null when there is nothing usable (no UPI, no full bank account). PURE. */
export function payToFromRow(raw: unknown): PayTo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Row;
  const upiId = validUpiId(str(r.upiId));
  const accountNumber = str(r.accountNumber).replace(/\s+/g, '');
  const ifsc = str(r.ifsc).toUpperCase();
  const accountName = str(r.accountName);
  const bank =
    /^\d{6,20}$/.test(accountNumber) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc) && accountName
      ? { accountName, accountNumber, ifsc, bankName: str(r.bankName) || null }
      : null;
  if (!upiId && !bank) return null;
  return { upiId, payeeName: str(r.payeeName) || accountName || 'MettleUp', bank };
}

/** One payment as the server sent it; null for a row we cannot read. PURE. */
export function paymentFromRow(raw: unknown): MettleUpPayment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Row;
  const plan = r.plan === 'starter' || r.plan === 'pro' ? r.plan : null;
  const billing = r.billing === 'monthly' || r.billing === 'yearly' ? r.billing : null;
  const status = r.status === 'pending' || r.status === 'confirmed' || r.status === 'rejected' ? r.status : null;
  const reportedAt = iso(r.reportedAt);
  if (!str(r.id) || !plan || !billing || !status || !reportedAt) return null;
  return {
    id: str(r.id),
    plan,
    billing,
    pricePaise: paise(r.pricePaise),
    amountPaise: paise(r.amountPaise),
    reference: str(r.reference),
    method: r.method === 'bank' ? 'bank' : 'upi',
    status,
    reportedAt,
    decidedAt: iso(r.decidedAt),
    rejectReason: str(r.rejectReason) || null,
    paidUntil: iso(r.paidUntil),
  };
}

/** owner_pay_mettleup's answer, checked field by field. PURE. */
export function overviewFromRow(raw: unknown): PayOverview {
  const r = raw && typeof raw === 'object' ? (raw as Row) : {};
  const payments = (Array.isArray(r.payments) ? r.payments : [])
    .map(paymentFromRow)
    .filter((p): p is MettleUpPayment => p !== null);
  return {
    payTo: payToFromRow(r.payTo),
    gymName: str(r.gymName),
    gymCode: str(r.gymCode),
    plan: str(r.plan) || null,
    billing: str(r.billing) || null,
    paidUntil: iso(r.paidUntil),
    trialEndsAt: iso(r.trialEndsAt),
    payments,
  };
}

/**
 * The UPI link for the QR code and the "Pay with a UPI app" button:
 * upi://pay?pa=<id>&pn=<name>&am=<amount>&cu=INR&tn=MettleUp <gym code>. Null without a UPI ID. PURE.
 */
export function mettleUpUpiLink(payTo: PayTo | null, amountP: Paise, gymCode: string): string | null {
  if (!payTo?.upiId || !(amountP > 0)) return null;
  const code = gymCode.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  return upiPayLink({ upiId: payTo.upiId, payee: payTo.payeeName, amountP, note: code ? `MettleUp ${code}` : 'MettleUp' });
}

/** The reference as the server keeps it: capitals, no spaces or dashes. PURE. */
export function cleanReference(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

/** What is wrong with a typed reference, in words; null when it is fine. PURE. */
export function referenceError(raw: string, method: PayMethod): string | null {
  const v = cleanReference(raw);
  if (!v) return method === 'upi' ? 'Type the UPI reference number (UTR) from your UPI app.' : 'Type the bank’s reference number (UTR).';
  if (!/^[A-Z0-9]+$/.test(v)) return 'A reference number has only letters and numbers.';
  if (v.length < 6 || v.length > 30) {
    return method === 'upi'
      ? 'A UPI reference number is usually 12 digits. Copy it from the payment in your UPI app.'
      : 'A bank reference number (UTR) is usually 16 to 22 letters and numbers.';
  }
  return null;
}

/** "1499" or "1,499.50" typed as rupees -> paise; null when it is not an amount. PURE. */
export function amountFromText(raw: string): Paise | null {
  const v = raw.replace(/[₹,\s]/g, '');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return null;
  const p = Math.round(Number(v) * 100);
  return p >= 100 ? p : null;
}

/** "1499" for the amount box (no decimals when whole). PURE. */
export function amountText(p: Paise): string {
  return p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2);
}

/** "6 Dec 2026" in India time. PURE. */
export function payDate(at: string): string {
  return new Date(at).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Pro, monthly". The retired 'ai' pack reads "Pro" (it is treated as Pro). PURE. */
export function planLabel(plan: string, billing: string | null): string {
  const name = packName(plan) || plan;
  return billing === 'monthly' || billing === 'yearly' || billing === 'lifetime' ? `${name}, ${billing}` : name;
}

export type StatusTone = 'waiting' | 'good' | 'bad';

/** One payment's line on the owner's screen. PURE. */
export function paymentStatus(p: MettleUpPayment): { tone: StatusTone; title: string; text: string } {
  const what = `${formatINR(p.amountPaise)} for ${planLabel(p.plan, p.billing)}, reference ${p.reference}, sent ${payDate(p.reportedAt)}`;
  if (p.status === 'pending') {
    return { tone: 'waiting', title: 'Waiting for confirmation', text: `${what}. MettleUp checks it with the bank and confirms it here.` };
  }
  if (p.status === 'confirmed') {
    return {
      tone: 'good',
      title: p.paidUntil ? `Confirmed: paid until ${payDate(p.paidUntil)}` : 'Confirmed',
      text: `${what}. Thank you!`,
    };
  }
  return {
    tone: 'bad',
    title: 'Not confirmed',
    text: `${what}. Reason: ${p.rejectReason ?? 'not given'}. Check the reference number and send it again, or message MettleUp.`,
  };
}

/** The gym's plan right now, in one line (top of the screen and the Settings card). PURE. */
export function planNow(o: Pick<PayOverview, 'plan' | 'billing' | 'paidUntil' | 'trialEndsAt'>, nowMs: number): string {
  if (o.plan && o.billing === 'lifetime') return `Your plan: ${planLabel(o.plan, 'lifetime')}. Nothing more to pay.`;
  if (o.plan && o.paidUntil) {
    const until = payDate(o.paidUntil);
    return Date.parse(o.paidUntil) >= nowMs
      ? `Your plan: ${planLabel(o.plan, o.billing)}. Paid until ${until}.`
      : `Your plan: ${planLabel(o.plan, o.billing)}. It was paid until ${until}. Pay below to keep going.`;
  }
  if (o.trialEndsAt) {
    return Date.parse(o.trialEndsAt) >= nowMs
      ? `You are on the free trial until ${payDate(o.trialEndsAt)}. You can pay now or later.`
      : `Your free trial ended on ${payDate(o.trialEndsAt)}. Pay below to keep going.`;
  }
  return 'You are on the free trial.';
}

/** Plain words for a refusal from 0060's functions; null for anything else. PURE. */
export function payErrorWords(err: unknown): string | null {
  const t = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
  if (/\bNOT_OPEN\b/.test(t)) return 'Paying here is not available yet. Message MettleUp to pay.';
  if (/\bDUPLICATE_REFERENCE\b/.test(t)) return 'This reference number was already sent. Check the list above.';
  if (/\bTOO_MANY\b/.test(t)) return 'You have 3 payments waiting for confirmation. Wait for MettleUp to check them first.';
  if (/\bBAD_REFERENCE\b/.test(t)) return 'That reference number does not look right. Copy it from your UPI app or bank.';
  if (/\bBAD_AMOUNT\b/.test(t)) return 'Type the amount you paid, in rupees.';
  if (/\bBAD_PLAN\b/.test(t)) return 'Pick Starter or Pro.';
  if (/\bOWNER_ONLY\b/.test(t)) return 'Only the gym owner can pay MettleUp.';
  return null;
}

// ---------------------------------------------------------------- paying during the free trial (0063)

/** "2026-11-06": the India day of a moment. PURE. */
function indiaDay(ms: number): string {
  return new Date(ms + 330 * 60000).toISOString().slice(0, 10);
}

/**
 * Where a new paid month or year starts counting from, as the server counts it (0063 _paid_from): the later
 * of the current paid-until and, while the free trial is still running, the trial's end. null = from today.
 * PURE.
 */
export function paidFrom(paidUntil: string | null, trialEndsAt: string | null, nowMs: number): string | null {
  const pu = paidUntil && !Number.isNaN(Date.parse(paidUntil)) ? Date.parse(paidUntil) : null;
  const te = trialEndsAt && !Number.isNaN(Date.parse(trialEndsAt)) && Date.parse(trialEndsAt) > nowMs ? Date.parse(trialEndsAt) : null;
  if (pu === null && te === null) return null;
  return new Date(Math.max(pu ?? -Infinity, te ?? -Infinity)).toISOString();
}

/**
 * The paid-until after one payment, as the server counts it (0060 _mettleup_extend): from the later of today
 * and `from` (India days), 1 or 12 months on (31 Jan + 1 month = 28/29 Feb), to the end of that India day.
 * PURE.
 */
export function paidUntilAfter(from: string | null, billing: PayBilling, nowMs: number): string {
  const today = indiaDay(nowMs);
  const fromDay = from && !Number.isNaN(Date.parse(from)) ? indiaDay(Date.parse(from)) : today;
  const base = fromDay > today ? fromDay : today;
  const [y, m, d] = base.split('-').map(Number);
  const month = m - 1 + (billing === 'yearly' ? 12 : 1);
  const last = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
  const day = new Date(Date.UTC(y, month, Math.min(d, last))).toISOString().slice(0, 10);
  return new Date(`${day}T23:59:59+05:30`).toISOString();
}

/**
 * The line the owner reads before paying during the free trial: no trial day is lost, the paid plan starts
 * when the trial ends. null when the trial is over (or already paid past its end). One billing:
 *   "Your paid plan starts when your free trial ends on 6 Feb 2027 and runs until 6 Mar 2027."
 * Both (the "Pay online" buttons):
 *   "... and runs until 6 Mar 2027 (1 month) or 6 Feb 2028 (1 year)." PURE.
 */
export function trialStartLine(
  o: { paidUntil: string | null; trialEndsAt: string | null; billing?: string | null },
  billing: PayBilling | 'both',
  nowMs: number,
): string | null {
  if (o.billing === 'lifetime' || !o.trialEndsAt) return null;
  const from = paidFrom(o.paidUntil, o.trialEndsAt, nowMs);
  if (!from || from !== new Date(Date.parse(o.trialEndsAt)).toISOString()) return null;
  const start = `Your paid plan starts when your free trial ends on ${payDate(o.trialEndsAt)}`;
  if (billing === 'both') {
    return `${start} and runs until ${payDate(paidUntilAfter(from, 'monthly', nowMs))} (1 month) or ${payDate(paidUntilAfter(from, 'yearly', nowMs))} (1 year).`;
  }
  return `${start} and runs until ${payDate(paidUntilAfter(from, billing, nowMs))}.`;
}

/**
 * Does the LIVE gym server keep the rest of a free trial when a payment is confirmed (0063 _paid_from)?
 * true since 7 Nov 2026 (R-390: 0062, 0063 and 0064 applied live, their tests passed): a payment made
 * during the free trial starts its paid month or year when the trial ends.
 */
export const TRIAL_KEPT_ON_PAY = true;

/**
 * The line the owner reads before paying during a running free trial, true to what the live server does.
 * With 0063 (kept): trialStartLine. With only 0060: the paid time starts the day MettleUp confirms it:
 *   "Your paid month starts on the day MettleUp confirms your payment, not when your free trial ends on
 *    17 Jan 2027. To keep every free day, pay nearer that date."
 * null when no trial is running, the gym is paid up, or lifetime. PURE.
 */
export function trialPayLine(
  o: { paidUntil: string | null; trialEndsAt: string | null; billing?: string | null },
  billing: PayBilling,
  nowMs: number,
  kept: boolean = TRIAL_KEPT_ON_PAY,
): string | null {
  if (kept) return trialStartLine(o, billing, nowMs);
  if (o.billing === 'lifetime' || !o.trialEndsAt) return null;
  const te = Date.parse(o.trialEndsAt);
  if (Number.isNaN(te) || te <= nowMs) return null;
  if (o.paidUntil && Date.parse(o.paidUntil) > nowMs) return null;
  const what = billing === 'yearly' ? 'year' : 'month';
  return `Your paid ${what} starts on the day MettleUp confirms your payment, not when your free trial ends on ${payDate(o.trialEndsAt)}. To keep every free day, pay nearer that date.`;
}
