import { describe, expect, it } from 'vitest';

import { DuplicatePhoneError, PartialSaveError } from '../../src/crm/data/adapter';
import {
  allRecords,
  CloudCrmData,
  diffSnapshots,
  uploadSnapshot,
  UPLOAD_CHUNK,
  type CrmCloudApi,
  type CrmRecord,
  type PullResult,
} from '../../src/crm/data/cloud';
import { emptySnapshot, normalizeSnapshot } from '../../src/crm/data/local';
import type { MemberDraft, PlanDraft } from '../../src/crm/types';
import { openTerm } from './fixtures';

const TODAY = '2026-10-14';

const member = (over: Partial<MemberDraft> = {}): MemberDraft => ({
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

const plan: PlanDraft = {
  name: 'Monthly',
  durationValue: 1,
  durationUnit: 'month',
  priceP: 150000,
  joiningFeeP: 0,
  description: null,
  active: true,
} as unknown as PlanDraft;

/** Postgres jsonb stores keys in its own order (shorter keys first): copy that, as the review asked. */
function jsonbOrder(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(jsonbOrder);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v as object).sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    return Object.fromEntries(keys.map((k) => [k, jsonbOrder((v as Record<string, unknown>)[k])]));
  }
  return v;
}

/**
 * A stand-in for crm_pull / crm_push with the same rules: one version per push, STALE on a race,
 * a push id seen before returns its first version (0011), keys stored in jsonb order.
 */
class FakeServer implements CrmCloudApi {
  version = 0;
  rows = new Map<string, { r: CrmRecord; v: number }>();
  pushes = 0;
  log = new Map<string, number>();
  /** Make the next N pushes save but lose their reply. */
  loseReplies = 0;
  /** Make the next N pushes fail before reaching the server. */
  offline = 0;
  gym = { gymId: 'g1', name: 'Iron Temple', joinCode: 'ABC123', createdAt: 1 };

  async pull(_key: string, since: number): Promise<PullResult> {
    const records = [...this.rows.values()]
      .filter((x) => x.v > since && (since > 0 || !x.r.x))
      .sort((a, b) => a.v - b.v)
      .map((x) => x.r);
    return { version: this.version, gym: { ...this.gym }, records: JSON.parse(JSON.stringify(records)) };
  }

  async push(_key: string, base: number, records: CrmRecord[], pushId: string): Promise<number> {
    if (this.offline > 0) {
      this.offline -= 1;
      throw new Error('Failed to fetch');
    }
    const done = this.log.get(pushId);
    if (done !== undefined) return done;
    if (base !== this.version) throw new Error('STALE');
    this.version += 1;
    this.pushes += 1;
    for (const r of records) {
      this.rows.set(`${r.k}:${r.id}`, { r: jsonbOrder(JSON.parse(JSON.stringify(r))) as CrmRecord, v: this.version });
      if (r.k === 'gym' && r.d && typeof (r.d as { name?: string }).name === 'string') this.gym.name = (r.d as { name: string }).name;
    }
    this.log.set(pushId, this.version);
    if (this.loseReplies > 0) {
      this.loseReplies -= 1;
      throw new Error('timed out');
    }
    return this.version;
  }
}

describe('diffSnapshots', () => {
  it('lists only what changed, and deletions', () => {
    const a = emptySnapshot(1, 'Gym');
    a.visits.push({ id: 'v1', gymId: 'g', memberId: 'm', visitedOn: TODAY, checkedInAt: 5, source: 'desk' } as never);
    const b = JSON.parse(JSON.stringify(a));
    b.visits = [];
    b.gym.phone = '0141 222';
    expect(diffSnapshots(a, b)).toEqual([
      { k: 'gym', id: 'gym', d: { name: 'Gym', phone: '0141 222', address: null, gstin: null } },
      { k: 'visit', id: 'v1', d: null, x: true },
    ]);
    expect(diffSnapshots(a, JSON.parse(JSON.stringify(a)))).toEqual([]);
  });
});

