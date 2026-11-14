/**
 * R-528 Pay online when joining: where a join request's payment stands on Today, when the desk may Approve in one tap,
 * and the sale Approve makes (the plan and prices they picked, what was really paid, one receipt per payment).
 * The server half is deploy/panel/joinPay.test.mjs; the screens are e2e/joinpay-uat.spec.mjs.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { approveQuestion, approveSale, canApprove, isRealMoney, joinLeftover, joinPaidDay, joinPayFor } from '../../src/crm/logic/joinPay';
import { approveWords, payLine } from '../../src/crm/ui/JoinedOnlineCard';
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
    const p = pay({ status: 'paid', paidP: 200000, method: 'upi', paymentId: 'pay_TEST777', paidAt: '2026-11-14T04:30:00.000Z', testMode: false });
    expect(approveSale({ memberId: 'm1', join: JOIN, pay: p, plans, today: TODAY, taker })).toEqual({
      memberId: 'm1',
      planId: 'plan-month',
      startsOn: '2026-11-20',
      priceP: 150000,
      joiningFeeP: 50000,
      notes: 'Joined online, paid online',
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
    expect(approveSale({ memberId: 'm1', join: JOIN, pay: pay({ status: 'paid', paidP: 9900, testMode: false }), plans, today: TODAY, taker })?.collectNowP).toBe(9900);
    expect(approveSale({ memberId: 'm1', join: JOIN, pay: pay({ status: 'paid', paidP: 999999, testMode: false }), plans, today: TODAY, taker })?.collectNowP).toBe(200000);
  });
  // Payment sweep (R-542). Matrix D-01: a test card or the test page's "Success" button is not money.
  it('D-01 a TEST-mode payment: Approve makes the member and plan, collects nothing, and says so', () => {
    const s = approveSale({ memberId: 'm1', join: JOIN, pay: pay({ status: 'paid', paidP: 200000, paymentId: 'pay_T' }), plans, today: TODAY, taker });
    expect(s).toMatchObject({ planId: 'plan-month', collectNowP: 0, notes: 'Joined online, paid in test mode (no real money, nothing collected)', requestId: 'pay-pr_aaaaaaaaaaaaaaaaaaaa' });
    expect(isRealMoney(pay())).toBe(false);
    expect(isRealMoney(pay({ testMode: false }))).toBe(true);
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

describe('payment sweep (R-542): what the desk is asked, told and shown', () => {
  it('D-02 Approve asks first for a UPI payment nobody confirmed, and for a paid amount that is not the plan', () => {
    expect(approveQuestion(joinPayFor(EID, [pay({ provider: null, providerName: null, testMode: false, said: true })]))).toEqual({ kind: 'bank', paidP: 200000, askedP: 200000 });
    expect(approveQuestion(joinPayFor(EID, [pay({ status: 'paid', paidP: 150000, testMode: false })]))).toEqual({ kind: 'amount', paidP: 150000, askedP: 200000 });
    expect(approveQuestion(joinPayFor(EID, [pay({ status: 'paid', paidP: 200000, testMode: false })]))).toBeNull();
    expect(approveQuestion({ kind: 'desk' })).toBeNull();
    expect(approveWords({ kind: 'bank', paidP: 200000, askedP: 200000 }, 'Kavya Rao')).toBe('Can you see ₹2,000 from Kavya Rao in your bank or UPI app? Approve saves it as paid.');
    expect(approveWords({ kind: 'amount', paidP: 150000, askedP: 200000 }, 'Neha')).toBe('Neha paid ₹1,500, but the plan is ₹2,000. Approve saves ₹1,500 as paid; the rest stays due.');
  });
  it('D-03 the row says what was REALLY paid; a test payment says no money came in', () => {
    expect(payLine(200000, joinPayFor(EID, [pay({ status: 'paid', paidP: 200000, testMode: false })]))).toEqual({ text: '₹2,000 paid online', tone: 'good' });
    expect(payLine(200000, joinPayFor(EID, [pay({ status: 'paid', paidP: 150000, testMode: false })]))).toEqual({ text: '₹1,500 paid online, but the plan is ₹2,000 · Check before approving', tone: 'warn' });
    expect(payLine(200000, joinPayFor(EID, [pay({ status: 'paid', paidP: 200000 })]))).toEqual({ text: '₹2,000 paid in test mode · No real money came in · Collect it at the desk', tone: 'warn' });
  });
  it('D-05 a paid join payment nobody approved is shown to the desk; one already saved is only told to the server', () => {
    const waiting = new Set([EID]);
    const paid = pay({ status: 'paid', paidP: 200000, testMode: false });
    expect(joinLeftover(paid, waiting, [])).toEqual({ kind: 'waiting' });
    expect(joinLeftover(paid, new Set(), [])).toEqual({ kind: 'stuck', why: 'JOIN_NOT_APPROVED' });
    expect(joinLeftover(pay({ status: 'paid' }), new Set(), [])).toEqual({ kind: 'stuck', why: 'TEST_MODE' });
    expect(joinLeftover(paid, new Set(), [{ requestId: 'pay-pr_aaaaaaaaaaaaaaaaaaaa', receiptNo: '2026-27/0009' }])).toEqual({ kind: 'saved', receiptNo: '2026-27/0009' });
    expect(joinLeftover(paid, waiting, [{ requestId: 'pay-pr_aaaaaaaaaaaaaaaaaaaa', receiptNo: '2026-27/0009' }])).toEqual({ kind: 'saved', receiptNo: '2026-27/0009' });
    expect(joinLeftover(paid, new Set(), [{ requestId: 'pay-pr_other', receiptNo: 'x' }, { requestId: null, receiptNo: 'y' }])).toEqual({ kind: 'stuck', why: 'JOIN_NOT_APPROVED' });
  });
  it('D-06 a second payment on one request (two paid rows): the first is Approved, the other is never hidden', () => {
    const first = pay({ id: 'pr_aaaaaaaaaaaaaaaaaaaa', status: 'paid', paidP: 200000, testMode: false });
    const second = pay({ id: 'pr_bbbbbbbbbbbbbbbbbbbb', status: 'paid', paidP: 200000, testMode: false });
    const s = joinPayFor(EID, [first, second]);
    expect(s.kind === 'paid' && s.pay.id).toBe('pr_aaaaaaaaaaaaaaaaaaaa');
    // After Approve the request is no longer waiting: the receipt exists for the first, the second is shown.
    const saved = [{ requestId: 'pay-pr_aaaaaaaaaaaaaaaaaaaa', receiptNo: 'R1' }];
    expect(joinLeftover(first, new Set(), saved).kind).toBe('saved');
    expect(joinLeftover(second, new Set(), saved)).toEqual({ kind: 'stuck', why: 'JOIN_NOT_APPROVED' });
  });
  it('D-07 the page, the desk and the receipt carry one amount: the server paise, formatted the same way', () => {
    const page = readFileSync(new URL('../../public/join-online.html', import.meta.url), 'utf8');
    // The page formats paise itself (no rounding: whole rupees with en-IN grouping, paise only when there are some).
    expect(page).toContain("return '₹' + whole.toLocaleString('en-IN') + (part ? '.' + String(part).padStart(2, '0') : '');");
    // English and Hindi lines use the same {total}, made by the same rupees() for both languages.
    expect(page).toMatch(/payNow: 'Pay \{total\} now'/);
    expect(page).toMatch(/payNow: 'अभी \{total\} दें'/);
    expect(page).toMatch(/payLink\(p\)|upiLink\(p\)/);
    expect(page).toContain("'am=' + (Math.round(Number(p.amountP) || 0) / 100).toFixed(2)");
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
