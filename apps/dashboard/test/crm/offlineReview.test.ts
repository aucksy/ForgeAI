/**
 * Offline front desk, step 3: the review of 9c832be (24 Oct 2026). One test (or more) per finding;
 * the first ones are the reviewer's probes (T1, T1b, T2, T3) brought into the repo.
 */
import { describe, expect, it } from 'vitest';

import type { RecordPaymentInput, SellMembershipInput } from '../../src/crm/data/adapter';
import {
  CLOCK_AHEAD_WORDS,
  CloudCrmData,
  HELD_PERSONAL_DAYS,
  STILL_SENDING_WORDS,
  STUCK_WORDS,
  type CloudCrmOptions,
  type CrmCloudApi,
  type CrmRecord,
  type PullResult,
} from '../../src/crm/data/cloud';
import { newRequestId } from '../../src/crm/data/local';
import { memoryOutbox, type OutboxStore } from '../../src/crm/data/outbox';
import type { Member, MemberDraft, Membership, Payment } from '../../src/crm/types';

const TODAY = '2026-10-24';

class Server implements CrmCloudApi {
  version = 0;
  rows = new Map<string, { r: CrmRecord; ver: number }>();
  log = new Map<string, number>();
  down = false;
  /** The next pushes fail before reaching the server. */
  failBefore = 0;
  /** After the next push is SAVED, the internet goes (the reply is lost). */
  afterNextPush: (() => void) | null = null;
  /** The next pushes answer 503 (not a refusal). */
  transient = 0;
  refuse: ((records: CrmRecord[], s: Server) => string | null) | null = null;
  gym = { gymId: 'g1', name: 'Iron Temple', joinCode: 'ABC123', createdAt: 1 };
  async pull(_key: string, since: number): Promise<PullResult> {
    if (this.down) throw new TypeError('Failed to fetch');
    const records = [...this.rows.values()].filter((x) => x.ver > since).map((x) => JSON.parse(JSON.stringify(x.r)) as CrmRecord);
    return { version: this.version, gym: { ...this.gym }, records };
  }
  async push(_key: string, base: number, records: CrmRecord[], pushId: string): Promise<number> {
    if (this.down) throw new TypeError('Failed to fetch');
    if (this.failBefore > 0) {
      this.failBefore -= 1;
      throw new TypeError('Failed to fetch');
    }
    if (this.transient > 0) {
      this.transient -= 1;
      throw new Error('503 Service Unavailable');
    }
    const done = this.log.get(pushId);
    if (done !== undefined) return done;
    if (base !== this.version) throw new Error('STALE');
    const why = this.refuse?.(records, this);
    if (why) throw new Error(why);
    this.version += 1;
    for (const r of records) this.rows.set(`${r.k}:${r.id}`, { r: JSON.parse(JSON.stringify(r)), ver: this.version });
    this.log.set(pushId, this.version);
    const after = this.afterNextPush;
    if (after) {
      this.afterNextPush = null;
      after();
      throw new TypeError('Failed to fetch');
    }
    return this.version;
  }
  list<T>(k: string): T[] {
    return [...this.rows.values()].filter((x) => x.r.k === k && !x.r.x).map((x) => x.r.d as T);
  }
}

const draft = (fullName: string, phone: string) =>
  ({ fullName, phone, email: null, gender: 'female', dateOfBirth: null, address: null, emergencyName: null, emergencyPhone: null, joinedOn: TODAY, photoUri: null, notes: null, archived: false }) as MemberDraft;

const OWNER = { staffId: 's-owner', name: 'Ramesh', role: 'owner' as const };
const SUNITA = { staffId: 's-sunita', name: 'Sunita', role: 'staff' as const };
const RAVI = { staffId: 's-ravi', name: 'Ravi', role: 'staff' as const };

function device(server: Server, key: string, extra: Partial<CloudCrmOptions> = {}, outbox: OutboxStore = memoryOutbox(), t = { now: 10_000 }) {
  return new CloudCrmData(key, server, { outbox, now: () => t.now, today: () => TODAY, wait: async () => undefined, ...extra });
}

async function gym(outbox: OutboxStore = memoryOutbox(), extra: Partial<CloudCrmOptions> = {}, t = { now: 10_000 }) {
  const server = new Server();
  const desk = device(server, 'k', extra, outbox, t);
  await desk.load();
  await desk.prepareOfflinePayments();
  await desk.createPlan({ name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150_000, joiningFeeP: 0, description: null, active: true, sortOrder: 1 });
  const plan = (await desk.load()).plans[0];
  const asha = await desk.createMember(draft('Asha', '+919829011111'));
  const sold = await desk.sellMembership(sale(asha.id, plan.id, 0));
  return { server, desk, outbox: outbox as ReturnType<typeof memoryOutbox>, asha, membership: sold.membership, plan, t };
}