describe('CloudCrmData', () => {
  it('saves a member online and reads it back on another device', async () => {
    const server = new FakeServer();
    const deskA = new CloudCrmData('k', server);
    const m = await deskA.createMember(member());
    const deskB = new CloudCrmData('k', server);
    const snap = await deskB.load();
    expect(snap.members.map((x) => x.id)).toEqual([m.id]);
    expect(snap.gym.joinCode).toBe('ABC123');
  });

  it('a second desk sees a mobile added at the first desk as a duplicate', async () => {
    const server = new FakeServer();
    const deskA = new CloudCrmData('k', server);
    const deskB = new CloudCrmData('k', server);
    await deskB.load(); // B's copy is now old
    await deskA.createMember(member());
    await expect(deskB.createMember(member({ fullName: 'Someone Else' }))).rejects.toBeInstanceOf(DuplicatePhoneError);
  });

  it('two desks taking money at once get different receipt numbers', async () => {
    const server = new FakeServer();
    const deskA = new CloudCrmData('k', server);
    const m = await deskA.createMember(member());
    const term = await openTerm(deskA, m.id, TODAY);
    const deskB = new CloudCrmData('k', server);
    await deskB.load();
    const input = {
      memberId: m.id,
      membershipId: term,
      amountP: 50000,
      method: 'cash' as const,
      paidOn: TODAY,
      reference: null,
      note: null,
      collectedBy: null,
    };
    const p1 = await deskA.recordPayment(input);
    const p2 = await deskB.recordPayment(input); // built on an old copy -> STALE -> redone on top
    expect(p1.receiptNo).not.toBe(p2.receiptNo);
    const snap = await new CloudCrmData('k', server).load();
    expect(snap.payments).toHaveLength(2);
  });

  const pay = (memberId: string, membershipId: string) => ({
    memberId,
    membershipId,
    amountP: 50000,
    method: 'cash' as const,
    paidOn: TODAY,
    reference: null,
    note: null,
    collectedBy: null,
  });
  const noSleep = { wait: async () => undefined };

  it('a payment whose reply was lost is saved once, and the screen says it saved', async () => {
    const server = new FakeServer();
    const desk = new CloudCrmData('k', server, noSleep);
    const m = await desk.createMember(member());
    const term = await openTerm(desk, m.id, TODAY);
    server.loseReplies = 1;
    await desk.recordPayment(pay(m.id, term)); // resent with the same id: the server answers "already have it"
    const snap = await new CloudCrmData('k', server).load();
    expect(snap.payments).toHaveLength(1);
    expect((await desk.load()).payments).toHaveLength(1);
  });

  it('no internet for all 3 tries: says so, keeps the push, and the next action sends it first — one payment', async () => {
    const server = new FakeServer();
    const desk = new CloudCrmData('k', server, noSleep);
    const m = await desk.createMember(member());
    const term = await openTerm(desk, m.id, TODAY);
    server.offline = 3; // the push and both resends never reach the server
    await expect(desk.recordPayment(pay(m.id, term))).rejects.toThrow(/internet/);
    expect((await new CloudCrmData('k', server).load()).payments).toHaveLength(0);
    // The internet is back. The kept payment goes first, and the next press stops to say so.
    await expect(desk.recordPayment(pay(m.id, term))).rejects.toThrow(/saved just now/);
    expect((await desk.load()).payments).toHaveLength(1);
    await desk.checkIn(m.id, TODAY, 'desk', TODAY);
    const snap = await new CloudCrmData('k', server).load();
    expect(snap.payments).toHaveLength(1);
    expect(snap.visits).toHaveLength(1);
  });

  it('offline for one try: the resend saves it', async () => {
    const server = new FakeServer();
    const desk = new CloudCrmData('k', server, noSleep);
    const m = await desk.createMember(member());
    server.offline = 1;
    await desk.checkIn(m.id, TODAY, 'desk', TODAY);
    expect((await new CloudCrmData('k', server).load()).visits).toHaveLength(1);
  });

  it('undoing a check-in deletes it online', async () => {
    const server = new FakeServer();
    const desk = new CloudCrmData('k', server);
    const m = await desk.createMember(member());
    await desk.checkIn(m.id, TODAY, 'desk', TODAY);
    await desk.undoCheckIn(m.id, TODAY);
    expect((await new CloudCrmData('k', server).load()).visits).toHaveLength(0);
  });

  it('refresh says whether another device changed anything', async () => {
    const server = new FakeServer();
    const deskA = new CloudCrmData('k', server);
    const deskB = new CloudCrmData('k', server);
    await deskB.load();
    expect(await deskB.refresh()).toBe(false);
    await deskA.createPlan(plan);
    expect(await deskB.refresh()).toBe(true);
    expect((await deskB.load()).plans).toHaveLength(1);
  });

  it('renaming the gym goes to the server name the member app shows', async () => {
    const server = new FakeServer();
    const desk = new CloudCrmData('k', server);
    await desk.updateGym({ name: 'Iron Temple Gym', phone: '0141 1234' });
    expect(server.gym.name).toBe('Iron Temple Gym');
    const snap = await desk.load();
    expect(snap.gym.name).toBe('Iron Temple Gym');
    expect(snap.gym.phone).toBe('0141 1234');
  });

  it('a dead key says so, in words', async () => {
    let signedOut = 0;
    const api: CrmCloudApi = {
      pull: async () => {
        throw new Error('BAD_KEY');
      },
      push: async () => 0,
    };
    const desk = new CloudCrmData('k', api, { onSignedOut: () => (signedOut += 1) });
    await expect(desk.load()).rejects.toThrow(/signed out/);
    expect(signedOut).toBe(1);
  });

  it('an owner-only refusal says so once and never freezes the desk (review of 0018)', async () => {
    const server = new FakeServer();
    const realPush = server.push.bind(server);
    let refuse = true;
    let pushes = 0;
    server.push = async (key, base, records, pushId) => {
      pushes += 1;
      if (refuse) throw new Error('OWNER_ONLY');
      return realPush(key, base, records, pushId);
    };
    const desk = new CloudCrmData('k', server, { wait: async () => undefined });
    await expect(desk.createMember(member({ fullName: 'Refused', phone: '+919811100001' }))).rejects.toThrow(/Only an owner/);
    expect(pushes).toBe(1); // not sent again
    refuse = false;
    // The next action goes through: nothing was kept to be re-sent first.
    const ok = await desk.createMember(member({ fullName: 'Next one', phone: '+919811100002' }));
    expect(ok.fullName).toBe('Next one');
    expect(pushes).toBe(2);
  });
});

