/**
 * Data migration (15 Oct 2026, owner: "I do not want to deal with each and every format
 * individually... they will be concerned about their data"). A rival's export arrives as members
 * WITH their plans, dates and payments — whatever the columns are called — and importing the same
 * file twice adds nothing.
 */
import { describe, expect, it } from 'vitest';

import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { guessColumns, guessFromValues, planImport } from '../../src/crm/logic/importMembers';
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
