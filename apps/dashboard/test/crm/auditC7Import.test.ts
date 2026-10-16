/**
 * Admin app audit C7, the import findings (Audit/e2e-v2/C7-admin-app.md, 16 Oct 2026). Each test
 * failed before its fix.
 */
import { describe, expect, it } from 'vitest';

import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { guessColumns, guessFromValues, planImport } from '../../src/crm/logic/importMembers';
import type { MemberDraft } from '../../src/crm/types';

const TODAY = '2026-10-15';
const mapOf = (rows: unknown[][], header = 0) => guessFromValues(rows, header, guessColumns(rows[header] ?? []), TODAY);
const H = ['Member Name', 'Mobile No', 'Package', 'Start Date', 'End Date', 'Package Amount', 'Amount Paid', 'Balance'];

const member = (over: Partial<MemberDraft> = {}): MemberDraft =>
  ({
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
    batch: null,
    ...over,
  }) as MemberDraft;

const newDb = () => {
  let c = 1000;
  return new LocalCrmData({ store: memoryStore(), now: () => (c += 1), seed: () => emptySnapshot(0, 'Test Gym') });
};

/** The screen's import, in order: new members, then every row's plan and payment (owner). */
async function importRows(rows: unknown[][], db: LocalCrmData = newDb(), importId = 'imp') {
  const roster = (await db.load()).members;
  const plan = planImport(rows, 0, mapOf(rows), roster, TODAY);
  const adds = plan.rows.filter((r) => r.status === 'add');
  await db.createMembers(adds.map((r) => ({ ...r.draft!, importId })) as never);
  const items = plan.rows
    .filter((r) => r.term && r.draft)
    .sort((a, b) => a.rowNumber - b.rowNumber)
    .map((r) => ({ phone: r.draft!.phone, term: r.term! }));
  const result = await db.importTerms(items, importId);
  return { plan, result, db, snap: await db.load() };
}
const rupees = (snap: { payments: { amountP: number }[] }) => snap.payments.map((p) => p.amountP / 100);

describe("C7-3: a family's shared mobile never puts one person's plan on another", () => {
  it('a different name on a mobile already in the gym: the plan and money are not added', async () => {
    const db = newDb();
    await db.createMember(member({ fullName: 'Ramesh Gupta', phone: '+919876543210' }));
    const { plan, snap } = await importRows([H, ['Sunita Gupta', '9876543210', '3 Months', '01/10/2026', '31/12/2026', '6000', '6000', '0']], db);
    expect(plan.rows[0]!.term).toBeNull();
    expect(plan.rows[0]!.warnings.join(' ')).toContain('Ramesh Gupta');
    expect(snap.memberships).toHaveLength(0);
    expect(snap.payments).toHaveLength(0);
  });

  it('the same person written a little differently still gets their plan', async () => {
    const db = newDb();
    await db.createMember(member({ fullName: 'Ramesh Gupta', phone: '+919876543210' }));
    const { snap } = await importRows([H, ['RAMESH', '9876543210', '3 Months', '01/10/2026', '31/12/2026', '6000', '6000', '0']], db);
    expect(snap.memberships).toHaveLength(1);
  });
});

describe('C7-4: a gym plan and a PT plan on the same dates stay two plans', () => {
  it('both are kept, with both payments', async () => {
    const { snap } = await importRows([
      H,
      ['Riya', '9876543210', 'Gym 3 Months', '01/08/2026', '31/10/2026', '6000', '6000', '0'],
      ['Riya', '9876543210', 'Personal Training 3 Months', '01/08/2026', '31/10/2026', '9000', '9000', '0'],
    ]);
    expect(snap.memberships.map((m) => [m.planName, m.priceP / 100])).toEqual([
      ['Gym 3 Months', 6000],
      ['Personal Training 3 Months', 9000],
    ]);
    expect(rupees(snap)).toEqual([6000, 9000]);
  });
});

describe('C7-5: fees written "Rs. 1,500/-" and the like are read', () => {
  const HF = ['Name', 'Mobile', 'Plan', 'Start Date', 'Fees'];
  it.each(['Rs. 1,500/-', 'Rs 1500', 'INR 1500', '1500 (paid)', '1.5k', '₹1,500', '1500/- only'])('%s is ₹1,500', (cell) => {
    const rows = [HF, ['Riya', '9876543210', 'Monthly', '01/10/2026', cell]];
    const r = planImport(rows, 0, mapOf(rows), [], TODAY).rows[0]!;
    expect(r.term).toMatchObject({ priceP: 150000, paidP: 150000 });
  });

  it('a fees cell that cannot be read is said on the row', () => {
    const rows = [HF, ['Riya', '9876543210', 'Monthly', '01/10/2026', 'fifteen hundred']];
    const r = planImport(rows, 0, mapOf(rows), [], TODAY).rows[0]!;
    expect(r.warnings.join(' ')).toContain('fifteen hundred');
  });
});

