/**
 * F79 online payments (R-328): the admin app's pure rules and words. The server half (keys sealed,
 * signatures, idempotent mark-paid, late and failed payments, revoked connections) is tested in
 * deploy/panel/pay.test.mjs.
 */
import { describe, expect, it } from 'vitest';

import { upiPayLink, validUpiId } from '../../src/crm/logic/upiPay';
import { paidDay, stuckWhy } from '../../src/crm/pay/PaidOnline';
import { qrPath } from '../../src/crm/pay/PayQr';
import { offWords, oauthBackWords } from '../../src/crm/pay/PaymentsScreen';
import { tenDigits, type PayConnection, type PayRequest } from '../../src/crm/pay/payApi';
import { OFFERED_PROVIDERS, connectProblem, connectionLine, onlineReference, payCaption, receiptMethod, requestLine, shownProviders, upiReceiptNote } from '../../src/crm/pay/payWords';
import { activeProvider } from '../../src/crm/pay/useDeskPay';

const req = (o: Partial<PayRequest> = {}): PayRequest => ({
  id: 'pr_0123456789abcdef0123',
  kind: 'fee',
  memberId: 'm1',
  ref: 'ms1',
  amountP: 150000,
  label: 'Monthly',
  note: 'Receipt 2026-27-0042',
  upiId: 'irontemple@okhdfc',
  payee: 'Iron Temple',
  provider: 'razorpay',
  providerName: 'Razorpay',
  testMode: true,
  url: 'https://rzp.io/i/abc',
  status: 'open',
  failed: false,
  paidP: 0,
  method: null,
  paymentId: null,
  paidAt: null,
  late: false,
  receiptNo: null,
  recorded: false,
  createdAt: '2026-11-04T10:00:00.000Z',
  expiresAt: null,
  ...o,
});

const conn = (o: Partial<PayConnection> = {}): PayConnection => ({
  provider: 'razorpay',
  mode: 'test',
  testMode: true,
  via: 'keys',
  hint: '3456',
  on: true,
  offReason: '',
  connectedAt: '2026-11-04T10:00:00.000Z',
  ...o,
});

describe('UPI QR', () => {
  it('the QR carries the UPI ID, the payee, the exact amount and the receipt number', () => {
    const link = upiPayLink({ upiId: 'irontemple@okhdfc', payee: 'Iron Temple', amountP: 150000, note: upiReceiptNote('2026-27/0042') });
    expect(link).toBe('upi://pay?pa=irontemple@okhdfc&pn=Iron%20Temple&am=1500.00&cu=INR&tn=Receipt%202026-27-0042');
  });

  it('the receipt note drops the "/" UPI apps refuse, and is empty without a number', () => {
    expect(upiReceiptNote('IT/0007')).toBe('Receipt IT-0007');
    expect(upiReceiptNote(null)).toBe('');
    expect(upiReceiptNote('  ')).toBe('');
  });

  it('only a name@handle UPI ID makes a QR', () => {
    expect(validUpiId('irontemple@okhdfc')).toBe('irontemple@okhdfc');
    expect(validUpiId('9829012345@ybl')).toBe('9829012345@ybl');
    expect(validUpiId('irontemple')).toBeNull();
    expect(validUpiId('@okhdfc')).toBeNull();
    expect(validUpiId('')).toBeNull();
  });

  it('draws a square QR with a quiet zone, and a longer text makes a bigger code', () => {
    const small = qrPath('upi://pay?pa=a@b&am=1.00&cu=INR');
    const big = qrPath(`upi://pay?pa=irontemple@okhdfc&pn=${'Iron%20Temple%20'.repeat(8)}&am=1500.00&cu=INR`);
    expect(small.size).toBeGreaterThanOrEqual(21 + 8);
    expect(big.size).toBeGreaterThan(small.size);
    expect(small.d.startsWith('M')).toBe(true);
    expect(qrPath('x', 0).size).toBe(21);
  });

  it('the caption names the amount and the gym', () => {
    expect(payCaption(150000, 'Iron Temple')).toBe('Pay ₹1,500 to Iron Temple');
    expect(payCaption(150000, '')).toBe('Pay ₹1,500 to the gym');
  });
});

