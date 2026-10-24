import { describe, expect, it } from 'vitest';

import { DuplicatePhoneError, type RecordPaymentInput } from '../../src/crm/data/adapter';
import {
  CloudCrmData,
  NO_DESK_SERIES_WORDS,
  OFFLINE_SAVE_WORDS,
  type CrmCloudApi,
  type CrmRecord,
  type PullResult,
} from '../../src/crm/data/cloud';
import { newRequestId } from '../../src/crm/data/local';
import {
  deskClaimRecord,
  emptyOutbox,
  isDeskClaim,
  memoryOutbox,
  nextDeskNo,
  overlay,
  replayRecords,
  usableOutbox,
  waitingSummary,
  type OutboxItem,
} from '../../src/crm/data/outbox';
import { highestOfflineSeq, nextReceiptNo, offlineReceiptNo, parseOfflineReceiptNo } from '../../src/crm/logic/receipts';
import type { Member, MemberDraft, Membership, Payment, PlanDraft } from '../../src/crm/types';

const TODAY = '2026-10-24';

const draft = (fullName: string, phone: string): MemberDraft =>
  ({
    fullName,
    phone,
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
  }) as MemberDraft;

const MONTHLY: PlanDraft = {
  name: 'Monthly',
  durationUnit: 'month',
  durationCount: 1,
  priceP: 150_000,
  joiningFeeP: 0,
  description: null,
  active: true,
  sortOrder: 1,
};

/**
 * crm_pull / crm_push with the server's rules that matter here: one version per push, STALE on a
 * race, a push id seen before answers with its first version (0011), a network that can drop, a
 * reply that can be lost after the save, and an optional refusal.
 */
class Server implements CrmCloudApi {
  version = 0;
  rows = new Map<string, { r: CrmRecord; ver: number }>();
  log = new Map<string, number>();
  down = false;
  loseReply = 0;
  pushes = 0;
  refuse: ((records: CrmRecord[], server: Server) => string | null) | null = null;
  gym = { gymId: 'g1', name: 'Iron Temple', joinCode: 'ABC123', createdAt: 1 };
  async pull(_key: string, since: number): Promise<PullResult> {
    if (this.down) throw new TypeError('Failed to fetch');
    const records = [...this.rows.values()].filter((x) => x.ver > since).map((x) => JSON.parse(JSON.stringify(x.r)) as CrmRecord);
    return { version: this.version, gym: { ...this.gym }, records };
  }
  async push(_key: string, base: number, records: CrmRecord[], pushId: string): Promise<number> {
    if (this.down) throw new TypeError('Failed to fetch');
    const done = this.log.get(pushId);
    if (done !== undefined) return done;
    if (base !== this.version) throw new Error('STALE');
    const why = this.refuse?.(records, this);
    if (why) throw new Error(why);
    this.version += 1;
    for (const r of records) this.rows.set(`${r.k}:${r.id}`, { r: JSON.parse(JSON.stringify(r)), ver: this.version });
    this.log.set(pushId, this.version);
    this.pushes += 1;
    if (this.loseReply > 0) {
      this.loseReply -= 1;
      throw new TypeError('Failed to fetch');
    }
    return this.version;
  }
  list<T>(k: string): T[] {
    return [...this.rows.values()].filter((x) => x.r.k === k && !x.r.x).map((x) => x.r.d as T);
  }
}

/** A device of the gym: its own key, its own waiting list (unless shared: two tabs). */
function device(server: Server, key: string, t = { now: 10_000 }, outbox = memoryOutbox()) {
  const desk = new CloudCrmData(key, server, { outbox, now: () => t.now, today: () => TODAY, wait: async () => undefined });
  return { desk, outbox, t };
}

const pay = (memberId: string, membershipId: string, amountP: number, requestId = newRequestId()): RecordPaymentInput => ({
  memberId,
  membershipId,
  amountP,
  method: 'cash',
  paidOn: TODAY,
  reference: null,
  note: null,
  collectedBy: null,
  requestId,
});

