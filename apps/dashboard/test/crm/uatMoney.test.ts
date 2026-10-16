/**
 * UAT item 1, the client half (17 Oct 2026): the money criteria from Audit/uat/RESEARCH.md that
 * only the admin app enforces. The server half is supabase/tests/uat_money.sql; which layer owns
 * which rule, and the findings, are in Audit/uat/MONEY-ACCESS.md.
 *
 * Tests named "FINDING F-xx" pin TODAY's behaviour of a gap that is written up there. They pass
 * now; when the gap is fixed they fail, and the fix updates them and the write-up together.
 *
 * vitest.config.ts pins TZ=Asia/Kolkata, which the IST-boundary tests below rely on.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { buildLedger, collectionSummary, filterLedger, presetRange } from '../../src/crm/logic/collections';
import { dateISOFromEpoch, todayISO } from '../../src/crm/logic/dates';
import { gstRateForDate, splitInclusiveGst, GYM_SAC_CODE } from '../../src/crm/logic/gst';
import { outstandingForMember, unpaidForMembership } from '../../src/crm/logic/membership';
import { formatINR, formatINRShort, paiseToRupees, parseRupeeInput, splitPaise, sumPaise } from '../../src/crm/logic/money';
import { buildReceiptDoc } from '../../src/crm/logic/receiptDoc';
import { financialYear, nextImportReceiptNo, nextReceiptNo, parseReceiptNo } from '../../src/crm/logic/receipts';
import { staffLowestPrice, validateSale } from '../../src/crm/logic/selling';
import { rupeesInWords } from '../../src/crm/logic/words';
import type { MemberDraft, Payment, PlanDraft } from '../../src/crm/types';
import { makeGym, makeMember, makeMembership, makePayment, VALID_GSTIN } from './fixtures';

const memberDraft = (over: Partial<MemberDraft> = {}): MemberDraft => ({
  fullName: 'Riya Sharma',
  phone: '+919876543210',
  email: null,
  gender: 'female',
  dateOfBirth: null,
  address: null,
  emergencyName: null,
  emergencyPhone: null,
  joinedOn: '2026-01-01',
  photoUri: null,
  notes: null,
  archived: false,
  ...over,
});

const planDraft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  name: 'Monthly',
  durationUnit: 'month',
  durationCount: 1,
  priceP: 150_000,
  joiningFeeP: 50_000,
  description: null,
  active: true,
  sortOrder: 1,
  ...over,
});

let db: LocalCrmData;
let clock: number;

beforeEach(() => {
  clock = 1_000;
  db = new LocalCrmData({ store: memoryStore(), now: () => (clock += 1), seed: () => emptySnapshot(0, 'UAT Gym') });
});

async function sale(collectNowP: number, paidOn = '2026-07-01') {
  const member = await db.createMember(memberDraft());
  const plan = await db.createPlan(planDraft());
  const res = await db.sellMembership({
    memberId: member.id, planId: plan.id, startsOn: '2026-07-01', priceP: plan.priceP, joiningFeeP: plan.joiningFeeP,
    notes: null, collectNowP, method: 'cash', reference: null, paidOn, soldBy: null,
  });
  return { member, plan, ...res };
}

const collect = (memberId: string, membershipId: string, amountP: number, paidOn = '2026-07-02') =>
  db.recordPayment({ memberId, membershipId, amountP, method: 'upi', paidOn, reference: null, note: null, collectedBy: null });

/** paid (not cancelled) + still due === price + joining fee, to the paisa. */
async function paidPlusDue(membershipId: string) {
  const snap = await db.load();
  const ms = snap.memberships.find((m) => m.id === membershipId)!;
  const paid = sumPaise(snap.payments.filter((p) => p.membershipId === ms.id && !p.voided).map((p) => p.amountP));
  return { paid, due: unpaidForMembership(ms, snap.payments), price: ms.priceP + ms.joiningFeeP };
}

