import { afterEach, describe, expect, it } from 'vitest';

import { setCurrentLang } from '../../src/crm/i18n';
import { buildMemberView } from '../../src/crm/logic/membership';
import {
  canUndoPtSession,
  cleanTrainer,
  gymTerms,
  isPtEnding,
  isPtMembership,
  isPtPlan,
  lastPtDay,
  livePtPack,
  ptEndingMemberIds,
  ptLeft,
  ptPlanLine,
  ptSummary,
  ptUsed,
} from '../../src/crm/logic/pt';
import { saleDefaults, validateSale } from '../../src/crm/logic/selling';
import { makeMember, makeMembership, makePlan } from './fixtures';

const TODAY = '2026-10-15';

const pt = (over: Parameters<typeof makeMembership>[0] = {}) =>
  makeMembership({
    planName: 'PT 12',
    startsOn: '2026-10-01',
    endsOn: '2026-10-31',
    ptSessions: 12,
    trainer: 'Rohit',
    ptLog: [],
    ...over,
  });

const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);

afterEach(() => setCurrentLang('en'));

describe('what is PT', () => {
  it('old plans and memberships (no field) are not PT', () => {
    expect(isPtPlan(makePlan())).toBe(false);
    expect(isPtPlan(makePlan({ ptSessions: null }))).toBe(false);
    expect(isPtPlan(makePlan({ ptSessions: 12 }))).toBe(true);
    expect(isPtMembership(makeMembership())).toBe(false);
    expect(isPtMembership(pt())).toBe(true);
  });
});

describe('the counter', () => {
  it('counts used and left, never below zero, and finds the last day', () => {
    const m = pt({ ptSessions: 3, ptLog: ['2026-10-09', '2026-10-02', '2026-10-05'] });
    expect(ptUsed(m)).toBe(3);
    expect(ptLeft(m)).toBe(0);
    expect(lastPtDay(m)).toBe('2026-10-09');
    expect(ptLeft(pt({ ptSessions: 2, ptLog: days(3) }))).toBe(0);
    expect(lastPtDay(pt())).toBeNull();
    expect(ptUsed(makeMembership())).toBe(0);
  });

  it('says it in both languages', () => {
    const m = pt({ ptLog: days(4) });
    expect(ptSummary(m)).toBe('PT: 4 of 12 sessions used · Trainer Rohit');
    setCurrentLang('hi');
    expect(ptSummary(m)).toBe('PT: 12 mein se 4 session ho gaye · Trainer Rohit');
    setCurrentLang('en');
    expect(ptSummary(pt({ trainer: null }))).toBe('PT: 0 of 12 sessions used');
    expect(ptPlanLine(makePlan({ ptSessions: 12, trainer: 'Rohit' }))).toBe('PT · 12 sessions · Trainer Rohit');
    expect(ptPlanLine(makePlan())).toBeNull();
  });

  it('cleans a typed trainer name', () => {
    expect(cleanTrainer('  Rohit   Singh ')).toBe('Rohit Singh');
    expect(cleanTrainer('   ')).toBeNull();
    expect(cleanTrainer(undefined)).toBeNull();
  });
});

describe('livePtPack', () => {
  it('is the newest running, not cancelled, PT pack', () => {
    const old = pt({ startsOn: '2026-09-20', endsOn: '2026-10-19' });
    const newer = pt({ startsOn: '2026-10-10', endsOn: '2026-11-09' });
    const cancelled = pt({ startsOn: '2026-10-12', cancelled: true });
    const gym = makeMembership({ startsOn: '2026-10-14', endsOn: '2026-11-13' });
    expect(livePtPack([old, newer, cancelled, gym], TODAY)?.id).toBe(newer.id);
    expect(livePtPack([pt({ endsOn: '2026-10-14' })], TODAY)).toBeNull();
    expect(livePtPack([pt({ startsOn: '2026-10-16' })], TODAY)).toBeNull();
  });
});

describe('PT ending', () => {
  it('2 or fewer left counts, 3 does not, all used counts', () => {
    expect(isPtEnding([pt({ ptSessions: 5, ptLog: days(2) })], TODAY)).toBe(false);
    expect(isPtEnding([pt({ ptSessions: 5, ptLog: days(3) })], TODAY)).toBe(true);
    expect(isPtEnding([pt({ ptSessions: 5, ptLog: days(5) })], TODAY)).toBe(true);
  });

  it('a new PT pack already bought and waiting takes them off the list', () => {
    const ending = pt({ ptSessions: 2, ptLog: days(2) });
    expect(isPtEnding([ending, pt({ startsOn: '2026-10-20', endsOn: '2026-11-19' })], TODAY)).toBe(false);
  });

  it('groups by member', () => {
    const a = pt({ memberId: 'a', ptSessions: 1, ptLog: days(1) });
    const b = pt({ memberId: 'b' });
    const c = makeMembership({ memberId: 'c' });
    expect([...ptEndingMemberIds([a, b, c], TODAY)]).toEqual(['a']);
  });
});

describe('undo rule', () => {
  it('anyone the same day; only an owner for an older day; nothing to undo is no', () => {
    expect(canUndoPtSession(TODAY, TODAY, false)).toBe(true);
    expect(canUndoPtSession('2026-10-14', TODAY, false)).toBe(false);
    expect(canUndoPtSession('2026-10-14', TODAY, true)).toBe(true);
    expect(canUndoPtSession(null, TODAY, true)).toBe(false);
  });
});

describe('a PT pack is an add-on to the gym plan', () => {
  const gym = makeMembership({ startsOn: '2026-10-01', endsOn: '2026-10-20' });
  const pack = pt({ startsOn: '2026-10-05', endsOn: '2026-12-04' });

  it('gym status ignores it while a gym plan exists, but counts it for a PT-only member', () => {
    expect(gymTerms([gym, pack])).toEqual([gym]);
    expect(gymTerms([pack])).toEqual([pack]);
    const view = buildMemberView(makeMember(), [gym, pack], [], [], TODAY);
    expect(view.coversUntil).toBe('2026-10-20');
    expect(view.current?.id).toBe(gym.id);
    // Money still counts the PT pack.
    expect(view.outstandingP).toBe(gym.priceP + pack.priceP);
    expect(buildMemberView(makeMember(), [pack], [], [], TODAY).state).toBe('active');
  });

  it('a PT plan sells from today on top of the gym plan; a gym renewal is not pushed past the PT pack', () => {
    const ptPlan = makePlan({ ptSessions: 12, durationCount: 2 });
    expect(saleDefaults([gym], ptPlan, TODAY).startsOn).toBe(TODAY);
    expect(
      validateSale({ planId: ptPlan.id, startsOn: TODAY, priceP: 1, joiningFeeP: 0, collectNowP: 0, pt: true }, [gym], TODAY),
    ).toBeNull();
    // Without the PT flag the same dates overlap the gym plan and are refused.
    expect(validateSale({ planId: 'x', startsOn: TODAY, priceP: 1, joiningFeeP: 0, collectNowP: 0 }, [gym], TODAY)?.field).toBe(
      'startsOn',
    );
    expect(saleDefaults([gym, pack], makePlan(), TODAY).startsOn).toBe('2026-10-21');
  });
});
