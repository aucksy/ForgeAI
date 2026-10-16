/**
 * Review of the admin-app audit C7 fixes (16 Oct 2026): five holes the adversarial review found.
 * Each test failed before its fix.
 */
import { describe, expect, it } from 'vitest';

import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { guessColumns, guessFromValues, planImport } from '../../src/crm/logic/importMembers';
import { validateSale } from '../../src/crm/logic/selling';
import type { MemberDraft } from '../../src/crm/types';
import { makeMembership } from './fixtures';

const TODAY = '2026-10-15';
const mapOf = (rows: unknown[][]) => guessFromValues(rows, 0, guessColumns(rows[0] ?? []), TODAY);
const H = ['Member Name', 'Mobile No', 'Package', 'Start Date', 'End Date', 'Package Amount', 'Amount Paid', 'Balance'];
const HP = ['Member Name', 'Mobile No', 'Package', 'Start Date', 'End Date', 'Package Amount', 'Amount Paid', 'Payment Date'];

const member = (over: Partial<MemberDraft> = {}): MemberDraft =>
  ({
    fullName: 'Riya',
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

async function importRows(rows: unknown[][], db: LocalCrmData, importId: string) {
  const plan = planImport(rows, 0, mapOf(rows), (await db.load()).members, TODAY);
  await db.createMembers(plan.rows.filter((r) => r.status === 'add').map((r) => ({ ...r.draft!, importId })) as never);
  const items = plan.rows.filter((r) => r.term && r.draft).map((r) => ({ phone: r.draft!.phone, term: r.term! }));
  await db.importTerms(items, importId);
  return db.load();
}
const rupees = (snap: { payments: { amountP: number }[] }) => snap.payments.map((p) => p.amountP / 100);

describe('review 1: a PT plan is never swallowed by a gym plan on the same dates', () => {
  it('hand-sold "Gym 3 Months" + file "Personal Training 3 Months" ₹9,000: the PT plan is added', async () => {
    const db = newDb();
    const m = await db.createMember(member());
    const gym = await db.createPlan({ name: 'Gym 3 Months', durationUnit: 'month', durationCount: 3, priceP: 600000, joiningFeeP: 0, description: null, active: true, sortOrder: 1 } as never);
    await db.sellMembership({ memberId: m.id, planId: gym.id, startsOn: '2026-08-01', priceP: 600000, joiningFeeP: 0, notes: null, collectNowP: 600000, method: 'cash', reference: null, paidOn: '2026-08-01', soldBy: null });
    const snap = await importRows([H, ['Riya', '9876543210', 'Personal Training 3 Months', '01/08/2026', '31/10/2026', '9000', '9000', '0']], db, 'imp-1');
    expect(snap.memberships.map((x) => x.planName)).toEqual(['Gym 3 Months', 'Personal Training 3 Months']);
    expect(rupees(snap)).toEqual([6000, 9000]);
  });

  it('two files (gym ₹6,000, then PT ₹9,000): two plans, both payments', async () => {
    const db = newDb();
    await importRows([H, ['Riya', '9876543210', 'Gym 3 Months', '01/08/2026', '31/10/2026', '6000', '6000', '0']], db, 'imp-1');
    const snap = await importRows([H, ['Riya', '9876543210', 'Personal Training 3 Months', '01/08/2026', '31/10/2026', '9000', '9000', '0']], db, 'imp-2');
    expect(snap.memberships.map((x) => [x.planName, x.priceP / 100])).toEqual([
      ['Gym 3 Months', 6000],
      ['Personal Training 3 Months', 9000],
    ]);
    expect(rupees(snap)).toEqual([6000, 9000]);
  });
});

describe('review 2: importing the same file again adds nothing', () => {
  it('running payments with dates and no balance: no false ₹1,500 the second time', async () => {
    const rows = [
      HP,
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '6000', '2000', '01/08/2026'],
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '6000', '4500', '01/09/2026'],
    ];
    const db = newDb();
    const first = await importRows(rows, db, 'imp-1');
    expect(rupees(first)).toEqual([2000, 2500]);
    const again = await importRows(rows, db, 'imp-2');
    expect(rupees(again)).toEqual([2000, 2500]);
  });
});

describe('review 5: the desk asks the joining fee only of someone with no plan yet (as the server)', () => {
  it('a renewal after a plan sold with no joining fee is not refused', () => {
    const last = makeMembership({ joiningFeeP: 0, startsOn: '2026-09-14', endsOn: '2026-10-14' });
    const sale = { planId: 'p', startsOn: TODAY, priceP: 120000, joiningFeeP: 0, collectNowP: 0, listPriceP: 120000, listJoiningFeeP: 50000 };
    expect(validateSale(sale, [last], TODAY, 'staff')).toBeNull();
    expect(validateSale(sale, [], TODAY, 'staff')).toMatchObject({ field: 'joiningFeeP' });
  });
});
