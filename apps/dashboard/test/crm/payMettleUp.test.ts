// T79 "Pay MettleUp" (0060): prices, the UPI link, the reference and amount checks, and the words the owner
// reads for each payment. Every payment detail here is an obviously fake test value.
import { describe, expect, it } from 'vitest';

import {
  PRICES,
  amountFromText,
  amountText,
  cleanReference,
  mettleUpUpiLink,
  overviewFromRow,
  payErrorWords,
  paymentFromRow,
  paymentStatus,
  payToFromRow,
  planNow,
  priceOf,
  referenceError,
  paidFrom,
  paidUntilAfter,
  trialPayLine,
  trialStartLine,
  type MettleUpPayment,
} from '../../src/crm/logic/payMettleUp';
import { trialBanner, type GymTrial } from '../../src/crm/logic/trial';

const FAKE = { upiId: 'test@upi', payeeName: 'Test Payee', accountName: 'Test Account', accountNumber: '000000000000', ifsc: 'TEST0000000', bankName: 'Test Bank' };
// 6 Nov 2026, 12:00 India time.
const NOW = Date.parse('2026-11-06T06:30:00Z');

const payment = (extra: Partial<MettleUpPayment> = {}): MettleUpPayment => ({
  id: 'p1',
  plan: 'pro',
  billing: 'monthly',
  pricePaise: 149_900,
  amountPaise: 149_900,
  reference: '123456789012',
  method: 'upi',
  status: 'pending',
  reportedAt: '2026-11-06T06:00:00Z',
  decidedAt: null,
  rejectReason: null,
  paidUntil: null,
  ...extra,
});

describe('prices (the approved list, #30 A)', () => {
  it('Starter and Pro, monthly and yearly; Pro + AI is not on sale here', () => {
    expect(PRICES).toEqual({ starter: { monthly: 99_900, yearly: 999_000 }, pro: { monthly: 149_900, yearly: 1_499_000 } });
    expect(priceOf('pro', 'yearly')).toBe(1_499_000);
    expect(priceOf('ai', 'monthly')).toBeNull();
    expect(priceOf('pro', 'lifetime')).toBeNull();
  });
});

describe('the UPI link for the QR code and the phone button', () => {
  const payTo = payToFromRow(FAKE)!;

  it('carries the id, the name, the amount with two decimals, INR and "MettleUp <gym code>"', () => {
    expect(mettleUpUpiLink(payTo, 149_900, 'PM60A1')).toBe('upi://pay?pa=test@upi&pn=Test%20Payee&am=1499.00&cu=INR&tn=MettleUp%20PM60A1');
    expect(mettleUpUpiLink(payTo, 999_000, 'abc123')).toBe('upi://pay?pa=test@upi&pn=Test%20Payee&am=9990.00&cu=INR&tn=MettleUp%20abc123');
  });

  it('encodes what a UPI app cannot read safely, and keeps the @', () => {
    const odd = payToFromRow({ ...FAKE, upiId: 'Test.Pay-1@UPI', payeeName: 'Test & Co / Gym' })!;
    expect(odd.upiId).toBe('test.pay-1@upi');
    const link = mettleUpUpiLink(odd, 50, 'X#1 2')!;
    expect(link).toBe('upi://pay?pa=test.pay-1@upi&pn=Test%20Co%20Gym&am=0.50&cu=INR&tn=MettleUp%20X12');
    expect(link).not.toContain('%40');
    expect(link).not.toContain(' ');
    expect(link).not.toContain('#');
  });

  it('no link without a UPI ID or an amount', () => {
    expect(mettleUpUpiLink(null, 149_900, 'A')).toBeNull();
    expect(mettleUpUpiLink(payToFromRow({ ...FAKE, upiId: null })!, 149_900, 'A')).toBeNull();
    expect(mettleUpUpiLink(payTo, 0, 'A')).toBeNull();
    expect(mettleUpUpiLink(payTo, 149_900, '')).toBe('upi://pay?pa=test@upi&pn=Test%20Payee&am=1499.00&cu=INR&tn=MettleUp');
  });
});

describe('the payment details from the server', () => {
  it('nothing usable (no row, a broken UPI ID and no full bank account) means "not available yet"', () => {
    expect(payToFromRow(null)).toBeNull();
    expect(payToFromRow({})).toBeNull();
    expect(payToFromRow({ upiId: 'not-a-upi', accountNumber: '12', ifsc: 'X' })).toBeNull();
    expect(overviewFromRow({ ok: true, payTo: null, payments: [] }).payTo).toBeNull();
  });

  it('bank only, UPI only, or both', () => {
    expect(payToFromRow({ ...FAKE, upiId: null })).toEqual({
      upiId: null,
      payeeName: 'Test Payee',
      bank: { accountName: 'Test Account', accountNumber: '000000000000', ifsc: 'TEST0000000', bankName: 'Test Bank' },
    });
    expect(payToFromRow({ upiId: 'test@upi', payeeName: '' })).toEqual({ upiId: 'test@upi', payeeName: 'MettleUp', bank: null });
  });

  it('reads payments field by field and drops ones it cannot read', () => {
    const o = overviewFromRow({
      payTo: FAKE,
      gymCode: 'PM60A1',
      payments: [{ id: 'a', plan: 'pro', billing: 'monthly', status: 'pending', reportedAt: '2026-11-06T06:00:00Z', amountPaise: 149900, reference: '123456789012' }, { id: 'b', plan: 'gold' }, null],
    });
    expect(o.payments).toHaveLength(1);
    expect(o.payments[0]).toMatchObject({ id: 'a', amountPaise: 149_900, method: 'upi', rejectReason: null });
    expect(paymentFromRow({ id: 'x', plan: 'ai', billing: 'monthly', status: 'pending', reportedAt: '2026-11-06T06:00:00Z' })).toBeNull();
  });
});

