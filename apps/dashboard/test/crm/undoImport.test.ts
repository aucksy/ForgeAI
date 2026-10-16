/**
 * "Undo this import" (16 Oct 2026, data migration): a wrong file is taken back, but nothing the
 * gym did after the import is lost, and nothing typed in by hand is touched.
 */
import { describe, expect, it } from 'vitest';

import { diffSnapshots } from '../../src/crm/data/cloud';
import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { lengthBetween } from '../../src/crm/logic/importTerms';
import { importTime, pastImports, planUndo } from '../../src/crm/logic/undoImport';

const member = (fullName: string, phone: string, importId?: string) => ({
  fullName, phone, email: null, gender: 'female', dateOfBirth: null, address: null, emergencyName: null, emergencyPhone: null,
  joinedOn: '2026-08-01', photoUri: null, notes: null, archived: false, batch: null, ...(importId ? { importId } : {}),
});
const term = (planName: string, startsOn: string, endsOn: string, priceP: number, paidP: number) => ({
  planName, startsOn, endsOn, priceP, paidP, paidOn: startsOn, length: lengthBetween(startsOn, endsOn),
});

async function gym() {
  let clock = 1_000;
  const db = new LocalCrmData({ store: memoryStore(), now: () => (clock += 1), seed: () => emptySnapshot(0, 'Test Gym') });
  await db.createMembers([member('Typed By Hand', '+919000000001')] as never);
  await db.createMembers([
    member('Riya Sharma', '+919876543210', 'import-abc'),
    member('Asha Verma', '+919829012345', 'import-abc'),
    member('Dev Rao', '+919811111111', 'import-abc'),
  ] as never);
  await db.importTerms(
    [
      { phone: '+919876543210', term: term('Quarterly', '2026-08-01', '2026-10-31', 450000, 300000) },
      { phone: '+919829012345', term: term('Quarterly', '2026-09-01', '2026-11-30', 450000, 400000) },
      { phone: '+919811111111', term: term('Yearly', '2026-01-01', '2026-12-31', 1200000, 1200000) },
    ],
    'import-abc',
  );
  return db;
}

