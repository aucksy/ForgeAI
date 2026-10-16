/**
 * Admin app audit C7, the import findings (Audit/e2e-v2/C7-admin-app.md, 16 Oct 2026). Each test
 * failed before its fix.
 */
import { describe, expect, it } from 'vitest';

import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { decodeCsvBytes, guessColumns, guessFromValues, importAction, parseSheetDate, planImport, rowBringsTerm, termsPreview } from '../../src/crm/logic/importMembers';
import { termFromRow } from '../../src/crm/logic/importTerms';
import { planUndo } from '../../src/crm/logic/undoImport';
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

const HP = [...H, 'Payment Date'];

describe('C7-17: payments in a second file are added', () => {
  it('a payments list split in two files: both halves count', async () => {
    const first = await importRows([HP, ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '12000', '4000', '8000', '01/08/2026']], newDb(), 'imp-1');
    const { snap } = await importRows([HP, ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '12000', '4000', '4000', '01/09/2026']], first.db, 'imp-2');
    expect(snap.memberships).toHaveLength(1);
    expect(rupees(snap)).toEqual([4000, 4000]);
  });

  it('the same file again still adds nothing', async () => {
    const rows = [HP, ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '12000', '4000', '8000', '01/08/2026']];
    const first = await importRows(rows, newDb(), 'imp-1');
    const { snap } = await importRows(rows, first.db, 'imp-2');
    expect(rupees(snap)).toEqual([4000]);
  });
});

describe('C7-18 / C7-37: the owner can add plans and payments for members already in', () => {
  const rows = [
    H,
    ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '4500', '0'],
    ['Asha', '9829012345', 'Monthly', '01/10/2026', '31/10/2026', '1500', '1500', '0'],
  ];
  const roster = async () => {
    const db = newDb();
    await db.createMembers([member({ fullName: 'Riya', phone: '+919876543210' }), member({ fullName: 'Asha', phone: '+919829012345' })]);
    return (await db.load()).members;
  };

  it('every row "already a member": the owner gets "Add 2 plans and payments"; staff do not', async () => {
    const plan = planImport(rows, 0, mapOf(rows), await roster(), TODAY);
    expect(importAction(plan.rows, 'skip', 'owner')).toMatchObject({ enabled: true, label: 'Add 2 plans and payments' });
    expect(importAction(plan.rows, 'skip', 'staff').enabled).toBe(false);
  });

  it('those rows are not "skipped", and the preview counts every payment row', async () => {
    const plan = planImport(rows, 0, mapOf(rows), await roster(), TODAY);
    expect(plan.rows.every((r) => rowBringsTerm(r, 'owner'))).toBe(true);
    expect(plan.rows.some((r) => rowBringsTerm(r, 'staff'))).toBe(false);
    const repeat = [H, ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '2000', ''], ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '2500', '']];
    expect(termsPreview(planImport(repeat, 0, mapOf(repeat), [], TODAY).rows)).toMatchObject({ members: 1, paidP: 450000 });
  });
});

describe('C7-19: a plan already typed in by hand is not added again', () => {
  it('"1 Month" in the file for the same days as a hand-sold "Monthly" is skipped', async () => {
    const db = newDb();
    const m = await db.createMember(member({ fullName: 'Riya', phone: '+919876543210' }));
    const plan = await db.createPlan({ name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150000, joiningFeeP: 0, description: null, active: true, sortOrder: 1 } as never);
    await db.sellMembership({ memberId: m.id, planId: plan.id, startsOn: '2026-10-01', priceP: 150000, joiningFeeP: 0, notes: null, collectNowP: 150000, method: 'cash', reference: null, paidOn: '2026-10-01', soldBy: null });
    const { snap, result } = await importRows([H, ['Riya', '9876543210', '1 Month', '01/10/2026', '31/10/2026', '1500', '1500', '0']], db);
    expect(snap.memberships).toHaveLength(1);
    expect(rupees(snap)).toEqual([1500]);
    expect(result.skipped).toBe(1);
  });
});

describe('C7-20: an exact copy of a row is pointed out', () => {
  it('two identical rows with no payment date: the second says it may be a copy', () => {
    const rows = [H, ['Riya', '9876543210', 'Monthly', '01/10/2026', '31/10/2026', '1500', '1500', ''], ['Riya', '9876543210', 'Monthly', '01/10/2026', '31/10/2026', '1500', '1500', '']];
    const plan = planImport(rows, 0, mapOf(rows), [], TODAY);
    expect(plan.rows[1]!.warnings.join(' ')).toContain('row 2');
  });
});

