import { afterEach, describe, expect, it } from 'vitest';

import { setCurrentLang } from '../../src/crm/i18n';
import { buildMemberView } from '../../src/crm/logic/membership';
import {
  canUndoPtSession,
  cleanTrainer,
  endedPtPacksWithSessionsLeft,
  gymTerms,
  isPtEnding,
  isPtMembership,
  isPtPlan,
  lastPtDay,
  livePtPack,
  ptEndingMemberIds,
  ptExportCells,
  ptLeft,
  ptLeftRunning,
  ptPackToMark,
  ptPackToUndo,
  ptPlanLine,
  ptSummary,
  ptUsed,
  runningPtPacks,
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

describe('two packs at once (renewed early): oldest first', () => {
  const old = pt({ startsOn: '2026-09-20', endsOn: '2026-10-19', ptSessions: 12, ptLog: days(9), createdAt: 1 });
  const renewal = pt({ startsOn: '2026-10-10', endsOn: '2026-11-09', ptSessions: 12, ptLog: [], createdAt: 2 });

  it('marks the OLDEST running pack that still has sessions, so paid sessions are never stranded', () => {
    expect(runningPtPacks([renewal, old], TODAY).map((m) => m.id)).toEqual([old.id, renewal.id]);
    expect(ptPackToMark([renewal, old], TODAY)?.id).toBe(old.id);
    // The old pack used up: the renewal is next.
    const oldUsed = { ...old, ptLog: days(12) };
    expect(ptPackToMark([renewal, oldUsed], TODAY)?.id).toBe(renewal.id);
    // Every pack used up: nothing to mark.
    expect(ptPackToMark([oldUsed, { ...renewal, ptLog: days(12) }], TODAY)).toBeNull();
    expect(ptLeftRunning([renewal, old], TODAY)).toBe(3 + 12);
  });

  it('same start day: the newer sale first; cancelled, ended and future packs never count', () => {
    const a = pt({ startsOn: '2026-10-01', createdAt: 5 });
    const b = pt({ startsOn: '2026-10-01', createdAt: 9 });
    const gone = pt({ startsOn: '2026-09-01', cancelled: true });
    const over = pt({ startsOn: '2026-09-01', endsOn: '2026-10-14' });
    const later = pt({ startsOn: '2026-10-16' });
    expect(runningPtPacks([a, b, gone, over, later], TODAY).map((m) => m.id)).toEqual([b.id, a.id]);
  });

  it('undo takes back from the pack with the latest session day', () => {
    const o = { ...old, ptLog: ['2026-10-12', '2026-10-14'] };
    const r = { ...renewal, ptLog: ['2026-10-13'] };
    expect(ptPackToUndo([o, r], TODAY)?.id).toBe(o.id);
    // The same day on both: the pack used later (the renewal).
    expect(ptPackToUndo([{ ...o, ptLog: [TODAY] }, { ...r, ptLog: [TODAY] }], TODAY)?.id).toBe(r.id);
    expect(ptPackToUndo([pt()], TODAY)).toBeNull();
  });
});

describe('packs that ended with sessions unused', () => {
  it('lists them, latest ended first; used-up, cancelled and running packs are not listed', () => {
    const a = pt({ startsOn: '2026-08-01', endsOn: '2026-08-31', ptLog: days(4) });
    const b = pt({ startsOn: '2026-09-01', endsOn: '2026-09-30', ptLog: days(2) });
    const usedUp = pt({ startsOn: '2026-07-01', endsOn: '2026-07-31', ptSessions: 2, ptLog: days(2) });
    const cancelled = pt({ startsOn: '2026-06-01', endsOn: '2026-06-30', cancelled: true });
    expect(endedPtPacksWithSessionsLeft([a, b, usedUp, cancelled, pt()], TODAY).map((m) => m.id)).toEqual([b.id, a.id]);
  });
});

describe('a cancelled gym plan and a running PT pack', () => {
  it('reads by the PT pack, not "Cancelled"', () => {
    const gym = makeMembership({ startsOn: '2026-10-01', endsOn: '2026-10-31', cancelled: true });
    const pack = pt({ startsOn: '2026-10-05', endsOn: '2026-12-04' });
    expect(gymTerms([gym, pack])).toEqual([gym, pack]);
    const view = buildMemberView(makeMember(), [gym, pack], [], [], TODAY);
    expect(view.state).toBe('active');
    expect(view.current?.id).toBe(pack.id);
    expect(view.coversUntil).toBe('2026-12-04');
    // Only a cancelled gym plan, no PT: still "Cancelled".
    expect(buildMemberView(makeMember(), [gym], [], [], TODAY).state).toBe('cancelled');
    // A gym plan that is still on keeps deciding, PT or not.
    const live = makeMembership({ startsOn: '2026-10-01', endsOn: '2026-10-20' });
    expect(gymTerms([gym, live, pack])).toEqual([gym, live]);
  });
});

describe('the dues file', () => {
  it('gives a PT pack its sessions in words and its trainer; a gym plan blank', () => {
    expect(ptExportCells(pt({ ptLog: days(4) }))).toEqual(['4 of 12', 'Rohit']);
    expect(ptExportCells(pt({ trainer: null }))).toEqual(['0 of 12', '']);
    expect(ptExportCells(makeMembership())).toEqual(['', '']);
  });
});

describe('PT ending', () => {
  it('flags a pack that runs out within 7 days, even with sessions left', () => {
    expect(isPtEnding([pt({ endsOn: '2026-10-22' })], TODAY)).toBe(true);
    expect(isPtEnding([pt({ endsOn: '2026-10-23' })], TODAY)).toBe(false);
    // A pack already bought and waiting still takes them off the list.
    expect(isPtEnding([pt({ endsOn: '2026-10-22' }), pt({ startsOn: '2026-10-23', endsOn: '2026-11-22' })], TODAY)).toBe(false);
  });

  it('counts the sessions left across every running pack', () => {
    const old = pt({ startsOn: '2026-09-20', endsOn: '2026-11-19', ptSessions: 12, ptLog: days(7) });
    const newer = pt({ startsOn: '2026-10-10', endsOn: '2026-11-30', ptSessions: 2, ptLog: days(1) });
    // The newer pack alone has 1 left, but the old one still has 5: not ending.
    expect(isPtEnding([old, newer], TODAY)).toBe(false);
    expect(isPtEnding([{ ...old, ptLog: days(11) }, newer], TODAY)).toBe(true);
  });

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
