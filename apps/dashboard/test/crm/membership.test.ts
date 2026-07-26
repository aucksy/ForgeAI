import { describe, expect, it } from 'vitest';

import { addDays, diffDays } from '../../src/crm/logic/dates';
import {
  buildMemberView,
  compareByAttention,
  computeEndDate,
  coverageEndsOn,
  currentMembership,
  daysRemaining,
  endDateForPlan,
  membershipState,
  needsAttentionToday,
  outstandingForMember,
  unpaidForMembership,
  nextTermStart,
  stateTone,
  toMembershipView,
  WINBACK_WINDOW_DAYS,
} from '../../src/crm/logic/membership';
import type { MemberView } from '../../src/crm/types';
import { makeMember, makeMembership, makePayment, makePlan, makeVisit } from './fixtures';

const TODAY = '2026-07-26';

describe('computeEndDate — the inclusive-end rule', () => {
  it('ends a 1-month term the day before the monthly anniversary', () => {
    // Start 26 Jul, last valid day 25 Aug, renewal starts 26 Aug: no gap, no overlap.
    expect(computeEndDate('2026-07-26', 'month', 1)).toBe('2026-08-25');
    expect(computeEndDate('2026-07-26', 'month', 3)).toBe('2026-10-25');
    expect(computeEndDate('2026-07-26', 'month', 12)).toBe('2027-07-25');
  });

  it('counts the start day itself for day passes', () => {
    expect(computeEndDate('2026-07-26', 'day', 1)).toBe('2026-07-26');
    expect(computeEndDate('2026-07-26', 'day', 7)).toBe('2026-08-01');
  });

  it('clamps a month-end start instead of spilling forward', () => {
    // 31 Jan + 1 month clamps to 28 Feb, so the last valid day is 27 Feb.
    expect(computeEndDate('2026-01-31', 'month', 1)).toBe('2026-02-27');
    expect(computeEndDate('2024-01-31', 'month', 1)).toBe('2024-02-28'); // leap year
  });

  it('settles on a stable anniversary when renewed from a clamped end', () => {
    // The renewal chain must not creep backwards month after month.
    let start = '2026-01-31';
    const ends: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const end = computeEndDate(start, 'month', 1);
      ends.push(end);
      start = addDays(end, 1);
    }
    expect(ends).toEqual(['2026-02-27', '2026-03-27', '2026-04-27', '2026-05-27']);
  });

  it('treats a zero or negative count as one unit rather than an invalid range', () => {
    expect(computeEndDate('2026-07-26', 'month', 0)).toBe('2026-08-25');
    expect(computeEndDate('2026-07-26', 'day', -5)).toBe('2026-07-26');
  });

  it('reads the duration off a plan', () => {
    const quarterly = makePlan({ durationUnit: 'month', durationCount: 3 });
    expect(endDateForPlan('2026-07-26', quarterly)).toBe('2026-10-25');
  });
});

describe('membershipState', () => {
  it('classifies every phase against today', () => {
    const upcoming = makeMembership({ startsOn: '2026-08-01', endsOn: '2026-08-31' });
    const active = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-09-30' });
    const expiring = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-30' });
    const expired = makeMembership({ startsOn: '2026-05-01', endsOn: '2026-07-25' });

    expect(membershipState(upcoming, TODAY)).toBe('upcoming');
    expect(membershipState(active, TODAY)).toBe('active');
    expect(membershipState(expiring, TODAY)).toBe('expiring');
    expect(membershipState(expired, TODAY)).toBe('expired');
  });

  it('treats the last valid day as still active, not expired', () => {
    const lastDay = makeMembership({ startsOn: '2026-07-01', endsOn: TODAY });
    expect(membershipState(lastDay, TODAY)).toBe('expiring');
    expect(daysRemaining(lastDay, TODAY)).toBe(0);
    // One day later the same row has lapsed.
    expect(membershipState(lastDay, '2026-07-27')).toBe('expired');
  });

  it('honours the expiring window boundary exactly', () => {
    const sevenDaysOut = makeMembership({ endsOn: addDays(TODAY, 7) });
    const eightDaysOut = makeMembership({ endsOn: addDays(TODAY, 8) });
    expect(membershipState(sevenDaysOut, TODAY)).toBe('expiring');
    expect(membershipState(eightDaysOut, TODAY)).toBe('active');
    // A caller may widen the window (a 30-day renewals view).
    expect(membershipState(eightDaysOut, TODAY, 30)).toBe('expiring');
  });

  it('lets cancelled outrank every other phase', () => {
    const cancelledButLive = makeMembership({
      startsOn: '2026-07-01',
      endsOn: '2026-12-31',
      cancelled: true,
    });
    expect(membershipState(cancelledButLive, TODAY)).toBe('cancelled');
  });

  it('exposes the derived facts on the view', () => {
    const m = makeMembership({ endsOn: '2026-08-25', priceP: 300_000, joiningFeeP: 50_000 });
    const view = toMembershipView(m, TODAY);
    expect(view.daysRemaining).toBe(30);
    expect(view.totalDueP).toBe(350_000);
    expect(view.state).toBe('active');
  });
});

