/**
 * F56 MettleUp Plus (R-461): the shared rules (packages/theme/src/memberPlan.ts). Who gets every feature, in
 * order: switched off > staff > gym (until 7 days after the plan ends, then the gym owner's switch) > bought >
 * the free month (30 days, from its first day) > the free part. Edges: the free month's last day, a phone clock
 * set back, the grace's last day, a pass with no end, the owner's default (ON, decided 12 Nov 2026).
 */
import { describe, expect, it } from 'vitest';

import {
  canUse,
  chartMonthsAllowed,
  FREE_CHART_MONTHS,
  FREE_OWN_EXERCISES,
  GYM_LOCK_AFTER_END_DEFAULT,
  GYM_UNLOCK_GRACE_DAYS,
  MEMBER_PAYMENTS_LIVE,
  MEMBER_PLAN_GATE_ON,
  MEMBER_TRIAL_DAYS,
  memberAccess,
  ownExerciseLimitReached,
  PAID_FEATURES,
  PLAY_PLUS_LIFETIME,
  PLAY_PLUS_SUBSCRIPTION,
  PLUS_PRICES,
  gymUnlock,
  planAddDays,
  planDay,
  planDaysBetween,
  trialEndsSoon,
  trialLastDay,
  type MemberPlanFacts,
} from '@forgeai/theme';

const base: MemberPlanFacts = { today: '2026-11-12', gateOn: true, trialStartedOn: '2026-11-12', bought: null, staff: null, gym: null };

describe('the switches and numbers', () => {
  it('ship switched off and in test mode until the owner says "payments live"', () => {
    expect(MEMBER_PLAN_GATE_ON).toBe(false);
    expect(MEMBER_PAYMENTS_LIVE).toBe(false);
  });
  it('the approved prices, the 30-day free month and the free part', () => {
    expect(PLUS_PRICES).toEqual({ monthly: 149, yearly: 999, lifetime: 2499 });
    expect(MEMBER_TRIAL_DAYS).toBe(30);
    expect(FREE_CHART_MONTHS).toBe(3);
    expect(FREE_OWN_EXERCISES).toBe(7);
    expect(GYM_UNLOCK_GRACE_DAYS).toBe(7);
    expect(PAID_FEATURES).toEqual(['watch', 'olderCharts', 'weightSuggestions', 'calculators', 'ownExercises']);
    expect(PLAY_PLUS_SUBSCRIPTION).toBe('mettleup_plus');
    expect(PLAY_PLUS_LIFETIME).toBe('mettleup_plus_lifetime');
  });
  it("the gym owner's switch starts ON (owner's decision A, 12 Nov 2026)", () => {
    expect(GYM_LOCK_AFTER_END_DEFAULT).toBe(true);
  });
});

