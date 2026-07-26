import { beforeEach, describe, expect, it } from 'vitest';

import {
  DuplicatePhoneError,
  FutureSchemaError,
  FutureVisitError,
  InvalidDateError,
  NotFoundError,
  StorageFullError,
  type CrmSnapshot,
} from '../../src/crm/data/adapter';
import {
  emptySnapshot,
  LocalCrmData,
  memoryStore,
  STORAGE_KEY,
  type KeyValueStore,
} from '../../src/crm/data/local';
import { unpaidForMembership } from '../../src/crm/logic/membership';
import type { MemberDraft, PlanDraft } from '../../src/crm/types';

const TODAY = '2026-07-26';

const memberDraft = (over: Partial<MemberDraft> = {}): MemberDraft => ({
  fullName: 'Riya Sharma',
  phone: '+919876543210',
  email: null,
  gender: 'female',
  dateOfBirth: null,
  address: null,
  emergencyName: null,
  emergencyPhone: null,
  joinedOn: TODAY,
  photoUri: null,
  notes: null,
  archived: false,
  ...over,
});

const planDraft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  name: 'Quarterly',
  durationUnit: 'month',
  durationCount: 3,
  priceP: 300_000,
  joiningFeeP: 50_000,
  description: null,
  active: true,
  sortOrder: 1,
  ...over,
});

let store: KeyValueStore;
let db: LocalCrmData;
let clock: number;

beforeEach(() => {
  store = memoryStore();
  clock = 1_000;
  db = new LocalCrmData({ store, now: () => (clock += 1), seed: () => emptySnapshot(0, 'Test Gym') });
});

describe('bootstrapping', () => {
  it('creates an empty gym on first load and persists it', () => {
    return db.load().then((snap) => {
      expect(snap.gym.name).toBe('Test Gym');
      expect(snap.members).toEqual([]);
      expect(snap.plans).toEqual([]);
      expect(store.getItem(STORAGE_KEY)).toBeTruthy();
    });
  });

  it('reloads what a previous session wrote', async () => {
    await db.createMember(memberDraft());
    const second = new LocalCrmData({ store, now: () => clock });
    const snap = await second.load();
    expect(snap.members).toHaveLength(1);
    expect(snap.members[0].fullName).toBe('Riya Sharma');
  });


  it('REFUSES a blob from a newer version instead of destroying it', async () => {
    // The dangerous one. A version mismatch threw nothing, so the corrupt-backup
    // path never ran and a fresh gym was written straight over the real data.
    // Trigger: a stale cached bundle or a rolled-back deploy — every member,
    // payment and receipt gone, unrecoverably.
    const realData = JSON.stringify({
      version: 99,
      snapshot: { gym: { gymId: 'g', name: 'Real Gym' }, members: [{ id: 'm1' }] },
    });
    store.setItem(STORAGE_KEY, realData);

    const db2 = new LocalCrmData({ store, seed: () => emptySnapshot(0, 'Fresh') });
    await expect(db2.load()).rejects.toBeInstanceOf(FutureSchemaError);

    // The original is still exactly where it was.
    expect(store.getItem(STORAGE_KEY)).toBe(realData);
  });

  it('keeps a copy of an unreadable blob before starting fresh', async () => {
    store.setItem(STORAGE_KEY, '{not json');
    const recovered = new LocalCrmData({ store, now: () => 555, seed: () => emptySnapshot(0, 'Recovered') });
    const snap = await recovered.load();
    expect(snap.gym.name).toBe('Recovered');
    expect(store.getItem(`${STORAGE_KEY}-backup-555`)).toBe('{not json');
  });

  it('tolerates a snapshot missing whole collections', async () => {
    const partial = { gym: emptySnapshot(0).gym } as unknown as CrmSnapshot;
    store.setItem(STORAGE_KEY, JSON.stringify({ version: 1, snapshot: partial }));
    const snap = await new LocalCrmData({ store }).load();
    expect(snap.members).toEqual([]);
    expect(snap.payments).toEqual([]);
    expect(snap.visits).toEqual([]);
  });

  it('hands out a copy, so a caller mutating the result cannot corrupt the store', async () => {
    await db.createMember(memberDraft());
    const snap = await db.load();
    snap.members[0].fullName = 'Tampered';
    snap.members.push(snap.members[0]);

    const fresh = await db.load();
    expect(fresh.members).toHaveLength(1);
    expect(fresh.members[0].fullName).toBe('Riya Sharma');
  });
});