describe('currentMembership', () => {
  it('prefers a live term over a future or past one', () => {
    const past = makeMembership({ startsOn: '2026-01-01', endsOn: '2026-06-30' });
    const live = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-09-30' });
    const future = makeMembership({ startsOn: '2026-10-01', endsOn: '2026-12-31' });
    expect(currentMembership([past, future, live], TODAY)?.id).toBe(live.id);
  });

  it('picks the latest-ending live term when a member renews early', () => {
    const running = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-31' });
    const alsoRunning = makeMembership({ startsOn: '2026-07-20', endsOn: '2026-10-31' });
    expect(currentMembership([running, alsoRunning], TODAY)?.id).toBe(alsoRunning.id);
  });

  it('falls back to the soonest upcoming term when nothing is live', () => {
    const later = makeMembership({ startsOn: '2026-11-01', endsOn: '2026-11-30' });
    const sooner = makeMembership({ startsOn: '2026-08-01', endsOn: '2026-08-31' });
    expect(currentMembership([later, sooner], TODAY)?.id).toBe(sooner.id);
  });

  it('falls back to the most recently expired term so it can be chased', () => {
    const old = makeMembership({ startsOn: '2025-01-01', endsOn: '2025-12-31' });
    const recent = makeMembership({ startsOn: '2026-01-01', endsOn: '2026-06-30' });
    expect(currentMembership([old, recent], TODAY)?.id).toBe(recent.id);
  });

  it('ignores cancelled terms entirely', () => {
    const cancelled = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-12-31', cancelled: true });
    const expired = makeMembership({ startsOn: '2026-01-01', endsOn: '2026-06-30' });
    expect(currentMembership([cancelled, expired], TODAY)?.id).toBe(expired.id);
    expect(currentMembership([cancelled], TODAY)).toBeNull();
  });

  it('returns null for a member who has never bought anything', () => {
    expect(currentMembership([], TODAY)).toBeNull();
  });
});

describe('nextTermStart', () => {
  it('continues the day after cover ends', () => {
    expect(nextTermStart('2026-08-25', TODAY)).toBe('2026-08-26');
  });

  it('starts today when cover has already lapsed, rather than backdating', () => {
    // Backdating would sell them time they never got.
    expect(nextTermStart('2026-04-30', TODAY)).toBe(TODAY);
  });

  it('starts today when there is no cover at all', () => {
    expect(nextTermStart(null, TODAY)).toBe(TODAY);
  });

  it('starts tomorrow when today is the last covered day', () => {
    expect(nextTermStart(TODAY, TODAY)).toBe('2026-07-27');
  });

  it('takes the END OF THE CHAIN, so a second renewal cannot overlap the first', () => {
    // Fed from `coverageEndsOn`, not from the term running today — which is what
    // made a second renewal default to a start date inside the first one.
    const running = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-30' });
    const renewal = makeMembership({ startsOn: '2026-07-31', endsOn: '2027-07-30' });
    expect(nextTermStart(coverageEndsOn([running, renewal], TODAY), TODAY)).toBe('2027-07-31');
  });
});

