/**
 * #41 branches (24 Oct 2026): receipt numbers per branch, the branch list and keys, the "All
 * branches" numbers, and the words at the desk. Server side: supabase/tests/0031_branches.sql.
 */

import { describe, expect, it } from 'vitest';

import { canOpen, staffRightsWords } from '../../src/crm/auth/permissions';
import { branchFailWords } from '../../src/crm/branches/BranchProvider';
import { matchBranchName } from '../../src/crm/branches/context';
import {
  acrossBranches,
  BRANCH_KEYS,
  branchErrorWords,
  branchListFromRow,
  branchSummary,
  clearBranchKeys,
  readBranchKeys,
  searchAcross,
  totalSummary,
  visitorsFromRows,
  visitorWords,
  writeBranchKeys,
} from '../../src/crm/branches/logic';
import type { CrmSnapshot } from '../../src/crm/data/adapter';
import { applyRecords, buildSnapshot, diffSnapshots, emptyRows } from '../../src/crm/data/cloud';
import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { cleanReceiptPrefix, nextImportReceiptNo, nextReceiptNo, parseReceiptNo } from '../../src/crm/logic/receipts';
import { fitsRule46 } from '../../src/crm/logic/receiptRules';
import type { MemberDraft } from '../../src/crm/types';
import { makeGym, makeMember, makeMembership, makePayment, makeVisit, openTerm } from './fixtures';

const TODAY = '2026-10-24';

describe('receipt numbers per branch (GST Rule 46: one series per GSTIN)', () => {
  it('the first branch keeps its own numbers; an added branch numbers B2/2026-27/0001', () => {
    expect(nextReceiptNo([], TODAY)).toBe('2026-27/0001');
    expect(nextReceiptNo([], TODAY, 'B2')).toBe('B2/2026-27/0001');
    const issued = [{ receiptNo: 'B2/2026-27/0007' }, { receiptNo: '2026-27/0042' }, { receiptNo: 'B3/2026-27/0099' }];
    expect(nextReceiptNo(issued, TODAY, 'B2')).toBe('B2/2026-27/0008');
    expect(nextReceiptNo(issued, TODAY)).toBe('2026-27/0043');
    expect(nextReceiptNo(issued, '2027-04-01', 'B2')).toBe('B2/2027-28/0001');
  });

  it('every number fits 16 characters and the receipt rule', () => {
    for (const no of [nextReceiptNo([], TODAY, 'B10'), nextReceiptNo([{ receiptNo: 'B10/2026-27/9999' }], TODAY, 'B10'), nextImportReceiptNo([], TODAY, 'B2')]) {
      expect(no.length).toBeLessThanOrEqual(16);
      expect(fitsRule46(no)).toBe(true);
    }
    // A long prefix writes the year short rather than pass 16, and still counts on from it.
    expect(nextReceiptNo([], TODAY, 'ABCD')).toBe('ABCD/26-27/0001');
    expect(nextReceiptNo([{ receiptNo: 'ABCD/26-27/0004' }], TODAY, 'ABCD')).toBe('ABCD/26-27/0005');
  });

  it('imports get the branch import series B2I/26-27/0001, apart from the desk series', () => {
    expect(nextImportReceiptNo([], TODAY, 'B2')).toBe('B2I/26-27/0001');
    expect(nextImportReceiptNo([{ receiptNo: 'B2I/26-27/0003' }, { receiptNo: 'IMP/2026-27/0050' }], TODAY, 'B2')).toBe('B2I/26-27/0004');
    expect(nextImportReceiptNo([{ receiptNo: 'B2I/26-27/0003' }], TODAY)).toBe('IMP/2026-27/0001');
    expect(parseReceiptNo('B2I/26-27/0003', 'B2')).toBeNull();
    expect(parseReceiptNo('B2/2026-27/0003', 'B2')).toEqual({ fy: '2026-27', seq: 3 });
    expect(parseReceiptNo('B2/2026-27/0003')).toBeNull();
  });

  it('a prefix is a capital letter and up to 3 more letters or digits; anything else is none', () => {
    expect(cleanReceiptPrefix(' b2 ')).toBe('B2');
    expect(cleanReceiptPrefix('2B')).toBe('');
    expect(cleanReceiptPrefix('B/2')).toBe('');
    expect(cleanReceiptPrefix(null)).toBe('');
  });

  it('a branch kept in this browser makes its receipts with its prefix (sale, payment, import)', async () => {
    const snap = emptySnapshot(0, 'Branch Two');
    snap.gym.receiptPrefix = 'B2';
    let t = 10;
    const db = new LocalCrmData({ store: memoryStore(), now: () => (t += 1), seed: () => snap, today: () => TODAY });
    const member = await db.createMember({
      fullName: 'Asha Verma', phone: '+919876531101', email: null, gender: null, dateOfBirth: null, address: null,
      emergencyName: null, emergencyPhone: null, joinedOn: TODAY, photoUri: null, notes: null, archived: false,
    } satisfies MemberDraft);
    const ms = await openTerm(db, member.id, TODAY, 100_000);
    const p = await db.recordPayment({ memberId: member.id, membershipId: ms, amountP: 50_000, method: 'cash', paidOn: TODAY, reference: null, note: null, collectedBy: null });
    expect(p.receiptNo).toBe('B2/2026-27/0001');
    const imported = await db.importTerms(
      [{ phone: '+919876531101', term: { planName: 'Old 3 months', startsOn: '2026-05-01', endsOn: '2026-07-31', priceP: 270_000, paidP: 270_000, paidOn: '2026-05-01', length: { unit: 'month', count: 3 } } }],
      'imp-b2',
    );
    expect(imported.payments).toBe(1);
    const all = (await db.load()).payments.map((x) => x.receiptNo).sort();
    expect(all).toEqual(['B2/2026-27/0001', 'B2I/26-27/0001']);
  });
});