/** A gym with one plan and Asha, who owes Rs 1,500 on it; the desk device is online (series D1). */
async function gymWithDue() {
  const server = new Server();
  const d = device(server, 'key-desk');
  await d.desk.load();
  // A money sheet opened online (review SHOULD 5: the series is claimed only then).
  await d.desk.prepareOfflinePayments();
  await d.desk.createPlan(MONTHLY);
  const plan = (await d.desk.load()).plans[0];
  const asha = await d.desk.createMember(draft('Asha Verma', '+919829011111'));
  const { membership } = await d.desk.sellMembership({
    memberId: asha.id,
    planId: plan.id,
    startsOn: TODAY,
    priceP: 150_000,
    joiningFeeP: 0,
    notes: null,
    collectNowP: 0,
    method: 'cash',
    reference: null,
    paidOn: TODAY,
    soldBy: null,
  });
  return { server, ...d, plan, asha, membership };
}

async function goOffline(server: Server, desk: CloudCrmData) {
  server.down = true;
  await desk.refresh().catch(() => undefined);
  expect(desk.offlineState()).not.toBeNull();
}

describe('offline front desk, step 3: the desk receipt series (pure)', () => {
  it('spells each series within 16 characters, branches with their prefix', () => {
    expect(offlineReceiptNo(1, 1, TODAY)).toBe('2026-27/D1-0001');
    expect(offlineReceiptNo(12, 37, TODAY)).toBe('2026-27/D12-0037');
    expect(offlineReceiptNo(123, 1, TODAY)).toBe('26-27/D123-0001');
    expect(offlineReceiptNo(1, 1, TODAY, 'B2')).toBe('B2/26-27/D1-0001');
    expect(offlineReceiptNo(10, 1, TODAY, 'B2')).toBe('B2/26/D10-0001');
    expect(offlineReceiptNo(1, 1, TODAY, 'B10')).toBe('B10/26/D1-0001');
    expect(offlineReceiptNo(1234, 1, TODAY)).toBe('26-27/D1234-0001');
    expect(offlineReceiptNo(12345, 1, TODAY)).toBe('26/D12345-0001');
    // Review SHOULD 5: every prefix the server allows (up to 4 characters) fits for D1..D99.
    for (const px of ['B2', 'B10', 'B999', 'ABCD']) {
      for (const n of [1, 9, 10, 99]) expect(offlineReceiptNo(n, 9999, TODAY, px).length).toBeLessThanOrEqual(16);
    }
    expect(() => offlineReceiptNo(100, 1, TODAY, 'ABCD')).toThrow(/too long/);
    for (const no of [offlineReceiptNo(9, 9999, TODAY), offlineReceiptNo(2, 1, TODAY, 'B9'), offlineReceiptNo(99, 1, TODAY)]) {
      expect(no.length).toBeLessThanOrEqual(16);
      // The branch rule of 0031: a prefixed branch's receipt starts with its prefix and a slash.
      expect(/^[A-Za-z0-9/-]{1,16}$/.test(no)).toBe(true);
    }
    // A March receipt is last year's series.
    expect(offlineReceiptNo(1, 1, '2027-03-31')).toBe('2026-27/D1-0001');
    expect(offlineReceiptNo(1, 1, '2027-04-01')).toBe('2027-28/D1-0001');
  });

  it('reads every spelling back, per desk and year; the normal series never reads them', () => {
    expect(parseOfflineReceiptNo('2026-27/D1-0007')).toEqual({ deskNo: 1, fy: '26-27', seq: 7 });
    expect(parseOfflineReceiptNo('26-27/D123-0001')).toEqual({ deskNo: 123, fy: '26-27', seq: 1 });
    expect(parseOfflineReceiptNo('B2/26-27/D1-0002', 'B2')).toEqual({ deskNo: 1, fy: '26-27', seq: 2 });
    expect(parseOfflineReceiptNo('B10/2627/D1-0003', 'B10')).toEqual({ deskNo: 1, fy: '26-27', seq: 3 });
    expect(parseOfflineReceiptNo('B10/26/D1-0004', 'B10')).toEqual({ deskNo: 1, fy: '26-27', seq: 4 });
    expect(parseOfflineReceiptNo('99/D1-0004')).toEqual({ deskNo: 1, fy: '99-00', seq: 4 });
    expect(parseOfflineReceiptNo('B2/26-27/D1-0002')).toBeNull();
    expect(parseOfflineReceiptNo('2026-27/0004')).toBeNull();
    const rows = [{ receiptNo: '2026-27/0004' }, { receiptNo: '2026-27/D1-0009' }, { receiptNo: '2026-27/D2-0040' }, { receiptNo: '2025-26/D1-0050' }];
    expect(highestOfflineSeq(rows, 1, TODAY)).toBe(9);
    expect(highestOfflineSeq(rows, 2, TODAY)).toBe(40);
    expect(highestOfflineSeq(rows, 3, TODAY)).toBe(0);
    // Online receipts keep the normal series, unmoved by the offline ones.
    expect(nextReceiptNo(rows, TODAY)).toBe('2026-27/0005');
  });

  it('desk numbers: the first free one; claims are not enquiries', () => {
    expect(nextDeskNo([])).toBe(1);
    expect(nextDeskNo(['e1', 'deskseries-1', 'deskseries-3'])).toBe(4);
    expect(isDeskClaim(deskClaimRecord(2, 'dev', 1, 'g1').id)).toBe(true);
    expect(usableOutbox({ v: 1, gymId: 'other', items: [] }, 'g1')).toEqual(emptyOutbox('g1'));
  });
});

