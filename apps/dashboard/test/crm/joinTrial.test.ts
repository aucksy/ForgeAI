/**
 * F210 Free trial when joining online (R-521; supabase 0088, NOT live until the owner's yes). The owner's setting on the
 * gym's details record, what the gym server writes on the enquiry for a trial, Today's lines, what "Make member" opens
 * with, the "server has 0088" check that keeps everything hidden before, and the public page's trial guards.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { applyRecords, buildSnapshot, diffSnapshots, emptyRows } from '../../src/crm/data/cloud';
import { JOIN_TRIAL_DAYS, joinTrialDays, selfJoinOf, sellPlanFor, sellStartFor, trialEndsOn, trialState, waitingOnlineJoins } from '../../src/crm/logic/selfJoin';
import { joinTrialServer, selfJoinOpen } from '../../src/crm/shop/selfJoinReady';
import type { Enquiry, Plan } from '../../src/crm/types';

const TRIAL_BLOCK = {
  v: 1,
  name: 'Ravi Kumar',
  gender: 'male',
  planId: '',
  planName: '',
  durationUnit: 'day',
  durationCount: 3,
  priceP: 0,
  joiningFeeP: 0,
  totalP: 0,
  startsOn: '2026-11-20',
  pay: 'desk',
  paid: false,
  phoneChecked: true,
  lang: 'en',
  consents: { adultAt: 1, healthAt: 1, wording: '2026-11-14' },
  at: 1000,
  trial: { days: 3, endsOn: '2026-11-22', feeP: 0 },
};

const enquiry = (selfJoin: unknown, over: Partial<Enquiry> = {}): Enquiry =>
  ({
    id: 'join-1',
    gymId: 'g',
    name: 'Ravi Kumar',
    phone: '+919000088001',
    interest: 'Free trial online: 3 days, 20 Nov to 22 Nov. Not a member yet.',
    followUpOn: '2026-11-15',
    status: 'open',
    memberId: null,
    source: null,
    selfJoin,
    createdAt: 1,
    updatedAt: 2,
    ...over,
  }) as Enquiry;

const GYM_ROW = { gymId: 'g', name: 'Shakti Gym', joinCode: 'QA0002', createdAt: 1 };

describe('the owner’s setting', () => {
  it('is 1, 3 or 7 days, or off; anything else reads as off', () => {
    expect(JOIN_TRIAL_DAYS).toEqual([1, 3, 7]);
    for (const d of [1, 3, 7]) expect(joinTrialDays({ joinTrialDays: d })).toBe(d);
    for (const d of [0, 2, 5, 30, null, undefined, -3, 3.5]) expect(joinTrialDays({ joinTrialDays: d as number })).toBeNull();
    expect(joinTrialDays(null)).toBeNull();
  });

  it('travels on the gym’s details record, under the key the gym server reads; off removes the key', () => {
    const rows = emptyRows();
    applyRecords(rows, [{ k: 'gym', id: 'gym', d: { name: 'Shakti Gym', phone: null, address: null, gstin: null, joinTrialDays: 3 } }]);
    const before = buildSnapshot(rows, GYM_ROW);
    expect(before.gym.joinTrialDays).toBe(3);
    const on7 = diffSnapshots(before, { ...before, gym: { ...before.gym, joinTrialDays: 7 } });
    expect(on7).toEqual([{ k: 'gym', id: 'gym', d: expect.objectContaining({ joinTrialDays: 7 }) }]);
    const off = diffSnapshots(before, { ...before, gym: { ...before.gym, joinTrialDays: null } });
    expect(off).toHaveLength(1);
    expect(off[0]!.d).not.toHaveProperty('joinTrialDays');
    // A value the admin app never writes is read as off.
    const odd = emptyRows();
    applyRecords(odd, [{ k: 'gym', id: 'gym', d: { name: 'Shakti Gym', joinTrialDays: 5 } }]);
    expect(buildSnapshot(odd, GYM_ROW).gym.joinTrialDays).toBeNull();
  });
});

describe('a trial on the enquiry (what 0088 writes)', () => {
  it('reads with no plan and no money, and its days', () => {
    const j = selfJoinOf(enquiry(TRIAL_BLOCK));
    expect(j).toMatchObject({ planId: '', planName: '', totalP: 0, startsOn: '2026-11-20', trial: { days: 3, endsOn: '2026-11-22', feeP: 0 } });
  });
  it('a damaged trial (no days, a last day before the start) is no request at all, as before', () => {
    expect(selfJoinOf(enquiry({ ...TRIAL_BLOCK, trial: { days: 'x', endsOn: '2026-11-22' } }))).toBeNull();
    expect(selfJoinOf(enquiry({ ...TRIAL_BLOCK, trial: { days: 3, endsOn: '2026-11-19' } }))).toBeNull();
    expect(selfJoinOf(enquiry({ ...TRIAL_BLOCK, trial: null }))).toBeNull();
  });
  it('a plan request has no trial key (exactly as before 0088)', () => {
    const plan = { ...TRIAL_BLOCK, planId: 'plan-month', planName: 'Monthly', priceP: 150000, totalP: 150000, trial: undefined };
    expect(selfJoinOf(enquiry(plan))).not.toHaveProperty('trial');
  });
  it('is on Today’s "Joined online" list with the plan requests', () => {
    expect(waitingOnlineJoins([enquiry(TRIAL_BLOCK)]).map((x) => x.enquiry.id)).toEqual(['join-1']);
  });
});

describe('where a trial stands', () => {
  const j = selfJoinOf(enquiry(TRIAL_BLOCK));
  it('before, on (the last day included) and after its days', () => {
    expect(trialState(j, '2026-11-19')?.kind).toBe('soon');
    expect(trialState(j, '2026-11-20')?.kind).toBe('on');
    expect(trialState(j, '2026-11-22')?.kind).toBe('on');
    expect(trialState(j, '2026-11-23')?.kind).toBe('ended');
    expect(trialState(null, '2026-11-20')).toBeNull();
    const plan = { ...TRIAL_BLOCK, planId: 'p', planName: 'P', priceP: 1, totalP: 1, trial: undefined };
    expect(trialState(selfJoinOf(enquiry(plan)), '2026-11-20')).toBeNull();
  });
  it('a trial of N days ends N - 1 days after it starts (a 1-day trial ends the same day)', () => {
    expect(trialEndsOn('2026-11-20', 3)).toBe('2026-11-22');
    expect(trialEndsOn('2026-11-20', 1)).toBe('2026-11-20');
    expect(trialEndsOn('2026-11-28', 7)).toBe('2026-12-04');
  });
});

describe('"Make member" after a trial', () => {
  it('Sell membership opens with no plan picked and on the usual start day (the desk picks both)', () => {
    const j = selfJoinOf(enquiry(TRIAL_BLOCK));
    const plans = [{ id: 'plan-month', name: 'Monthly', active: true } as Plan, { id: '', name: '', active: true } as Plan];
    expect(sellPlanFor(j, plans)).toBeUndefined();
    expect(sellStartFor(j, '2026-11-15')).toBeUndefined();
  });
});

describe('nothing about trials shows before the gym server has 0088', () => {
  const open = { gymName: 'Shakti Gym', closed: false, plans: [{ id: 'p' }] };
  it('0088 answers the trial key for an open gym, even while it is off', () => {
    expect(joinTrialServer({ ...open, trial: null })).toBe(true);
    expect(joinTrialServer({ ...open, trial: { days: 3, feeP: 0 } })).toBe(true);
  });
  it('0077 (no trial key), a paused gym, no plans or no answer: hidden', () => {
    expect(joinTrialServer(open)).toBe(false);
    expect(selfJoinOpen(open)).toBe(true);
    expect(joinTrialServer({ ...open, closed: true, trial: null })).toBe(false);
    expect(joinTrialServer({ ...open, plans: [], trial: null })).toBe(false);
    expect(joinTrialServer(null)).toBe(false);
  });
});

describe('the public page', () => {
  const page = readFileSync(new URL('../../public/join-online.html', import.meta.url), 'utf8');
  it('offers the trial only from the server’s answer, as plan "_trial", never with a price', () => {
    expect(page).toContain("var TRIAL = '_trial';");
    expect(page).toContain('function trialDays() { var d = gym && gym.trial && Number(gym.trial.days); return !S.trialUsed && (d === 1 || d === 3 || d === 7) ? d : 0; }');
    const send = /fetch\('\/api\/self-join'[\s\S]*?body: JSON\.stringify\(([^\n]+)\)/.exec(page)?.[1] ?? '';
    expect(send).toContain('plan: S.plan');
    expect(send).not.toMatch(/price|total|fee|trial/i);
  });
  it('a trial is never paid online', () => {
    expect(page).toContain("function payChoice() { return offer && S.pay !== 'desk' && !onTrial() ? 'online' : 'desk'; }");
  });
  it('says every trial line in English and Hindi', () => {
    for (const k of ['trialName', 'trialHow', 'sendTrial', 'doneTrial', 'doneTrialHow', 'TRIAL_USED', 'TRIAL_OFF', 'trialPayNote']) {
      const count = page.split(`${k}: '`).length - 1;
      expect(count, k).toBe(2);
    }
  });
});