describe('a write that fails', () => {
  /** A store whose `setItem` starts throwing, like a full quota. */
  function brittleStore(): { store: KeyValueStore; fail: () => void; allow: () => void } {
    const inner = memoryStore();
    let failing = false;
    return {
      store: {
        getItem: (k) => inner.getItem(k),
        setItem: (k, v) => {
          if (failing) throw new DOMException('quota', 'QuotaExceededError');
          inner.setItem(k, v);
        },
        removeItem: (k) => inner.removeItem(k),
      },
      fail: () => {
        failing = true;
      },
      allow: () => {
        failing = false;
      },
    };
  }

  it('reports a storage failure rather than pretending it saved', async () => {
    const brittle = brittleStore();
    const adapter = new LocalCrmData({ store: brittle.store, seed: () => emptySnapshot(0) });
    await adapter.load();

    brittle.fail();
    await expect(adapter.createMember(memberDraft())).rejects.toBeInstanceOf(StorageFullError);
  });

  it('does not keep records in memory that were never persisted', async () => {
    const brittle = brittleStore();
    const adapter = new LocalCrmData({ store: brittle.store, seed: () => emptySnapshot(0) });
    await adapter.load();

    brittle.fail();
    await expect(adapter.createMember(memberDraft())).rejects.toThrow();

    brittle.allow();
    const snap = await adapter.load();
    expect(snap.members).toHaveLength(0);
  });

  it('does not duplicate the record when the owner retries', async () => {
    // The failure mode: pushing to the cache BEFORE writing left a phantom row
    // in memory, so the retry added a second one and the next successful write
    // persisted both — one sale, two memberships and two receipts.
    const brittle = brittleStore();
    const adapter = new LocalCrmData({ store: brittle.store, seed: () => emptySnapshot(0) });
    await adapter.load();

    brittle.fail();
    await expect(adapter.createMember(memberDraft())).rejects.toThrow();

    brittle.allow();
    await adapter.createMember(memberDraft());

    const snap = await adapter.load();
    expect(snap.members).toHaveLength(1);
  });

  it('leaves no half-written sale behind', async () => {
    const brittle = brittleStore();
    const adapter = new LocalCrmData({ store: brittle.store, seed: () => emptySnapshot(0) });
    const m = await adapter.createMember(memberDraft());
    const plan = await adapter.createPlan(planDraft());

    brittle.fail();
    await expect(
      adapter.sellMembership({
        memberId: m.id,
        planId: plan.id,
        startsOn: TODAY,
        priceP: 300_000,
        joiningFeeP: 0,
        notes: null,
        collectNowP: 300_000,
        method: 'cash',
        reference: null,
        paidOn: TODAY,
        soldBy: null,
      }),
    ).rejects.toThrow();

    brittle.allow();
    const snap = await adapter.load();
    expect(snap.memberships).toHaveLength(0);
    expect(snap.payments).toHaveLength(0);
  });
});

describe('two tabs on the same computer', () => {
  it('does not erase what the other tab wrote', async () => {
    // A shared front-desk PC with the CRM open twice. Each adapter cached the
    // whole gym and wrote its own cache wholesale, so the second save silently
    // replaced everything the first one had done.
    const tabA = new LocalCrmData({ store, now: () => (clock += 1), seed: () => emptySnapshot(0, 'Shared') });
    const tabB = new LocalCrmData({ store, now: () => (clock += 1) });
    await tabA.load();
    await tabB.load();

    await tabA.createMember(memberDraft({ fullName: 'Added in tab A' }));
    await tabB.createMember(memberDraft({ phone: '+919999999999', fullName: 'Added in tab B' }));

    const names = (await tabA.load()).members.map((m) => m.fullName).sort();
    expect(names).toEqual(['Added in tab A', 'Added in tab B']);
  });

  it('does not mint the same receipt number twice', async () => {
    const tabA = new LocalCrmData({ store, now: () => (clock += 1), seed: () => emptySnapshot(0, 'Shared') });
    const tabB = new LocalCrmData({ store, now: () => (clock += 1) });
    const member = await tabA.createMember(memberDraft());
    await tabB.load();

    const pay = (adapter: LocalCrmData) =>
      adapter.recordPayment({
        memberId: member.id,
        membershipId: null,
        amountP: 100_000,
        method: 'cash',
        paidOn: TODAY,
        reference: null,
        note: null,
        collectedBy: null,
      });

    const first = await pay(tabA);
    const second = await pay(tabB);

    expect(first.receiptNo).toBe('2026-27/0001');
    expect(second.receiptNo).toBe('2026-27/0002');
    expect((await tabA.load()).payments).toHaveLength(2);
  });

  it('sees a duplicate phone number added by the other tab', async () => {
    const tabA = new LocalCrmData({ store, now: () => (clock += 1), seed: () => emptySnapshot(0, 'Shared') });
    const tabB = new LocalCrmData({ store, now: () => (clock += 1) });
    await tabB.load();

    await tabA.createMember(memberDraft());
    await expect(tabB.createMember(memberDraft({ fullName: 'Same number' }))).rejects.toBeInstanceOf(
      DuplicatePhoneError,
    );
  });
});