const pay = (memberId: string, membershipId: string, amountP: number, collectedBy: string | null = null): RecordPaymentInput => ({
  memberId,
  membershipId,
  amountP,
  method: 'cash',
  paidOn: TODAY,
  reference: null,
  note: null,
  collectedBy,
  requestId: newRequestId(),
});

const sale = (memberId: string, planId: string, collectNowP: number): SellMembershipInput => ({
  memberId,
  planId,
  startsOn: TODAY,
  priceP: 150_000,
  joiningFeeP: 0,
  notes: null,
  collectNowP,
  method: 'cash',
  reference: null,
  paidOn: TODAY,
  soldBy: null,
  requestId: newRequestId(),
});

async function goOffline(server: Server, desk: CloudCrmData) {
  server.down = true;
  await desk.refresh().catch(() => undefined);
}

describe('review MUST 1: an online payment whose reply was lost is never taken twice', () => {
  it('T1: reply lost, then a new sheet offline for the same member is refused; online: ONE receipt', async () => {
    const { server, desk, outbox, asha, membership } = await gym();
    server.afterNextPush = () => {
      server.down = true;
    };
    await expect(desk.recordPayment(pay(asha.id, membership.id, 50_000))).rejects.toThrow(STUCK_WORDS);
    // It is on the waiting list with its push id, shows on screen, and its number is not sure yet.
    const item = outbox.docs.get('g1')!.items[0];
    expect(item.kind).toBe('push');
    const shown = (await desk.load()).payments;
    expect(shown).toHaveLength(1);
    expect(desk.deskState().unconfirmedIds).toEqual([shown[0].id]);
    await desk.refresh().catch(() => undefined); // the poll: offline
    await expect(desk.recordPayment(pay(asha.id, membership.id, 50_000))).rejects.toThrow(STILL_SENDING_WORDS);
    server.down = false;
    await desk.refresh();
    await desk.refresh();
    expect(server.list<Payment>('payment')).toHaveLength(1);
    expect(outbox.docs.get('g1')!.items).toEqual([]);
  });

  it('T1b: the same for a plan sold: one plan, one receipt', async () => {
    const { server, desk, asha, plan } = await gym();
    server.afterNextPush = () => {
      server.down = true;
    };
    await expect(desk.sellMembership(sale(asha.id, plan.id, 150_000))).rejects.toThrow(STUCK_WORDS);
    await desk.refresh().catch(() => undefined);
    await expect(desk.sellMembership(sale(asha.id, plan.id, 150_000))).rejects.toThrow(STILL_SENDING_WORDS);
    server.down = false;
    await desk.refresh();
    await desk.refresh();
    expect(server.list<Payment>('payment')).toHaveLength(1);
    expect(server.list<Membership>('membership')).toHaveLength(2); // the first plan (due) + the one sold once
  });

  it('a reload keeps the stuck payment and sends it exactly once', async () => {
    const { server, desk, outbox, asha, membership, t } = await gym();
    server.afterNextPush = () => {
      server.down = true;
    };
    await expect(desk.recordPayment(pay(asha.id, membership.id, 50_000))).rejects.toThrow(STUCK_WORDS);
    server.down = false;
    const again = device(server, 'k', {}, outbox, t);
    await again.load();
    await again.refresh();
    expect(server.list<Payment>('payment')).toHaveLength(1);
    expect(outbox.docs.get('g1')!.items).toEqual([]);
  });

  it('it never reached the server and another desk took its number meanwhile: it gets the next number, once', async () => {
    const { server, desk, asha, membership } = await gym();
    server.failBefore = 3; // the push and both resends never reach the server
    await expect(desk.recordPayment(pay(asha.id, membership.id, 50_000))).rejects.toThrow(STUCK_WORDS);
    const other = device(server, 'k2');
    await other.load();
    const theirs = await other.recordPayment(pay(asha.id, membership.id, 50_000));
    expect(theirs.receiptNo).toBe('2026-27/0001');
    await desk.refresh();
    const nos = server.list<Payment>('payment').map((p) => p.receiptNo).sort();
    expect(nos).toEqual(['2026-27/0001', '2026-27/0002']);
  });

  it('the internet back at the next press: the stuck save lands first and the desk is told to look', async () => {
    const { server, desk, asha, membership } = await gym();
    server.failBefore = 3;
    await expect(desk.recordPayment(pay(asha.id, membership.id, 50_000))).rejects.toThrow(STUCK_WORDS);
    await expect(desk.recordPayment(pay(asha.id, membership.id, 50_000))).rejects.toThrow(/saved just now/);
    expect(server.list<Payment>('payment')).toHaveLength(1);
  });
});