describe('days', () => {
  it('reads and moves India calendar days, across a month and a year', () => {
    expect(planDay('2026-11-31')).toBeNull();
    expect(planDay('2026-12-01')).toBe('2026-12-01');
    expect(planDay(20261201)).toBeNull();
    expect(planAddDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(planAddDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(planDaysBetween('2026-11-12', '2026-12-11')).toBe(29);
  });
});

describe('the free month', () => {
  it('day 1 to day 30 open everything; day 31 is the free part', () => {
    expect(trialLastDay('2026-11-12')).toBe('2026-12-11');
    expect(memberAccess(base)).toEqual({ all: true, why: 'trial', daysLeft: 30, lastDay: '2026-12-11' });
    expect(memberAccess({ ...base, today: '2026-12-11' })).toEqual({ all: true, why: 'trial', daysLeft: 1, lastDay: '2026-12-11' });
    expect(memberAccess({ ...base, today: '2026-12-12' })).toEqual({ all: false, why: 'free', trialEndedOn: '2026-12-11', gymEnded: null });
  });
  it('not started yet = today is day 1 (never locked before it starts)', () => {
    expect(memberAccess({ ...base, trialStartedOn: null, today: '2027-05-01' })).toMatchObject({ all: true, why: 'trial', daysLeft: 30 });
  });
  it('a phone clock set back before the start never gives more than 30 days', () => {
    expect(memberAccess({ ...base, today: '2026-10-01' })).toMatchObject({ why: 'trial', daysLeft: 30 });
  });
  it('says "ends soon" only in its last 5 days', () => {
    expect(trialEndsSoon(memberAccess({ ...base, today: '2026-12-06' }))).toBe(false);
    expect(trialEndsSoon(memberAccess({ ...base, today: '2026-12-07' }))).toBe(true);
    expect(trialEndsSoon(memberAccess({ ...base, today: '2026-12-12' }))).toBe(false);
  });
});

describe('who gets everything, in order', () => {
  const after = { ...base, today: '2027-02-01' };
  it('switched off: everyone, whatever else is true', () => {
    expect(memberAccess({ ...after, gateOn: false })).toEqual({ all: true, why: 'off' });
  });
  it('owners and desk staff', () => {
    expect(memberAccess({ ...after, staff: { gymName: 'Iron Temple' } })).toEqual({ all: true, why: 'staff', gymName: 'Iron Temple' });
  });
  it('a bought plan', () => {
    expect(memberAccess({ ...after, bought: { option: 'lifetime' } })).toEqual({ all: true, why: 'bought', option: 'lifetime' });
  });
  it('a gym member with a running plan, and one on a pass (no end)', () => {
    expect(memberAccess({ ...after, gym: { gymName: 'Iron Temple', endsOn: '2027-03-01', lockAfterEnd: null } })).toEqual({
      all: true,
      why: 'gym',
      gymName: 'Iron Temple',
      endedOn: null,
      graceEndsOn: null,
    });
    expect(memberAccess({ ...after, gym: { gymName: 'Iron Temple', endsOn: null, lockAfterEnd: true } })).toMatchObject({ all: true, why: 'gym' });
  });
});

describe('when the gym plan ends', () => {
  const gym = { gymName: 'Iron Temple', endsOn: '2027-01-31', lockAfterEnd: null };
  it('the last day of the plan and the 7 extra days stay open, saying when they end', () => {
    expect(gymUnlock(gym, '2027-01-31')).toEqual({ open: true, endedOn: null, graceEndsOn: null });
    expect(gymUnlock(gym, '2027-02-01')).toEqual({ open: true, endedOn: '2027-01-31', graceEndsOn: '2027-02-07' });
    expect(gymUnlock(gym, '2027-02-07')).toEqual({ open: true, endedOn: '2027-01-31', graceEndsOn: '2027-02-07' });
  });
  it('after the 7 days the switch decides: ON (the default) locks, OFF keeps every feature free', () => {
    expect(gymUnlock(gym, '2027-02-08').open).toBe(false);
    expect(gymUnlock({ ...gym, lockAfterEnd: true }, '2027-02-08').open).toBe(false);
    expect(gymUnlock({ ...gym, lockAfterEnd: false }, '2027-02-08').open).toBe(true);
  });
  it('locked: falls back to a purchase, else the free part with "renew at the gym"', () => {
    const f = { ...base, today: '2027-02-08', gym };
    expect(memberAccess(f)).toEqual({ all: false, why: 'free', trialEndedOn: '2026-12-11', gymEnded: { gymName: 'Iron Temple', endedOn: '2027-01-31' } });
    expect(memberAccess({ ...f, bought: { option: 'monthly' } })).toMatchObject({ all: true, why: 'bought' });
  });
  it('locked while the free month still runs: the free month keeps everything open', () => {
    expect(memberAccess({ ...base, today: '2026-11-20', gym: { ...gym, endsOn: '2026-11-01' } })).toMatchObject({ all: true, why: 'trial' });
  });
});

describe('the paid features on the free part', () => {
  const free = memberAccess({ ...base, today: '2027-01-01' });
  it('every paid feature closes together, and opens together', () => {
    for (const f of PAID_FEATURES) expect(canUse(free, f)).toBe(false);
    for (const f of PAID_FEATURES) expect(canUse(memberAccess(base), f)).toBe(true);
  });
  it('charts: 3 months fit, more does not', () => {
    expect(chartMonthsAllowed(free, 3)).toBe(true);
    expect(chartMonthsAllowed(free, 12)).toBe(false);
    expect(chartMonthsAllowed(free, null)).toBe(false);
    expect(chartMonthsAllowed(memberAccess(base), null)).toBe(true);
  });
  it('own exercises: 7 fit, the 8th does not', () => {
    expect(ownExerciseLimitReached(free, 6)).toBe(false);
    expect(ownExerciseLimitReached(free, 7)).toBe(true);
    expect(ownExerciseLimitReached(memberAccess(base), 70)).toBe(false);
  });
});