describe('uploadSnapshot', () => {
  it('copies a whole browser gym up in chunks, with the online gym id, and can run twice', async () => {
    const server = new FakeServer();
    const snap = emptySnapshot(1, 'Old Gym');
    for (let i = 0; i < UPLOAD_CHUNK + 5; i += 1) {
      snap.visits.push({ id: `v${i}`, gymId: 'local', memberId: 'm', visitedOn: TODAY, checkedInAt: i, source: 'desk' } as never);
    }
    await uploadSnapshot(server, 'k', snap, 'g1');
    await uploadSnapshot(server, 'k', snap, 'g1');
    const back = await new CloudCrmData('k', server).load();
    expect(back.visits).toHaveLength(UPLOAD_CHUNK + 5);
    expect(back.visits.every((v) => v.gymId === 'g1')).toBe(true);
    expect(allRecords(snap, 'g1')[0]).toEqual({ k: 'gym', id: 'gym', d: { name: 'Old Gym', phone: null, address: null, gstin: null } });
  });

  it('an old browser gym saved before enquiries and expenses existed still goes online', async () => {
    const server = new FakeServer();
    const full = emptySnapshot(1, 'Old Gym');
    full.visits.push({ id: 'v1', gymId: 'local', memberId: 'm', visitedOn: TODAY, checkedInAt: 1, source: 'desk' } as never);
    // Exactly what an older browser has stored: no `enquiries`, no `expenses` key at all.
    const old: Partial<typeof full> = { ...full };
    delete old.enquiries;
    delete old.expenses;
    expect('enquiries' in old || 'expenses' in old).toBe(false);
    await expect(uploadSnapshot(server, 'k', old as never, 'g1')).resolves.toBeUndefined();
    const back = await new CloudCrmData('k', server).load();
    expect(back.visits).toHaveLength(1);
    expect(back.enquiries).toEqual([]);
    expect(back.expenses).toEqual([]);
    // The same snapshot after the panel fills the missing lists in.
    expect(allRecords(normalizeSnapshot(old as never), 'g1')).toEqual(allRecords(old as never, 'g1'));
  });
});

describe('PT sessions online', () => {
  it('marking a session sends ONLY the membership row, with cancelled and endsOn unchanged (0014 lets Staff do it)', async () => {
    const server = new FakeServer();
    const owner = new CloudCrmData('k', server);
    const m = await owner.createMember(member());
    // An old plan saved before PT existed (no PT fields) must never be re-sent by a PT action.
    await owner.createPlan(plan);
    const ptPlan = await owner.createPlan({ ...plan, name: 'PT 12', durationCount: 1, sortOrder: 2, ptSessions: 12, trainer: 'Rohit' } as PlanDraft);
    const { membership } = await owner.sellMembership({
      memberId: m.id,
      planId: ptPlan.id,
      startsOn: TODAY,
      priceP: 600000,
      joiningFeeP: 0,
      notes: null,
      collectNowP: 0,
      method: 'cash',
      reference: null,
      paidOn: TODAY,
      soldBy: null,
    });

    const sent: CrmRecord[][] = [];
    const realPush = server.push.bind(server);
    server.push = async (key, base, records, pushId) => {
      sent.push(JSON.parse(JSON.stringify(records)));
      return realPush(key, base, records, pushId);
    };
    const staffDesk = new CloudCrmData('k', server);
    await staffDesk.markPtSession(membership.id, TODAY, TODAY);
    expect(sent).toHaveLength(1);
    expect(sent[0].map((r) => `${r.k}:${r.id}`)).toEqual([`membership:${membership.id}`]);
    const d = sent[0][0].d as { cancelled: boolean; endsOn: string; ptLog: string[] };
    expect(d.cancelled).toBe(membership.cancelled);
    expect(d.endsOn).toBe(membership.endsOn);
    expect(d.ptLog).toEqual([TODAY]);

    await staffDesk.undoPtSession(membership.id, TODAY);
    expect((await new CloudCrmData('k', server).load()).memberships[0].ptLog).toEqual([]);
  });
});