describe('C7-21: Undo import keeps a member the gym edited since', () => {
  it('notes added after the import: the member stays', async () => {
    const db = newDb();
    const [m] = await db.createMembers([{ ...member({ fullName: 'Riya', phone: '+919876543210' }), importId: 'imp' } as never]);
    await db.updateMember(m!.id, { notes: 'Knee injury' });
    const undo = planUndo(await db.load(), 'imp');
    expect(undo.members).toEqual([]);
    expect(undo.kept.members).toBe(1);
  });
});

describe('C7-22: a sheet proven month-first is read month-first in every date column', () => {
  it('the expiry column with only ambiguous dates follows the joining column', () => {
    const rows = [
      ['Name', 'Mobile', 'Joining Date', 'Plan', 'Start Date', 'Expiry'],
      ['Riya', '9876543210', '12/25/2025', 'Monthly', '12/03/2025', '01/02/2026'],
    ];
    const r = planImport(rows, 0, mapOf(rows), [], TODAY).rows[0]!;
    expect(r.term?.endsOn).toBe('2026-01-02');
  });
});

describe('C7-23: a discount in the sheet keeps the right due', () => {
  it('total 6,000, paid 4,000, balance 1,000: price 5,000 and ₹1,000 due', () => {
    const t = termFromRow({ planName: 'Quarterly', startsOn: '2026-08-01', endsOn: '2026-10-31', joinedOn: null, totalP: 600000, paidP: 400000, dueP: 100000 });
    expect(t).toMatchObject({ priceP: 500000, paidP: 400000 });
  });
});

describe('C7-24: a plan that cannot be dated is said, and its money kept in the notes', () => {
  it('end before start', () => {
    const rows = [H, ['Riya', '9876543210', 'Quarterly', '01/10/2026', '01/09/2026', '5000', '1000', '4000']];
    const r = planImport(rows, 0, mapOf(rows), [], TODAY).rows[0]!;
    expect(r.term).toBeNull();
    expect(r.warnings.join(' ')).toContain('end date is before its start');
    expect(r.draft!.notes).toContain('Balance: ₹4,000');
  });

  it('a plan name with no length and no end date', () => {
    const rows = [['Name', 'Mobile', 'Plan', 'Start Date', 'Fees', 'Balance'], ['Riya', '9876543210', 'Gold', '01/10/2026', '5000', '4000']];
    const r = planImport(rows, 0, mapOf(rows), [], TODAY).rows[0]!;
    expect(r.term).toBeNull();
    expect(r.warnings.join(' ')).toContain('Gold');
    expect(r.draft!.notes).toContain('Balance: ₹4,000');
  });
});

describe('C7-38: a payments list sorted newest first keeps the real joining date', () => {
  it('joined on the earliest plan start of that member', () => {
    const rows = [
      ['Member Name', 'Mobile No', 'Package', 'Start Date', 'End Date', 'Amount Paid'],
      ['Riya', '9876543210', 'Yearly', '01/10/2026', '30/09/2027', '12000'],
      ['Riya', '9876543210', 'Yearly', '01/09/2025', '31/08/2026', '12000'],
    ];
    expect(planImport(rows, 0, mapOf(rows), [], TODAY).rows[0]!.draft!.joinedOn).toBe('2025-09-01');
  });
});

describe("C7-39: Excel's Unicode Text (UTF-16) file is read", () => {
  it('a UTF-16 file with its byte-order mark reads as text', () => {
    const text = 'Name\tMobile\r\nRiya\t9876543210\r\n';
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let i = 0; i < text.length; i += 1) bytes[2 + i * 2] = text.charCodeAt(i);
    expect(decodeCsvBytes(bytes)).toBe(text);
  });
});

describe('C7-45: an old .xls birthday before Oct 1954 is read', () => {
  it('Excel date number 15000 (1941) is a birthday; a bare year is not', () => {
    expect(parseSheetDate(15000, TODAY, true, true)).toBe('1941-01-24');
    expect(parseSheetDate(1990, TODAY, true, true)).toBeNull();
  });
});
