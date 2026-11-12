/**
 * F56 MettleUp Plus (R-461) on the phone: the kept blob is checked before it is trusted; "My membership" turns
 * into the gym unlock (plan, renewal, pass, ended, not linked); the QA switch works only in QA builds; each
 * free-month pop-up shows once; the words name the right things and never a banned word.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));

import type { MembershipAnswer } from '@/shop/membership';
import { BANNED_MEMBER_WORDS } from '@/lib/words';
import { accessOf, cleanPlan, duePopUp, EMPTY_PLAN, gymFactsFrom, hasQaPlanStandIn, qaPlanFrom, type PlanBlob } from '@/plan/memberPlan';
import * as W from '@/plan/planWords';
import { bestOwned } from '@/plan/playBilling';

const ok = (over: Partial<Extract<MembershipAnswer, { ok: true }>>): MembershipAnswer => ({
  ok: true,
  gymName: 'Iron Temple',
  memberName: 'Asha',
  day: '2026-11-12',
  current: null,
  next: null,
  lastEndedOn: null,
  visitsThisMonth: 3,
  ...over,
});

describe('the kept blob', () => {
  it('anything odd is dropped, never trusted', () => {
    expect(cleanPlan(null)).toEqual(EMPTY_PLAN);
    expect(cleanPlan({ trialStartedOn: '2026-13-01', bought: { option: 'forever' }, staff: { gymName: 'X' }, qaGateOn: 'yes' })).toEqual(EMPTY_PLAN);
    const good = cleanPlan({
      trialStartedOn: '2026-11-12',
      bought: { option: 'yearly' },
      staff: { gymName: 'Iron Temple', joinCode: 'IRON01' },
      gym: { memberId: 'm1', gymName: 'Iron Temple', endsOn: null, lockAfterEnd: false },
      seenSoon: '2026-12-11',
    });
    expect(good.trialStartedOn).toBe('2026-11-12');
    expect(good.bought).toEqual({ option: 'yearly' });
    expect(good.staff).toEqual({ gymName: 'Iron Temple', joinCode: 'IRON01' });
    expect(good.gym).toEqual({ memberId: 'm1', gymName: 'Iron Temple', endsOn: null, lockAfterEnd: false });
    expect(cleanPlan({ gym: { memberId: 'm1', endsOn: 'soon' } }).gym).toBeNull();
  });
});

describe('My membership -> the gym unlock', () => {
  const span = (startsOn: string, endsOn: string) => ({ planName: 'Gold', startsOn, endsOn });
  it('a running plan, with the renewal after it winning', () => {
    expect(gymFactsFrom('m1', ok({ current: { ...span('2026-11-01', '2026-11-30'), ptSessions: null, ptUsed: 0, trainer: null } }), null)?.endsOn).toBe('2026-11-30');
    expect(
      gymFactsFrom('m1', ok({ current: { ...span('2026-11-01', '2026-11-30'), ptSessions: null, ptUsed: 0, trainer: null }, next: span('2026-12-01', '2027-02-28') }), true),
    ).toEqual({ memberId: 'm1', gymName: 'Iron Temple', endsOn: '2027-02-28', lockAfterEnd: true });
  });
  it('a pass has no end; an ended plan keeps its end day (the grace and the switch decide)', () => {
    expect(gymFactsFrom('m1', ok({ pass: 'FITPASS' }), null)?.endsOn).toBeNull();
    expect(gymFactsFrom('m1', ok({ lastEndedOn: '2026-10-31' }), null)?.endsOn).toBe('2026-10-31');
  });
  it('no plan, or the number not linked: the gym unlocks nothing', () => {
    expect(gymFactsFrom('m1', ok({}), null)).toBeNull();
    expect(gymFactsFrom('m1', { ok: false, problem: 'NO_PHONE', gymName: 'Iron Temple' }, null)).toBeNull();
    expect(gymFactsFrom('m1', { ok: false, problem: 'NOT_ON_ROSTER', gymName: 'Iron Temple' }, null)).toBeNull();
  });
});

describe('QA builds only', () => {
  it('the test switch needs the memberPlan stand-in', () => {
    expect(hasQaPlanStandIn({ qaStandIns: ['memberPlan'] })).toBe(true);
    expect(hasQaPlanStandIn({ qaStandIns: ['gymTalk'] })).toBe(false);
    expect(hasQaPlanStandIn(undefined)).toBe(false);
    const on: PlanBlob = { ...EMPTY_PLAN, qaGateOn: true, trialStartedOn: '2026-01-01' };
    expect(accessOf(on, '2026-11-12', false).why).toBe('off'); // a store build ignores it
    expect(accessOf(on, '2026-11-12', true).why).toBe('free');
  });
  it('the qa-plan link: day 26, bought, staff, a gym, reset', () => {
    let b = qaPlanFrom(EMPTY_PLAN, { gate: '1', day: '26', today: '2026-12-01' }, '2026-11-12');
    expect(b).toMatchObject({ qaGateOn: true, qaToday: '2026-12-01', trialStartedOn: '2026-11-06' });
    expect(accessOf(b, '2026-11-12', true)).toMatchObject({ why: 'trial', daysLeft: 5 });
    b = qaPlanFrom(b, { day: '31' }, '2026-11-12');
    expect(accessOf(b, '2026-11-12', true).why).toBe('free');
    expect(accessOf(qaPlanFrom(b, { bought: 'yearly' }, '2026-11-12'), '2026-11-12', true).why).toBe('bought');
    expect(accessOf(qaPlanFrom(b, { staff: 'QA UAT Gym' }, '2026-11-12'), '2026-11-12', true).why).toBe('staff');
    const g = qaPlanFrom(b, { gym: 'QA UAT Gym', ends: '2026-11-20', lock: '0' }, '2026-11-12');
    expect(accessOf(g, '2026-11-12', true)).toMatchObject({ why: 'gym', gymName: 'QA UAT Gym', endedOn: '2026-11-20' });
    expect(qaPlanFrom(g, { reset: '1' }, '2026-11-12')).toEqual(EMPTY_PLAN);
  });
});

describe('the free-month pop-ups show once each', () => {
  const b: PlanBlob = { ...EMPTY_PLAN, trialStartedOn: '2026-11-12' };
  it('ends soon, in the last 5 days', () => {
    const soon = accessOf(b, '2026-12-08', false, true);
    expect(duePopUp(soon, b)).toEqual({ kind: 'soon', lastDay: '2026-12-11', daysLeft: 4 });
    expect(duePopUp(soon, { ...b, seenSoon: '2026-12-11' })).toBeNull();
    expect(duePopUp(accessOf(b, '2026-12-01', false, true), b)).toBeNull();
  });
  it('has ended, once; not when a gym plan ended (its own line says renew)', () => {
    const ended = accessOf(b, '2026-12-12', false, true);
    expect(duePopUp(ended, b)).toEqual({ kind: 'ended', lastDay: '2026-12-11' });
    expect(duePopUp(ended, { ...b, seenEnded: '2026-12-11' })).toBeNull();
    const gymEnded = accessOf({ ...b, gym: { memberId: 'm', gymName: 'X', endsOn: '2026-12-01', lockAfterEnd: true } }, '2026-12-20', false, true);
    expect(duePopUp(gymEnded, b)).toBeNull();
  });
  it('never while switched off', () => {
    expect(duePopUp(accessOf(b, '2026-12-20', false), b)).toBeNull();
  });
});

describe('Google Play answers', () => {
  it('for life beats a subscription; a subscription keeps the plan this phone bought', () => {
    expect(bestOwned(['subscription', 'lifetime'], 'monthly')).toBe('lifetime');
    expect(bestOwned(['subscription'], 'yearly')).toBe('yearly');
    expect(bestOwned(['subscription'], null)).toBe('monthly');
    expect(bestOwned([], 'yearly')).toBeNull();
  });
});

describe('the words', () => {
  const today = '2026-11-12';
  it('the status line for each case', () => {
    expect(W.accessLine({ all: true, why: 'trial', daysLeft: 12, lastDay: '2026-11-23' }, today)).toBe('Your free month: every feature is open for 12 more days.');
    expect(W.accessLine({ all: true, why: 'trial', daysLeft: 1, lastDay: today }, today)).toBe('Your free month ends today. Every feature is open until then.');
    expect(W.accessLine({ all: true, why: 'gym', gymName: 'Iron Temple', endedOn: null, graceEndsOn: null }, today)).toBe(
      'Iron Temple gives you every feature free, because you are a member there.',
    );
    expect(W.accessLine({ all: true, why: 'gym', gymName: 'Iron Temple', endedOn: '2026-11-10', graceEndsOn: '2026-11-17' }, today)).toMatch(
      /^Your plan at Iron Temple ended on .+\. Every feature stays open until .+\. Renew at Iron Temple to keep them free\.$/,
    );
    expect(W.accessLine({ all: true, why: 'staff', gymName: 'Iron Temple' }, today)).toBe('You work at Iron Temple, so every feature is free for you.');
    expect(W.accessLine({ all: true, why: 'bought', option: 'lifetime' }, today)).toBe('You have MettleUp Plus for life. Thank you!');
    expect(W.accessLine({ all: false, why: 'free', trialEndedOn: today, gymEnded: { gymName: 'Iron Temple', endedOn: today } }, today)).toBe(
      'Your plan at Iron Temple has ended. Renew there to get every feature free again, or get MettleUp Plus.',
    );
  });
  it('the gym card: "Renew at <gym>" once the gym plan ended, with no button; otherwise "Find my gym"', () => {
    expect(W.plusGymCard({ all: false, why: 'free', trialEndedOn: today, gymEnded: { gymName: 'Iron Temple', endedOn: today } })).toEqual({
      title: 'Renew at Iron Temple',
      body: 'Your gym plan gave you every MettleUp feature free. Renew it at the desk to get them back.',
      findGym: false,
    });
    for (const a of [
      { all: false, why: 'free', trialEndedOn: today, gymEnded: null },
      { all: true, why: 'trial', daysLeft: 3, lastDay: today },
      { all: true, why: 'bought', option: 'yearly' },
    ] as const) {
      expect(W.plusGymCard(a)).toEqual({ title: W.PLUS_WORDS.gymTitle, body: W.PLUS_WORDS.gymBody, findGym: true });
    }
  });
  it('the prices on the buttons', () => {
    expect(W.buyLabel('monthly', null)).toBe('₹149 a month');
    expect(W.buyLabel('yearly', null)).toBe('₹999 a year');
    expect(W.buyLabel('lifetime', null)).toBe('₹2,499 once, for life');
    expect(W.buyLabel('yearly', '₹999.00')).toBe('₹999.00 a year');
  });
  it('the free month titles', () => {
    expect(W.trialSoonTitle(5)).toBe('Your free month has 5 days left');
    expect(W.trialSoonTitle(1)).toBe('Your free month ends today');
  });
  it('never a banned word, "upgrade" or "premium"', () => {
    const all = [
      ...Object.values(W.PLUS_WORDS).flat(),
      ...(['watch', 'olderCharts', 'weightSuggestions', 'calculators', 'ownExercises'] as const).map(W.lockedTitle),
      W.LOCKED_BODY,
      W.TRIAL_SOON_BODY,
      W.TRIAL_ENDED_BODY,
      W.SUGGESTION_LOCKED_LINE,
      W.STAFF_DOOR_PLUS,
      W.WATCH_LOCKED.text,
      W.plusGymCard({ all: false, why: 'free', trialEndedOn: null, gymEnded: { gymName: 'X', endedOn: '2026-11-01' } }).title,
      W.plusGymCard({ all: false, why: 'free', trialEndedOn: null, gymEnded: { gymName: 'X', endedOn: '2026-11-01' } }).body,
    ].join(' ');
    for (const b of BANNED_MEMBER_WORDS) expect(b.re.test(all), b.word).toBe(false);
    expect(all).not.toMatch(/upgrade|premium/i);
  });
});