describe('offline front desk, step 3: each desk gets its own series, once, while online', () => {
  it('two devices get D1 and D2, even when they claim at the same moment', async () => {
    const server = new Server();
    const a = device(server, 'key-a');
    const b = device(server, 'key-b');
    await Promise.all([a.desk.load(), b.desk.load()]);
    // Opening alone claims nothing (review SHOULD 5).
    expect([...server.rows.keys()].filter((k) => k.startsWith('enquiry:deskseries-'))).toEqual([]);
    await Promise.all([a.desk.prepareOfflinePayments(), b.desk.prepareOfflinePayments()]);
    const nos = [a.outbox.docs.get('g1')?.desk?.no, b.outbox.docs.get('g1')?.desk?.no].sort();
    expect(nos).toEqual([1, 2]);
    // A third load does not claim again.
    const before = server.pushes;
    await a.desk.refresh();
    await a.desk.prepareOfflinePayments();
    expect(server.pushes).toBe(before);
    // Claims never show as enquiries.
    expect((await a.desk.load()).enquiries).toEqual([]);
  });

  it('no series kept and no internet: the payment is refused in plain words; check-ins still work', async () => {
    const { server, asha, membership } = await gymWithDue();
    // A second device: online once, but no money sheet ever opened on it (so no series).
    const b = device(server, 'key-b');
    await b.desk.load();
    await goOffline(server, b.desk);
    await expect(b.desk.recordPayment(pay(asha.id, membership.id, 50_000))).rejects.toThrow(NO_DESK_SERIES_WORDS);
    await b.desk.checkIn(asha.id, TODAY, 'desk', TODAY);
    expect(b.outbox.docs.get('g1')?.items).toHaveLength(1);
  });
});

