/**
 * R-540 (owner, 14 Nov 2026): "ensure that the demo gym has enough data so all the functionalities can be shown in all
 * its glory." The sales demo at /demo: the sample gym (demo/showcase.ts) and its pretend gym server (demo/demoServer.ts),
 * read through the screens' own calls and parsers, so a shape the screens cannot read fails here, not at a gym visit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listPeople } from '../../src/crm/auth/api';
import { listDiets, listMeasures } from '../../src/crm/shop/bodyApi';
import { getChallenges } from '../../src/crm/shop/challengesApi';
import { friendSummary } from '../../src/crm/shop/friendApi';
import { getTalkList } from '../../src/crm/shop/memberMessagesApi';
import { listPlanRequests } from '../../src/crm/shop/planRequestApi';
import { getMemberProgress, getQuestions } from '../../src/crm/shop/questionsApi';
import { getTimings } from '../../src/crm/shop/timingsApi';
import { getTrainerMembers } from '../../src/crm/shop/trainerApi';
import { getTrainerSchedule } from '../../src/crm/shop/trainerScheduleApi';
import { listAppMembers, listMessages, listOffers, listOrders, listProducts, sendMessage, setOrderStatus } from '../../src/crm/shop/api';
import { errorCode } from '../../src/crm/shop/logic';
import { progressTag } from '../../src/crm/logic/progressTrend';
import { addDays, type DateISO } from '../../src/crm/logic/dates';
import { makeDemoServer } from '../../src/crm/demo/demoServer';
import { buildShowcase } from '../../src/crm/demo/showcase';
import { demoSnapshot } from '../../src/crm/data/demo';
import { readCloudGym } from '../../src/crm/shop/cloudGym';
import { lockForDemo } from '../../src/lib/demoLock';
import { serveDemo } from '../../src/lib/demoServerSlot';

const TODAY = '2026-11-14' as DateISO;
const show = buildShowcase(TODAY);
const server = makeDemoServer(show, TODAY, () => new Date(2026, 10, 14, 10, 0).getTime());
const KEY = 'demo-session-key-owner-0001';

beforeAll(() => {
  lockForDemo();
  serveDemo(server);
});
afterAll(() => serveDemo(null));

describe('the sample gym', () => {
  const s = show.snapshot;
  it('is the Welcome demo gym plus the showcase, and leaves the Welcome one alone', () => {
    expect(s.gym.name).toBe('Iron Temple Fitness');
    expect(s.members.length).toBeGreaterThanOrEqual(120);
    expect(demoSnapshot(TODAY).enquiries).toEqual([]);
  });

  it('numbers every receipt once, in the order the money came in', () => {
    const live = s.payments.filter((p) => !p.voided);
    const nos = s.payments.map((p) => p.receiptNo);
    expect(new Set(nos).size).toBe(nos.length);
    const sorted = [...live].sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : 0));
    const asNumber = (r: string) => Number(r.replace(/\D/g, ''));
    for (let i = 1; i < sorted.length; i += 1) expect(asNumber(sorted[i]!.receiptNo)).toBeGreaterThan(asNumber(sorted[i - 1]!.receiptNo));
  });

  it('has money in today, by UPI and cash', () => {
    const today = s.payments.filter((p) => p.paidOn === TODAY && !p.voided);
    expect(today.length).toBeGreaterThanOrEqual(3);
    expect(new Set(today.map((p) => p.method)).size).toBeGreaterThanOrEqual(2);
  });

  it('has enquiries in every stage: due today or late, later, joined, lost, friends, web page, joined online', () => {
    const e = s.enquiries;
    const open = e.filter((x) => x.status === 'open');
    expect(open.filter((x) => x.followUpOn && x.followUpOn <= TODAY).length).toBeGreaterThanOrEqual(4);
    expect(open.filter((x) => x.followUpOn && x.followUpOn > TODAY).length).toBeGreaterThanOrEqual(3);
    expect(e.filter((x) => x.status === 'joined').length).toBeGreaterThanOrEqual(8);
    expect(e.filter((x) => x.status === 'lost' && x.lostReason).length).toBeGreaterThanOrEqual(3);
    expect(e.filter((x) => x.referral).length).toBeGreaterThanOrEqual(3);
    expect(e.filter((x) => x.selfJoin).length).toBeGreaterThanOrEqual(1);
    expect(e.filter((x) => x.pageAsk).length).toBeGreaterThanOrEqual(1);
  });

  it('spends less than it takes in, most months (a believable gym)', () => {
    const month = (d: string) => d.slice(0, 7);
    const months = [1, 2, 3, 4].map((k) => month(addDays(`${TODAY.slice(0, 7)}-01` as DateISO, -1 - 31 * (k - 1))));
    let ahead = 0;
    for (const m of months) {
      const inP = s.payments.filter((p) => !p.voided && month(p.paidOn) === m).reduce((t, p) => t + p.amountP, 0);
      const outP = s.expenses.filter((x) => month(x.spentOn) === m).reduce((t, x) => t + x.amountP, 0);
      expect(outP, `expenses in ${m}`).toBeGreaterThan(0);
      if (inP > outP) ahead += 1;
    }
    expect(ahead).toBeGreaterThanOrEqual(3);
  });

  it('has workout plans and a PT plan', () => {
    expect((s.workoutPlans ?? []).filter((p) => !p.withdrawn).length).toBeGreaterThanOrEqual(3);
    expect(show.ptMemberships.length).toBe(3);
  });
});

describe('the pretend gym server, read the way the screens read it', () => {
  it('signs the owner in on a pretend online session', () => {
    const s = readCloudGym();
    expect(s?.online).toBe(true);
    expect(s?.demo).toBe(true);
    expect(s?.person?.role).toBe('owner');
  });

  it('Staff & sign-in: owner, desk, two trainers and a manager', async () => {
    const people = await listPeople(KEY);
    expect(people.map((p) => p.role).sort()).toEqual(['owner', 'staff', 'staff', 'staff', 'staff']);
    expect(people.some((p) => p.job === 'Manager')).toBe(true);
  });

  it('Training progress: one getting stronger, one steady, one dropping', async () => {
    const t = await getTrainerMembers(KEY);
    if (typeof t === 'string') throw new Error(t);
    expect(t.members.length).toBeGreaterThanOrEqual(6);
    const tags: string[] = [];
    for (const m of t.members) {
      const p = await getMemberProgress(KEY, m.memberId!);
      if (p === 'missing' || !p.shared) throw new Error('no progress');
      tags.push(progressTag(p.recent, TODAY).overall);
    }
    expect(tags.slice(0, 3)).toEqual(['up', 'steady', 'down']);
    expect(tags).toContain('unknown');
  });

  it('member questions, member messages, the shop, messages and offers have rows', async () => {
    const q = await getQuestions(KEY);
    if (typeof q === 'string') throw new Error(q);
    expect(q.questions.filter((x) => x.open).length).toBeGreaterThanOrEqual(1);
    const talk = await getTalkList(KEY);
    if (talk === 'missing') throw new Error(talk);
    expect(talk.threads.length).toBeGreaterThanOrEqual(4);
    expect((await listProducts(KEY)).length).toBe(12);
    const orders = await listOrders(KEY);
    expect(orders.filter((o) => o.status === 'ordered').length).toBeGreaterThanOrEqual(2);
    expect((await listAppMembers(KEY)).length).toBeGreaterThanOrEqual(30);
    expect((await listMessages(KEY)).length).toBeGreaterThanOrEqual(5);
    const offers = await listOffers(KEY);
    expect(offers.offers.length).toBe(1);
  });

  it('diet plans, measurements, timings, trainers’ week, challenges, friends and app requests', async () => {
    expect((await listDiets(KEY)).length).toBeGreaterThanOrEqual(3);
    const pt = show.ptMemberships[0]!;
    expect((await listMeasures(KEY, pt.memberId)).length).toBe(4);
    expect((await getTimings(KEY)).hours).not.toBeNull();
    const monday = addDays(TODAY, -((new Date(`${TODAY}T00:00:00Z`).getUTCDay() + 6) % 7));
    const week = await getTrainerSchedule(KEY, monday);
    if (typeof week === 'string') throw new Error(week);
    expect(week.trainers.length).toBe(2);
    expect(week.bookings.length).toBeGreaterThanOrEqual(3);
    const ch = await getChallenges(KEY);
    expect(ch.challenges.map((c) => c.status).sort()).toEqual(['ended', 'running']);
    const f = await friendSummary(KEY);
    if (f === 'missing') throw new Error(f);
    expect(f.joined).toBeGreaterThanOrEqual(2);
    const req = await listPlanRequests(KEY);
    if (req === 'missing') throw new Error(req);
    expect(req.filter((r) => r.status === 'pending').length).toBe(2);
  });

  it('acts out the common taps in memory, and turns the rest away in the demo’s words', async () => {
    const order = (await listOrders(KEY)).find((o) => o.status === 'ordered')!;
    expect((await setOrderStatus(KEY, order.orderId, 'ready')).status).toBe('ready');
    const sent = await sendMessage(KEY, { kind: 'announcement', title: 'Test', body: 'Hello members' });
    expect((await listMessages(KEY))[0]!.id).toBe(sent.id);
    const refused = await server.answer('owner_save_product', {}).catch((e: unknown) => e);
    expect(errorCode(refused)).toBe('DEMO');
  });

  it('the front desk sees what a desk sees: no staff list, no complaints', async () => {
    server.setRole('staff');
    try {
      expect(readCloudGym()?.person?.role).toBe('staff');
      await expect(listPeople('demo-session-key-desk-00001')).rejects.toThrow('OWNER_ONLY');
      const talk = await getTalkList('demo-session-key-desk-00001');
      if (talk === 'missing') throw new Error(talk);
      expect(talk.threads.some((t) => t.kind === 'complaint')).toBe(false);
    } finally {
      server.setRole('owner');
    }
  });
});