describe('coverageEndsOn — the renewal chain', () => {
  it('follows a back-to-back renewal to the real end date', () => {
    const running = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-31' });
    const renewal = makeMembership({ startsOn: '2026-08-01', endsOn: '2027-07-31' });
    expect(coverageEndsOn([running, renewal], TODAY)).toBe('2027-07-31');
  });

  it('follows a chain three terms deep, in any array order', () => {
    const a = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-31' });
    const b = makeMembership({ startsOn: '2026-08-01', endsOn: '2026-10-31' });
    const c = makeMembership({ startsOn: '2026-11-01', endsOn: '2027-01-31' });
    expect(coverageEndsOn([c, a, b], TODAY)).toBe('2027-01-31');
  });

  it('stops at a real gap — a term starting weeks later does not count as cover', () => {
    const running = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-31' });
    const muchLater = makeMembership({ startsOn: '2026-09-15', endsOn: '2026-12-31' });
    expect(coverageEndsOn([running, muchLater], TODAY)).toBe('2026-07-31');
  });

  it('handles an overlapping early renewal, not just an exact handover', () => {
    const running = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-31' });
    const overlapping = makeMembership({ startsOn: '2026-07-20', endsOn: '2026-12-31' });
    expect(coverageEndsOn([running, overlapping], TODAY)).toBe('2026-12-31');
  });

  it('ignores cancelled terms when extending the chain', () => {
    const running = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-31' });
    const cancelledRenewal = makeMembership({
      startsOn: '2026-08-01',
      endsOn: '2027-07-31',
      cancelled: true,
    });
    expect(coverageEndsOn([running, cancelledRenewal], TODAY)).toBe('2026-07-31');
  });

  it('returns null when nothing covers today', () => {
    const expired = makeMembership({ startsOn: '2026-01-01', endsOn: '2026-06-30' });
    const upcoming = makeMembership({ startsOn: '2026-09-01', endsOn: '2026-12-31' });
    expect(coverageEndsOn([expired, upcoming], TODAY)).toBeNull();
    expect(coverageEndsOn([], TODAY)).toBeNull();
  });

  it('takes a member who renewed early OFF the chase list', () => {
    // The bug this pins: reading only the live term reports "expiring" for someone
    // who has already paid for next year, and the owner phones a paying customer.
    const expiringNow = makeMembership({ memberId: 'mem_r', startsOn: '2026-07-01', endsOn: '2026-07-30' });
    const renewal = makeMembership({ memberId: 'mem_r', startsOn: '2026-07-31', endsOn: '2027-07-30' });

    const withoutRenewal = buildMemberView(makeMember({ id: 'mem_r' }), [expiringNow], [], [], TODAY);
    expect(withoutRenewal.state).toBe('expiring');
    expect(needsAttentionToday(withoutRenewal)).toBe(true);

    const withRenewal = buildMemberView(makeMember({ id: 'mem_r' }), [expiringNow, renewal], [], [], TODAY);
    expect(withRenewal.state).toBe('active');
    expect(withRenewal.coversUntil).toBe('2027-07-30');
    expect(withRenewal.daysRemaining).toBe(369);
    expect(needsAttentionToday(withRenewal)).toBe(false);
    // The term they are physically inside is still the one shown as current.
    expect(withRenewal.current?.endsOn).toBe('2026-07-30');
  });

  it('still reports expiring when the renewal leaves a gap', () => {
    const expiringNow = makeMembership({ startsOn: '2026-07-01', endsOn: '2026-07-30' });
    const laterTerm = makeMembership({ startsOn: '2026-09-01', endsOn: '2027-08-31' });
    const view = buildMemberView(makeMember(), [expiringNow, laterTerm], [], [], TODAY);
    expect(view.state).toBe('expiring');
    expect(view.coversUntil).toBe('2026-07-30');
  });
});