describe('phone numbers for the payment company', () => {
  it('keeps a 10-digit Indian mobile, from any common way of writing it', () => {
    expect(tenDigits('+91 98290 12345')).toBe('9829012345');
    expect(tenDigits('09829012345')).toBe('9829012345');
    expect(tenDigits('9829012345')).toBe('9829012345');
    expect(tenDigits('12345')).toBeNull();
    expect(tenDigits('1829012345')).toBeNull();
    expect(tenDigits(null)).toBeNull();
  });
});

describe('Settings -> Payments words', () => {
  it('says how a company is connected and never shows more than the last 4 letters', () => {
    expect(connectionLine('Razorpay', null)).toBe('Not connected.');
    expect(connectionLine('Razorpay', conn())).toBe('Connected with the key ending 3456.');
    expect(connectionLine('Razorpay', conn({ via: 'oauth' }))).toBe('Connected to your Razorpay account.');
    expect(connectionLine('Razorpay', conn({ on: false, offReason: 'revoked' }))).toMatch(/stopped this connection/);
    expect(connectionLine('Razorpay', conn({ on: false, offReason: 'bad_keys' }))).toMatch(/stopped accepting these keys/);
    expect(connectionLine('Razorpay', conn({ on: false, offReason: 'disconnected' }))).toBe('Not connected.');
  });

  it('a refused connect is said in plain words', () => {
    expect(connectProblem('BAD_KEYS', null, 'Cashfree')).toBe('Cashfree did not accept these keys. Check them and try again.');
    expect(connectProblem('CHECK', 'Use your test key (rzp_test_...).', 'Razorpay')).toBe('Use your test key (rzp_test_...).');
    expect(connectProblem('OWNER_ONLY', null, 'PayU')).toBe('Only the gym owner can connect a payment company.');
    expect(connectProblem('NO_MASTER_KEY', null, 'PayU')).toBe('Online payments are not switched on yet.');
    expect(connectProblem('WHAT', null, 'PayU')).toBe('Could not connect. Try again.');
  });

  it('with the server part off, the screen says "not switched on yet" (no buttons, no crash)', () => {
    const notYet = 'Online payments are not switched on yet. Until then, members can pay by the UPI QR above.';
    expect(offWords({ on: false, why: 'NOT_READY' })).toBe(notYet);
    expect(offWords({ on: false, why: 'NO_MASTER_KEY' })).toBe(notYet);
    expect(offWords({ on: true, connectOn: false, testMode: true, canManage: true, providers: [] })).toBe(notYet);
    expect(offWords({ on: true, connectOn: true, testMode: true, canManage: true, providers: [] })).toBeNull();
    expect(offWords(null)).toBeNull();
  });

  it('the sign-in-with-the-company page coming back', () => {
    expect(oauthBackWords('connected')?.ok).toBe(true);
    expect(oauthBackWords('cancelled')).toEqual({ ok: false, text: 'Not connected: the sign-in was cancelled.' });
    expect(oauthBackWords('bad_state')?.ok).toBe(false);
    expect(oauthBackWords(null)).toBeNull();
  });

  it('payment links use the first connected company, and none while connecting is off', () => {
    const providers = [
      { id: 'razorpay' as const, name: 'Razorpay', fields: [], oauth: false, connection: conn({ on: false, offReason: 'disconnected' }) },
      { id: 'cashfree' as const, name: 'Cashfree', fields: [], oauth: false, connection: conn({ provider: 'cashfree' }) },
    ];
    expect(activeProvider({ on: true, connectOn: true, testMode: true, canManage: true, providers })?.id).toBe('cashfree');
    expect(activeProvider({ on: true, connectOn: false, testMode: true, canManage: true, providers })).toBeNull();
    expect(activeProvider({ on: false, why: 'NOT_READY' })).toBeNull();
  });

  it('R-547: the picker offers exactly Razorpay and Cashfree; a gym already on PayU or PhonePe still sees it', () => {
    const card = (id: 'razorpay' | 'cashfree' | 'payu' | 'phonepe', name: string, connection: PayConnection | null = null) => ({ id, name, fields: [], oauth: false, connection });
    const all = [card('razorpay', 'Razorpay'), card('cashfree', 'Cashfree'), card('payu', 'PayU'), card('phonepe', 'PhonePe')];
    expect(OFFERED_PROVIDERS).toEqual(['razorpay', 'cashfree']);
    expect(shownProviders(all).map((p) => p.id)).toEqual(['razorpay', 'cashfree']);
    // Already connected (on, or switched off by the company or by bad keys): still shown, so it works and can be disconnected.
    const onPayU = [all[0], all[1], card('payu', 'PayU', conn({ provider: 'payu' })), card('phonepe', 'PhonePe', conn({ provider: 'phonepe', on: false, offReason: 'bad_keys' }))];
    expect(shownProviders(onPayU).map((p) => p.id)).toEqual(['razorpay', 'cashfree', 'payu', 'phonepe']);
    // Once the gym disconnects it, it is gone.
    const gone = [all[0], all[1], card('payu', 'PayU', conn({ provider: 'payu', on: false, offReason: 'disconnected' }))];
    expect(shownProviders(gone).map((p) => p.id)).toEqual(['razorpay', 'cashfree']);
  });
});