describe('review SHOULD 2: only a real refusal marks an item refused', () => {
  it('T3: one 503 while sending keeps it waiting; the next look sends it', async () => {
    const { server, desk, asha, membership } = await gym();
    await goOffline(server, desk);
    await desk.recordPayment(pay(asha.id, membership.id, 50_000));
    server.down = false;
    server.transient = 1;
    await desk.refresh();
    expect(desk.deskState().held).toEqual([]);
    expect(desk.deskState().waiting).toBe(1);
    await desk.refresh();
    expect(server.list<Payment>('payment')).toHaveLength(1);
    expect(desk.deskState().waiting).toBe(0);
  });
});

describe('review SHOULD 3: refused money is not money taken; the owner decides', () => {
  async function refused() {
    const g = await gym(memoryOutbox(), { person: OWNER });
    await goOffline(g.server, g.desk);
    const p = await g.desk.recordPayment(pay(g.asha.id, g.membership.id, 150_000));
    g.server.refuse = (records) => (records.some((r) => r.k === 'payment' && !(r.d as Payment).voided) ? 'OVER_DUE' : null);
    g.server.down = false;
    await g.desk.refresh();
    return { ...g, p };
  }

  it('not in the lists or totals; in the banner with the reason, marked as a receipt', async () => {
    const { desk, p } = await refused();
    expect((await desk.load()).payments.map((x) => x.id)).not.toContain(p.id);
    const s = desk.deskState();
    expect(s.paidP).toBe(0);
    expect(s.payments).toBe(0);
    expect(s.held).toEqual([expect.objectContaining({ hasReceipt: true, words: expect.stringMatching(/more than this member owes/) })]);
  });

  it('"Save as cancelled receipt": the number is kept on the server, cancelled, and nothing is owed less', async () => {
    const { server, desk, p } = await refused();
    await desk.saveHeldAsCancelled(desk.deskState().held[0].id);
    const onServer = server.list<Payment>('payment').find((x) => x.id === p.id);
    expect(onServer).toMatchObject({ receiptNo: '2026-27/D1-0001', voided: true });
    expect(onServer?.voidReason).toMatch(/Not sent from the desk/);
    expect(desk.deskState().waiting).toBe(0);
  });

  it('"Remove from this device": gone from the device, never sent', async () => {
    const { server, desk } = await refused();
    await desk.removeHeld(desk.deskState().held[0].id);
    expect(desk.deskState().waiting).toBe(0);
    expect(server.list<Payment>('payment')).toEqual([]);
  });
});

describe('review SHOULD 4: no endless desk claims', () => {
  it('T2: a waiting list that cannot be read: no claim at all', async () => {
    const broken: OutboxStore = {
      async load() {
        throw new Error('SecurityError: blocked');
      },
      async update() {
        throw new Error('QuotaExceededError');
      },
    };
    const { server, desk } = await gym(broken);
    for (let i = 0; i < 5; i += 1) {
      await desk.refresh();
      await desk.prepareOfflinePayments();
    }
    expect([...server.rows.keys()].filter((k) => k.startsWith('enquiry:deskseries-'))).toEqual([]);
  });

  it('read but not written: ONE claim, kept in memory', async () => {
    const real = memoryOutbox();
    const readOnly: OutboxStore = {
      load: (g) => real.load(g),
      async update() {
        throw new Error('QuotaExceededError');
      },
    };
    const { server, desk } = await gym(readOnly);
    for (let i = 0; i < 5; i += 1) {
      await desk.refresh();
      await desk.prepareOfflinePayments();
    }
    expect([...server.rows.keys()].filter((k) => k.startsWith('enquiry:deskseries-'))).toHaveLength(1);
    expect(desk.deskState().canPayOffline).toBe(true);
  });
});