describe('createMembers online (the import)', () => {
  const many = (n: number, from = 0): MemberDraft[] =>
    Array.from({ length: n }, (_, i) => member({ fullName: `Member ${from + i}`, phone: `+9198${String(10_000_000 + from + i).slice(-8)}` }));
  const noSleep = { wait: async () => undefined };

  /** Records per push, and the server's own cap (crm_push refuses more than 1000 rows). */
  function counting(server: FakeServer): number[] {
    const sizes: number[] = [];
    const realPush = server.push.bind(server);
    server.push = async (key, base, records, pushId) => {
      if (records.length > 1000) throw new Error('INVALID');
      sizes.push(records.length);
      return realPush(key, base, records, pushId);
    };
    return sizes;
  }

  it('up to 900 members go in ONE push', async () => {
    const server = new FakeServer();
    const sizes = counting(server);
    const desk = new CloudCrmData('k', server);
    const made = await desk.createMembers(many(900));
    expect(made).toHaveLength(900);
    expect(sizes).toEqual([900]);
    expect((await new CloudCrmData('k', server).load()).members).toHaveLength(900);
  });

  it('more than 900: 500 per push, all saved', async () => {
    const server = new FakeServer();
    const sizes = counting(server);
    const made = await new CloudCrmData('k', server).createMembers(many(1200));
    expect(made).toHaveLength(1200);
    expect(sizes).toEqual([500, 500, 200]);
  });

  it('the internet drops after the first push: PartialSaveError names the members saved', async () => {
    const server = new FakeServer();
    const desk = new CloudCrmData('k', server, noSleep);
    await desk.load();
    let pushes = 0;
    const realPush = server.push.bind(server);
    server.push = async (key, base, records, pushId) => {
      pushes += 1;
      if (pushes > 1) throw new Error('Failed to fetch');
      return realPush(key, base, records, pushId);
    };
    const err = await desk.createMembers(many(1000)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PartialSaveError);
    expect((err as PartialSaveError).saved).toHaveLength(500);
    expect((err as PartialSaveError).saved[0]!.fullName).toBe('Member 0');
    server.push = realPush;
    expect((await new CloudCrmData('k', server).load()).members).toHaveLength(500);
  });

  it('U-A11: the same batch again after "no internet" sends the stuck push, then carries on: each member once, no "saved just now" stop', async () => {
    const server = new FakeServer();
    const desk = new CloudCrmData('k', server, noSleep);
    await desk.load();
    const batch = many(100);
    server.offline = 3; // the push and both resends never reach the server: the batch is kept
    await expect(desk.createMembers(batch)).rejects.toThrow(/internet/);
    expect((await new CloudCrmData('k', server).load()).members).toHaveLength(0);
    // The internet is back and the import runs again with the same rows. The kept push lands first;
    // the rows it brought in are now members, so the same mobile is refused, never saved twice.
    const again = await desk.createMembers(batch).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(DuplicatePhoneError);
    expect(String((again as Error).message)).not.toMatch(/saved just now/);
    const snap = await new CloudCrmData('k', server).load();
    expect(snap.members).toHaveLength(100);
    expect(new Set(snap.members.map((m) => m.phone)).size).toBe(100);
    expect((await desk.load()).members).toHaveLength(100);
  });

  it('a mobile another desk already added refuses the push, naming it', async () => {
    const server = new FakeServer();
    const deskA = new CloudCrmData('k', server);
    const deskB = new CloudCrmData('k', server);
    await deskB.load();
    await deskA.createMember(many(1, 5)[0]!);
    await expect(deskB.createMembers(many(10))).rejects.toBeInstanceOf(DuplicatePhoneError);
    expect((await new CloudCrmData('k', server).load()).members).toHaveLength(1);
  });
});