describe('members', () => {
  it('creates with generated identity fields', async () => {
    const m = await db.createMember(memberDraft());
    expect(m.id).toBeTruthy();
    expect(m.gymId).toBeTruthy();
    expect(m.appUserId).toBeNull();
    expect(m.createdAt).toBeGreaterThan(0);
  });

  it('blocks a second member on the same number', async () => {
    await db.createMember(memberDraft());
    await expect(db.createMember(memberDraft({ fullName: 'Someone Else' }))).rejects.toBeInstanceOf(
      DuplicatePhoneError,
    );
    expect((await db.load()).members).toHaveLength(1);
  });

  it('blocks an edit that would collide with another member', async () => {
    await db.createMember(memberDraft());
    const b = await db.createMember(memberDraft({ phone: '+919999999999', fullName: 'Kabir' }));
    await expect(db.updateMember(b.id, { phone: '+919876543210' })).rejects.toBeInstanceOf(
      DuplicatePhoneError,
    );
  });

  it('lets a member keep their own number while editing other fields', async () => {
    const m = await db.createMember(memberDraft());
    const updated = await db.updateMember(m.id, { phone: m.phone, fullName: 'Riya S' });
    expect(updated.fullName).toBe('Riya S');
    expect(updated.updatedAt).toBeGreaterThan(m.updatedAt);
  });

  it('archives without destroying the record', async () => {
    const m = await db.createMember(memberDraft());
    await db.setMemberArchived(m.id, true);
    const snap = await db.load();
    expect(snap.members).toHaveLength(1);
    expect(snap.members[0].archived).toBe(true);
  });

  it('reports a missing member by name', async () => {
    await expect(db.updateMember('nope', { fullName: 'X' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('selling a membership', () => {
  it('computes the end date from the plan and snapshots name and list price', async () => {
    const m = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());

    const { membership } = await db.sellMembership({
      memberId: m.id,
      planId: plan.id,
      startsOn: TODAY,
      priceP: 280_000, // negotiated below list
      joiningFeeP: 50_000,
      notes: null,
      collectNowP: 0,
      method: 'cash',
      reference: null,
      paidOn: TODAY,
      soldBy: null,
    });

    expect(membership.endsOn).toBe('2026-10-25'); // 3 months, inclusive end
    expect(membership.planName).toBe('Quarterly');
    expect(membership.listPriceP).toBe(300_000);
    expect(membership.priceP).toBe(280_000);
  });

  it('keeps the snapshot when the plan is later renamed or repriced', async () => {
    const m = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());
    const { membership } = await db.sellMembership({
      memberId: m.id,
      planId: plan.id,
      startsOn: TODAY,
      priceP: 300_000,
      joiningFeeP: 0,
      notes: null,
      collectNowP: 300_000,
      method: 'upi',
      reference: null,
      paidOn: TODAY,
      soldBy: null,
    });

    await db.updatePlan(plan.id, { name: 'Quarterly (2027)', priceP: 400_000 });

    const stored = (await db.load()).memberships.find((x) => x.id === membership.id);
    // A receipt printed today must not change because prices went up tomorrow.
    expect(stored?.planName).toBe('Quarterly');
    expect(stored?.priceP).toBe(300_000);
    expect(stored?.listPriceP).toBe(300_000);
  });

  it('writes the sale and its receipt together', async () => {
    const m = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());
    const { membership, payment } = await db.sellMembership({
      memberId: m.id,
      planId: plan.id,
      startsOn: TODAY,
      priceP: 300_000,
      joiningFeeP: 50_000,
      notes: null,
      collectNowP: 200_000,
      method: 'cash',
      reference: null,
      paidOn: TODAY,
      soldBy: null,
    });

    expect(payment).not.toBeNull();
    expect(payment?.membershipId).toBe(membership.id);
    expect(payment?.receiptNo).toBe('2026-27/0001');
    const snap = await db.load();
    expect(unpaidForMembership(membership, snap.payments)).toBe(150_000);
  });

  it('creates no receipt when nothing was collected, leaving the full amount due', async () => {
    const m = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());
    const { membership, payment } = await db.sellMembership({
      memberId: m.id,
      planId: plan.id,
      startsOn: TODAY,
      priceP: 300_000,
      joiningFeeP: 0,
      notes: null,
      collectNowP: 0,
      method: 'cash',
      reference: null,
      paidOn: TODAY,
      soldBy: null,
    });

    expect(payment).toBeNull();
    const snap = await db.load();
    expect(snap.payments).toHaveLength(0);
    expect(unpaidForMembership(membership, snap.payments)).toBe(300_000);
  });

  it('refuses to sell to a member or plan that does not exist', async () => {
    const plan = await db.createPlan(planDraft());
    const base = {
      planId: plan.id,
      startsOn: TODAY,
      priceP: 1,
      joiningFeeP: 0,
      notes: null,
      collectNowP: 0,
      method: 'cash' as const,
      reference: null,
      paidOn: TODAY,
      soldBy: null,
    };
    await expect(db.sellMembership({ ...base, memberId: 'ghost' })).rejects.toBeInstanceOf(NotFoundError);

    const m = await db.createMember(memberDraft());
    await expect(
      db.sellMembership({ ...base, memberId: m.id, planId: 'ghost' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await db.load()).memberships).toHaveLength(0);
  });

  it('cancels without deleting, recording the reason', async () => {
    const m = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());
    const { membership } = await db.sellMembership({
      memberId: m.id,
      planId: plan.id,
      startsOn: TODAY,
      priceP: 300_000,
      joiningFeeP: 0,
      notes: null,
      collectNowP: 0,
      method: 'cash',
      reference: null,
      paidOn: TODAY,
      soldBy: null,
    });

    const cancelled = await db.cancelMembership(membership.id, 'moved city');
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.notes).toContain('moved city');
    expect((await db.load()).memberships).toHaveLength(1);
  });

  it('can undo a cancellation', async () => {
    // Cancelling drops a term out of cover, out of dues and out of the
    // joining-fee guard. A misclick on that must not be permanent.
    const m = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());
    const { membership } = await db.sellMembership({
      memberId: m.id,
      planId: plan.id,
      startsOn: TODAY,
      priceP: 300_000,
      joiningFeeP: 0,
      notes: null,
      collectNowP: 0,
      method: 'cash',
      reference: null,
      paidOn: TODAY,
      soldBy: null,
    });

    await db.cancelMembership(membership.id, 'misclick');
    const restored = await db.uncancelMembership(membership.id);
    expect(restored.cancelled).toBe(false);
    expect(restored.notes).toContain('Cancellation reversed');
  });
});

describe('payments', () => {
  it('issues sequential receipt numbers across separate payments', async () => {
    const m = await db.createMember(memberDraft());
    const first = await db.recordPayment({
      memberId: m.id,
      membershipId: null,
      amountP: 50_000,
      method: 'cash',
      paidOn: TODAY,
      reference: null,
      note: null,
      collectedBy: null,
    });
    const second = await db.recordPayment({
      memberId: m.id,
      membershipId: null,
      amountP: 50_000,
      method: 'upi',
      paidOn: TODAY,
      reference: 'UPI123',
      note: null,
      collectedBy: null,
    });
    expect(first.receiptNo).toBe('2026-27/0001');
    expect(second.receiptNo).toBe('2026-27/0002');
  });

  it('voids rather than deletes, and the number is not reissued', async () => {
    const m = await db.createMember(memberDraft());
    const p = await db.recordPayment({
      memberId: m.id,
      membershipId: null,
      amountP: 50_000,
      method: 'cash',
      paidOn: TODAY,
      reference: null,
      note: null,
      collectedBy: null,
    });
    await db.voidPayment(p.id, 'entered twice');

    const snap = await db.load();
    expect(snap.payments).toHaveLength(1);
    expect(snap.payments[0].voided).toBe(true);
    expect(snap.payments[0].voidReason).toBe('entered twice');

    const next = await db.recordPayment({
      memberId: m.id,
      membershipId: null,
      amountP: 10_000,
      method: 'cash',
      paidOn: TODAY,
      reference: null,
      note: null,
      collectedBy: null,
    });
    expect(next.receiptNo).toBe('2026-27/0002');
  });

  it('refuses a payment against a member or membership that does not exist', async () => {
    const base = {
      membershipId: null,
      amountP: 1,
      method: 'cash' as const,
      paidOn: TODAY,
      reference: null,
      note: null,
      collectedBy: null,
    };
    await expect(db.recordPayment({ ...base, memberId: 'ghost' })).rejects.toBeInstanceOf(NotFoundError);

    const m = await db.createMember(memberDraft());
    await expect(
      db.recordPayment({ ...base, memberId: m.id, membershipId: 'ghost' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('check-in', () => {
  it('records one visit per member per day, however many times they scan', async () => {
    const m = await db.createMember(memberDraft());
    const first = await db.checkIn(m.id, TODAY, 'desk', TODAY);
    const again = await db.checkIn(m.id, TODAY, 'app', TODAY);

    expect(again.id).toBe(first.id);
    expect((await db.load()).visits).toHaveLength(1);
  });

  it('records separate days separately', async () => {
    const m = await db.createMember(memberDraft());
    await db.checkIn(m.id, '2026-07-25', 'desk', TODAY);
    await db.checkIn(m.id, '2026-07-26', 'desk', TODAY);
    expect((await db.load()).visits).toHaveLength(2);
  });

  it('refuses a check-in for someone who is not on the roster', async () => {
    await expect(db.checkIn('ghost', TODAY, 'desk', TODAY)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('accepts a back-dated visit — a desk PC that was down still has to be caught up', async () => {
    const m = await db.createMember(memberDraft());
    const visit = await db.checkIn(m.id, '2026-07-20', 'desk', TODAY);
    expect(visit.visitedOn).toBe('2026-07-20');
    expect((await db.load()).visits).toHaveLength(1);
  });

  it('refuses a visit dated in the future, and writes nothing', async () => {
    const m = await db.createMember(memberDraft());
    await expect(db.checkIn(m.id, '2026-07-27', 'desk', TODAY)).rejects.toBeInstanceOf(
      FutureVisitError,
    );
    expect((await db.load()).visits).toHaveLength(0);
  });

  it('refuses a visit date that is not a real day', async () => {
    const m = await db.createMember(memberDraft());
    // A `type="date"` field hands over '' while it is being typed, and year 0002
    // without complaint. Both used to reach storage.
    await expect(db.checkIn(m.id, '', 'desk', TODAY)).rejects.toBeInstanceOf(InvalidDateError);
    await expect(db.checkIn(m.id, '2026-02-30', 'desk', TODAY)).rejects.toBeInstanceOf(
      InvalidDateError,
    );
    await expect(db.checkIn(m.id, '0002-01-01', 'desk', TODAY)).rejects.toBeInstanceOf(
      InvalidDateError,
    );
    expect((await db.load()).visits).toHaveLength(0);
  });
});

describe('undo a check-in', () => {
  it('removes only that member on only that day', async () => {
    const a = await db.createMember(memberDraft());
    const b = await db.createMember(memberDraft({ phone: '+919876500011' }));
    await db.checkIn(a.id, '2026-07-25', 'desk', TODAY);
    await db.checkIn(a.id, TODAY, 'desk', TODAY);
    await db.checkIn(b.id, TODAY, 'desk', TODAY);

    await db.undoCheckIn(a.id, TODAY);

    const visits = (await db.load()).visits;
    // Filtering on one key instead of two would take out either A's whole history
    // or everybody's attendance for the day, from what the desk thinks is one undo.
    expect(visits).toHaveLength(2);
    expect(visits.some((v) => v.memberId === a.id && v.visitedOn === '2026-07-25')).toBe(true);
    expect(visits.some((v) => v.memberId === b.id && v.visitedOn === TODAY)).toBe(true);
    expect(visits.some((v) => v.memberId === a.id && v.visitedOn === TODAY)).toBe(false);
  });

  it('is a silent no-op when there was no such visit, so a double-tap cannot fail', async () => {
    const m = await db.createMember(memberDraft());
    await db.checkIn(m.id, TODAY, 'desk', TODAY);
    await db.undoCheckIn(m.id, TODAY);
    await expect(db.undoCheckIn(m.id, TODAY)).resolves.toBeUndefined();
    expect((await db.load()).visits).toHaveLength(0);
  });

  it('refuses a date that is not a real day', async () => {
    const m = await db.createMember(memberDraft());
    await expect(db.undoCheckIn(m.id, '2026-13-01')).rejects.toBeInstanceOf(InvalidDateError);
  });

  it('survives a reload — the removal is persisted, not just dropped from memory', async () => {
    const m = await db.createMember(memberDraft());
    await db.checkIn(m.id, TODAY, 'desk', TODAY);
    await db.undoCheckIn(m.id, TODAY);

    const reopened = new LocalCrmData({ store, now: () => 1 });
    expect((await reopened.load()).visits).toHaveLength(0);
  });
});

describe('a date the browser hands over half-finished never reaches storage', () => {
  const sell = async (over: { startsOn?: string; paidOn?: string; collectNowP?: number } = {}) => {
    const member = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());
    return db.sellMembership({
      memberId: member.id,
      planId: plan.id,
      startsOn: over.startsOn ?? TODAY,
      priceP: 300_000,
      joiningFeeP: 0,
      notes: null,
      collectNowP: over.collectNowP ?? 300_000,
      method: 'cash',
      reference: null,
      paidOn: over.paidOn ?? TODAY,
      soldBy: null,
    });
  };

  it('refuses an empty payment date instead of throwing inside the receipt maths', async () => {
    await expect(sell({ paidOn: '' })).rejects.toThrow(InvalidDateError);
  });

  it('refuses a mistyped year that would mint an unreadable receipt number', async () => {
    // `0002-01-01` is a real calendar day and passes "not in the future", so
    // nothing else stopped it. Its receipt number could not be parsed back, and
    // the next receipt reused it.
    await expect(sell({ paidOn: '0002-01-01' })).rejects.toThrow(InvalidDateError);
  });

  it('refuses a nonsense start date', async () => {
    await expect(sell({ startsOn: '2026-02-30' })).rejects.toThrow(InvalidDateError);
  });

  it('writes nothing at all when it refuses', async () => {
    await expect(sell({ paidOn: '' })).rejects.toThrow(InvalidDateError);
    const snap = await db.load();
    expect(snap.memberships).toEqual([]);
    expect(snap.payments).toEqual([]);
  });

  it('refuses a bad date on a later collection too', async () => {
    const { membership } = await sell({ collectNowP: 0 });
    await expect(
      db.recordPayment({
        memberId: membership.memberId,
        membershipId: membership.id,
        amountP: 100_000,
        method: 'cash',
        paidOn: 'not-a-date',
        reference: null,
        note: null,
        collectedBy: null,
      }),
    ).rejects.toThrow(InvalidDateError);
  });

  it('still accepts an ordinary back-dated payment', async () => {
    const { payment } = await sell({ paidOn: '2026-07-01' });
    expect(payment?.paidOn).toBe('2026-07-01');
  });
});

describe('the gym’s GST registration is snapshotted onto every receipt', () => {
  const sellTo = async () => {
    const member = await db.createMember(memberDraft());
    const plan = await db.createPlan(planDraft());
    return db.sellMembership({
      memberId: member.id,
      planId: plan.id,
      startsOn: TODAY,
      priceP: 300_000,
      joiningFeeP: 0,
      notes: null,
      collectNowP: 150_000,
      method: 'cash',
      reference: null,
      paidOn: TODAY,
      soldBy: null,
    });
  };

  it('records null while the gym is not registered', async () => {
    const { payment } = await sellTo();
    expect(payment?.gstinAtSale).toBeNull();
  });

  it('records the GSTIN the gym held at the moment of sale', async () => {
    await db.updateGym({ gstin: '27AAPFU0939F1ZV' });
    const { payment } = await sellTo();
    expect(payment?.gstinAtSale).toBe('27AAPFU0939F1ZV');
  });

  it('does not rewrite an existing receipt when the gym registers later', async () => {
    const { payment } = await sellTo();
    await db.updateGym({ gstin: '27AAPFU0939F1ZV' });

    const snap = await db.load();
    const stored = snap.payments.find((p) => p.id === payment?.id);
    expect(stored?.gstinAtSale).toBeNull();
  });

  it('snapshots on a later collection as well as at the point of sale', async () => {
    const { membership } = await sellTo();
    await db.updateGym({ gstin: '27AAPFU0939F1ZV' });

    const second = await db.recordPayment({
      memberId: membership.memberId,
      membershipId: membership.id,
      amountP: 150_000,
      method: 'upi',
      paidOn: TODAY,
      reference: null,
      note: null,
      collectedBy: null,
    });
    expect(second.gstinAtSale).toBe('27AAPFU0939F1ZV');
  });
});