describe('review SHOULD 6: who took the cash', () => {
  it('Sunita took it offline; Ravi signs in on the same device: it waits for her (or an owner), with words', async () => {
    const outbox = memoryOutbox();
    const g = await gym(outbox, { person: SUNITA });
    await goOffline(g.server, g.desk);
    await g.desk.recordPayment(pay(g.asha.id, g.membership.id, 50_000, SUNITA.staffId));
    g.server.down = false;
    const ravi = device(g.server, 'k-ravi', { person: RAVI }, outbox);
    await ravi.load();
    await ravi.refresh();
    expect(g.server.list<Payment>('payment')).toEqual([]);
    expect(ravi.deskState().waits[0].words).toMatch(/Waiting for Sunita or an owner/);
    expect(ravi.deskState().held).toEqual([]);
    // The owner signs in: sent, with Sunita's name kept as the taker.
    const owner = device(g.server, 'k-owner', { person: OWNER }, outbox);
    await owner.load();
    const sent = g.server.list<Payment>('payment');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ collectedBy: null, collectedByName: 'Sunita' });
  });

  it('the same person signed in again sends it as it was', async () => {
    const outbox = memoryOutbox();
    const g = await gym(outbox, { person: SUNITA });
    await goOffline(g.server, g.desk);
    await g.desk.recordPayment(pay(g.asha.id, g.membership.id, 50_000, SUNITA.staffId));
    g.server.down = false;
    const again = device(g.server, 'k-sunita-2', { person: SUNITA }, outbox);
    await again.load();
    expect(g.server.list<Payment>('payment')[0]).toMatchObject({ collectedBy: SUNITA.staffId });
  });
});

describe('review nits', () => {
  it('a refused new member holds back their plan and payment; the banner says so', async () => {
    const { server, desk, plan } = await gym();
    await goOffline(server, desk);
    const ravi = await desk.createMember(draft('Ravi', '+919829022222'));
    await desk.sellMembership(sale(ravi.id, plan.id, 100_000));
    server.refuse = (records) => (records.some((r) => r.k === 'member') ? 'INVALID' : null);
    server.down = false;
    await desk.refresh();
    expect(server.list<Membership>('membership').some((m) => m.memberId === ravi.id)).toBe(false);
    const s = desk.deskState();
    expect(s.held).toEqual([expect.objectContaining({ kind: 'member', withIt: 1 })]);
  });

  it('a refused member (personal details) leaves the device after 30 days', async () => {
    const t = { now: 10_000 };
    const { server, desk } = await gym(memoryOutbox(), {}, t);
    await goOffline(server, desk);
    await desk.createMember(draft('Ravi', '+919829022222'));
    server.refuse = (records) => (records.some((r) => r.k === 'member') ? 'INVALID' : null);
    server.down = false;
    await desk.refresh();
    expect(desk.deskState().held).toHaveLength(1);
    t.now += (HELD_PERSONAL_DAYS + 1) * 86_400_000;
    await desk.refresh();
    expect(desk.deskState().held).toEqual([]);
  });

  it("the desk's clock was ahead (BAD_DATE): it waits with words, retried; an owner sends it with today's date", async () => {
    // This device thinks it is the 25th; the server knows it is the 24th.
    let deviceToday = '2026-10-25';
    const { server, desk, asha, membership } = await gym(memoryOutbox(), { person: OWNER, today: () => deviceToday });
    await goOffline(server, desk);
    await desk.recordPayment({ ...pay(asha.id, membership.id, 50_000), paidOn: '2026-10-25' });
    server.refuse = (records) => (records.some((r) => r.k === 'payment' && (r.d as Payment).paidOn > TODAY) ? 'BAD_DATE' : null);
    server.down = false;
    await desk.refresh();
    await desk.refresh(); // tried again on every look, still not refused
    const s = desk.deskState();
    expect(s.held).toEqual([]);
    expect(s.waits[0]).toMatchObject({ words: CLOCK_AHEAD_WORDS, clockAhead: true });
    expect(s.paidP).toBe(50_000); // still money taken, still waiting
    expect(server.list<Payment>('payment')).toEqual([]);
    // The clock is put right; the owner sends it with today's date (the receipt number stays).
    deviceToday = TODAY;
    expect(await desk.sendWithToday(s.waits[0].id)).toBe(true);
    expect(server.list<Payment>('payment')).toEqual([expect.objectContaining({ paidOn: TODAY, receiptNo: '2026-27/D1-0001' })]);
  });

  it('"Clear this device\'s saved data" empties the waiting list for the gym', async () => {
    const { server, desk, outbox, asha } = await gym();
    await goOffline(server, desk);
    await desk.checkIn(asha.id, TODAY, 'desk', TODAY);
    await desk.clearDevice();
    expect(outbox.docs.get('g1')!.items).toEqual([]);
  });

  it('member edits merge field by field (no clock needed when fields differ)', async () => {
    const { server, desk, asha, t } = await gym();
    await goOffline(server, desk);
    t.now = 50_000;
    await desk.updateMember(asha.id, { email: 'asha@example.com' });
    server.down = false;
    const o = device(server, 'k2', {}, memoryOutbox(), { now: 90_000 });
    await o.load();
    await o.updateMember(asha.id, { notes: 'Knee' });
    await desk.refresh();
    const m = server.list<Member>('member').find((x) => x.id === asha.id);
    expect(m).toMatchObject({ email: 'asha@example.com', notes: 'Knee' });
  });
});
