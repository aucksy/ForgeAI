import { describe, expect, it } from 'vitest';

import {
  AGING_ORDER,
  agingTotals,
  bucketFor,
  buildLedger,
  collectionSummary,
  duesByMember,
  duesLedger,
  filterLedger,
  financialYearRange,
  inRange,
  ledgerMatchesQuery,
  normalizeRange,
  paymentsInRange,
  presetRange,
  type LedgerFilter,
} from '../../src/crm/logic/collections';
import { PAYMENT_METHODS } from '../../src/crm/logic/payments';
import { sumPaise } from '../../src/crm/logic/money';
import { makeMember, makeMembership, makePayment } from './fixtures';

const TODAY = '2026-07-26';

// ---------------------------------------------------------------- ranges

describe('a range includes both of its ends', () => {
  const range = { from: '2026-07-01', to: '2026-07-31' };

  it('contains the first and the last day', () => {
    expect(inRange('2026-07-01', range)).toBe(true);
    expect(inRange('2026-07-31', range)).toBe(true);
  });

  it('excludes the day either side', () => {
    expect(inRange('2026-06-30', range)).toBe(false);
    expect(inRange('2026-08-01', range)).toBe(false);
  });

  it('reads a backwards range the way it was clearly meant', () => {
    const backwards = { from: '2026-07-31', to: '2026-07-01' };
    expect(normalizeRange(backwards)).toEqual(range);
    // Without the swap this silently reports ₹0 for a month the gym traded in.
    expect(inRange('2026-07-15', backwards)).toBe(true);
  });
});