describe('the branch prefix travels with the online records', () => {
  it('a pulled gym record carries it; the first branch never gains one', () => {
    const rows = emptyRows();
    applyRecords(rows, [{ k: 'gym', id: 'gym', d: { name: 'Branch Two', phone: null, address: null, gstin: null, receiptPrefix: 'B2' } }]);
    const snap = buildSnapshot(rows, { gymId: 'g2', name: 'Branch Two', joinCode: 'B2CODE', createdAt: 0 });
    expect(snap.gym.receiptPrefix).toBe('B2');
    // Saving the details again sends the prefix back (the server keeps it either way).
    const after = { ...snap, gym: { ...snap.gym, gstin: '27AAPFU0939F1ZV' } };
    expect(diffSnapshots(snap, after)).toEqual([{ k: 'gym', id: 'gym', d: { name: 'Branch Two', phone: null, address: null, gstin: '27AAPFU0939F1ZV', receiptPrefix: 'B2' } }]);
    const first = buildSnapshot(emptyRows(), { gymId: 'g1', name: 'First', joinCode: 'ONE001', createdAt: 0 });
    const renamed = { ...first, gym: { ...first.gym, name: 'First Gym' } };
    expect(diffSnapshots(first, renamed)[0].d).toEqual({ name: 'First Gym', phone: null, address: null, gstin: null });
  });
});