describe('the "I have paid" form', () => {
  it('cleans the reference and says what is wrong in words', () => {
    expect(cleanReference(' 1234 5678-9012 ')).toBe('123456789012');
    expect(referenceError(' 1234 5678 9012', 'upi')).toBeNull();
    expect(referenceError('', 'upi')).toBe('Type the UPI reference number (UTR) from your UPI app.');
    expect(referenceError('', 'bank')).toBe('Type the bank’s reference number (UTR).');
    expect(referenceError('12345', 'upi')).toMatch(/usually 12 digits/);
    expect(referenceError('1234#5678', 'bank')).toBe('A reference number has only letters and numbers.');
    expect(referenceError('x'.repeat(31), 'bank')).toMatch(/16 to 22/);
  });

  it('reads the amount in rupees', () => {
    expect(amountFromText('1499')).toBe(149_900);
    expect(amountFromText('₹ 14,990')).toBe(1_499_000);
    expect(amountFromText('999.5')).toBe(99_950);
    expect(amountFromText('0.5')).toBeNull();
    expect(amountFromText('abc')).toBeNull();
    expect(amountFromText('')).toBeNull();
    expect(amountText(149_900)).toBe('1499');
    expect(amountText(99_950)).toBe('999.50');
  });

  it('turns the server refusals into words', () => {
    expect(payErrorWords({ message: 'DUPLICATE_REFERENCE' })).toMatch(/already sent/);
    expect(payErrorWords({ message: 'NOT_OPEN' })).toMatch(/not available yet/);
    expect(payErrorWords({ message: 'TOO_MANY' })).toMatch(/3 payments waiting/);
    expect(payErrorWords(new Error('OWNER_ONLY'))).toBe('Only the gym owner can pay MettleUp.');
    expect(payErrorWords({ message: 'timed out' })).toBeNull();
  });
});

describe('what the owner sees', () => {
  it('waiting / confirmed until a date / not confirmed with the reason', () => {
    expect(paymentStatus(payment())).toEqual({
      tone: 'waiting',
      title: 'Waiting for confirmation',
      text: '₹1,499 for Pro, monthly, reference 123456789012, sent 6 Nov 2026. MettleUp checks it with the bank and confirms it here.',
    });
    const ok = paymentStatus(payment({ status: 'confirmed', paidUntil: '2026-12-06T18:29:59Z' }));
    expect(ok.tone).toBe('good');
    expect(ok.title).toBe('Confirmed: paid until 6 Dec 2026');
    const no = paymentStatus(payment({ status: 'rejected', rejectReason: 'No payment with this reference arrived' }));
    expect(no.tone).toBe('bad');
    expect(no.title).toBe('Not confirmed');
    expect(no.text).toContain('Reason: No payment with this reference arrived.');
    expect(no.text).not.toMatch(/GST|invoice/i);
  });

  it('the plan right now', () => {
    expect(planNow({ plan: null, billing: null, paidUntil: null, trialEndsAt: '2027-01-24T05:00:00Z' }, NOW)).toBe(
      'You are on the free trial until 24 Jan 2027. You can pay now or later.',
    );
    expect(planNow({ plan: null, billing: null, paidUntil: null, trialEndsAt: '2026-10-24T05:00:00Z' }, NOW)).toBe(
      'Your free trial ended on 24 Oct 2026. Pay below to keep going.',
    );
    expect(planNow({ plan: 'pro', billing: 'monthly', paidUntil: '2026-12-06T18:29:59Z', trialEndsAt: null }, NOW)).toBe(
      'Your plan: Pro, monthly. Paid until 6 Dec 2026.',
    );
    expect(planNow({ plan: 'starter', billing: 'yearly', paidUntil: '2026-11-01T18:29:59Z', trialEndsAt: null }, NOW)).toMatch(/was paid until 1 Nov 2026\. Pay below/);
    expect(planNow({ plan: 'pro', billing: 'lifetime', paidUntil: null, trialEndsAt: null }, NOW)).toBe('Your plan: Pro, lifetime. Nothing more to pay.');
  });

  it('the Today line asks for the next payment in the last 7 days of a paid plan, and after it', () => {
    const t = (extra: Partial<GymTrial>): GymTrial => ({ startsAt: '2026-08-01T05:00:00Z', endsAt: '2026-11-01T05:00:00Z', plan: 'pro', billing: 'monthly', paidUntil: null, ...extra });
    expect(trialBanner(t({ paidUntil: '2026-12-06T18:29:59Z' }), NOW)).toBeNull();
    expect(trialBanner(t({ paidUntil: '2026-11-12T18:29:59Z' }), NOW)).toEqual({
      tone: 'strong',
      text: 'Your MettleUp plan is paid until 12 Nov 2026. Pay for the next month or year to keep going.',
      showPlans: true,
    });
    expect(trialBanner(t({ paidUntil: '2026-11-05T18:29:59Z' }), NOW)?.text).toBe(
      'Your MettleUp plan was paid until 5 Nov 2026. Pay to keep going. Your members’ app keeps working.',
    );
    expect(trialBanner(t({ billing: 'lifetime' }), NOW)).toBeNull();
  });
});

