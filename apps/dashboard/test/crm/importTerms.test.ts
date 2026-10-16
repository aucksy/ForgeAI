/**
 * Data migration (15 Oct 2026, owner: "I do not want to deal with each and every format
 * individually... they will be concerned about their data"). A rival's export arrives as members
 * WITH their plans, dates and payments — whatever the columns are called — and importing the same
 * file twice adds nothing.
 */
import { describe, expect, it } from 'vitest';

import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { guessColumns, guessFromValues, planImport, rowVerdict } from '../../src/crm/logic/importMembers';
import { lengthBetween, lengthFromPlanName, termFromRow } from '../../src/crm/logic/importTerms';

const TODAY = '2026-10-15';

/** The column guess the screen makes: names first, then what is in the columns. */
const mapOf = (rows: unknown[][], header = 0) => guessFromValues(rows, header, guessColumns(rows[header] ?? []), TODAY);

describe('a plan becomes a real membership', () => {
  it('reads a plan length from its name', () => {
    expect(lengthFromPlanName('3 Months')).toEqual({ unit: 'month', count: 3 });
    expect(lengthFromPlanName('Quarterly Gym')).toEqual({ unit: 'month', count: 3 });
    expect(lengthFromPlanName('Half Yearly')).toEqual({ unit: 'month', count: 6 });
    expect(lengthFromPlanName('Annual + PT')).toEqual({ unit: 'month', count: 12 });
    expect(lengthFromPlanName('1 yr')).toEqual({ unit: 'month', count: 12 });
    expect(lengthFromPlanName('45 days')).toEqual({ unit: 'day', count: 45 });
    expect(lengthFromPlanName('Monthly')).toEqual({ unit: 'month', count: 1 });
    expect(lengthFromPlanName('Gold')).toBeNull();
  });

  it('measures whole months between the panel-style start and end, else days', () => {
    expect(lengthBetween('2026-08-15', '2026-11-14')).toEqual({ unit: 'month', count: 3 });
    expect(lengthBetween('2026-08-15', '2026-09-28')).toEqual({ unit: 'day', count: 45 });
  });

  it('works out the start from the end and the plan name, and never invents a due', () => {
    expect(termFromRow({ planName: '3 Months', startsOn: null, endsOn: '2026-11-14', joinedOn: null, totalP: null, paidP: 450000, dueP: null })).toMatchObject({
      startsOn: '2026-08-15',
      endsOn: '2026-11-14',
      priceP: 450000,
      paidP: 450000,
    });
    // Paid + due = the price; the receipt is only what was paid.
    expect(termFromRow({ planName: 'Gold', startsOn: '2026-10-01', endsOn: '2027-09-30', joinedOn: null, totalP: null, paidP: 1000000, dueP: 200000 })).toMatchObject({ priceP: 1200000, paidP: 1000000, length: { unit: 'month', count: 12 } });
    // Price and due, no paid column: paid = price - due.
    expect(termFromRow({ planName: 'Gold', startsOn: '2026-10-01', endsOn: '2026-10-31', joinedOn: null, totalP: 300000, paidP: null, dueP: 100000 })).toMatchObject({ priceP: 300000, paidP: 200000 });
    // No end and no length: no membership (the plan stays in the notes).
    expect(termFromRow({ planName: 'Gold', startsOn: '2026-10-01', endsOn: null, joinedOn: null, totalP: null, paidP: null, dueP: null })).toBeNull();
    // A start after the end is not a term.
    expect(termFromRow({ planName: 'Gold', startsOn: '2026-12-01', endsOn: '2026-10-31', joinedOn: null, totalP: null, paidP: null, dueP: null })).toBeNull();
  });
});