describe('a payment link on the desk', () => {
  it('says waiting, paid (with how), late, failed, run out', () => {
    expect(requestLine(req())).toBe('Waiting for the payment…');
    expect(requestLine(req({ status: 'paid', paidP: 150000, method: 'card' }))).toBe('Paid ₹1,500 by card.');
    expect(requestLine(req({ status: 'paid', paidP: 150000, method: 'upi', late: true }))).toBe('Paid ₹1,500 by UPI, after the link was closed.');
    expect(requestLine(req({ failed: true }))).toBe('The last try did not go through. They can try again.');
    expect(requestLine(req({ status: 'expired' }))).toBe('This link has run out. Make a new one.');
    expect(requestLine(req({ status: 'cancelled' }))).toBe('This link was cancelled.');
  });

  it('the receipt carries the company and its payment id, and the right method', () => {
    expect(onlineReference(req({ paymentId: 'pay_ABC123' }))).toBe('Razorpay pay_ABC123');
    expect(receiptMethod(req({ method: 'bank' }))).toBe('bank');
    expect(receiptMethod(req())).toBe('upi');
  });
});

describe('payments that came in with no sheet open', () => {
  const memberships = [{ id: 'ms1', memberId: 'm1', priceP: 150000, joiningFeeP: 0 }];

  it('becomes a receipt by itself only when the plan is there and the amount is not more than due', () => {
    const live = { testMode: false };
    expect(stuckWhy(req({ status: 'paid', paidP: 150000, ...live }), memberships, () => 150000)).toBeNull();
    expect(stuckWhy(req({ status: 'paid', paidP: 150000, ...live }), memberships, () => 50000)).toBe('MORE_THAN_DUE');
    expect(stuckWhy(req({ status: 'paid', paidP: 150000, ref: 'gone', ...live }), memberships, () => 150000)).toBe('NO_MEMBERSHIP');
    expect(stuckWhy(req({ status: 'paid', paidP: 150000, memberId: 'm2', ...live }), memberships, () => 150000)).toBe('NO_MEMBERSHIP');
  });

  // Payment sweep (R-542, matrix D-04): anyone can "pay" a test link with a test card, so a test payment is never a
  // receipt, even when everything else fits.
  it('D-04 a TEST-mode payment never becomes a receipt by itself', () => {
    expect(stuckWhy(req({ status: 'paid', paidP: 150000, testMode: true }), memberships, () => 150000)).toBe('TEST_MODE');
  });

  it('the receipt is dated the day it was paid in India, never in the future', () => {
    // 4 Nov 2026, 11:30 pm in India is still 4 Nov there (6 pm UTC).
    expect(paidDay('2026-11-04T18:00:00.000Z', '2026-11-06')).toBe('2026-11-04');
    // 19:00 UTC is 12:30 am on 5 Nov in India.
    expect(paidDay('2026-11-04T19:00:00.000Z', '2026-11-06')).toBe('2026-11-05');
    expect(paidDay('2026-11-09T10:00:00.000Z', '2026-11-06')).toBe('2026-11-06');
    expect(paidDay(null, '2026-11-06')).toBe('2026-11-06');
    expect(paidDay('nonsense', '2026-11-06')).toBe('2026-11-06');
  });
});
