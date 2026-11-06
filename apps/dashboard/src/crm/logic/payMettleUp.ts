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

import { PACK_PRICES } from '@forgeai/theme';

import { formatINR, rupeesToPaise, type Paise } from './money';
import { upiPayLink, validUpiId } from './upiPay';

export type PayPlan = 'starter' | 'pro';
export type PayBilling = 'monthly' | 'yearly';
export type PayMethod = 'upi' | 'bank';
export type PayStatus = 'pending' | 'confirmed' | 'rejected';

/**
 * The approved prices for ONE branch, in paise. Billing step 1 (R-385): read from the one price list,
 * packages/theme/src/plans.ts (PACK_PRICES); never typed here. The server keeps the same list (0060
 * _mettleup_price) and a test checks they agree (test/crm/pricesOneSource.test.ts). Pro + AI is not on
 * sale yet, so it is not here.
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
const PLAN_ANY: Readonly<Record<string, string>> = { starter: 'Starter', pro: 'Pro', ai: 'Pro + AI' };

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

/** "Pro, monthly". PURE. */
export function planLabel(plan: string, billing: string | null): string {
  const name = PLAN_ANY[plan] ?? plan;
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