/** Every financial year's receipt numbers run 1..n with no gap and no repeat. */
function gapless(receipts: readonly string[]): boolean {
  const byFy = new Map<string, number[]>();
  for (const r of receipts) {
    const p = parseReceiptNo(r);
    if (!p) return false;
    byFy.set(p.fy, [...(byFy.get(p.fy) ?? []), p.seq]);
  }
  for (const seqs of byFy.values()) {
    const sorted = [...seqs].sort((a, b) => a - b);
    if (sorted.some((s, i) => s !== i + 1)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- paid + due = price

describe('UAT money: paid + due = price, in whole paise', () => {
  it('holds after a sale, a part payment, a cancelled receipt and the final payment', async () => {
    const { member, membership, payment } = await sale(70_000);
    expect(payment!.amountP).toBe(70_000);
    let s = await paidPlusDue(membership.id);
    expect(s).toEqual({ paid: 70_000, due: 130_000, price: 200_000 });

    const part = await collect(member.id, membership.id, 30_000);
    s = await paidPlusDue(membership.id);
    expect(s.paid + s.due).toBe(s.price);
    expect(s.due).toBe(100_000);

    await db.voidPayment(part.id, 'Wrong member');
    s = await paidPlusDue(membership.id);
    expect(s.paid + s.due).toBe(s.price);
    expect(s.due).toBe(130_000);

    await collect(member.id, membership.id, 130_000);
    s = await paidPlusDue(membership.id);
    expect(s).toEqual({ paid: 200_000, due: 0, price: 200_000 });
    const snap = await db.load();
    for (const p of snap.payments) expect(Number.isInteger(p.amountP)).toBe(true);
  });

  it('three instalments of an odd total settle it to the paisa', async () => {
    const { member, membership } = await sale(0);
    for (const part of splitPaise(200_000, 3)) await collect(member.id, membership.id, part);
    const s = await paidPlusDue(membership.id);
    expect(s.due).toBe(0);
    expect(s.paid).toBe(200_000);
  });

  it('a cancelled plan stops being chased but its history still shows what was not paid', () => {
    const ms = makeMembership({ id: 'ms_c', priceP: 100_000, cancelled: true });
    const pays = [makePayment({ membershipId: 'ms_c', amountP: 40_000 })];
    expect(unpaidForMembership(ms, pays)).toBe(60_000);
    expect(outstandingForMember([ms], pays)).toBe(0);
  });

  it('the rupee box only takes whole paise, never minus, never past two decimals', () => {
    expect(parseRupeeInput('1,00,000')).toBe(10_000_000);
    expect(parseRupeeInput('1499.50')).toBe(149_950);
    expect(parseRupeeInput('-500')).toBeNull();
    expect(parseRupeeInput('10.555')).toBeNull();
    expect(parseRupeeInput('1e3')).toBeNull();
  });

  it('a sale cannot take more than its total', () => {
    const problem = validateSale(
      { planId: 'p', startsOn: '2026-07-01', priceP: 100_000, joiningFeeP: 0, collectNowP: 100_001, paidOn: '2026-07-01' },
      [], '2026-07-01',
    );
    expect(problem?.field).toBe('collectNowP');
  });

  it('the desk discount floor matches the server (0019): 10% off, rounded in the gym’s favour', () => {
    expect(staffLowestPrice(100_000)).toBe(90_000);
    expect(staffLowestPrice(99_999)).toBe(90_000);
    expect(staffLowestPrice(1)).toBe(1);
  });

  it('FINDING F-01: below the Collect sheet nothing stops a receipt bigger than what is owed', async () => {
    // The sheet's guard ("That is more than the ₹x due") lives in CollectPaymentSheet.tsx only. The
    // store and the server (uat_money.sql probe F-01) both save it, and the extra money then
    // vanishes from dues (floored at 0) while Collected counts it in full.
    const { member, membership } = await sale(0);
    await collect(member.id, membership.id, 250_000);
    const s = await paidPlusDue(membership.id);
    expect(s.paid).toBe(250_000);
    expect(s.due).toBe(0);
    expect(s.paid + s.due).not.toBe(s.price);
  });

  it('FINDING F-04: below the sheets nothing stops a minus or fractional receipt', async () => {
    const { member, membership } = await sale(0);
    await collect(member.id, membership.id, -5_000);
    await collect(member.id, membership.id, 100.5);
    const snap = await db.load();
    expect(snap.payments.map((p) => p.amountP).sort((a, b) => a - b)).toEqual([-5_000, 100.5]);
  });
});

// ---------------------------------------------------------------- receipt numbers

describe('UAT money: receipt numbers are gapless per gym per financial year, restarting 1 April', () => {
  it('runs 2025-26/0001.. up to 31 March, then 2026-27/0001 from 1 April; a late entry for March continues March', async () => {
    const { member, membership } = await sale(0);
    const issued: string[] = [];
    for (const day of ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-03-31']) {
      issued.push((await collect(member.id, membership.id, 1_000, day)).receiptNo);
    }
    expect(issued).toEqual(['2025-26/0001', '2025-26/0002', '2026-27/0001', '2026-27/0002', '2025-26/0003']);
    expect(gapless(issued)).toBe(true);
  });

  it('a cancelled receipt keeps its number; the next one never reuses it', async () => {
    const { member, membership, payment } = await sale(10_000, '2026-07-01');
    expect(payment!.receiptNo).toBe('2026-27/0001');
    const voided = await db.voidPayment(payment!.id, 'Typo');
    expect(voided.receiptNo).toBe('2026-27/0001');
    const next = await collect(member.id, membership.id, 5_000);
    expect(next.receiptNo).toBe('2026-27/0002');
    const snap = await db.load();
    expect(snap.payments).toHaveLength(2);
    expect(gapless(snap.payments.map((p) => p.receiptNo))).toBe(true);
  });

  it('each gym has its own series', async () => {
    const other = new LocalCrmData({ store: memoryStore(), now: () => (clock += 1), seed: () => emptySnapshot(0, 'Gym Two') });
    const { payment } = await sale(10_000);
    const m = await other.createMember(memberDraft());
    const p = await other.createPlan(planDraft());
    const res = await other.sellMembership({
      memberId: m.id, planId: p.id, startsOn: '2026-07-01', priceP: p.priceP, joiningFeeP: p.joiningFeeP,
      notes: null, collectNowP: 10_000, method: 'cash', reference: null, paidOn: '2026-07-01', soldBy: null,
    });
    expect(payment!.receiptNo).toBe('2026-27/0001');
    expect(res.payment!.receiptNo).toBe('2026-27/0001');
  });

  it('imported receipts run their own IMP/ series and never take a desk number', () => {
    const existing = [{ receiptNo: '2026-27/0001' }, { receiptNo: 'IMP/2026-27/0001' }, { receiptNo: '2026-27/0002' }];
    expect(nextReceiptNo(existing, '2026-07-01')).toBe('2026-27/0003');
    expect(nextImportReceiptNo(existing, '2026-07-01')).toBe('IMP/2026-27/0002');
  });

  it('the same press sent twice (C7-1 requestId) is one receipt, not two numbers', async () => {
    const { member, membership } = await sale(0);
    const input = { memberId: member.id, membershipId: membership.id, amountP: 5_000, method: 'cash' as const,
      paidOn: '2026-07-02', reference: null, note: null, collectedBy: null, requestId: 'press-1' };
    const a = await db.recordPayment(input);
    const b = await db.recordPayment(input);
    expect(b.id).toBe(a.id);
    expect((await db.load()).payments).toHaveLength(1);
  });

  it('a receipt number fits GST Rule 46 (at most 16 letters, digits, "-" or "/")', () => {
    const rule46 = /^[A-Za-z0-9/-]{1,16}$/;
    expect(nextReceiptNo([], '2026-07-01')).toMatch(rule46);
    expect(nextImportReceiptNo([], '2026-07-01')).toMatch(rule46);
    // FINDING F-11: the 10,000th imported receipt in one year is 17 characters.
    expect(nextImportReceiptNo([{ receiptNo: 'IMP/2026-27/9999' }], '2026-07-01')).toBe('IMP/2026-27/10000');
    expect('IMP/2026-27/10000').not.toMatch(rule46);
  });
});

// ---------------------------------------------------------------- Money screen = export = receipts

describe('UAT money: the Money screen, the Excel file and the receipts add up to the same number', () => {
  const range = { from: '2026-07-01', to: '2026-07-31' };
  const payments: Payment[] = [
    makePayment({ id: 'p1', amountP: 149_900, method: 'cash', paidOn: '2026-07-01', receiptNo: '2026-27/0001', createdAt: 1 }),
    makePayment({ id: 'p2', amountP: 33_333, method: 'upi', paidOn: '2026-07-01', receiptNo: '2026-27/0002', createdAt: 2 }),
    makePayment({ id: 'p3', amountP: 50_050, method: 'card', paidOn: '2026-07-15', receiptNo: '2026-27/0003', createdAt: 3 }),
    makePayment({ id: 'p4', amountP: 20_000, method: 'cash', paidOn: '2026-07-20', receiptNo: '2026-27/0004', voided: true, voidReason: 'Typo', createdAt: 4 }),
    makePayment({ id: 'p5', amountP: 99_999, method: 'bank', paidOn: '2026-07-31', receiptNo: '2026-27/0005', createdAt: 5 }),
    makePayment({ id: 'p6', amountP: 70_000, method: 'cash', paidOn: '2026-08-01', receiptNo: '2026-27/0006', createdAt: 6 }),
  ];
  const ledger = buildLedger(payments, [makeMember({ id: 'mem_1' })], [makeMembership({ id: 'ms_1' })]);
  const filter = { range, method: 'all' as const, query: '', includeVoided: false };

  it('Collected = the export’s Amount column = the sum of the live receipts in the period', () => {
    const summary = collectionSummary(payments, range);
    const exported = filterLedger(ledger, filter).map((r) => paiseToRupees(r.payment.amountP));
    const receipts = sumPaise(payments.filter((p) => !p.voided && p.paidOn >= range.from && p.paidOn <= range.to).map((p) => p.amountP));
    expect(summary.netP).toBe(333_282);
    expect(Math.round(exported.reduce((a, b) => a + b, 0) * 100)).toBe(summary.netP);
    expect(receipts).toBe(summary.netP);
    expect(sumPaise(summary.byMethod.map((m) => m.amountP))).toBe(summary.netP);
    expect(sumPaise(summary.byDay.map((d) => d.amountP))).toBe(summary.netP);
  });

  it('the last day of the month is in, the first day of the next is out', () => {
    const summary = collectionSummary(payments, range);
    expect(summary.byDay.map((d) => d.day)).toEqual(['2026-07-01', '2026-07-15', '2026-07-31']);
  });

  it('FINDING F-09: with "show cancelled" ticked the export’s Amount column no longer equals Collected', () => {
    const summary = collectionSummary(payments, range);
    const exported = filterLedger(ledger, { ...filter, includeVoided: true }).map((r) => r.payment.amountP);
    expect(sumPaise(exported) - summary.netP).toBe(summary.voidedP);
    expect(summary.voidedP).toBe(20_000);
  });
});

// ---------------------------------------------------------------- lakh formatting

describe('UAT money: amounts read the Indian way (lakh, crore)', () => {
  it('prints exact en-IN strings at every grouping boundary', () => {
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(100)).toBe('₹1');
    expect(formatINR(9_999_900)).toBe('₹99,999');
    expect(formatINR(10_000_000)).toBe('₹1,00,000');
    expect(formatINR(999_999_900)).toBe('₹99,99,999');
    expect(formatINR(1_000_000_000)).toBe('₹1,00,00,000');
    expect(formatINR(12_345_678)).toBe('₹1,23,456.78');
    expect(formatINR(-10_000_000)).toBe('-₹1,00,000');
  });

  it('tiles round to lakh and crore, never to "100k"', () => {
    expect(formatINRShort(10_000_000)).toBe('₹1L');
    expect(formatINRShort(9_996_000)).toBe('₹1L');
    expect(formatINRShort(1_000_000_000)).toBe('₹1Cr');
  });

  it('the receipt says the amount in words with lakh', () => {
    expect(rupeesInWords(10_000_000)).toBe('Rupees One Lakh Only');
  });
});

// ---------------------------------------------------------------- IST days

describe('UAT money: days and financial years turn over at midnight India time', () => {
  it('23:59:59 IST on 31 March is still last year; 00:00 IST on 1 April is the new one', () => {
    const lastSecond = new Date('2026-03-31T18:29:59Z');
    const firstSecond = new Date('2026-03-31T18:30:00Z');
    expect(todayISO(lastSecond)).toBe('2026-03-31');
    expect(todayISO(firstSecond)).toBe('2026-04-01');
    expect(dateISOFromEpoch(lastSecond.getTime())).toBe('2026-03-31');
    expect(financialYear(todayISO(lastSecond))).toBe('2025-26');
    expect(financialYear(todayISO(firstSecond))).toBe('2026-27');
    expect(nextReceiptNo([{ receiptNo: '2025-26/0412' }], todayISO(firstSecond))).toBe('2026-27/0001');
  });

  it('"Today" on the Money screen just after midnight IST is the new day only', () => {
    const today = todayISO(new Date('2026-07-01T18:30:30Z'));
    expect(presetRange('today', today)).toEqual({ from: '2026-07-02', to: '2026-07-02' });
    const summary = collectionSummary(
      [makePayment({ amountP: 5_000, paidOn: '2026-07-01' }), makePayment({ amountP: 7_000, paidOn: '2026-07-02' })],
      presetRange('today', today),
    );
    expect(summary.netP).toBe(7_000);
  });
});

// ---------------------------------------------------------------- GST

describe('UAT money: GST is taken out of the amount, at the rate of the day the money came', () => {
  it('₹1,500 at 5%: taxable + tax = ₹1,500, CGST + SGST = tax, to the paisa', () => {
    const s = splitInclusiveGst(150_000, 5);
    expect(s).toEqual({ ratePct: 5, grossP: 150_000, taxableP: 142_857, taxP: 7_143, cgstP: 3_571, sgstP: 3_572 });
  });

  it('the rate switches from 18% to 5% on 22 Sep 2025, by the day paid, on the printed receipt too', () => {
    expect(gstRateForDate('2025-09-21')).toBe(18);
    expect(gstRateForDate('2025-09-22')).toBe(5);
    const doc = (paidOn: string) =>
      buildReceiptDoc({
        gym: makeGym({ gstin: VALID_GSTIN }),
        payment: makePayment({ amountP: 118_000, paidOn, gstinAtSale: VALID_GSTIN }),
        member: makeMember(), membership: null, memberPayments: [], today: '2026-07-01',
      });
    expect(doc('2025-09-21').gst).toMatchObject({ ratePct: 18, taxableP: 100_000, taxP: 18_000, cgstP: 9_000, sgstP: 9_000 });
    expect(doc('2025-09-22').gst!.ratePct).toBe(5);
    expect(doc('2025-09-22').sacCode).toBe(GYM_SAC_CODE);
    expect(doc('2025-09-22').gstin).toBe(VALID_GSTIN);
  });

  it('every amount from ₹1 to ₹20,000 splits back exactly', () => {
    for (let p = 100; p <= 2_000_000; p += 997) {
      const s = splitInclusiveGst(p, 5);
      expect(s.taxableP + s.taxP).toBe(p);
      expect(s.cgstP + s.sgstP).toBe(s.taxP);
      expect(Number.isInteger(s.taxP)).toBe(true);
    }
  });

  it('FINDING F-12: tax is kept to the paisa, not rounded to the rupee (Section 170)', () => {
    // Section 170 CGST Act rounds the tax PAYABLE (in the return) to the nearest rupee. Whether a
    // per-receipt split must also be whole rupees is a question for the gym's accountant.
    expect(splitInclusiveGst(150_000, 5).taxP % 100).not.toBe(0);
  });
});