describe('any sheet layout', () => {
  it('a Fitness Force style export: its own column names', () => {
    const rows = [
      ['Member Name', 'Mobile No', 'Membership Type Name', 'Membership Start Date', 'Membership End Date', 'Total Membership Value', 'Amount Paid', 'Balance'],
      ['Riya Sharma', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4,500', '3,000', '1,500'],
    ];
    const map = mapOf(rows);
    expect(map).toMatchObject({ fullName: 0, phone: 1, plan: 2, startDate: 3, expiry: 4, total: 5, amount: 6, due: 7 });
    const r = planImport(rows, 0, map, [], TODAY).rows[0]!;
    expect(r.status).toBe('add');
    expect(r.term).toMatchObject({ planName: 'Quarterly', startsOn: '2026-08-01', endsOn: '2026-10-31', priceP: 450000, paidP: 300000 });
  });

  it('a register whose columns say nothing useful: placed by what is in them', () => {
    const rows = [
      ['Sr', 'Col A', 'Col B', 'Col C', 'Col D', 'Col E', 'Col F'],
      ['1', 'Asha Verma', '+91 98290-12345', '12/05/1994', '01/09/2026', '30/11/2026', '₹3,000/-'],
      ['2', 'Bilal Khan', '98290 54321', '03/02/1990', '15/09/2026', '14/12/2026', '3,000'],
      ['3', 'Dev Rao', '9876543210', '22/11/1998', '01/10/2026', '31/12/2026', '3000'],
    ];
    const map = mapOf(rows);
    expect(map.phone).toBe(2);
    expect(map.dateOfBirth).toBe(3);
    expect(map.expiry).toBe(5);
    expect(map.joinedOn).toBe(4);
    expect(map.amount).toBe(6);
    // The name column needs a word ("Col A" says nothing): the owner picks it on the screen.
    expect(map.fullName).toBeNull();
  });

  it('header names win over value guesses, and a mobile column is never money', () => {
    const rows = [
      ['Name', 'Contact', 'Fees'],
      ['Riya', '9876543210', '1500'],
      ['Asha', '9829012345', '2000'],
    ];
    const map = mapOf(rows);
    expect(map).toMatchObject({ fullName: 0, phone: 1, amount: 2 });
  });
});

describe('saving: memberships and receipts, never twice', () => {
  const make = async () => {
    let clock = 1_000;
    const db = new LocalCrmData({ store: memoryStore(), now: () => (clock += 1), seed: () => emptySnapshot(0, 'Test Gym') });
    await db.createMembers([
      { fullName: 'Riya Sharma', phone: '+919876543210', email: null, gender: 'female', dateOfBirth: null, address: null, emergencyName: null, emergencyPhone: null, joinedOn: '2026-08-01', photoUri: null, notes: null, archived: false, batch: null },
      { fullName: 'Asha Verma', phone: '+919829012345', email: null, gender: 'female', dateOfBirth: null, address: null, emergencyName: null, emergencyPhone: null, joinedOn: '2026-08-01', photoUri: null, notes: null, archived: false, batch: null },
    ] as never);
    return db;
  };
  const term = (planName: string, startsOn: string, endsOn: string, priceP: number, paidP: number) => ({
    planName,
    startsOn,
    endsOn,
    priceP,
    paidP,
    length: lengthBetween(startsOn, endsOn),
  });

  it('makes the plan once, a membership per member with the SHEET\'s dates, and a receipt for what was paid', async () => {
    const db = await make();
    const r = await db.importTerms(
      [
        { phone: '+919876543210', term: term('Quarterly', '2026-08-01', '2026-10-31', 450000, 300000) },
        { phone: '+919829012345', term: term('quarterly', '2026-09-01', '2026-11-30', 450000, 0) },
        { phone: '+910000000000', term: term('Quarterly', '2026-09-01', '2026-11-30', 450000, 0) },
      ],
      'import-1',
    );
    expect(r).toEqual({ plans: 1, memberships: 2, payments: 1, skipped: 1 });
    const snap = await db.load();
    expect(snap.plans).toHaveLength(1);
    expect(snap.plans[0]).toMatchObject({ name: 'Quarterly', durationUnit: 'month', durationCount: 3, importId: 'import-1' });
    expect(snap.memberships.map((m) => [m.startsOn, m.endsOn, m.priceP, m.importId])).toEqual([
      ['2026-08-01', '2026-10-31', 450000, 'import-1'],
      ['2026-09-01', '2026-11-30', 450000, 'import-1'],
    ]);
    expect(snap.payments).toHaveLength(1);
    expect(snap.payments[0]).toMatchObject({ amountP: 300000, paidOn: '2026-08-01', method: 'other', importId: 'import-1' });
  });

  it('the same file again adds nothing', async () => {
    const db = await make();
    const items = [{ phone: '+919876543210', term: term('Quarterly', '2026-08-01', '2026-10-31', 450000, 300000) }];
    await db.importTerms(items, 'import-1');
    const again = await db.importTerms(items, 'import-2');
    expect(again).toEqual({ plans: 0, memberships: 0, payments: 0, skipped: 1 });
    const snap = await db.load();
    expect(snap.memberships).toHaveLength(1);
    expect(snap.payments).toHaveLength(1);
  });
});

describe('a payments list: one row per payment (16 Oct 2026)', () => {
  const rows = [
    ['Member Name', 'Mobile No', 'Package', 'Start Date', 'End Date', 'Package Amount', 'Amount Paid', 'Payment Date'],
    ['Riya Sharma', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4,500', '2,000', '01/08/2026'],
    ['Riya Sharma', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4,500', '2,500', '15/08/2026'],
    ['Riya Sharma', '9876543210', 'Quarterly', '01/11/2026', '31/01/2027', '4,500', '4,500', '01/11/2026'],
    // The same payment twice in the file (copy-paste): one receipt.
    ['Riya Sharma', '9876543210', 'Quarterly', '01/11/2026', '31/01/2027', '4,500', '4,500', '01/11/2026'],
    ['Asha Verma', '9829012345', 'Monthly', '05/10/2026', '04/11/2026', '1,500', '1,500', '05/10/2026'],
  ];

  async function run(db: LocalCrmData, importId: string) {
    const map = mapOf(rows);
    const plan = planImport(rows, 0, map, (await db.load()).members, TODAY);
    const adds = plan.rows.filter((r) => r.status === 'add');
    if (adds.length) await db.createMembers(adds.map((r) => ({ ...r.draft!, importId })) as never);
    const snap = await db.load();
    // As the screen does: every row with a term, in file order (repeats included).
    const items = plan.rows
      .filter((r) => r.term && r.draft && (r.status === 'add' || r.existing || r.sameAsRow !== null))
      .sort((a, b) => a.rowNumber - b.rowNumber)
      .map((r) => ({ phone: r.draft!.phone, term: r.term! }));
    expect(snap.members.length).toBeGreaterThan(0);
    return { plan, result: await db.importTerms(items, importId) };
  }

  it('finds the payment date column and says what a repeated row does', () => {
    const map = mapOf(rows);
    expect(map.paidOn).toBe(7);
    const plan = planImport(rows, 0, map, [], TODAY);
    expect(plan.rows.map((r) => r.status)).toEqual(['add', 'duplicate', 'duplicate', 'duplicate', 'add']);
    expect(rowVerdict(plan.rows[1]!)).toBe('Same member as row 2 — this plan and payment are added to them');
  });

  it('one member, a term per period, a receipt per payment with its own date', async () => {
    const db = new LocalCrmData({ store: memoryStore(), now: (() => { let c = 1000; return () => (c += 1); })(), seed: () => emptySnapshot(0, 'Test Gym') });
    const { result } = await run(db, 'import-1');
    expect(result).toEqual({ plans: 2, memberships: 3, payments: 4, skipped: 1 });
    const snap = await db.load();
    const riya = snap.members.find((m) => m.fullName === 'Riya Sharma')!;
    expect(snap.memberships.filter((m) => m.memberId === riya.id).map((m) => [m.startsOn, m.endsOn, m.priceP])).toEqual([
      ['2026-08-01', '2026-10-31', 450000],
      ['2026-11-01', '2027-01-31', 450000],
    ]);
    expect(snap.payments.filter((p) => p.memberId === riya.id).map((p) => [p.paidOn, p.amountP])).toEqual([
      ['2026-08-01', 200000],
      ['2026-08-15', 250000],
      ['2026-11-01', 450000],
    ]);
    // Same file again: nothing new.
    const again = await run(db, 'import-2');
    expect(again.result).toMatchObject({ memberships: 0, payments: 0 });
    expect((await db.load()).payments).toHaveLength(4);
  });
});

describe('payments lists: review fixes (16 Oct 2026)', () => {
  const H = ['Member Name', 'Mobile No', 'Package', 'Start Date', 'End Date', 'Package Amount', 'Amount Paid', 'Balance'];
  async function importRows(rows: unknown[][]) {
    let c = 1000;
    const db = new LocalCrmData({ store: memoryStore(), now: () => (c += 1), seed: () => emptySnapshot(0, 'Test Gym') });
    const plan = planImport(rows, 0, mapOf(rows), [], TODAY);
    const adds = plan.rows.filter((r) => r.status === 'add');
    await db.createMembers(adds.map((r) => ({ ...r.draft!, importId: 'imp' })) as never);
    const items = plan.rows
      .filter((r) => r.term && r.draft && (r.status === 'add' || r.sameAsRow !== null))
      .sort((a, b) => a.rowNumber - b.rowNumber)
      .map((r) => ({ phone: r.draft!.phone, term: r.term! }));
    await db.importTerms(items, 'imp');
    return { plan, snap: await db.load() };
  }
  const paid = (snap: Awaited<ReturnType<typeof importRows>>['snap']) => snap.payments.map((p) => p.amountP / 100);

  it('two people on one mobile are never merged', async () => {
    const { plan, snap } = await importRows([
      H,
      ['Rahul Jain', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '4500', ''],
      ['Priya Jain', '9876543210', 'Monthly', '01/08/2026', '31/08/2026', '1500', '1500', ''],
    ]);
    expect(plan.rows[1]!.term).toBeNull();
    expect(plan.rows[1]!.warnings.join(' ')).toContain('another name');
    expect(snap.memberships).toHaveLength(1);
    expect(paid(snap)).toEqual([4500]);
  });

  it('a running total of what was paid is not counted twice', async () => {
    const { snap } = await importRows([
      H,
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '2000', ''],
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '4500', ''],
    ]);
    expect(paid(snap)).toEqual([2000, 2500]);
  });

  it('a falling balance with no paid column: each row adds only the new money, the last (balance 0) too', async () => {
    const { snap } = await importRows([
      ['Member Name', 'Mobile No', 'Package', 'Start Date', 'End Date', 'Package Amount', 'Balance'],
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '2500'],
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '1000'],
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '0'],
    ]);
    expect(paid(snap)).toEqual([2000, 1500, 1000]);
  });

  it('equal instalments with no payment date column all count, and never past the price', async () => {
    const { snap } = await importRows([
      H,
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '1500', ''],
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '1500', ''],
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '1500', ''],
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '1500', ''],
    ]);
    expect(paid(snap)).toEqual([1500, 1500, 1500]);
  });

  it('a typo in a repeated row (end date a day off, plan name misspelt) is the same plan', async () => {
    const { snap } = await importRows([
      H,
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '2000', ''],
      ['Riya', '9876543210', 'Quartely', '01/08/2026', '30/10/2026', '4500', '2500', ''],
    ]);
    expect(snap.memberships).toHaveLength(1);
    expect(snap.plans.map((p) => p.name)).toEqual(['Quarterly']);
    expect(paid(snap)).toEqual([2000, 2500]);
  });

  it('a payment date that cannot be used falls back to the start, with a warning', () => {
    const rows = [
      [...H.slice(0, 7), 'Payment Date'],
      ['Riya', '9876543210', 'Quarterly', '01/08/2026', '31/10/2026', '4500', '4500', '01/01/2031'],
    ];
    const r = planImport(rows, 0, mapOf(rows), [], TODAY).rows[0]!;
    expect(r.term?.paidOn).toBe('2026-08-01');
    expect(r.warnings.join(' ')).toContain('Payment date');
  });
});