describe('the branch list and this device’s keys', () => {
  it('reads owner_branches; a broken answer is the gym alone', () => {
    const l = branchListFromRow(
      {
        groupId: 'grp-1', groupName: 'Iron Temple', canOpen: true,
        branches: [
          { gymId: 'g1', name: 'Iron Temple', joinCode: 'IRON01', receiptPrefix: null, branchNo: 1, isThis: true },
          { gymId: 'g2', name: 'Iron Temple, Vaishali', joinCode: 'IRON02', receiptPrefix: 'B2', branchNo: 2, isThis: false },
          { name: 'no id' },
        ],
      },
      { gymId: 'g1', name: 'Iron Temple', joinCode: 'IRON01' },
    );
    expect(l.branches.map((b) => b.gymId)).toEqual(['g1', 'g2']);
    expect(l.branches[1].receiptPrefix).toBe('B2');
    expect(l.canOpen).toBe(true);
    const broken = branchListFromRow([], { gymId: 'g9', name: 'Solo', joinCode: 'SOLO01' });
    expect(broken).toEqual({ groupId: null, groupName: 'Solo', canOpen: false, branches: [{ gymId: 'g9', name: 'Solo', joinCode: 'SOLO01', receiptPrefix: null, branchNo: 1, isThis: true }] });
  });

  it('keys are kept per owner: another person signing in on this device never gets them', () => {
    const store = memoryStore();
    writeBranchKeys(store, '9876531001', { g1: 'k'.repeat(48), g2: 'm'.repeat(48), g3: 'short' });
    expect(Object.keys(readBranchKeys(store, '9876531001')).sort()).toEqual(['g1', 'g2']);
    expect(readBranchKeys(store, '9876539999')).toEqual({});
    expect(Object.keys(clearBranchKeys(store)).length).toBe(3);
    expect(store.getItem(BRANCH_KEYS)).toBeNull();
    store.setItem(BRANCH_KEYS, '{not json');
    expect(readBranchKeys(store, '9876531001')).toEqual({});
    expect(readBranchKeys(null, '9876531001')).toEqual({});
  });
});

function snapOf(gymId: string, name: string, over: Partial<CrmSnapshot> = {}): CrmSnapshot {
  return { ...emptySnapshot(0, name), gym: makeGym({ gymId, name }), ...over };
}

describe('All branches: the numbers', () => {
  const a1 = makeMember({ id: 'a1', gymId: 'gA', fullName: 'Asha Verma', phone: '+919876531101', joinedOn: '2026-10-02', allBranches: true });
  const a2 = makeMember({ id: 'a2', gymId: 'gA', fullName: 'Bilal Khan', phone: '+919876531102', joinedOn: '2026-01-02' });
  const b1 = makeMember({ id: 'b1', gymId: 'gB', fullName: 'Chand Rao', phone: '+919876531201', joinedOn: '2026-10-10' });
  const A = snapOf('gA', 'Iron Temple', {
    members: [a1, a2],
    memberships: [
      makeMembership({ id: 'msa1', memberId: 'a1', startsOn: '2026-10-01', endsOn: '2026-10-27', priceP: 100_000, listPriceP: 100_000 }),
      makeMembership({ id: 'msa2', memberId: 'a2', startsOn: '2026-08-01', endsOn: '2026-09-30', priceP: 100_000, listPriceP: 100_000 }),
    ],
    payments: [
      makePayment({ memberId: 'a1', membershipId: 'msa1', amountP: 60_000, paidOn: '2026-10-01' }),
      makePayment({ memberId: 'a2', membershipId: 'msa2', amountP: 100_000, paidOn: '2026-08-01' }),
    ],
    // Asha trained at branch B today: the visit is kept here, at home, and says where.
    visits: [makeVisit({ memberId: 'a1', visitedOn: TODAY, gymId: 'gA', atGymId: 'gB', atGymName: 'Iron Temple, Vaishali' })],
  });
  const B = snapOf('gB', 'Iron Temple, Vaishali', {
    members: [b1],
    memberships: [makeMembership({ id: 'msb1', memberId: 'b1', startsOn: '2026-10-10', endsOn: '2027-01-09', priceP: 270_000, listPriceP: 270_000 })],
    payments: [makePayment({ memberId: 'b1', membershipId: 'msb1', amountP: 270_000, paidOn: TODAY, receiptNo: 'B2/2026-27/0001' })],
    visits: [makeVisit({ memberId: 'b1', visitedOn: TODAY, gymId: 'gB' })],
  });
  const all = [{ gymId: 'gA', snap: A }, { gymId: 'gB', snap: B }];

  it('each branch: active, ending soon, dues, money, and check-ins AT the branch', () => {
    const sa = branchSummary('gA', 'Iron Temple', A, TODAY, all);
    const sb = branchSummary('gB', 'Iron Temple, Vaishali', B, TODAY, all);
    expect(sa).toMatchObject({ active: 1, endingSoon: 1, expired: 1, owing: 1, dueP: 40_000, collectedTodayP: 0, collectedMonthP: 60_000, inToday: 0, joinedMonth: 1 });
    expect(sb).toMatchObject({ active: 1, endingSoon: 0, expired: 0, owing: 0, dueP: 0, collectedTodayP: 270_000, collectedMonthP: 270_000, inToday: 2, joinedMonth: 1 });
    expect(totalSummary([sa, sb])).toMatchObject({ active: 2, owing: 1, dueP: 40_000, collectedMonthP: 330_000, inToday: 2, joinedMonth: 2 });
  });

  it('lists across branches say which branch each member belongs to', () => {
    const branches = [{ gymId: 'gA', name: 'Iron Temple', snap: A }, { gymId: 'gB', name: 'Iron Temple, Vaishali', snap: B }];
    expect(acrossBranches(branches, 'ending', TODAY).map((r) => `${r.view.member.fullName}@${r.branchName}`)).toEqual(['Asha Verma@Iron Temple']);
    expect(acrossBranches(branches, 'owing', TODAY).map((r) => [r.view.member.id, r.dueP])).toEqual([['a1', 40_000]]);
    expect(acrossBranches(branches, 'expired', TODAY).map((r) => r.view.member.id)).toEqual(['a2']);
    expect(searchAcross(branches, 'chand', TODAY).map((r) => r.gymId)).toEqual(['gB']);
    expect(searchAcross(branches, '31102', TODAY).map((r) => r.view.member.id)).toEqual(['a2']);
    expect(searchAcross(branches, 'ch', TODAY)).toEqual([]);
  });
});