describe('outstanding dues', () => {
  it('subtracts payments from price plus joining fee', () => {
    const m = makeMembership({ id: 'ms_x', priceP: 300_000, joiningFeeP: 50_000 });
    expect(unpaidForMembership(m, [])).toBe(350_000);
    expect(unpaidForMembership(m, [makePayment({ membershipId: 'ms_x', amountP: 200_000 })])).toBe(
      150_000,
    );
  });

  it('ignores voided payments — a cancelled receipt is not money', () => {
    const m = makeMembership({ id: 'ms_x', priceP: 300_000, joiningFeeP: 0 });
    const payments = [
      makePayment({ membershipId: 'ms_x', amountP: 300_000, voided: true, voidReason: 'entered twice' }),
    ];
    expect(unpaidForMembership(m, payments)).toBe(300_000);
  });

  it('ignores payments belonging to a different term', () => {
    const m = makeMembership({ id: 'ms_x', priceP: 300_000, joiningFeeP: 0 });
    expect(unpaidForMembership(m, [makePayment({ membershipId: 'ms_other', amountP: 300_000 })])).toBe(
      300_000,
    );
  });

  it('never goes negative when a member overpays', () => {
    const m = makeMembership({ id: 'ms_x', priceP: 100_000, joiningFeeP: 0 });
    expect(unpaidForMembership(m, [makePayment({ membershipId: 'ms_x', amountP: 150_000 })])).toBe(0);
  });

  it('sums across every term but skips cancelled ones', () => {
    const a = makeMembership({ id: 'ms_a', priceP: 100_000, joiningFeeP: 0 });
    const b = makeMembership({ id: 'ms_b', priceP: 200_000, joiningFeeP: 0 });
    const cancelled = makeMembership({ id: 'ms_c', priceP: 500_000, joiningFeeP: 0, cancelled: true });
    const paid = [makePayment({ membershipId: 'ms_a', amountP: 40_000 })];
    // 60,000 still owed on a + 200,000 on b; the cancelled term is not chased.
    expect(outstandingForMember([a, b, cancelled], paid)).toBe(260_000);
  });

  it('does not let one member’s overpayment cancel another term’s due', () => {
    const a = makeMembership({ id: 'ms_a', priceP: 100_000, joiningFeeP: 0 });
    const b = makeMembership({ id: 'ms_b', priceP: 100_000, joiningFeeP: 0 });
    const paid = [makePayment({ membershipId: 'ms_a', amountP: 500_000 })];
    expect(outstandingForMember([a, b], paid)).toBe(100_000);
  });
});

describe('buildMemberView', () => {
  it('joins status, dues and last visit into one row', () => {
    const member = makeMember({ id: 'mem_v' });
    const ms = makeMembership({
      id: 'ms_v',
      memberId: 'mem_v',
      startsOn: '2026-07-01',
      endsOn: '2026-07-30',
      priceP: 300_000,
      joiningFeeP: 0,
    });
    const payments = [makePayment({ membershipId: 'ms_v', amountP: 100_000 })];
    const visits = [
      makeVisit({ memberId: 'mem_v', visitedOn: '2026-07-10' }),
      makeVisit({ memberId: 'mem_v', visitedOn: '2026-07-22' }),
    ];

    const view = buildMemberView(member, [ms], payments, visits, TODAY);
    expect(view.state).toBe('expiring');
    expect(view.coversUntil).toBe('2026-07-30');
    expect(view.daysRemaining).toBe(4);
    expect(view.outstandingP).toBe(200_000);
    expect(view.lastVisitOn).toBe('2026-07-22');
    expect(view.daysSinceVisit).toBe(4);
  });

  it('reports a member who has never bought or visited', () => {
    const view = buildMemberView(makeMember(), [], [], [], TODAY);
    expect(view.state).toBe('never');
    expect(view.current).toBeNull();
    expect(view.daysRemaining).toBeNull();
    expect(view.outstandingP).toBe(0);
    expect(view.lastVisitOn).toBeNull();
    expect(view.daysSinceVisit).toBeNull();
  });

  it('picks the latest visit regardless of array order', () => {
    const visits = [
      makeVisit({ visitedOn: '2026-07-22' }),
      makeVisit({ visitedOn: '2026-07-01' }),
      makeVisit({ visitedOn: '2026-07-15' }),
    ];
    const view = buildMemberView(makeMember(), [], [], visits, TODAY);
    expect(view.lastVisitOn).toBe('2026-07-22');
    expect(view.daysSinceVisit).toBe(diffDays('2026-07-22', TODAY));
  });
});

