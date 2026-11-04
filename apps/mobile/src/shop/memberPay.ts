/**
 * F79 online payments (R-328, 4 Nov 2026): paying the gym from the MettleUp app. PURE (tested in
 * test/shop/memberPay.test.ts); the calls are in memberPayApi.ts, the screen part in PayPanel.tsx.
 *
 * What the member sees, on My membership (fees the desk asked for) and on a shop order:
 *   1. the UPI QR first (scan it from another phone, or show it to a friend paying for you),
 *   2. "Pay by UPI app" (opens Google Pay, PhonePe, Paytm... with the amount filled in),
 *   3. the gym's UPI ID to copy by pressing and holding it,
 *   4. "Pay ₹1,500 online" when the gym connected a payment company (UPI, card or net banking),
 *   5. "Test mode: no real money moves." until MettleUp switches live payments on.
 * Hidden completely until the server answers (an older server, no internet, nothing asked).
 * Words: plain and short; never "volume", "PR" or "session".
 */

import { rupees } from './money';

export const PAY_URL = 'https://app.mettleup.fit/api/pay';

export interface MemberPayRequest {
  id: string;
  kind: 'fee' | 'shop';
  /** shop: the order id; fee: null. */
  ref: string | null;
  amountP: number;
  label: string;
  note: string;
  upiId: string | null;
  payee: string;
  providerName: string | null;
  testMode: boolean;
  /** The company's payment page (only while open). */
  url: string | null;
  status: 'open' | 'paid' | 'cancelled' | 'expired';
  failed: boolean;
  paidP: number;
  paidAt: string | null;
  recorded: boolean;
}

export interface MinePayAnswer {
  requests: MemberPayRequest[];
  gymUpi: string | null;
}

const UPI_RE = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/i;

/** A real name@handle UPI ID, trimmed and lower-case; null for anything else. PURE. */
export function validUpiId(id: string | null | undefined): string | null {
  const v = String(id ?? '').trim().toLowerCase();
  return UPI_RE.test(v) ? v : null;
}

/** Only letters, digits, spaces and . , - / in a UPI name or note (some apps refuse others). PURE. */
function plain(s: string, max = 40): string {
  return s.replace(/[^A-Za-z0-9 .,\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** upi://pay?pa=..&pn=..&am=1500.00&cu=INR&tn=Receipt 2026-27-0042 (the same as the admin app's). PURE. */
export function upiLink(o: { upiId: string; payee: string; amountP: number; note?: string }): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%40/g, '@');
  const parts = [`pa=${enc(o.upiId)}`, `pn=${enc(plain(o.payee) || 'Gym')}`, `am=${(Math.round(o.amountP) / 100).toFixed(2)}`, 'cu=INR'];
  const note = o.note ? plain(o.note, 50) : '';
  if (note) parts.push(`tn=${enc(note)}`);
  return `upi://pay?${parts.join('&')}`;
}

/** Read the server's answer to /api/pay/mine; null = hide everything. PURE. */
export function mineFromJson(json: unknown): MinePayAnswer | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as { on?: unknown; requests?: unknown; gymUpi?: unknown };
  if (o.on !== true || !Array.isArray(o.requests)) return null;
  const requests = o.requests.map(requestFromJson).filter((r): r is MemberPayRequest => r !== null);
  return { requests, gymUpi: validUpiId(typeof o.gymUpi === 'string' ? o.gymUpi : null) };
}

/** One request, or null when it is not readable. PURE. */
export function requestFromJson(x: unknown): MemberPayRequest | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  const status = r.status;
  if (typeof r.id !== 'string' || !(status === 'open' || status === 'paid' || status === 'cancelled' || status === 'expired')) return null;
  const amountP = Number(r.amountP);
  if (!Number.isFinite(amountP) || amountP <= 0) return null;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    id: r.id,
    kind: r.kind === 'shop' ? 'shop' : 'fee',
    ref: typeof r.ref === 'string' ? r.ref : null,
    amountP,
    label: s(r.label),
    note: s(r.note),
    upiId: validUpiId(s(r.upiId)),
    payee: s(r.payee),
    providerName: s(r.providerName) || null,
    testMode: r.testMode === true,
    url: typeof r.url === 'string' && /^https:\/\//.test(r.url) ? r.url : null,
    status,
    failed: r.failed === true,
    paidP: Number(r.paidP) || 0,
    paidAt: typeof r.paidAt === 'string' ? r.paidAt : null,
    recorded: r.recorded === true,
  };
}

/** The fees to show on My membership: open ones, and ones paid in the last 3 days (a thank-you). PURE. */
export function feesToShow(rs: readonly MemberPayRequest[], nowMs: number): MemberPayRequest[] {
  return rs.filter(
    (r) => r.kind === 'fee' && (r.status === 'open' || (r.status === 'paid' && r.paidAt != null && nowMs - Date.parse(r.paidAt) < 3 * 86_400_000)),
  );
}

export const PAY_WORDS = {
  title: 'Pay your gym',
  scan: 'Scan this QR with any UPI app.',
  upiApp: 'Pay by UPI app',
  holdToCopy: 'Press and hold to copy the UPI ID.',
  testMode: 'Test mode: no real money moves.',
  deskConfirms: 'After you pay, the gym saves your receipt.',
  failed: 'Your last try did not go through. You can try again.',
  noUpiApp: 'No UPI app found on this phone. Scan the QR from another phone, or pay at the desk.',
  linkProblem: 'The payment page did not open. Try again, or pay at the desk.',
  orderPay: 'Pay for this order',
  orderPaid: 'Paid. The gym can see it.',
  orderNotOn: 'Online payment is not set up at this gym yet. Pay at the desk.',
} as const;

/** "Monthly plan: ₹1,500" — what the gym asked for. PURE. */
export function askLine(r: MemberPayRequest): string {
  return r.label ? `${r.label}: ${rupees(r.amountP)}` : rupees(r.amountP);
}

/** "Pay ₹1,500 online" for the company link button. PURE. */
export function onlineButton(r: MemberPayRequest): string {
  return `Pay ${rupees(r.amountP)} online`;
}

/** The status line under a request. PURE. */
export function statusLine(r: MemberPayRequest): string | null {
  if (r.status === 'paid') return `Paid ${rupees(r.paidP || r.amountP)}. Thank you!${r.recorded ? ' Your receipt is saved.' : ''}`;
  if (r.status === 'expired') return 'This payment link has run out. Ask the desk for a new one.';
  if (r.status === 'cancelled') return null;
  return r.failed ? PAY_WORDS.failed : null;
}