describe('offline front desk, step 3: payments taken with no internet', () => {
  it('a payment offline gets the desk number, shows at once as waiting, and goes exactly once', async () => {
    const { server, desk, outbox, asha, membership } = await gymWithDue();
    await goOffline(server, desk);
    const p1 = await desk.recordPayment(pay(asha.id, membership.id, 50_000));
    const p2 = await desk.recordPayment(pay(asha.id, membership.id, 30_000));
    expect(p1.receiptNo).toBe('2026-27/D1-0001');
    expect(p2.receiptNo).toBe('2026-27/D1-0002');
    expect(p1.offline).toBe(true);
    const snap = await desk.load();
    expect(snap.payments.map((p) => p.receiptNo)).toEqual(['2026-27/D1-0001', '2026-27/D1-0002']);
    const state = desk.deskState();
    expect(state.offline).toBe(true);
    expect(state.waiting).toBe(2);
    expect(state.waitingIds).toEqual(expect.arrayContaining([p1.id, p2.id]));
    expect(state.paidP).toBe(80_000);
    expect(server.list<Payment>('payment')).toEqual([]);

    server.down = false;
    await desk.refresh();
    await desk.refresh(); // a second look sends nothing again
    const sent = server.list<Payment>('payment');
    expect(sent.map((p) => p.receiptNo).sort()).toEqual(['2026-27/D1-0001', '2026-27/D1-0002']);
    expect(sent.find((p) => p.id === p1.id)).toMatchObject({ amountP: 50_000, receiptNo: '2026-27/D1-0001', offline: true });
    expect(desk.deskState().waiting).toBe(0);
    expect(outbox.docs.get('g1')?.items).toEqual([]);
    // Back online, the next payment is from the normal series.
    const p3 = await desk.recordPayment(pay(asha.id, membership.id, 10_000));
    expect(p3.receiptNo).toBe('2026-27/0001');
    expect(p3.offline).toBeUndefined();
  });

  it('the same press twice offline (the same sheet) is one payment, never two', async () => {
    const { server, desk, outbox, asha, membership } = await gymWithDue();
    await goOffline(server, desk);
    const input = pay(asha.id, membership.id, 50_000);
    const a = await desk.recordPayment(input);
    const b = await desk.recordPayment(input);
    expect(b.id).toBe(a.id);
    expect(outbox.docs.get('g1')?.items).toHaveLength(1);
  });

  it('the reply is lost after the server saved it: sent again with the same push id, saved once', async () => {
    const { server, desk, asha, membership } = await gymWithDue();
    await goOffline(server, desk);
    const p = await desk.recordPayment(pay(asha.id, membership.id, 50_000));
    server.down = false;
    server.loseReply = 1;
    await desk.refresh().catch(() => undefined); // saved on the server; the answer never came
    expect(desk.deskState().waiting).toBe(1); // still waiting here: the desk could not know
    await desk.refresh();
    const onServer = server.list<Payment>('payment').filter((x) => x.id === p.id);
    expect(onServer).toHaveLength(1);
    expect(server.list<Payment>('payment')).toHaveLength(1);
    expect(desk.deskState().waiting).toBe(0);
  });

  it('a plan sold offline (renewal) carries its payment and number; both arrive', async () => {
    const { server, desk, asha, plan } = await gymWithDue();
    await goOffline(server, desk);
    const r = await desk.sellMembership({
      memberId: asha.id,
      planId: plan.id,
      startsOn: '2026-11-24',
      priceP: 150_000,
      joiningFeeP: 0,
      notes: null,
      collectNowP: 150_000,
      method: 'upi',
      reference: null,
      paidOn: TODAY,
      soldBy: null,
      requestId: newRequestId(),
    });
    expect(r.payment?.receiptNo).toBe('2026-27/D1-0001');
    server.down = false;
    await desk.refresh();
    expect(server.list<Membership>('membership').map((m) => m.id)).toContain(r.membership.id);
    expect(server.list<Payment>('payment').map((p) => p.receiptNo)).toEqual(['2026-27/D1-0001']);
  });

  it('two tabs on the same desk, both offline, never print the same number', async () => {
    const { server, desk, outbox, asha, membership, t } = await gymWithDue();
    const tab2 = new CloudCrmData('key-desk', server, { outbox, now: () => t.now, today: () => TODAY, wait: async () => undefined });
    await tab2.load();
    await goOffline(server, desk);
    await goOffline(server, tab2);
    const [a, b] = await Promise.all([
      desk.recordPayment(pay(asha.id, membership.id, 20_000)),
      tab2.recordPayment(pay(asha.id, membership.id, 20_000)),
    ]);
    expect([a.receiptNo, b.receiptNo].sort()).toEqual(['2026-27/D1-0001', '2026-27/D1-0002']);
    expect(outbox.docs.get('g1')?.items).toHaveLength(2);
  });

  it('the page restarted offline: the waiting payment is still on screen, and goes when online', async () => {
    const { server, desk, outbox, asha, membership, t } = await gymWithDue();
    await goOffline(server, desk);
    const p = await desk.recordPayment(pay(asha.id, membership.id, 50_000));
    // Restart: a fresh copy of the panel, with the copy of the gym kept... the outbox carries it.
    server.down = false;
    const again = new CloudCrmData('key-desk', server, { outbox, now: () => t.now, today: () => TODAY, wait: async () => undefined });
    await again.load(); // opens online and sends at once
    expect(server.list<Payment>('payment').map((x) => x.id)).toEqual([p.id]);
  });

  it('signed out and in again (a new key, the same gym): the waiting payment is sent, never lost', async () => {
    const { server, desk, outbox, asha, membership, t } = await gymWithDue();
    await goOffline(server, desk);
    const p = await desk.recordPayment(pay(asha.id, membership.id, 50_000));
    server.down = false;
    const newKey = new CloudCrmData('key-new-sign-in', server, { outbox, now: () => t.now, today: () => TODAY, wait: async () => undefined });
    await newKey.load();
    expect(server.list<Payment>('payment').map((x) => x.id)).toEqual([p.id]);
  });

  it('another device took money for the same plan meanwhile: ours is refused but KEPT, on screen, with words', async () => {
    const { server, desk, outbox, asha, membership } = await gymWithDue();
    await goOffline(server, desk);
    const ours = await desk.recordPayment(pay(asha.id, membership.id, 150_000));
    // The server's OVER_DUE rule (0021): more than the plan still owes.
    server.refuse = (records, s) => {
      for (const r of records) {
        if (r.k !== 'payment') continue;
        const p = r.d as Payment;
        const paid = s.list<Payment>('payment').filter((x) => x.membershipId === p.membershipId && !x.voided && x.id !== p.id).reduce((n, x) => n + x.amountP, 0);
        if (p.amountP + paid > 150_000) return 'OVER_DUE';
      }
      return null;
    };
    server.down = false;
    const other = device(server, 'key-other');
    await other.desk.load();
    await other.desk.recordPayment(pay(asha.id, membership.id, 150_000));
    await desk.refresh();
    const state = desk.deskState();
    expect(state.waiting).toBe(1);
    expect(state.held).toHaveLength(1);
    expect(state.held[0].words).toMatch(/kept on this device/);
    // Review SHOULD 3: refused is not money taken: banner only, never in the totals or lists.
    expect((await desk.load()).payments.some((p) => p.id === ours.id)).toBe(false);
    expect(state.paidP).toBe(0);
    expect(outbox.docs.get('g1')?.items[0].held).toMatch(/more than this member owes/);
    // The owner sorts it out (here: the other receipt is cancelled); Try again sends it.
    server.refuse = null;
    expect(await desk.sendAgain()).toBe(true);
    expect(server.list<Payment>('payment').some((p) => p.id === ours.id)).toBe(true);
    expect(desk.deskState().waiting).toBe(0);
  });
});