describe('paying during the free trial (0063): no trial day is lost', () => {
  const NOW_MS = Date.parse('2026-11-06T12:00:00+05:30');
  const TRIAL = '2027-02-06T18:00:00+05:30';

  it('counts from the trial end while the trial runs, as the server does', () => {
    expect(paidFrom(null, TRIAL, NOW_MS)).toBe(new Date(TRIAL).toISOString());
    expect(paidFrom(null, '2026-11-01T10:00:00+05:30', NOW_MS)).toBeNull();
    expect(paidFrom('2027-03-01T23:59:59+05:30', TRIAL, NOW_MS)).toBe(new Date('2027-03-01T23:59:59+05:30').toISOString());
    expect(paidUntilAfter(TRIAL, 'monthly', NOW_MS)).toBe(new Date('2027-03-06T23:59:59+05:30').toISOString());
    expect(paidUntilAfter(TRIAL, 'yearly', NOW_MS)).toBe(new Date('2028-02-06T23:59:59+05:30').toISOString());
    expect(paidUntilAfter(null, 'monthly', NOW_MS)).toBe(new Date('2026-12-06T23:59:59+05:30').toISOString());
    // 31 Jan + 1 month = 28 Feb.
    expect(paidUntilAfter('2027-01-31T10:00:00+05:30', 'monthly', NOW_MS)).toBe(new Date('2027-02-28T23:59:59+05:30').toISOString());
  });

  it('tells the owner the real dates before paying', () => {
    const o = { paidUntil: null, trialEndsAt: TRIAL, billing: null };
    expect(trialStartLine(o, 'monthly', NOW_MS)).toBe('Your paid plan starts when your free trial ends on 6 Feb 2027 and runs until 6 Mar 2027.');
    expect(trialStartLine(o, 'yearly', NOW_MS)).toBe('Your paid plan starts when your free trial ends on 6 Feb 2027 and runs until 6 Feb 2028.');
    expect(trialStartLine(o, 'both', NOW_MS)).toBe(
      'Your paid plan starts when your free trial ends on 6 Feb 2027 and runs until 6 Mar 2027 (1 month) or 6 Feb 2028 (1 year).',
    );
    // Trial over, already paid past the trial, or lifetime: no line.
    expect(trialStartLine({ ...o, trialEndsAt: '2026-11-01T10:00:00+05:30' }, 'monthly', NOW_MS)).toBeNull();
    expect(trialStartLine({ ...o, paidUntil: '2027-03-06T23:59:59+05:30', billing: 'monthly' }, 'monthly', NOW_MS)).toBeNull();
    expect(trialStartLine({ ...o, billing: 'lifetime' }, 'monthly', NOW_MS)).toBeNull();
  });
});

describe('trialPayLine: true to the live server (only 0060 live: paid time starts the day it is confirmed)', () => {
  const NOW_MS = Date.parse('2026-11-06T06:30:00Z');
  const o = { paidUntil: null, trialEndsAt: '2027-02-06T10:00:00+05:30', billing: null };
  it('says the paid time starts on the confirm day while 0063 is not live, and never promises the trial end', () => {
    expect(trialPayLine(o, 'monthly', NOW_MS, false)).toBe(
      'Your paid month starts on the day MettleUp confirms your payment, not when your free trial ends on 6 Feb 2027. To keep every free day, pay nearer that date.',
    );
    expect(trialPayLine(o, 'yearly', NOW_MS, false)).toContain('Your paid year starts on the day MettleUp confirms');
    expect(trialPayLine({ ...o, trialEndsAt: '2026-11-01T10:00:00+05:30' }, 'monthly', NOW_MS, false)).toBeNull();
    expect(trialPayLine({ ...o, paidUntil: '2026-12-06T23:59:59+05:30', billing: 'monthly' }, 'monthly', NOW_MS, false)).toBeNull();
    expect(trialPayLine({ ...o, billing: 'lifetime' }, 'monthly', NOW_MS, false)).toBeNull();
  });
  it('with 0063 live (kept) it is the trial-end line', () => {
    expect(trialPayLine(o, 'monthly', NOW_MS, true)).toBe(trialStartLine(o, 'monthly', NOW_MS));
  });
});
