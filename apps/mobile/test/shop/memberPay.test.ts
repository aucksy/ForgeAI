/**
 * F79 online payments (R-328): the member's side. The server half is tested in
 * deploy/panel/pay.test.mjs, the desk's in apps/dashboard/test/crm/pay.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { PAY_WORDS, askLine, feesToShow, mineFromJson, onlineButton, requestFromJson, statusLine, upiLink, validUpiId, type MemberPayRequest } from '@/shop/memberPay';

const raw = (o: Record<string, unknown> = {}) => ({
  id: 'pr_0123456789abcdef0123',
  kind: 'fee',
  ref: null,
  amountP: 150000,
  label: 'Monthly',
  note: 'Receipt 2026-27-0042',
  upiId: 'IronTemple@okhdfc',
  payee: 'Iron Temple',
  providerName: 'Razorpay',
  testMode: true,
  url: 'https://rzp.io/i/abc',
  status: 'open',
  failed: false,
  paidP: 0,
  paidAt: null,
  recorded: false,
  ...o,
});

const req = (o: Record<string, unknown> = {}) => requestFromJson(raw(o)) as MemberPayRequest;

describe('the UPI link and QR text', () => {
  it('is the same string the desk shows: UPI ID, payee, exact amount, receipt number', () => {
    expect(upiLink({ upiId: 'irontemple@okhdfc', payee: 'Iron Temple', amountP: 150000, note: 'Receipt 2026-27-0042' })).toBe(
      'upi://pay?pa=irontemple@okhdfc&pn=Iron%20Temple&am=1500.00&cu=INR&tn=Receipt%202026-27-0042',
    );
    expect(upiLink({ upiId: 'a@b', payee: '', amountP: 99950 })).toBe('upi://pay?pa=a@b&pn=Gym&am=999.50&cu=INR');
  });

  it('only a name@handle UPI ID is used', () => {
    expect(validUpiId(' IronTemple@OKHDFC ')).toBe('irontemple@okhdfc');
    expect(validUpiId('irontemple')).toBeNull();
    expect(validUpiId('a@1bank')).toBeNull();
    expect(validUpiId(null)).toBeNull();
  });
});

describe('reading the server', () => {
  it('hides everything unless the server says on', () => {
    expect(mineFromJson(null)).toBeNull();
    expect(mineFromJson({ on: false, why: 'NOT_READY' })).toBeNull();
    expect(mineFromJson({ error: 'BAD_KEY' })).toBeNull();
    expect(mineFromJson({ on: true, requests: [], gymUpi: 'x@y' })).toEqual({ requests: [], gymUpi: null });
  });

  it('keeps only readable requests, an https payment page and a real UPI ID', () => {
    const a = mineFromJson({ on: true, requests: [raw(), raw({ id: 7 }), raw({ amountP: 0 }), raw({ url: 'javascript:alert(1)', id: 'b' })], gymUpi: 'gym@ybl' });
    expect(a?.requests.map((r) => r.id)).toEqual(['pr_0123456789abcdef0123', 'b']);
    expect(a?.requests[0].upiId).toBe('irontemple@okhdfc');
    expect(a?.requests[1].url).toBeNull();
    expect(a?.gymUpi).toBe('gym@ybl');
  });
});

describe('what the member sees', () => {
  it('shows open fees, and paid ones for 3 days as a thank-you; never shop orders here', () => {
    const now = Date.parse('2026-11-04T12:00:00.000Z');
    const list = [
      req({ id: 'open' }),
      req({ id: 'paid-today', status: 'paid', paidAt: '2026-11-04T10:00:00.000Z' }),
      req({ id: 'paid-old', status: 'paid', paidAt: '2026-10-30T10:00:00.000Z' }),
      req({ id: 'gone', status: 'cancelled' }),
      req({ id: 'shop', kind: 'shop', ref: 'o1' }),
    ];
    expect(feesToShow(list, now).map((r) => r.id)).toEqual(['open', 'paid-today']);
  });

  it('says the amount with its label, and every status in plain words', () => {
    expect(askLine(req())).toBe('Monthly: ₹1,500');
    expect(askLine(req({ label: '' }))).toBe('₹1,500');
    expect(onlineButton(req())).toBe('Pay ₹1,500 online');
    expect(statusLine(req())).toBeNull();
    expect(statusLine(req({ failed: true }))).toBe('Your last try did not go through. You can try again.');
    expect(statusLine(req({ status: 'paid', paidP: 150000 }))).toBe('Paid ₹1,500. Thank you!');
    expect(statusLine(req({ status: 'paid', paidP: 150000, recorded: true }))).toBe('Paid ₹1,500. Thank you! Your receipt is saved.');
    expect(statusLine(req({ status: 'expired' }))).toBe('This payment link has run out. Ask the desk for a new one.');
  });

  it('R-528: the owner switched off payments in the app: what they owe stays, the ways to pay go', () => {
    const r = req({ upiId: null, url: null, deskOnly: true });
    expect(r.deskOnly).toBe(true);
    expect(r.upiId).toBeNull();
    expect(r.url).toBeNull();
    expect(askLine(r)).toBe('Monthly: ₹1,500');
    expect(PAY_WORDS.deskOnly).toBe('Pay this at the gym desk.');
    expect(req().deskOnly).toBe(false);
    expect(mineFromJson({ on: true, appPay: false, requests: [raw({ upiId: null, url: null, deskOnly: true })], gymUpi: null })?.requests[0]?.deskOnly).toBe(true);
  });

  it('never uses the words the member app keeps out', () => {
    const lines = [askLine(req()), onlineButton(req()), statusLine(req({ failed: true })), statusLine(req({ status: 'expired' }))].join(' ');
    expect(lines).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});