describe('offline front desk, step 3: new members and their changes', () => {
  it('a member added offline keeps their id; the payment and check-in made for them follow it', async () => {
    const { server, desk, plan } = await gymWithDue();
    await goOffline(server, desk);
    const ravi = await desk.createMember(draft('Ravi Kumar', '+919829022222'));
    const sale = await desk.sellMembership({
      memberId: ravi.id,
      planId: plan.id,
      startsOn: TODAY,
      priceP: 150_000,
      joiningFeeP: 0,
      notes: null,
      collectNowP: 100_000,
      method: 'cash',
      reference: null,
      paidOn: TODAY,
      soldBy: null,
      requestId: newRequestId(),
    });
    await desk.checkIn(ravi.id, TODAY, 'desk', TODAY);
    expect((await desk.load()).members.map((m) => m.fullName)).toContain('Ravi Kumar');
    expect(desk.deskState().waiting).toBe(3);

    server.down = false;
    await desk.refresh();
    const members = server.list<Member>('member').filter((m) => m.fullName === 'Ravi Kumar');
    expect(members).toHaveLength(1);
    expect(members[0].id).toBe(ravi.id);
    expect(server.list<Membership>('membership').find((m) => m.id === sale.membership.id)?.memberId).toBe(ravi.id);
    expect(server.list<Payment>('payment').find((p) => p.id === sale.payment?.id)?.memberId).toBe(ravi.id);
    expect(server.list<{ memberId: string }>('visit').map((v) => v.memberId)).toEqual([ravi.id]);
  });

  it('a mobile already in the copy on this device is refused offline, as online', async () => {
    const { server, desk } = await gymWithDue();
    await goOffline(server, desk);
    await expect(desk.createMember(draft('Asha again', '+919829011111'))).rejects.toBeInstanceOf(DuplicatePhoneError);
  });

  it('another device added the same mobile meanwhile: both are kept, ours says "Check", never merged', async () => {
    const { server, desk } = await gymWithDue();
    await goOffline(server, desk);
    const ours = await desk.createMember(draft('Ravi Kumar', '+919829022222'));
    server.down = false;
    const other = device(server, 'key-other');
    await other.desk.load();
    const theirs = await other.desk.createMember(draft('Ravi K', '+919829022222'));
    await desk.refresh();
    const both = server.list<Member>('member').filter((m) => m.phone === '+919829022222');
    expect(both.map((m) => m.id).sort()).toEqual([ours.id, theirs.id].sort());
    expect(both.find((m) => m.id === ours.id)?.duplicateOf).toBe(theirs.id);
    expect(desk.deskState().notes.map((n) => n.text)).toEqual(['Check Ravi Kumar: Ravi K already has the same mobile number. Both are kept.']);
    const note = desk.deskState().notes[0];
    await desk.dismissNote(note.id);
    expect(desk.deskState().notes).toEqual([]);
  });

  it('a change made here offline, then a NEWER one on another device: the newer one wins, the desk is told', async () => {
    const { server, desk, asha, t } = await gymWithDue();
    await goOffline(server, desk);
    t.now = 20_000;
    await desk.updateMember(asha.id, { address: 'Old street' });
    server.down = false;
    const o = device(server, 'key-other', { now: 30_000 });
    await o.desk.load();
    await o.desk.updateMember(asha.id, { address: 'New street' });
    await desk.refresh();
    expect(server.list<Member>('member').find((m) => m.id === asha.id)?.address).toBe('New street');
    expect(desk.deskState().notes[0].text).toMatch(/changed on another device later, so that newer change was kept/);
    expect((await desk.load()).members.find((m) => m.id === asha.id)?.address).toBe('New street');
  });

  it('another device changed the member EARLIER than the change made here: ours is newer and wins', async () => {
    const { server, desk, asha, t } = await gymWithDue();
    await goOffline(server, desk);
    server.down = false;
    const o = device(server, 'key-other', { now: 15_000 });
    await o.desk.load();
    await o.desk.updateMember(asha.id, { notes: 'Knee' });
    server.down = true;
    t.now = 40_000;
    await desk.updateMember(asha.id, { address: 'Desk street' });
    server.down = false;
    await desk.refresh();
    const s = server.list<Member>('member').find((m) => m.id === asha.id);
    expect(s?.address).toBe('Desk street');
    expect(s?.notes).toBe('Knee'); // review nit: merged field by field, both changes kept
    expect(desk.deskState().notes).toEqual([]); // different fields: nothing to tell
  });

  it('the SAME field changed on both, ours later: ours is kept, the desk is told', async () => {
    const { server, desk, asha, t } = await gymWithDue();
    await goOffline(server, desk);
    server.down = false;
    const o = device(server, 'key-other', { now: 15_000 });
    await o.desk.load();
    await o.desk.updateMember(asha.id, { address: 'Their street' });
    server.down = true;
    t.now = 40_000;
    await desk.updateMember(asha.id, { address: 'Desk street' });
    server.down = false;
    await desk.refresh();
    expect(server.list<Member>('member').find((m) => m.id === asha.id)?.address).toBe('Desk street');
    expect(desk.deskState().notes[0].text).toMatch(/newer, so it was kept/);
  });

  it('not safe to keep offline (plans, archive, receipts cancelled): refused in plain words', async () => {
    const { server, desk, asha } = await gymWithDue();
    await goOffline(server, desk);
    await expect(desk.setMemberArchived(asha.id, true)).rejects.toThrow(OFFLINE_SAVE_WORDS);
    await expect(desk.updatePlan('x', { priceP: 1 })).rejects.toThrow(OFFLINE_SAVE_WORDS);
  });
});

