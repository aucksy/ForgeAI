/**
 * F79 online payments (R-328): every word the owner and the desk read about online payments, and the
 * small rules behind them. PURE (tested in test/crm/pay.test.ts). English, with Hinglish through t().
 */

import { t } from '../lang/lang';
import { formatINR, type Paise } from '../logic/money';
import type { PayConnection, PayProvider, PayRequest, ProviderId } from './payApi';

/** Where the owner finds their keys in each company's own dashboard (opens in a new tab). */
export const KEYS_HELP: Record<ProviderId, { where: string; url: string }> = {
  razorpay: { where: 'In Razorpay, open Account & Settings, then API keys. Make a test key.', url: 'https://dashboard.razorpay.com/' },
  cashfree: { where: 'In Cashfree, open Developers, then API keys. Use the Test keys.', url: 'https://merchant.cashfree.com/' },
  payu: { where: 'In PayU, open Settings, then Key and Salt.', url: 'https://dashboard.payu.in/' },
  phonepe: { where: 'In PhonePe Business, open Developer settings, then API keys.', url: 'https://business.phonepe.com/' },
};

/** R-547 (owner's decision A, 14 Nov 2026): the only companies a gym can pick or connect. */
export const OFFERED_PROVIDERS: readonly ProviderId[] = ['razorpay', 'cashfree'];

/**
 * The company cards Settings -> Payments shows: Razorpay and Cashfree, plus PayU or PhonePe ONLY when this gym is
 * already on it (so it keeps working and can still be disconnected). The server sends the same list. PURE.
 */
export function shownProviders(list: readonly PayProvider[]): PayProvider[] {
  return list.filter((p) => OFFERED_PROVIDERS.includes(p.id) || Boolean(p.connection && p.connection.offReason !== 'disconnected'));
}

/** The UPI note a payer sees for a receipt ("Receipt 2026-27-0042"); UPI apps drop a "/". PURE. */
export function upiReceiptNote(receiptNo: string | null | undefined): string {
  const n = String(receiptNo ?? '').replace(/\//g, '-').trim();
  return n ? `Receipt ${n}` : '';
}

/** The one line under a company's name in Settings -> Payments. PURE. */
export function connectionLine(name: string, c: PayConnection | null): string {
  if (!c) return t('Not connected.');
  if (c.on) {
    return c.via === 'oauth'
      ? t('Connected to your {name} account.', { name })
      : t('Connected with the key ending {hint}.', { hint: c.hint });
  }
  if (c.offReason === 'revoked') return t('Your {name} account stopped this connection. Connect again to take payments online.', { name });
  if (c.offReason === 'bad_keys') return t('{name} stopped accepting these keys. Paste your new keys to connect again.', { name });
  return t('Not connected.');
}

/** Plain words for a refused connect. PURE. */
export function connectProblem(code: string, words: string | null, name: string): string {
  if (code === 'CHECK' && words) return words;
  if (code === 'BAD_KEYS') return t('{name} did not accept these keys. Check them and try again.', { name });
  // Review round 4 (R-554): the company did not answer the "same account?" check: nothing was saved or closed.
  if (code === 'CHECK_FAILED') return t('Could not check with {name}. Try again.', { name });
  if (code === 'OWNER_ONLY') return t('Only the gym owner can connect a payment company.');
  if (code === 'NO_MASTER_KEY' || code === 'NOT_READY') return t('Online payments are not switched on yet.');
  if (code === 'OFFLINE') return t('No internet. Try again.');
  return t('Could not connect. Try again.');
}

/** What the desk sees about a payment link while the member pays. PURE. */
export function requestLine(r: PayRequest): string {
  if (r.status === 'paid') {
    const how = r.method === 'card' ? t('by card') : r.method === 'bank' ? t('by net banking') : r.method === 'other' ? t('online') : t('by UPI');
    return r.late
      ? t('Paid {amount} {how}, after the link was closed.', { amount: formatINR(r.paidP || r.amountP), how })
      : t('Paid {amount} {how}.', { amount: formatINR(r.paidP || r.amountP), how });
  }
  if (r.status === 'expired') return t('This link has run out. Make a new one.');
  if (r.status === 'cancelled') return t('This link was cancelled.');
  if (r.failed) return t('The last try did not go through. They can try again.');
  return t('Waiting for the payment…');
}

/** The receipt's reference for an online payment: "Razorpay pay_ABC". PURE. */
export function onlineReference(r: PayRequest): string {
  return [r.providerName, r.paymentId].filter(Boolean).join(' ').slice(0, 60);
}

/** The receipt's method for an online payment (the ledger's own methods). PURE. */
export function receiptMethod(r: PayRequest): 'upi' | 'card' | 'bank' | 'other' {
  return r.method ?? 'upi';
}

/**
 * Review round 3 (R-550): the desk tried to save money taken another way (cash, or UPI to the gym's QR), but the
 * member had just paid the same due or shop order online. Nothing was saved, so the gym does not take the money twice.
 * PURE.
 */
export function justPaidOnline(kind: 'fee' | 'shop', name: string, r: PayRequest): string {
  const amount = formatINR(r.paidP || r.amountP);
  const who = name.trim() || t('This member');
  return kind === 'shop'
    ? t('{name} has just paid {amount} online for this order, so do not take money for it. Tap "Collected (paid)" again to hand it over.', { name: who, amount })
    : t('{name} has just paid {amount} online, so this payment was not saved. The receipt for their online payment is made by itself in a few minutes.', { name: who, amount });
}

/** "Pay ₹1,500 to Iron Temple" for the QR's caption. PURE. */
export function payCaption(amountP: Paise, payee: string): string {
  return t('Pay {amount} to {payee}', { amount: formatINR(amountP), payee: payee || t('the gym') });
}