describe('range presets', () => {
  it('today is one day', () => {
    expect(presetRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY });
  });

  it('last 7 days is 7 days including today, not 8', () => {
    expect(presetRange('last7', TODAY)).toEqual({ from: '2026-07-20', to: '2026-07-26' });
  });

  it('this month runs to the end of the month', () => {
    expect(presetRange('thisMonth', TODAY)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('last month is the whole previous month, including across a year boundary', () => {
    expect(presetRange('lastMonth', TODAY)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
    expect(presetRange('lastMonth', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('last month clamps a short February rather than landing on 31 Feb', () => {
    expect(presetRange('lastMonth', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetRange('lastMonth', '2028-03-31')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('the financial year runs April to March, not January to December', () => {
    expect(presetRange('thisFy', TODAY)).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    // A February day belongs to the year that started the previous April.
    expect(financialYearRange('2027-02-12')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(financialYearRange('2026-03-31')).toEqual({ from: '2025-04-01', to: '2026-03-31' });
    expect(financialYearRange('2026-04-01')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
  });
});

// ---------------------------------------------------------------- collections

describe('what the gym actually collected', () => {
  const july = { from: '2026-07-01', to: '2026-07-31' };

  const payments = [
    makePayment({ id: 'p1', amountP: 150_000, method: 'cash', paidOn: '2026-07-01' }),
    makePayment({ id: 'p2', amountP: 250_000, method: 'upi', paidOn: '2026-07-01' }),
    makePayment({ id: 'p3', amountP: 100_000, method: 'upi', paidOn: '2026-07-15' }),
    makePayment({ id: 'p4', amountP: 500_000, method: 'card', paidOn: '2026-07-31' }),
    makePayment({ id: 'p5', amountP: 900_000, method: 'cash', paidOn: '2026-08-01' }),
    makePayment({ id: 'p6', amountP: 700_000, method: 'cash', paidOn: '2026-06-30' }),
  ];

  it('counts only the days inside the range', () => {
    expect(paymentsInRange(payments, july).map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('totals the money and the receipts', () => {
    const s = collectionSummary(payments, july);
    expect(s.netP).toBe(1_000_000);
    expect(s.receiptsN).toBe(4);
    expect(s.largestP).toBe(500_000);
    expect(s.averageP).toBe(250_000);
  });

  it('reports an empty period as zero, not as NaN', () => {
    const s = collectionSummary(payments, { from: '2026-09-01', to: '2026-09-30' });
    expect(s.netP).toBe(0);
    expect(s.receiptsN).toBe(0);
    expect(s.averageP).toBe(0);
    expect(s.largestP).toBe(0);
  });

  it('splits by method with every column present even at zero', () => {
    const s = collectionSummary(payments, july);
    expect(s.byMethod.map((m) => m.method)).toEqual([...PAYMENT_METHODS]);

    const byName = Object.fromEntries(s.byMethod.map((m) => [m.method, m]));
    expect(byName.cash.amountP).toBe(150_000);
    expect(byName.upi.amountP).toBe(350_000);
    expect(byName.upi.countN).toBe(2);
    expect(byName.card.amountP).toBe(500_000);
    expect(byName.bank).toEqual({ method: 'bank', countN: 0, amountP: 0 });
  });

  it('never loses money between the total and the method split', () => {
    const s = collectionSummary(payments, july);
    expect(sumPaise(s.byMethod.map((m) => m.amountP))).toBe(s.netP);
    expect(s.byMethod.reduce((n, m) => n + m.countN, 0)).toBe(s.receiptsN);
  });

  it('gives an unrecognised method its own row rather than dropping it', () => {
    // A row written by a newer version of the app must still be visible in the
    // report, or money silently disappears from a total while sitting in the ledger.
    const odd = makePayment({ id: 'px', amountP: 12_300, method: 'crypto' as never, paidOn: '2026-07-05' });
    const s = collectionSummary([...payments, odd], july);
    expect(s.netP).toBe(1_012_300);
    expect(sumPaise(s.byMethod.map((m) => m.amountP))).toBe(s.netP);
    expect(s.byMethod.some((m) => (m.method as string) === 'crypto')).toBe(true);
  });

  it('buckets by day, ascending, skipping days with nothing', () => {
    const s = collectionSummary(payments, july);
    expect(s.byDay).toEqual([
      { day: '2026-07-01', countN: 2, amountP: 400_000 },
      { day: '2026-07-15', countN: 1, amountP: 100_000 },
      { day: '2026-07-31', countN: 1, amountP: 500_000 },
    ]);
  });
});

describe('voided receipts are reported, never netted off', () => {
  const july = { from: '2026-07-01', to: '2026-07-31' };
  const rows = [
    makePayment({ id: 'ok', amountP: 150_000, method: 'cash', paidOn: '2026-07-10' }),
    makePayment({
      id: 'void',
      amountP: 999_900,
      method: 'cash',
      paidOn: '2026-07-10',
      voided: true,
      voidReason: 'Entered twice',
    }),
  ];

  it('keeps the void out of the total and out of every split', () => {
    const s = collectionSummary(rows, july);
    expect(s.netP).toBe(150_000);
    expect(s.receiptsN).toBe(1);
    expect(s.byDay).toEqual([{ day: '2026-07-10', countN: 1, amountP: 150_000 }]);
    expect(s.byMethod.find((m) => m.method === 'cash')?.amountP).toBe(150_000);
    expect(s.largestP).toBe(150_000);
  });

  it('still reports it so the report reconciles against the ledger', () => {
    const s = collectionSummary(rows, july);
    expect(s.voidedP).toBe(999_900);
    expect(s.voidedN).toBe(1);
  });
});

// ---------------------------------------------------------------- ledger

describe('the ledger table', () => {
  const riya = makeMember({ id: 'm1', fullName: 'Riya Sharma', phone: '+919876543210' });
  const arjun = makeMember({ id: 'm2', fullName: 'Arjun Mehta', phone: '+919812345678' });
  const term = makeMembership({ id: 'ms1', memberId: 'm1', planName: 'Quarterly' });

  const payments = [
    makePayment({ id: 'a', memberId: 'm1', membershipId: 'ms1', paidOn: '2026-07-01', receiptNo: '2026-27/0001', createdAt: 1 }),
    makePayment({ id: 'b', memberId: 'm2', membershipId: null, paidOn: '2026-07-20', receiptNo: '2026-27/0002', reference: 'UPI9931', createdAt: 2 }),
    makePayment({ id: 'c', memberId: 'ghost', membershipId: null, paidOn: '2026-07-20', receiptNo: '2026-27/0003', createdAt: 3 }),
  ];

  const rows = buildLedger(payments, [riya, arjun], [term]);

  it('is newest first, breaking a same-day tie by when it was entered', () => {
    expect(rows.map((r) => r.payment.id)).toEqual(['c', 'b', 'a']);
  });

  it('joins the member and the term it was against', () => {
    const a = rows.find((r) => r.payment.id === 'a');
    expect(a?.member?.fullName).toBe('Riya Sharma');
    expect(a?.membership?.planName).toBe('Quarterly');
  });

  it('keeps a payment whose member row is missing instead of hiding the money', () => {
    const orphan = rows.find((r) => r.payment.id === 'c');
    expect(orphan).toBeDefined();
    expect(orphan?.member).toBeNull();
  });

  it('finds a row by receipt number, name, reference or phone digits', () => {
    const b = rows.find((r) => r.payment.id === 'b')!;
    expect(ledgerMatchesQuery(b, '0002')).toBe(true);
    expect(ledgerMatchesQuery(b, 'arjun')).toBe(true);
    expect(ledgerMatchesQuery(b, 'upi9931')).toBe(true);
    expect(ledgerMatchesQuery(b, '5678')).toBe(true);
    expect(ledgerMatchesQuery(b, 'riya')).toBe(false);
    expect(ledgerMatchesQuery(b, '')).toBe(true);
  });

  it('does not match a two-digit fragment as a phone number', () => {
    const b = rows.find((r) => r.payment.id === 'b')!;
    // Any two digits appear in almost every number; matching on them would make
    // the search useless. It falls back to a text match, which "56" is not.
    expect(ledgerMatchesQuery(b, '56')).toBe(false);
  });
});

describe('ledger filters', () => {
  const base: LedgerFilter = {
    range: { from: '2026-07-01', to: '2026-07-31' },
    method: 'all',
    query: '',
    includeVoided: false,
  };

  const member = makeMember({ id: 'm1', fullName: 'Riya Sharma' });
  const rows = buildLedger(
    [
      makePayment({ id: 'cash', memberId: 'm1', method: 'cash', paidOn: '2026-07-10' }),
      makePayment({ id: 'upi', memberId: 'm1', method: 'upi', paidOn: '2026-07-11' }),
      makePayment({ id: 'gone', memberId: 'm1', method: 'cash', paidOn: '2026-07-12', voided: true }),
      makePayment({ id: 'old', memberId: 'm1', method: 'cash', paidOn: '2026-06-10' }),
    ],
    [member],
    [],
  );

  it('hides voided rows by default but keeps them reachable', () => {
    expect(filterLedger(rows, base).map((r) => r.payment.id)).toEqual(['upi', 'cash']);
    expect(filterLedger(rows, { ...base, includeVoided: true }).map((r) => r.payment.id)).toEqual([
      'gone',
      'upi',
      'cash',
    ]);
  });

  it('filters by method', () => {
    expect(filterLedger(rows, { ...base, method: 'upi' }).map((r) => r.payment.id)).toEqual(['upi']);
  });

  it('filters by range', () => {
    expect(
      filterLedger(rows, { ...base, range: { from: '2026-06-01', to: '2026-06-30' } }).map(
        (r) => r.payment.id,
      ),
    ).toEqual(['old']);
  });
});

// ---------------------------------------------------------------- dues

describe('how old a debt is decides the phone call', () => {
  it('buckets on the boundaries, not around them', () => {
    expect(bucketFor(-1)).toBe('upcoming');
    expect(bucketFor(0)).toBe('d0_30');
    expect(bucketFor(30)).toBe('d0_30');
    expect(bucketFor(31)).toBe('d31_60');
    expect(bucketFor(60)).toBe('d31_60');
    expect(bucketFor(61)).toBe('d60plus');
  });

  it('does not treat money taken in advance as overdue', () => {
    // Through the real ledger, not another `bucketFor(-n)` call: repeating the
    // same branch with a different negative number tests nothing new. What
    // matters is that a term sold for next week reaches the owner's list as a
    // sale rather than as a debt she is late chasing.
    const member = makeMember({ id: 'm1' });
    const advance = makeMembership({
      id: 'ms-next-week',
      memberId: 'm1',
      priceP: 300_000,
      joiningFeeP: 0,
      startsOn: '2026-08-02',
    });

    const rows = duesLedger([member], [advance], [], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].ageDays).toBe(-7);
    expect(rows[0].bucket).toBe('upcoming');
    expect(agingTotals(rows).find((t) => t.bucket === 'd0_30')?.amountP).toBe(0);
  });
});

describe('the dues ledger', () => {
  const riya = makeMember({ id: 'm1', fullName: 'Riya Sharma' });
  const arjun = makeMember({ id: 'm2', fullName: 'Arjun Mehta' });
  const gone = makeMember({ id: 'm3', fullName: 'Old Member', archived: true });

  const terms = [
    makeMembership({ id: 'ms1', memberId: 'm1', priceP: 300_000, joiningFeeP: 0, startsOn: '2026-07-20' }),
    makeMembership({ id: 'ms2', memberId: 'm1', priceP: 300_000, joiningFeeP: 0, startsOn: '2026-03-01' }),
    makeMembership({ id: 'ms3', memberId: 'm2', priceP: 120_000, joiningFeeP: 0, startsOn: '2026-07-26' }),
    makeMembership({ id: 'ms4', memberId: 'm3', priceP: 500_000, joiningFeeP: 0, startsOn: '2026-05-01' }),
  ];

  const payments = [
    makePayment({ id: 'x1', memberId: 'm1', membershipId: 'ms1', amountP: 100_000 }),
    makePayment({ id: 'x2', memberId: 'm2', membershipId: 'ms3', amountP: 120_000 }),
  ];

  const rows = duesLedger([riya, arjun, gone], terms, payments, TODAY);

  it('lists only what is genuinely unpaid', () => {
    // ms3 is settled in full, so Arjun does not appear at all.
    expect(rows.map((r) => r.membership.id)).toEqual(['ms2', 'ms4', 'ms1']);
  });

  it('is ordered oldest debt first', () => {
    expect(rows.map((r) => r.ageDays)).toEqual([147, 86, 6]);
  });

  it('counts an archived member’s debt — archiving is not forgiveness', () => {
    const archived = rows.find((r) => r.member.id === 'm3');
    expect(archived?.unpaidP).toBe(500_000);
  });

  it('subtracts part-payments', () => {
    expect(rows.find((r) => r.membership.id === 'ms1')?.unpaidP).toBe(200_000);
  });

  it('puts a voided receipt’s money BACK on the tab', () => {
    // Voiding a receipt is the gym saying that money never arrived. If the due
    // did not reappear, a mistyped receipt would write off a real debt.
    const voided = [makePayment({ id: 'v', memberId: 'm2', membershipId: 'ms3', amountP: 120_000, voided: true })];
    const after = duesLedger([arjun], [terms[2]], voided, TODAY);
    expect(after).toHaveLength(1);
    expect(after[0].unpaidP).toBe(120_000);
  });

  it('drops a cancelled term — the gym has stopped chasing it', () => {
    const cancelled = [{ ...terms[3], cancelled: true }];
    expect(duesLedger([gone], cancelled, [], TODAY)).toEqual([]);
  });

  it('ignores a term whose member no longer exists', () => {
    expect(duesLedger([], terms, [], TODAY)).toEqual([]);
  });
});

describe('aging totals and the per-member roll-up', () => {
  const riya = makeMember({ id: 'm1', fullName: 'Riya Sharma' });
  const terms = [
    makeMembership({ id: 'ms1', memberId: 'm1', priceP: 100_000, joiningFeeP: 0, startsOn: '2026-07-20' }),
    makeMembership({ id: 'ms2', memberId: 'm1', priceP: 200_000, joiningFeeP: 0, startsOn: '2026-03-01' }),
  ];
  const rows = duesLedger([riya], terms, [], TODAY);

  it('keeps every bucket so the report rows never shift', () => {
    const totals = agingTotals(rows);
    expect(totals.map((t) => t.bucket)).toEqual([...AGING_ORDER]);
    expect(totals.find((t) => t.bucket === 'd60plus')).toEqual({
      bucket: 'd60plus',
      countN: 1,
      amountP: 200_000,
    });
    expect(totals.find((t) => t.bucket === 'upcoming')).toEqual({
      bucket: 'upcoming',
      countN: 0,
      amountP: 0,
    });
  });

  it('every rupee of dues lands in exactly one bucket', () => {
    const totals = agingTotals(rows);
    expect(sumPaise(totals.map((t) => t.amountP))).toBe(sumPaise(rows.map((r) => r.unpaidP)));
  });

  it('rolls a member up to one row carrying their OLDEST debt', () => {
    const byMember = duesByMember(rows);
    expect(byMember).toHaveLength(1);
    expect(byMember[0].totalP).toBe(300_000);
    expect(byMember[0].oldestAgeDays).toBe(147);
    expect(byMember[0].bucket).toBe('d60plus');
    expect(byMember[0].terms).toHaveLength(2);
  });
});
