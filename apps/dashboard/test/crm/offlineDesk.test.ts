import { describe, expect, it } from 'vitest';

import { CloudCrmData, OFFLINE_SAVE_WORDS, type CrmCloudApi, type CrmRecord, type PullResult } from '../../src/crm/data/cloud';
import { isNetworkFailure, keyId, rowsToRecords, usableCopy, type SavedCopyStore, type SavedGym } from '../../src/crm/data/savedCopy';
import { emptyRows } from '../../src/crm/data/cloud';
import { memoryOutbox } from '../../src/crm/data/outbox';
import type { MemberDraft } from '../../src/crm/types';

const TODAY = '2026-10-22';

const member = (fullName: string, phone: string): MemberDraft =>
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

/** A tiny crm_pull / crm_push stand-in whose network can be switched off. */
class Server implements CrmCloudApi {
  version = 0;
  rows = new Map<string, CrmRecord>();
  down = false;
  gym = { gymId: 'g1', name: 'Iron Temple', joinCode: 'ABC123', createdAt: 1 };
  async pull(_key: string, since: number): Promise<PullResult> {
    if (this.down) throw new TypeError('Failed to fetch');
    return { version: this.version, gym: { ...this.gym }, records: since >= this.version ? [] : JSON.parse(JSON.stringify([...this.rows.values()])) };
  }
  async push(_key: string, base: number, records: CrmRecord[]): Promise<number> {
    if (this.down) throw new TypeError('Failed to fetch');
    if (base !== this.version) throw new Error('STALE');
    this.version += 1;
    for (const r of records) this.rows.set(`${r.k}:${r.id}`, JSON.parse(JSON.stringify(r)));
    return this.version;
  }
}