describe('C7-6: "Total Fees / Paid Fees / Due Fees" columns', () => {
  it('total is the price, paid is paid, due is due', () => {
    const rows = [
      ['Name', 'Mobile', 'Plan', 'Start Date', 'Total Fees', 'Paid Fees', 'Due Fees'],
      ['Riya', '9876543210', 'Quarterly', '01/10/2026', '6000', '2000', '4000'],
    ];
    const map = mapOf(rows);
    expect([map.total, map.amount, map.due]).toEqual([4, 5, 6]);
    expect(planImport(rows, 0, map, [], TODAY).rows[0]!.term).toMatchObject({ priceP: 600000, paidP: 200000 });
  });

  it('a header with "total" is never the amount paid', () => {
    expect(guessColumns(['Name', 'Mobile', 'Total Fee Amount']).amount).toBeNull();
  });
});

describe('C7-7: a "Joining Fee" column is never the amount paid', () => {
  it('6,500 paid and nothing due', () => {
    const rows = [
      ['Name', 'Mobile', 'Plan', 'Start Date', 'Joining Fee', 'Package Amount', 'Amount Paid', 'Balance'],
      ['Riya', '9876543210', 'Quarterly', '01/10/2026', '500', '6000', '6500', '0'],
    ];
    const map = mapOf(rows);
    expect(map.amount).toBe(6);
    expect(planImport(rows, 0, map, [], TODAY).rows[0]!.term).toMatchObject({ paidP: 650000, priceP: 650000 });
  });
});

describe('C7-8: a Member ID column is never taken as fees', () => {
  it('"Amt" is the amount paid and the ids are left alone', () => {
    const rows = [
      ['Member ID', 'Name', 'Mobile', 'Plan', 'Start Date', 'Amt'],
      ['1001', 'Riya', '9876543210', 'Monthly', '01/10/2026', '1500'],
      ['1002', 'Asha', '9829012345', 'Monthly', '01/10/2026', '1500'],
    ];
    const map = mapOf(rows);
    expect(map.amount).toBe(5);
    expect(map.total).toBeNull();
    expect(planImport(rows, 0, map, [], TODAY).rows.map((r) => r.term?.paidP)).toEqual([150000, 150000]);
  });

  it('a column of running numbers (1001, 1002, 1003) under an unknown header is not money', () => {
    const rows = [
      ['Ref', 'Name', 'Mobile', 'Plan', 'Start Date', 'Rokda'],
      ['1001', 'Riya', '9876543210', 'Monthly', '01/10/2026', '1500'],
      ['1002', 'Asha', '9829012345', 'Monthly', '01/10/2026', '1800'],
      ['1003', 'Amit', '9829012346', 'Monthly', '01/10/2026', '1200'],
    ];
    const map = mapOf(rows);
    expect(map.amount).toBe(5);
    expect(map.total).toBeNull();
  });
});

describe('C7-9: a running "paid so far" column with a balance column', () => {
  it('₹6,000 paid and ₹4,000 due, never ₹10,000 paid', async () => {
    const { snap } = await importRows([
      H,
      ['Riya', '9876543210', 'Yearly', '01/04/2026', '31/03/2027', '10000', '2000', '8000'],
      ['Riya', '9876543210', 'Yearly', '01/04/2026', '31/03/2027', '10000', '4000', '6000'],
      ['Riya', '9876543210', 'Yearly', '01/04/2026', '31/03/2027', '10000', '6000', '4000'],
    ]);
    expect(rupees(snap)).toEqual([2000, 2000, 2000]);
    expect(snap.memberships[0]!.priceP).toBe(1000000);
  });

  it('instalments (not a running total) with a falling balance count each instalment', async () => {
    const { snap } = await importRows([
      H,
      ['Riya', '9876543210', 'Yearly', '01/04/2026', '31/03/2027', '10000', '2000', '8000'],
      ['Riya', '9876543210', 'Yearly', '01/04/2026', '31/03/2027', '10000', '2000', '6000'],
      ['Riya', '9876543210', 'Yearly', '01/04/2026', '31/03/2027', '10000', '2000', '4000'],
    ]);
    expect(rupees(snap)).toEqual([2000, 2000, 2000]);
    expect(snap.memberships[0]!.priceP).toBe(1000000);
  });
});