describe('offline front desk, step 3: replay and overlay (pure)', () => {
  const snap = () => ({
    gym: { gymId: 'g1', name: 'G', joinCode: 'J', phone: null, address: null, gstin: null, createdAt: 1 },
    members: [{ id: 'm1', fullName: 'Asha', phone: '+911', updatedAt: 5 } as Member],
    plans: [],
    memberships: [{ id: 'ms1', memberId: 'm1' } as Membership],
    payments: [] as Payment[],
    visits: [],
    enquiries: [],
    expenses: [],
    workoutPlans: [],
  });
  const item = (over: Partial<OutboxItem>): OutboxItem => ({ id: 'i1', kind: 'payment', at: 10, memberId: 'm1', records: [], ...over });

  it('a payment already on the server is not sent again; one whose number is taken is held', () => {
    const p = { id: 'p1', memberId: 'm1', membershipId: 'ms1', receiptNo: '2026-27/D1-0001', amountP: 5 } as Payment;
    const it = item({ records: [{ k: 'payment', id: 'p1', d: p }] });
    expect(replayRecords(it, snap()).records).toHaveLength(1);
    expect(replayRecords(it, { ...snap(), payments: [p] }).records).toEqual([]);
    const clash = { ...p, id: 'p9' };
    expect(replayRecords(it, { ...snap(), payments: [clash] }).hold).toMatch(/already has the number/);
    const lost = item({ records: [{ k: 'payment', id: 'p1', d: { ...p, membershipId: 'gone' } }] });
    expect(replayRecords(lost, snap()).hold).toMatch(/not on the server/);
  });

  it('overlay shows waiting records once, and the summary counts them', () => {
    const v = { id: 'v1', memberId: 'm1', visitedOn: TODAY };
    const items = [item({ kind: 'checkIn', records: [{ k: 'visit', id: 'v1', d: v }] }), item({ id: 'i2', records: [{ k: 'payment', id: 'p1', d: { id: 'p1', amountP: 700 } }] })];
    const out = overlay(snap(), items);
    expect(out.visits).toHaveLength(1);
    expect(out.payments).toHaveLength(1);
    // The server already has a visit that day: the waiting one is not shown twice.
    const withServerVisit = overlay({ ...snap(), visits: [{ id: 'v0', memberId: 'm1', visitedOn: TODAY } as never] }, items);
    expect(withServerVisit.visits.map((x) => x.id)).toEqual(['v0']);
    expect(waitingSummary(items)).toMatchObject({ waiting: 2, payments: 1, paidP: 700 });
  });
});