/** The device's store, in memory. */
function memoryCopy(): SavedCopyStore & { kept: Map<string, SavedGym> } {
  const kept = new Map<string, SavedGym>();
  return {
    kept,
    async load(id) {
      return kept.get(id) ?? null;
    },
    async save(id, copy) {
      kept.clear();
      kept.set(id, JSON.parse(JSON.stringify(copy)));
    },
    async clear() {
      kept.clear();
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const opts = (saved: SavedCopyStore, t = { now: 1_000 }) => ({ saved, now: () => t.now, today: () => TODAY, wait: async () => undefined });

describe('R-55: offline front desk, step 1 (owner #7)', () => {
  it('online: every good load keeps a copy of the gym on this device', async () => {
    const server = new Server();
    const saved = memoryCopy();
    const desk = new CloudCrmData('key-1', server, opts(saved));
    await desk.createMember(member('Riya Sharma', '+919876543210'));
    await settle();
    const copy = saved.kept.get(keyId('key-1'));
    expect(copy?.records.some((r) => r.k === 'member' && (r.d as { fullName: string }).fullName === 'Riya Sharma')).toBe(true);
    expect(copy?.gym.name).toBe('Iron Temple');
    expect(desk.offlineState()).toBeNull();
  });

  it('no internet at start: the panel opens the kept copy, says it is offline, and refuses saves in plain words', async () => {
    const server = new Server();
    const saved = memoryCopy();
    const first = new CloudCrmData('key-1', server, opts(saved));
    await first.createMember(member('Riya Sharma', '+919876543210'));
    await settle();

    server.down = true;
    const t = { now: 50_000 };
    const desk = new CloudCrmData('key-1', server, opts(saved, t));
    const snap = await desk.load();
    expect(snap.members.map((m) => m.fullName)).toEqual(['Riya Sharma']);
    expect(desk.offlineState()).toMatchObject({ since: 50_000 });
    await expect(desk.createMember(member('Aman Verma', '+919812345678'))).rejects.toThrow(OFFLINE_SAVE_WORDS);
    expect(server.rows.size).toBeGreaterThan(0);
    expect([...server.rows.values()].some((r) => (r.d as { fullName?: string } | null)?.fullName === 'Aman Verma')).toBe(false);

    // The internet is back: the next look brings the panel online, and saving works again.
    server.down = false;
    expect(await desk.refresh()).toBe(true);
    expect(desk.offlineState()).toBeNull();
    await desk.createMember(member('Aman Verma', '+919812345678'));
    expect((await desk.load()).members.map((m) => m.fullName).sort()).toEqual(['Aman Verma', 'Riya Sharma']);
  });

  it('the internet drops mid-day: the screens keep what they show, the bar appears, and goes when it is back', async () => {
    const server = new Server();
    const desk = new CloudCrmData('key-1', server, opts(memoryCopy()));
    await desk.load();
    server.down = true;
    await expect(desk.refresh()).rejects.toThrow();
    expect(desk.offlineState()).not.toBeNull();
    server.down = false;
    await desk.refresh();
    expect(desk.offlineState()).toBeNull();
  });

  it('no copy on this device and no internet: as before, the panel cannot open', async () => {
    const server = new Server();
    server.down = true;
    const desk = new CloudCrmData('key-1', server, opts(memoryCopy()));
    await expect(desk.load()).rejects.toThrow();
  });

  it('another key (another gym, or a new sign-in) never opens this copy', async () => {
    const server = new Server();
    const saved = memoryCopy();
    await new CloudCrmData('key-1', server, opts(saved)).load();
    await settle();
    server.down = true;
    await expect(new CloudCrmData('key-2', server, opts(saved)).load()).rejects.toThrow();
  });

  it('a key the server no longer accepts deletes the copy on this device', async () => {
    const server = new Server();
    const saved = memoryCopy();
    const desk = new CloudCrmData('key-1', server, { ...opts(saved), onSignedOut: () => undefined });
    await desk.load();
    await settle();
    expect(saved.kept.size).toBe(1);
    server.pull = async () => {
      throw new Error('BAD_KEY');
    };
    await expect(desk.refresh()).rejects.toThrow();
    await settle();
    expect(saved.kept.size).toBe(0);
  });

  it('pure parts: records round-trip, a damaged copy is not used, "no internet" is told from a refusal', () => {
    const rows = emptyRows();
    rows.gym = { name: 'G', phone: null, address: null, gstin: null };
    rows.member.set('m1', { id: 'm1', fullName: 'A' });
    expect(rowsToRecords(rows)).toEqual([
      { k: 'gym', id: 'gym', d: rows.gym },
      { k: 'member', id: 'm1', d: { id: 'm1', fullName: 'A' } },
    ]);
    expect(usableCopy({ v: 2 })).toBeNull();
    expect(usableCopy(null)).toBeNull();
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(new Error('BAD_KEY'))).toBe(false);
    expect(keyId('key-1')).not.toContain('key');
    expect(keyId('key-1')).not.toBe(keyId('key-2'));
  });
});

describe('R-55: offline front desk, step 2 (check-ins kept offline, sent later; step 3 moved them to the waiting list)', () => {
  async function offlineDesk() {
    const server = new Server();
    const saved = memoryCopy();
    const outbox = memoryOutbox();
    const first = new CloudCrmData('key-1', server, { ...opts(saved), outbox });
    const m = await first.createMember(member('Riya Sharma', '+919876543210'));
    await settle();
    server.down = true;
    const t = { now: 60_000 };
    const desk = new CloudCrmData('key-1', server, { ...opts(saved, t), outbox });
    await desk.load();
    return { server, saved, outbox, desk, m, t };
  }
  const visitsOnServer = (server: Server) => [...server.rows.values()].filter((r) => r.k === 'visit' && !r.x).map((r) => r.d as { memberId: string; checkedInAt: number; visitedOn: string });
  const waiting = (outbox: ReturnType<typeof memoryOutbox>) => outbox.docs.get('g1')?.items ?? [];

  it('a check-in with no internet shows at once and waits on this device; the bar counts it', async () => {
    const { server, outbox, desk, m } = await offlineDesk();
    const v = await desk.checkIn(m.id, TODAY, 'desk', TODAY);
    expect(v.checkedInAt).toBe(60_000);
    expect((await desk.load()).visits.map((x) => x.memberId)).toEqual([m.id]);
    expect(visitsOnServer(server)).toEqual([]);
    expect(desk.offlineState()?.queued).toBe(1);
    expect(waiting(outbox)).toHaveLength(1);
  });

  it('a second tap for the same member the same day is the same check-in, never two', async () => {
    const { desk, m } = await offlineDesk();
    const a = await desk.checkIn(m.id, TODAY, 'desk', TODAY);
    const b = await desk.checkIn(m.id, TODAY, 'desk', TODAY);
    expect(b.id).toBe(a.id);
    expect(desk.offlineState()?.queued).toBe(1);
  });

  it('a check-in still waiting can be taken back offline; nothing reaches the server', async () => {
    const { server, outbox, desk, m } = await offlineDesk();
    await desk.checkIn(m.id, TODAY, 'desk', TODAY);
    await desk.undoCheckIn(m.id, TODAY);
    expect(waiting(outbox)).toHaveLength(0);
    expect((await desk.load()).visits).toEqual([]);
    server.down = false;
    await desk.refresh();
    expect(visitsOnServer(server)).toEqual([]);
  });

  it('the internet back: the check-in is sent with the time it was made, and the bar goes', async () => {
    const { server, outbox, desk, m, t } = await offlineDesk();
    await desk.checkIn(m.id, TODAY, 'desk', TODAY);
    t.now = 900_000; // sent much later
    server.down = false;
    expect(await desk.refresh()).toBe(true);
    expect(desk.offlineState()).toBeNull();
    const onServer = visitsOnServer(server);
    expect(onServer).toHaveLength(1);
    expect(onServer[0]).toMatchObject({ memberId: m.id, visitedOn: TODAY, checkedInAt: 60_000 });
    expect((await desk.load()).visits).toHaveLength(1);
    expect(waiting(outbox)).toHaveLength(0);
  });

  it('#51: the gym is paused by ForgeAI when the internet is back: the check-ins are kept, and go once it is switched back on', async () => {
    const { server, outbox, desk, m } = await offlineDesk();
    await desk.checkIn(m.id, TODAY, 'desk', TODAY);
    server.down = false;
    const push = server.push.bind(server);
    let paused = true;
    server.push = async (k, base, records) => {
      if (paused) throw new Error('SUSPENDED');
      return push(k, base, records);
    };
    await desk.refresh();
    expect(visitsOnServer(server)).toEqual([]);
    expect(waiting(outbox)).toHaveLength(1);
    expect(waiting(outbox)[0].held ?? null).toBeNull();
    expect((await desk.load()).visits.map((x) => x.memberId)).toEqual([m.id]);
    paused = false;
    await desk.refresh();
    expect(visitsOnServer(server)).toHaveLength(1);
  });

  it('the page closed while offline: after a reload the check-in is still waiting, and goes when online', async () => {
    const { server, saved, outbox, desk, m } = await offlineDesk();
    await desk.checkIn(m.id, TODAY, 'desk', TODAY);
    server.down = false;
    const again = new CloudCrmData('key-1', server, { ...opts(saved, { now: 70_000 }), outbox });
    await again.load();
    await again.refresh();
    expect(visitsOnServer(server)).toHaveLength(1);
  });

  it('another desk checked the same member in meanwhile: still one visit', async () => {
    const { server, desk, m } = await offlineDesk();
    await desk.checkIn(m.id, TODAY, 'desk', TODAY);
    server.down = false;
    const other = new CloudCrmData('key-1', server, opts(memoryCopy(), { now: 80_000 }));
    await other.checkIn(m.id, TODAY, 'desk', TODAY);
    await desk.refresh();
    expect(visitsOnServer(server)).toHaveLength(1);
  });

  it("step 2's check-ins kept inside the saved copy move to the waiting list once, and are sent", async () => {
    const server = new Server();
    const saved = memoryCopy();
    const first = new CloudCrmData('key-1', server, opts(saved));
    const m = await first.createMember(member('Riya Sharma', '+919876543210'));
    await settle();
    const copy = saved.kept.get(keyId('key-1'))!;
    const visit = { id: 'v-old', gymId: 'g1', memberId: m.id, visitedOn: TODAY, checkedInAt: 5_000, source: 'desk' as const };
    copy.queued = [{ memberId: m.id, day: TODAY, source: 'desk', today: TODAY, at: 5_000, visit }];
    server.down = true;
    const outbox = memoryOutbox();
    const desk = new CloudCrmData('key-1', server, { ...opts(saved), outbox });
    await desk.load();
    expect(outbox.docs.get('g1')?.items).toHaveLength(1);
    expect((await desk.load()).visits.map((v) => v.id)).toEqual(['v-old']);
    server.down = false;
    await desk.refresh();
    expect(visitsOnServer(server)).toEqual([expect.objectContaining({ checkedInAt: 5_000 })]);
  });

  it('other saving still waits for the internet, in words that say what still works', async () => {
    const { desk } = await offlineDesk();
    await expect(desk.createPlan({ name: 'Monthly' } as never)).rejects.toThrow(OFFLINE_SAVE_WORDS);
    expect(OFFLINE_SAVE_WORDS).toMatch(/Check-ins, payments and new members still work/);
  });
});