describe('a member of another branch at the desk', () => {
  it('reads the answer and words each case', () => {
    const [v] = visitorsFromRows([{ gymId: 'gA', branchName: 'Iron Temple', memberId: 'a1', firstName: 'Asha', allowed: true, planOk: true, alreadyIn: false }, { nope: 1 }]);
    expect(visitorWords(v)).toBe('Asha is a member of Iron Temple. Their plan covers every branch.');
    expect(visitorWords({ ...v, allowed: false })).toBe('Asha is a member of Iron Temple. Their plan is for that branch only. Ask them to go there, or ask the owner.');
    expect(visitorWords({ ...v, alreadyIn: true })).toBe('Asha (Iron Temple) is already checked in today.');
    expect(visitorWords({ ...v, planOk: false })).toBe('Asha (Iron Temple) has no plan running today. Ask them to renew at the desk.');
    expect(branchErrorWords('NAME_TAKEN')).toMatch(/already exists/);
    expect(branchErrorWords('SOMETHING')).toBeNull();
    // #41 review: the per-branch limit on looking up other branches' members has its own words.
    expect(branchErrorWords('TOO_MANY_LOOKUPS')).toBe('This desk looked up 30 numbers of other branches in the last hour. Wait a little, then try again.');
    expect(branchFailWords(new Error('TOO_MANY_LOOKUPS'))).toBe(branchErrorWords('TOO_MANY_LOOKUPS'));
    expect(branchFailWords(new Error('TOO_MANY'))).toBe(branchErrorWords('TOO_MANY'));
  });
});

describe('who sees branches', () => {
  it('All branches is the owner’s; the desk works at one branch', () => {
    expect(canOpen('owner', '/branches')).toBe(true);
    expect(canOpen('staff', '/branches')).toBe(false);
    expect(staffRightsWords(true)).toMatch(/^Owners are owners of every branch\. Staff work only at the branch they are added to\. /);
    expect(staffRightsWords()).not.toMatch(/branch/);
  });

  it('a branch named loosely in a sheet finds the one it means', () => {
    const branches = [
      { gymId: 'g1', name: 'Iron Temple, Malviya Nagar' },
      { gymId: 'g2', name: 'Iron Temple, Vaishali Nagar' },
    ];
    expect(matchBranchName('vaishali', branches)).toBe('g2');
    expect(matchBranchName('IRON TEMPLE - MALVIYA NAGAR', branches)).toBe('g1');
    expect(matchBranchName('Iron Temple', branches)).toBeNull();
    expect(matchBranchName('Jaipur Central', branches)).toBeNull();
  });
});