describe('which records an undo takes back', () => {
  it('everything the file added, when the gym has not used it since', async () => {
    const db = await gym();
    const snap = await db.load();
    const plan = planUndo(snap, 'import-abc');
    expect(plan.members).toHaveLength(3);
    expect(plan.memberships).toHaveLength(3);
    expect(plan.payments).toHaveLength(3);
    expect(plan.plans).toHaveLength(2);
    expect(plan.kept).toEqual({ members: 0, memberships: 0, plans: 0 });
    // A member typed in by hand is never on the list.
    const hand = snap.members.find((m) => m.fullName === 'Typed By Hand')!;
    expect(plan.members).not.toContain(hand.id);
  });

  it('keeps what the gym used after the import, with its receipts (review: no false dues)', async () => {
    const db = await gym();
    let snap = await db.load();
    const riya = snap.members.find((m) => m.fullName === 'Riya Sharma')!;
    const asha = snap.members.find((m) => m.fullName === 'Asha Verma')!;
    const dev = snap.members.find((m) => m.fullName === 'Dev Rao')!;
    const ashaTerm = snap.memberships.find((m) => m.memberId === asha.id)!;
    await db.checkIn(riya.id, '2026-10-15', 'desk', '2026-10-15');
    await db.recordPayment({ memberId: asha.id, membershipId: ashaTerm.id, amountP: 1000, method: 'cash', paidOn: '2026-10-15', note: null } as never);
    snap = await db.load();
    const plan = planUndo(snap, 'import-abc');
    // Riya is training: she keeps her imported plan AND its receipt (else she looks lapsed / owing).
    const riyaTerm = snap.memberships.find((m) => m.memberId === riya.id)!;
    expect(plan.members).not.toContain(riya.id);
    expect(plan.memberships).not.toContain(riyaTerm.id);
    expect(plan.payments.some((id) => snap.payments.find((p) => p.id === id)!.memberId === riya.id)).toBe(false);
    // Asha paid at the desk against her imported plan: the plan and the file's receipt both stay.
    expect(plan.members).not.toContain(asha.id);
    expect(plan.memberships).not.toContain(ashaTerm.id);
    expect(plan.payments.some((id) => snap.payments.find((p) => p.id === id)!.membershipId === ashaTerm.id)).toBe(false);
    // Dev was never used: he goes, with his plan and receipt; Yearly goes, Quarterly is still in use.
    expect(plan.members).toEqual([dev.id]);
    expect(plan.plans.map((id) => snap.plans.find((p) => p.id === id)!.name)).toEqual(['Yearly']);
    expect(plan.kept).toEqual({ members: 2, memberships: 2, plans: 1 });
  });

  it('a term the gym changed (extra days) stays, and so does its member', async () => {
    const db = await gym();
    let snap = await db.load();
    const dev = snap.members.find((m) => m.fullName === 'Dev Rao')!;
    const devTerm = snap.memberships.find((m) => m.memberId === dev.id)!;
    await db.extendMembership(devTerm.id, 10, 'Freeze');
    snap = await db.load();
    const plan = planUndo(snap, 'import-abc');
    expect(plan.memberships).not.toContain(devTerm.id);
    expect(plan.members).not.toContain(dev.id);
    expect(plan.payments.some((id) => snap.payments.find((p) => p.id === id)!.membershipId === devTerm.id)).toBe(false);
  });

  it('an import the gym fully kept leaves the Past imports list', async () => {
    const db = await gym();
    let snap = await db.load();
    for (const m of snap.members.filter((x) => x.importId)) await db.checkIn(m.id, '2026-10-15', 'desk', '2026-10-15');
    snap = await db.load();
    expect(pastImports(snap)).toHaveLength(0);
  });

  it('another import, and an empty id, take back nothing', async () => {
    const snap = await (await gym()).load();
    expect(planUndo(snap, 'import-other').members).toHaveLength(0);
    expect(planUndo(snap, '').members).toHaveLength(0);
  });
});

describe('the store', () => {
  it('removes them all, and the change sent online is deletions only of imported rows', async () => {
    const db = await gym();
    const before = await db.load();
    const r = await db.undoImport('import-abc');
    expect(r).toMatchObject({ members: 3, memberships: 3, payments: 3, plans: 2, more: false });
    const after = await db.load();
    expect(after.members.map((m) => m.fullName)).toEqual(['Typed By Hand']);
    const rows = diffSnapshots(before, after);
    expect(rows.every((x) => x.x === true)).toBe(true);
    const importedIds = new Set([...before.members, ...before.plans, ...before.memberships, ...before.payments].filter((x) => x.importId === 'import-abc').map((x) => x.id));
    expect(rows.every((x) => importedIds.has(x.id))).toBe(true);
    expect(pastImports(after)).toHaveLength(0);
  });

  it('in parts (the online cap): receipts first, then terms, members and plans; the same end', async () => {
    const db = await gym();
    const first = await db.undoImport('import-abc', 4);
    expect(first).toMatchObject({ payments: 3, memberships: 1, members: 0, plans: 0, more: true });
    let n = 1;
    let r = first;
    while (r.more) {
      r = await db.undoImport('import-abc', 4);
      n += 1;
    }
    expect(n).toBe(3);
    const after = await db.load();
    expect(after.members).toHaveLength(1);
    expect(after.plans).toHaveLength(0);
    expect(after.memberships).toHaveLength(0);
    expect(after.payments).toHaveLength(0);
  });
});

describe('the list of past imports', () => {
  it('one row per import, newest first, with its time', async () => {
    const snap = await (await gym()).load();
    const list = pastImports(snap);
    expect(list).toEqual([{ importId: 'import-abc', at: null, members: 3, plans: 2, memberships: 3, payments: 3 }]);
    const t = Date.UTC(2026, 9, 16, 10, 0);
    expect(importTime(`import-${t.toString(36)}`)).toBe(t);
    expect(importTime('import-abc')).toBeNull();
  });
});