describe('attention ordering', () => {
  const view = (state: MemberView['state'], days: number | null, name: string): MemberView => ({
    member: makeMember({ fullName: name }),
    current: null,
    coversUntil: null,
    state,
    daysRemaining: days,
    outstandingP: 0,
    lastVisitOn: null,
    daysSinceVisit: null,
  });

  it('puts the cheapest save first — expiring before already-lapsed', () => {
    const rows = [
      view('active', 200, 'Active Anil'),
      view('upcoming', 40, 'Upcoming Uma'),
      view('expired', -30, 'Expired Esha'),
      view('never', null, 'Never Neha'),
      view('expiring', 3, 'Expiring Eshan'),
    ];
    const order = [...rows].sort(compareByAttention).map((r) => r.member.fullName);
    expect(order).toEqual([
      'Expiring Eshan',
      'Expired Esha',
      'Never Neha',
      'Active Anil',
      'Upcoming Uma',
    ]);
  });

  it('sorts the soonest expiry first within a running term, then by name', () => {
    const rows = [
      view('expiring', 6, 'Zara'),
      view('expiring', 2, 'Bhavna'),
      view('expiring', 2, 'Aman'),
    ];
    const order = [...rows].sort(compareByAttention).map((r) => r.member.fullName);
    expect(order).toEqual(['Aman', 'Bhavna', 'Zara']);
  });

  it('sorts the MOST RECENTLY lapsed first, not the longest gone', () => {
    // Sorting expired the same direction as expiring buries this week's lapses
    // under members who left two years ago, which is what the demo gym exposed.
    const rows = [
      view('expired', -700, 'Long Gone Lata'),
      view('expired', -2, 'Just Lapsed Jai'),
      view('expired', -40, 'Month Ago Mira'),
    ];
    const order = [...rows].sort(compareByAttention).map((r) => r.member.fullName);
    expect(order).toEqual(['Just Lapsed Jai', 'Month Ago Mira', 'Long Gone Lata']);
  });
});

describe('needsAttentionToday', () => {
  const view = (state: MemberView['state'], days: number | null): MemberView => ({
    member: makeMember(),
    current: null,
    coversUntil: null,
    state,
    daysRemaining: days,
    outstandingP: 0,
    lastVisitOn: null,
    daysSinceVisit: null,
  });

  it('includes everyone whose term is still running but about to end', () => {
    expect(needsAttentionToday(view('expiring', 0))).toBe(true);
    expect(needsAttentionToday(view('expiring', 7))).toBe(true);
  });

  it('includes the recently lapsed and drops the long gone', () => {
    expect(needsAttentionToday(view('expired', -1))).toBe(true);
    expect(needsAttentionToday(view('expired', -WINBACK_WINDOW_DAYS))).toBe(true);
    expect(needsAttentionToday(view('expired', -WINBACK_WINDOW_DAYS - 1))).toBe(false);
    expect(needsAttentionToday(view('expired', -700))).toBe(false);
  });

  it('honours a caller-supplied window', () => {
    expect(needsAttentionToday(view('expired', -90), 120)).toBe(true);
    expect(needsAttentionToday(view('expired', -90), 30)).toBe(false);
  });

  it('leaves everyone else off the daily list', () => {
    expect(needsAttentionToday(view('active', 200))).toBe(false);
    expect(needsAttentionToday(view('upcoming', 30))).toBe(false);
    expect(needsAttentionToday(view('never', null))).toBe(false);
    expect(needsAttentionToday(view('cancelled', 5))).toBe(false);
  });
});

describe('stateTone', () => {
  it('reserves critical for money already lost', () => {
    expect(stateTone('expired')).toBe('critical');
    expect(stateTone('expiring')).toBe('warn');
    expect(stateTone('active')).toBe('good');
    expect(stateTone('upcoming')).toBe('good');
    expect(stateTone('never')).toBe('muted');
    expect(stateTone('cancelled')).toBe('muted');
  });
});
