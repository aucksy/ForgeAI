/**
 * F150: pause / renew requests from the member app, on the admin panel. Reading the server, what
 * Approve does (always the desk's own F81 tools), the words, and the card staying hidden until the
 * server has 0044.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn();
vi.mock('../../src/crm/shop/api', () => ({ call: (...a: unknown[]) => callMock(...a) }));
vi.mock('../../src/lib/demoLock', () => ({ isDemoLocked: () => false }));

import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { addDays } from '../../src/crm/logic/dates';
import {
  approveErrorWords,
  decidedLine,
  decideErrorWords,
  freezeReason,
  pauseDays,
  planFreeze,
  planRenewal,
  PLAN_REQUEST_DESK_WORDS,
  planRequestRowFrom,
  planRequestRowsFrom,
  planToPause,
  requestMark,
  requestWhat,
  sortRequests,
  type PlanRequestRow,
} from '../../src/crm/logic/planRequests';
import { decidePlanRequest, listPlanRequests, planRequestServer, resetPlanRequestsForTest } from '../../src/crm/shop/planRequestApi';
import type { MemberDraft, PlanDraft } from '../../src/crm/types';
import { makeMember, makeMembership, makePayment, makePlan } from './fixtures';

const TODAY = '2026-10-30';
const ID = '1a2b3c4d-0000-4000-8000-000000000001';

const freezeRow = (over: Partial<PlanRequestRow> = {}): PlanRequestRow => ({
  id: ID, kind: 'freeze', from: '2026-11-03', to: '2026-11-09', planId: null, planName: null, status: 'pending',
  createdAt: 1, decidedAt: null, rosterId: 'mem_1', memberName: 'Asha Verma', decidedBy: null, membershipId: null,
  startsOn: null, endsOn: null, ...over,
});
const renewRow = (over: Partial<PlanRequestRow> = {}): PlanRequestRow =>
  freezeRow({ id: '9f8e7d6c-0000-4000-8000-000000000002', kind: 'renew', from: null, to: null, planId: 'pl-gold', planName: 'Gold 3 months', ...over });

describe('reading the server', () => {
  it('keeps the rows it can read', () => {
    const rows = planRequestRowsFrom([
      { id: 'a', kind: 'freeze', from: '2026-11-03', to: '2026-11-09', status: 'pending', rosterId: 'm1', memberName: 'Asha', createdAt: 5 },
      { id: 'b', kind: 'renew', planId: 'p', planName: 'Gold', status: 'approved', rosterId: 'm1', decidedBy: 'Ravi', startsOn: '2027-01-01', endsOn: '2027-03-31' },
      { id: 'c', kind: 'freeze', status: 'pending', rosterId: 'm1' },
      { id: 'd', kind: 'renew', status: 'pending', rosterId: 'm1' },
      { id: 'e', kind: 'renew', planId: 'p', status: 'pending' },
      'junk',
    ]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rows[0]).toMatchObject({ memberName: 'Asha', createdAt: 5, planId: null });
    expect(rows[1]).toMatchObject({ decidedBy: 'Ravi', endsOn: '2027-03-31', from: null });
    expect(planRequestRowsFrom(null)).toEqual([]);
  });

  it('a nameless member is "A member"', () => {
    expect(planRequestRowFrom({ id: 'a', kind: 'renew', planId: 'p', status: 'pending', rosterId: 'm1' })?.memberName).toBe('A member');
  });

  it('pending first (oldest first), then answered (newest first)', () => {
    const rows = sortRequests([
      freezeRow({ id: 'd1', status: 'approved', decidedAt: 10 }),
      freezeRow({ id: 'p2', createdAt: 20 }),
      freezeRow({ id: 'd2', status: 'declined', decidedAt: 30 }),
      freezeRow({ id: 'p1', createdAt: 5 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['p1', 'p2', 'd2', 'd1']);
  });
});

describe('approving a pause: the freeze tool on the plan that ends last', () => {
  it('counts both days and carries the request mark in the reason', () => {
    expect(pauseDays('2026-11-03', '2026-11-09')).toBe(7);
    expect(requestMark(ID)).toBe('app #1a2b3c4d');
    expect(freezeReason(ID)).toBe('Freeze - asked in the app (app #1a2b3c4d)');
  });

  it('picks the gym plan ending last; never a cancelled plan or a PT pack', () => {
    const old = makeMembership({ id: 'old', endsOn: '2026-11-30' });
    const queued = makeMembership({ id: 'queued', endsOn: '2027-02-28' });
    const cancelled = makeMembership({ id: 'cx', endsOn: '2027-06-30', cancelled: true });
    const pt = makeMembership({ id: 'pt', endsOn: '2027-09-30', ptSessions: 12 });
    const other = makeMembership({ id: 'other', memberId: 'mem_2', endsOn: '2028-01-01' });
    expect(planToPause([old, queued, cancelled, pt, other], 'mem_1')?.id).toBe('queued');
    expect(planFreeze(freezeRow(), [old, queued, cancelled, pt, other])).toEqual({
      ok: true, membershipId: 'queued', days: 7, reason: freezeReason(ID), alreadyDone: false,
    });
  });

  it('a second tap finds the days already added (the note carries the mark) and adds nothing', () => {
    const done = makeMembership({ id: 'ms', endsOn: '2026-12-07', notes: `+7 days (${freezeReason(ID)}): 2026-11-30 -> 2026-12-07` });
    expect(planFreeze(freezeRow(), [done])).toMatchObject({ ok: true, membershipId: 'ms', alreadyDone: true });
  });

  it('no gym plan: says so', () => {
    expect(planFreeze(freezeRow(), [makeMembership({ ptSessions: 10 })])).toEqual({ ok: false, problem: PLAN_REQUEST_DESK_WORDS.nothingToPause });
    expect(planFreeze(renewRow(), [])).toEqual({ ok: false, problem: PLAN_REQUEST_DESK_WORDS.notAPause });
  });
});

describe('approving a renewal: the sell tool with the sheet defaults, nothing collected', () => {
  const gold = makePlan({ id: 'pl-gold', name: 'Gold 3 months', durationCount: 3, priceP: 300_000, joiningFeeP: 50_000 });
  const asha = makeMember({ id: 'mem_1', fullName: 'Asha Verma' });
  const running = makeMembership({ id: 'run', startsOn: '2026-10-01', endsOn: '2026-11-15', joiningFeeP: 50_000 });
  const data = { members: [asha], memberships: [running], plans: [gold], payments: [makePayment({ membershipId: 'run' })] };
  const taker = { id: 'staff-1', name: 'Ravi' };

  it('starts after the cover she has, list price, no second joining fee, a due (paid at the desk)', () => {
    const p = planRenewal(renewRow(), data, TODAY, 'staff', taker);
    expect(p.ok && !p.alreadyDone).toBe(true);
    if (!p.ok || p.alreadyDone) return;
    expect(p.input).toMatchObject({
      memberId: 'mem_1', planId: 'pl-gold', startsOn: '2026-11-16', priceP: 300_000, joiningFeeP: 0, collectNowP: 0,
      method: 'cash', reference: null, paidOn: TODAY, soldBy: 'staff-1', soldByName: 'Ravi', requestId: renewRow().id,
    });
    expect(p.input.notes).toBe('Asked in the app (app #9f8e7d6c)');
    expect(p.startsOn).toBe('2026-11-16');
  });

  it('a new member pays the joining fee', () => {
    const p = planRenewal(renewRow(), { ...data, memberships: [], payments: [] }, TODAY, 'owner', taker);
    expect(p.ok && !p.alreadyDone && p.input.joiningFeeP).toBe(50_000);
    expect(p.ok && !p.alreadyDone && p.input.startsOn).toBe(TODAY);
  });

  it('a second tap finds the sale by its request id', () => {
    const sold = makeMembership({ id: 'sold', requestId: renewRow().id });
    expect(planRenewal(renewRow(), { ...data, memberships: [running, sold] }, TODAY, 'staff', taker)).toEqual({ ok: true, alreadyDone: true, membershipId: 'sold' });
  });

  it('refuses a plan no longer on sale, a PT pack, a member no longer on the list', () => {
    expect(planRenewal(renewRow(), { ...data, plans: [{ ...gold, active: false }] }, TODAY, 'owner', taker)).toEqual({ ok: false, problem: PLAN_REQUEST_DESK_WORDS.planGone });
    expect(planRenewal(renewRow(), { ...data, plans: [{ ...gold, ptSessions: 12 }] }, TODAY, 'owner', taker)).toEqual({ ok: false, problem: PLAN_REQUEST_DESK_WORDS.planGone });
    expect(planRenewal(renewRow(), { ...data, members: [] }, TODAY, 'owner', taker)).toEqual({ ok: false, problem: PLAN_REQUEST_DESK_WORDS.noMember });
    expect(planRenewal(freezeRow(), data, TODAY, 'owner', taker)).toEqual({ ok: false, problem: PLAN_REQUEST_DESK_WORDS.notARenewal });
  });
});

describe('through the real desk tools (local store)', () => {
  const draft = (over: Partial<MemberDraft> = {}): MemberDraft => ({
    fullName: 'Asha Verma', phone: '+919829012345', email: null, gender: 'female', dateOfBirth: null, address: null,
    emergencyName: null, emergencyPhone: null, joinedOn: TODAY, photoUri: null, notes: null, archived: false, ...over,
  });
  const planDraft: PlanDraft = { name: 'Gold 3 months', durationUnit: 'month', durationCount: 3, priceP: 300_000, joiningFeeP: 0, description: null, active: true, sortOrder: 1 } as PlanDraft;

  it('freeze: the note carries the mark the server looks for; the sale carries the request id, once', async () => {
    let clock = 0;
    const db = new LocalCrmData({ store: memoryStore(), now: () => (clock += 1), seed: () => emptySnapshot(0, 'Test Gym'), today: () => TODAY });
    await db.load();
    const m = await db.createMember(draft());
    const plan = await db.createPlan(planDraft);
    const first = await db.sellMembership({
      memberId: m.id, planId: plan.id, startsOn: TODAY, priceP: 300_000, joiningFeeP: 0, notes: null, collectNowP: 0,
      method: 'cash', reference: null, paidOn: TODAY, soldBy: null,
    });

    let snap = await db.load();
    const f = planFreeze(freezeRow({ rosterId: m.id }), snap.memberships);
    expect(f.ok && !f.alreadyDone).toBe(true);
    if (!f.ok) return;
    const after = await db.extendMembership(f.membershipId, f.days, f.reason);
    expect(after.id).toBe(first.membership.id);
    expect(after.notes).toContain(requestMark(ID));
    snap = await db.load();
    expect(planFreeze(freezeRow({ rosterId: m.id }), snap.memberships)).toMatchObject({ alreadyDone: true });

    const r = planRenewal(renewRow({ rosterId: m.id, planId: plan.id }), snap, TODAY, 'owner', { id: null, name: null });
    expect(r.ok && !r.alreadyDone).toBe(true);
    if (!r.ok || r.alreadyDone) return;
    // The renewal starts the day after the paused plan's new end.
    expect(r.input.startsOn).toBe(addDays(after.endsOn, 1));
    const sold = await db.sellMembership(r.input);
    expect(sold.membership.requestId).toBe(renewRow().id);
    expect(sold.payment).toBeNull();
    const again = await db.sellMembership(r.input);
    expect(again.membership.id).toBe(sold.membership.id);
    expect((await db.load()).memberships).toHaveLength(2);
  });
});

describe('the words', () => {
  it('what was asked, and what was done', () => {
    expect(requestWhat(freezeRow())).toMatch(/^Pause .+ - .+ \(7 days\)$/);
    expect(requestWhat(renewRow())).toBe('Renew: Gold 3 months');
    expect(decidedLine(freezeRow({ status: 'approved', decidedBy: 'Ravi', endsOn: '2027-01-01' }))).toMatch(/^Paused by Ravi\. Plan now ends /);
    expect(decidedLine(renewRow({ status: 'approved', startsOn: '2027-01-01', endsOn: '2027-03-31' }))).toMatch(/Collect the fee at the desk\.$/);
    expect(decidedLine(renewRow({ status: 'declined', decidedBy: 'Owner' }))).toBe('Declined by Owner.');
  });

  it('server refusals in plain words; the desk tool’s own words kept; anything else the general line', () => {
    expect(decideErrorWords({ message: 'ALREADY_DECIDED' })).toMatch(/already answered/);
    expect(decideErrorWords(new Error('NOT_DONE'))).toMatch(/press Approve again/);
    expect(decideErrorWords({ message: 'GONE' })).toMatch(/no longer there/);
    expect(approveErrorWords(new Error('This member has a later plan. Add the days to the plan that ends last.'))).toMatch(/later plan/);
    expect(approveErrorWords(new Error('timed out'))).toBe(PLAN_REQUEST_DESK_WORDS.failed);
    expect(approveErrorWords(new TypeError('Failed to fetch.'))).toBe(PLAN_REQUEST_DESK_WORDS.failed);
  });
});

describe('the card stays hidden until the server has 0044', () => {
  beforeEach(() => {
    callMock.mockReset();
    resetPlanRequestsForTest();
  });
  afterEach(() => vi.restoreAllMocks());

  it('PGRST202: "missing", remembered, one quiet note, no second call', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    callMock.mockRejectedValue({ code: 'PGRST202', message: 'Could not find the function public.owner_plan_requests' });
    expect(await listPlanRequests('k')).toBe('missing');
    expect(await listPlanRequests('k')).toBe('missing');
    expect(callMock).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
    expect(planRequestServer()).toBe('no');
  });

  it('a list: "yes"; no internet: thrown and not remembered', async () => {
    callMock.mockRejectedValueOnce(new Error('timed out'));
    await expect(listPlanRequests('k')).rejects.toThrow('timed out');
    expect(planRequestServer()).toBe('unknown');
    callMock.mockResolvedValueOnce([{ id: 'a', kind: 'renew', planId: 'p', status: 'pending', rosterId: 'm1' }]);
    expect(await listPlanRequests('k')).toHaveLength(1);
    expect(planRequestServer()).toBe('yes');
    expect(callMock).toHaveBeenLastCalledWith('owner_plan_requests', { p_key: 'k' });
  });

  it('a decision sends the plan the desk tool wrote', async () => {
    callMock.mockResolvedValueOnce({ id: 'a', kind: 'renew', planId: 'p', status: 'approved', rosterId: 'm1' });
    expect((await decidePlanRequest('k', 'a', 'approved', 'ms-1'))?.status).toBe('approved');
    expect(callMock).toHaveBeenCalledWith('owner_decide_plan_request', { p_key: 'k', p_request: 'a', p_decision: 'approved', p_membership: 'ms-1' });
  });
});
