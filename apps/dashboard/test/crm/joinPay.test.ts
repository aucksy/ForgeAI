/**
 * R-528 Pay online when joining: where a join request's payment stands on Today, when the desk may Approve in one tap,
 * and the sale Approve makes (the plan and prices they picked, what was really paid, one receipt per payment).
 * The server half is deploy/panel/joinPay.test.mjs; the screens are e2e/joinpay-uat.spec.mjs.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { approveSale, canApprove, joinPaidDay, joinPayFor } from '../../src/crm/logic/joinPay';
import type { JoinPay } from '../../src/crm/pay/payApi';
import type { EnquirySelfJoin, Plan } from '../../src/crm/types';

const TODAY = '2026-11-14';
const EID = 'join-0a1b2c3d4e5f60718293a4b5c6d7e8f9';

const JOIN = {
  v: 1,
  name: 'Ravi Kumar',
  gender: 'male',
  planId: 'plan-month',
  planName: 'Monthly',
  durationUnit: 'month',
  durationCount: 1,
  priceP: 150000,
  joiningFeeP: 50000,
  totalP: 200000,
  startsOn: '2026-11-20',
  pay: 'desk',
  paid: false,
  phoneChecked: true,
  lang: 'en',
  consents: { adultAt: 1, healthAt: 1, wording: '2026-11-14' },
  at: 1000,
} as EnquirySelfJoin;

const pay = (o: Partial<JoinPay> = {}): JoinPay => ({
  id: 'pr_aaaaaaaaaaaaaaaaaaaa',
  kind: 'join',
  memberId: null,
  ref: EID,
  amountP: 200000,
  label: 'Joining: Monthly',
  note: '',
  upiId: null,
  payee: 'Shakti Gym',
  provider: 'razorpay',
  providerName: 'Razorpay',
  testMode: true,
  url: 'https://rzp.io/i/x',
  status: 'open',
  failed: false,
  paidP: 0,
  method: null,
  paymentId: null,
  paidAt: null,
  late: false,
  receiptNo: null,
  recorded: false,
  createdAt: '2026-11-14T04:00:00.000Z',
  expiresAt: null,
  said: false,
  ...o,
});

const plans = [{ id: 'plan-month', name: 'Monthly', active: true }] as Plan[];
const taker = { id: 'staff-1', name: 'Asha' };

describe('where the payment stands', () => {
  it('no payment, or someone else’s: pay at the desk, as before', () => {
    expect(joinPayFor(EID, [])).toEqual({ kind: 'desk' });
    expect(joinPayFor(EID, null)).toEqual({ kind: 'desk' });
    expect(joinPayFor(EID, [pay({ ref: 'join-other', status: 'paid' })])).toEqual({ kind: 'desk' });
    expect(joinPayFor(EID, [pay({ kind: 'fee', status: 'paid' })])).toEqual({ kind: 'desk' });
  });
  it('paid by the company; paid wins over an older try', () => {
    expect(joinPayFor(EID, [pay({ id: 'pr_old', failed: true }), pay({ status: 'paid', paidP: 200000 })]).kind).toBe('paid');
  });
  it('a plain UPI payment they say they made, to check in the bank', () => {
    expect(joinPayFor(EID, [pay({ provider: null, providerName: null, said: true })]).kind).toBe('said');
    // A company's payment is never "said": the company confirms it.
    expect(joinPayFor(EID, [pay({ said: true })]).kind).toBe('started');
  });
  it('failed, started, or ran out: Not paid', () => {
    expect(joinPayFor(EID, [pay({ failed: true })]).kind).toBe('failed');
    expect(joinPayFor(EID, [pay()]).kind).toBe('started');
    expect(joinPayFor(EID, [pay({ status: 'expired' })]).kind).toBe('started');
    expect(joinPayFor(EID, [pay({ status: 'cancelled' })])).toEqual({ kind: 'desk' });
  });
  it('one tap Approve only when the money is in, or they say so', () => {
    expect(canApprove(joinPayFor(EID, [pay({ status: 'paid' })]))).toBe(true);
    expect(canApprove(joinPayFor(EID, [pay({ provider: null, said: true })]))).toBe(true);
    expect(canApprove(joinPayFor(EID, [pay({ failed: true })]))).toBe(false);
    expect(canApprove(joinPayFor(EID, [pay()]))).toBe(false);
    expect(canApprove({ kind: 'desk' })).toBe(false);
  });
});

describe('the sale Approve makes', () => {
  it('their plan, start day and prices; what was paid collected now; the company’s id; one receipt per payment', () => {
    const p = pay({ status: 'paid', paidP: 200000, method: 'upi', paymentId: 'pay_TEST777', paidAt: '2026-11-14T04:30:00.000Z' });
    expect(approveSale({ memberId: 'm1', join: JOIN, pay: p, plans, today: TODAY, taker })).toEqual({
      memberId: 'm1',
      planId: 'plan-month',
      startsOn: '2026-11-20',
      priceP: 150000,
      joiningFeeP: 50000,
      notes: 'Joined online, paid online (test mode)',
      collectNowP: 200000,
      method: 'upi',
      reference: 'Razorpay pay_TEST777',
      paidOn: TODAY,
      soldBy: 'staff-1',
      soldByName: 'Asha',
      requestId: 'pay-pr_aaaaaaaaaaaaaaaaaaaa',
    });
  });
  it('a plain UPI payment: by UPI, the amount asked, no reference, not test mode', () => {
    const s = approveSale({ memberId: 'm1', join: JOIN, pay: pay({ provider: null, providerName: null, testMode: false, said: true }), plans, today: TODAY, taker });
    expect(s).toMatchObject({ collectNowP: 200000, method: 'upi', reference: null, notes: 'Joined online, paid online' });
  });
  it('F210 hook: a smaller payment (a trial fee) is taken off the plan; the rest stays due. Never more than due', () => {
    expect(approveSale({ memberId: 'm1', join: JOIN, pay: pay({ status: 'paid', paidP: 9900 }), plans, today: TODAY, taker })?.collectNowP).toBe(9900);
    expect(approveSale({ memberId: 'm1', join: JOIN, pay: pay({ status: 'paid', paidP: 999999 }), plans, today: TODAY, taker })?.collectNowP).toBe(200000);
  });
  it('the plan is no longer sold: no sale (the desk uses Make member)', () => {
    expect(approveSale({ memberId: 'm1', join: JOIN, pay: pay({ status: 'paid' }), plans: [{ ...plans[0], active: false }], today: TODAY, taker })).toBeNull();
  });
  it('a start day already past: today', () => {
    expect(approveSale({ memberId: 'm1', join: { ...JOIN, startsOn: '2026-11-01' }, pay: pay({ status: 'paid' }), plans, today: TODAY, taker })?.startsOn).toBe(TODAY);
  });
  it('the receipt’s day is the day paid (India time), never after today', () => {
    expect(joinPaidDay('2026-11-13T19:00:00.000Z', TODAY)).toBe('2026-11-14');
    expect(joinPaidDay('2026-11-12T10:00:00.000Z', TODAY)).toBe('2026-11-12');
    expect(joinPaidDay('2026-11-20T10:00:00.000Z', TODAY)).toBe(TODAY);
    expect(joinPaidDay(null, TODAY)).toBe(TODAY);
    expect(joinPaidDay('nonsense', TODAY)).toBe(TODAY);
  });
});

describe('the public page', () => {
  const page = readFileSync(new URL('../../public/join-online.html', import.meta.url), 'utf8');
  it('sends the choice, never a price; online pay only when the server offers it', () => {
    const send = /fetch\('\/api\/self-join'[\s\S]*?body: JSON\.stringify\(([^\n]+)\)/.exec(page)?.[1] ?? '';
    expect(send).toContain('pay: payChoice()');
    expect(send).not.toMatch(/price|total|fee/i);
    expect(page).toContain("fetch('/api/self-join/pay-info'");
    expect(page).toMatch(/<label class="hide" id="pay-online-opt">/);
    expect(page).toMatch(/<input type="radio" name="pay" value="desk" checked>/);
  });
  it('a payment is never confirmed by the page itself: paid only from the server’s answer', () => {
    expect(page).not.toMatch(/status\s*=\s*'paid'/);
  });
});
