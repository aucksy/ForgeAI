// R-168: the "Your numbers" tiles on Today. Every figure must agree with the screen it sits beside
// (the dues list, Losing the habit, the Ending-in tiles), and every line must add up to its figure.
import { describe, expect, it } from 'vitest';

import { canOpen } from '../../src/crm/auth/permissions';
import { activeNavPath } from '../../src/crm/ui/AppShell';
import { atRiskList } from '../../src/crm/logic/attendance';
import { duesLedger } from '../../src/crm/logic/collections';
import { addDays } from '../../src/crm/logic/dates';
import { tileCounts } from '../../src/crm/logic/homeTiles';
import { buildMemberView } from '../../src/crm/logic/membership';
import {
  aheadWindow,
  backWindow,
  busyHours,
  countChangeWords,
  countTrend,
  customRange,
  DEFAULT_RANGE,
  drawnHours,
  MAX_RANGE_DAYS,
  NUMBER_IDS,
  newMemberPlanWords,
  newMembers,
  numberLabel,
  numbersFor,
  owedListOn,
  owedOn,
  parseRange,
  perDayWords,
  previousWindow,
  rangeChipLabel,
  rangeParam,
  renewalsDue,
  stepDays,
  stoppedComingOn,
  tileFigures,
  trendSpans,
  windowWords,
  type NumbersRange,
} from '../../src/crm/logic/ownerNumbers';
import { makeMember, makeMembership, makePayment, makeVisit } from './fixtures';

const TODAY = '2026-10-29';

/** An IST check-in at `hour` on `day`. */
const at = (day: string, hour: number) => Date.parse(`${day}T${String(hour).padStart(2, '0')}:15:00+05:30`);

describe('the range', () => {
  it('reads and writes presets and two dates; anything else is 30 days', () => {
    for (const r of [{ kind: '7' }, { kind: '30' }, { kind: '90' }, { kind: 'custom', from: '2026-10-01', to: '2026-10-29' }] as NumbersRange[]) {
      expect(parseRange(rangeParam(r))).toEqual(r);
    }
    expect(parseRange(undefined)).toEqual(DEFAULT_RANGE);
    expect(parseRange('45')).toEqual(DEFAULT_RANGE);
    expect(parseRange('2026-13-01_2026-10-29')).toEqual(DEFAULT_RANGE);
    expect(parseRange('junk')).toEqual(DEFAULT_RANGE);
  });

  it('puts two dates the right way round and keeps at most a year', () => {
    expect(parseRange('2026-10-29_2026-10-01')).toEqual({ kind: 'custom', from: '2026-10-01', to: '2026-10-29' });
    const long = customRange('2020-01-01', TODAY);
    expect(long.kind === 'custom' && long.from).toBe(addDays(TODAY, -(MAX_RANGE_DAYS - 1)));
  });

  it('a preset looks back n days for most tiles and ahead (today to today + n) for renewals', () => {
    expect(backWindow({ kind: '7' }, TODAY)).toEqual({ from: '2026-10-23', to: TODAY });
    expect(backWindow({ kind: '30' }, TODAY)).toEqual({ from: '2026-09-30', to: TODAY });
    expect(aheadWindow({ kind: '7' }, TODAY)).toEqual({ from: TODAY, to: '2026-11-05' });
    const c: NumbersRange = { kind: 'custom', from: '2026-09-01', to: '2026-09-30' };
    expect(backWindow(c, TODAY)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(aheadWindow(c, TODAY)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('says which days it covers', () => {
    expect(windowWords('new', { kind: '30' }, TODAY)).toBe('Last 30 days');
    expect(windowWords('renewals', { kind: '30' }, TODAY)).toBe('Next 30 days');
    expect(windowWords('new', { kind: 'custom', from: '2026-10-01', to: '2026-10-29' }, TODAY)).toBe('1 Oct – 29 Oct 2026');
    expect(windowWords('new', { kind: 'custom', from: '2025-12-20', to: '2026-01-10' }, TODAY)).toBe('20 Dec 2025 – 10 Jan 2026');
    expect(rangeChipLabel('7')).toBe('7 days');
    expect(rangeChipLabel('custom')).toBe('Pick dates');
  });
});

describe('the trend line', () => {
  it('a point a day up to 31 days, a week up to half a year, then a month', () => {
    expect([stepDays(7), stepDays(31), stepDays(32), stepDays(186), stepDays(187)]).toEqual([1, 1, 7, 7, 30]);
  });

  it('cuts from the newest day, covers every day once, and the oldest point is the short one', () => {
    const w = backWindow({ kind: '90' }, TODAY);
    const spans = trendSpans(w);
    expect(spans).toHaveLength(13);
    expect(spans[spans.length - 1]).toEqual({ from: addDays(TODAY, -6), to: TODAY });
    expect(spans[0].from).toBe(w.from);
    for (let i = 1; i < spans.length; i += 1) expect(spans[i].from).toBe(addDays(spans[i - 1].to, 1));
    expect(trendSpans(backWindow({ kind: '30' }, TODAY))).toHaveLength(30);
  });

  it('a count line adds up to the count, days outside the window left out', () => {
    const w = backWindow({ kind: '90' }, TODAY);
    const days = ['2026-07-30', w.from, '2026-09-15', '2026-10-28', TODAY, '2026-10-30'];
    const line = countTrend(days, w);
    expect(line.reduce((n, p) => n + p.value, 0)).toBe(4);
  });
});

describe('renewals due', () => {
  it('plans ending in the window without a back-to-back renewal; soonest first; one row per member', () => {
    const a = makeMember({ fullName: 'Asha' });
    const b = makeMember({ fullName: 'Bina' });
    const c = makeMember({ fullName: 'Chetan' });
    const d = makeMember({ fullName: 'Dev', archived: true });
    const e = makeMember({ fullName: 'Esha' });
    const ms = [
      makeMembership({ memberId: a.id, startsOn: '2026-10-03', endsOn: '2026-11-02' }),
      // Bina renewed early: the next term starts the day after; not due.
      makeMembership({ memberId: b.id, startsOn: '2026-10-01', endsOn: '2026-10-31' }),
      makeMembership({ memberId: b.id, startsOn: '2026-11-01', endsOn: '2026-11-30' }),
      makeMembership({ memberId: c.id, startsOn: '2026-10-01', endsOn: '2026-10-29' }),
      // Archived: left out, like the roster.
      makeMembership({ memberId: d.id, startsOn: '2026-10-01', endsOn: '2026-10-30' }),
      // Cancelled: decides nothing.
      makeMembership({ memberId: e.id, startsOn: '2026-10-01', endsOn: '2026-10-30', cancelled: true }),
    ];
    const rows = renewalsDue([a, b, c, d, e], ms, aheadWindow({ kind: '7' }, TODAY), TODAY);
    expect(rows.map((r) => [r.member.fullName, r.endsOn, r.daysLeft])).toEqual([
      ['Chetan', '2026-10-29', 0],
      ['Asha', '2026-11-02', 4],
    ]);
  });

  it('a PT pack never makes a member due while their gym plan runs on', () => {
    const m = makeMember();
    const ms = [
      makeMembership({ memberId: m.id, startsOn: '2026-10-01', endsOn: '2026-12-31' }),
      makeMembership({ memberId: m.id, startsOn: '2026-10-01', endsOn: '2026-10-31', ptSessions: 12, planName: 'PT 12' }),
    ];
    expect(renewalsDue([m], ms, aheadWindow({ kind: '7' }, TODAY), TODAY)).toEqual([]);
  });

  it('for a week it is the same people as Ending today + 1-3 + 4-7 days', () => {
    const members = Array.from({ length: 12 }, (_, i) => makeMember({ fullName: `M${i}` }));
    const ms = members.map((m, i) => makeMembership({ memberId: m.id, startsOn: '2026-10-01', endsOn: addDays(TODAY, i - 2) }));
    const views = members.map((m) => buildMemberView(m, ms.filter((x) => x.memberId === m.id), [], [], TODAY));
    const t = tileCounts(views, TODAY);
    expect(renewalsDue(members, ms, aheadWindow({ kind: '7' }, TODAY), TODAY)).toHaveLength(t['exp-today'] + t['exp-1-3'] + t['exp-4-7']);
  });
});

describe('money owed', () => {
  const m1 = makeMember({ fullName: 'Kiran' });
  const m2 = makeMember({ fullName: 'Lata', archived: true });
  const t1 = makeMembership({ memberId: m1.id, startsOn: '2026-09-01', endsOn: '2026-09-30', priceP: 200_000 });
  const t2 = makeMembership({ memberId: m1.id, startsOn: '2026-10-20', endsOn: '2026-11-19', priceP: 150_000, joiningFeeP: 50_000 });
  const t3 = makeMembership({ memberId: m2.id, startsOn: '2026-08-01', endsOn: '2026-08-31', priceP: 100_000 });
  const t4 = makeMembership({ memberId: m1.id, startsOn: '2026-07-01', endsOn: '2026-07-31', priceP: 90_000, cancelled: true });
  const payments = [
    makePayment({ memberId: m1.id, membershipId: t1.id, amountP: 50_000, paidOn: '2026-09-01' }),
    makePayment({ memberId: m1.id, membershipId: t1.id, amountP: 100_000, paidOn: '2026-10-25' }),
    makePayment({ memberId: m1.id, membershipId: t2.id, amountP: 200_000, paidOn: '2026-10-21', voided: true }),
  ];
  const members = [m1, m2];
  const ms = [t1, t2, t3, t4];

  it('today it is the dues list total and every member view’s outstanding, archived included', () => {
    const owed = owedOn(members, ms, payments, TODAY);
    expect(owed).toBe(50_000 + 200_000 + 100_000);
    expect(owed).toBe(duesLedger(members, ms, payments, TODAY).reduce((n, r) => n + r.unpaidP, 0));
    const views = members.map((m) => buildMemberView(m, ms.filter((x) => x.memberId === m.id), payments, [], TODAY));
    expect(owed).toBe(views.reduce((n, v) => n + v.outstandingP, 0));
    expect(owedListOn(members, ms, payments, TODAY).map((r) => r.member.fullName)).toEqual(['Lata', 'Kiran']);
  });

  it('an earlier day: later receipts and later plans are not there yet', () => {
    // 19 Oct: t2 has not started, the 25 Oct receipt is not taken yet.
    expect(owedOn(members, ms, payments, '2026-10-19')).toBe(150_000 + 100_000);
    // 31 Jul: nothing was owed yet (the cancelled July plan is never chased).
    expect(owedOn(members, ms, payments, '2026-07-31')).toBe(0);
  });

  it('a plan written down before it starts is owed from the day it was written down', () => {
    const m = makeMember();
    const t = makeMembership({ memberId: m.id, startsOn: '2026-11-05', endsOn: '2026-12-04', priceP: 100_000, createdAt: at('2026-10-27', 11) });
    expect(owedOn([m], [t], [], '2026-10-26')).toBe(0);
    expect(owedOn([m], [t], [], '2026-10-27')).toBe(100_000);
  });
});

describe('stopped coming', () => {
  it('today it is the Losing the habit list; an earlier day reads only the check-ins up to it', () => {
    const regular = makeMember({ fullName: 'Regular', joinedOn: '2026-06-01' });
    const away = makeMember({ fullName: 'Away', joinedOn: '2026-06-01' });
    const ms = [regular, away].map((m) => makeMembership({ memberId: m.id, startsOn: '2026-06-01', endsOn: '2026-12-31' }));
    const visits = [];
    for (let d = 0; d < 60; d += 2) {
      const day = addDays(TODAY, -d);
      visits.push(makeVisit({ memberId: regular.id, visitedOn: day, checkedInAt: at(day, 7) }));
      // Away came every other day until 40 days ago.
      if (d >= 40) visits.push(makeVisit({ memberId: away.id, visitedOn: day, checkedInAt: at(day, 18) }));
    }
    const now = stoppedComingOn([regular, away], ms, visits, TODAY);
    expect(now.map((r) => r.member.fullName)).toEqual(['Away']);
    expect(now).toEqual(atRiskList([regular, away], ms, visits, TODAY));
    // 41 days ago Away had just been in: nobody was away then.
    expect(stoppedComingOn([regular, away], ms, visits, addDays(TODAY, -41))).toEqual([]);
  });
});

describe('new members', () => {
  it('joined inside the days, newest first, archived left out; compared with the same days before', () => {
    const w = backWindow({ kind: '30' }, TODAY);
    const ms = [
      makeMember({ fullName: 'Old', joinedOn: '2026-09-29' }),
      makeMember({ fullName: 'First', joinedOn: '2026-09-30' }),
      makeMember({ fullName: 'Last', joinedOn: TODAY }),
      makeMember({ fullName: 'Gone', joinedOn: '2026-10-10', archived: true }),
      makeMember({ fullName: 'Before', joinedOn: '2026-09-01' }),
    ];
    expect(newMembers(ms, w).map((m) => m.fullName)).toEqual(['Last', 'First']);
    expect(previousWindow(w)).toEqual({ from: '2026-08-31', to: '2026-09-29' });
    expect(newMembers(ms, previousWindow(w)).map((m) => m.fullName)).toEqual(['Old', 'Before']);
  });
});

describe('busy hours', () => {
  it('counts real check-in times only, the busiest hour wins (ties: the earlier), per day over every day', () => {
    const w = backWindow({ kind: '7' }, TODAY);
    const visits = [
      makeVisit({ visitedOn: TODAY, checkedInAt: at(TODAY, 7) }),
      makeVisit({ visitedOn: TODAY, checkedInAt: at(TODAY, 7) }),
      makeVisit({ visitedOn: '2026-10-28', checkedInAt: at('2026-10-28', 18) }),
      makeVisit({ visitedOn: '2026-10-27', checkedInAt: at('2026-10-27', 18) }),
      // An imported paper-register row (no real time) and a time on another day: never counted.
      makeVisit({ visitedOn: '2026-10-26', checkedInAt: 0, source: 'import' }),
      makeVisit({ visitedOn: '2026-10-25', checkedInAt: at('2026-10-24', 9) }),
      // Outside the days.
      makeVisit({ visitedOn: '2026-10-01', checkedInAt: at('2026-10-01', 9) }),
    ];
    const b = busyHours(visits, w);
    expect(b.timedN).toBe(4);
    expect(b.busiest).toBe(7);
    expect(b.hours[7].perDay).toBeCloseTo(2 / 7);
    expect(b.hours[5].visitsN).toBe(0);
    expect(drawnHours(b)[0].hour).toBe(6);
    expect(busyHours([], w).busiest).toBeNull();
  });
});

describe('all the tiles together', () => {
  const m = makeMember({ joinedOn: '2026-10-20' });
  const t = makeMembership({ memberId: m.id, startsOn: '2026-10-20', endsOn: '2026-11-03', priceP: 100_000 });
  const snap = { members: [m], memberships: [t], payments: [], visits: [makeVisit({ memberId: m.id, visitedOn: TODAY, checkedInAt: at(TODAY, 6) })] };

  it('a standing figure is the newest point of its own line; a line of counts adds up to its figure', () => {
    for (const range of [{ kind: '7' }, { kind: '30' }, { kind: '90' }] as NumbersRange[]) {
      const f = tileFigures(snap, range, TODAY, true);
      expect(f.owed.totalP).toBe(100_000);
      expect(f.owed.trend[f.owed.trend.length - 1].value).toBe(f.owed.totalP);
      expect(f.owed.people).toBe(1);
      expect(f.stopped.count).toBe(f.stopped.trend[f.stopped.trend.length - 1].value);
      expect(f.renewals.trend.reduce((n, p) => n + p.value, 0)).toBe(f.renewals.count);
      expect(f.newcomers.trend.reduce((n, p) => n + p.value, 0)).toBe(f.newcomers.count);
      expect(f.newcomers.count).toBe(range.kind === '7' ? 0 : 1);
      expect(f.busy.busiest).toBe(6);
    }
  });

  it('the front desk’s figures never work out money', () => {
    const f = tileFigures(snap, { kind: '30' }, TODAY, false);
    expect(f.owed).toEqual({ totalP: 0, people: 0, trend: [], beforeP: 0 });
  });
});

describe('who sees what', () => {
  it('Money owed is the owner’s: not on the desk’s tiles, its list closed to the desk', () => {
    expect(numbersFor(true)).toEqual([...NUMBER_IDS]);
    expect(numbersFor(false)).toEqual(['renewals', 'stopped', 'new', 'busy']);
    expect(canOpen('staff', '/numbers/owed/30')).toBe(false);
    expect(canOpen('owner', '/numbers/owed/30')).toBe(true);
    for (const id of ['renewals', 'stopped', 'new', 'busy']) expect(canOpen('staff', `/numbers/${id}/30`)).toBe(true);
  });

  it('a numbers list keeps Today lit in the menu', () => {
    expect(activeNavPath(['/', '/members', '/money', '/more'], '/numbers/renewals/30')).toBe('/');
  });
});

describe('words', () => {
  it('plain, and never the banned words', () => {
    const range: NumbersRange = { kind: '30' };
    const words = [
      ...NUMBER_IDS.map(numberLabel),
      ...NUMBER_IDS.map((id) => windowWords(id, range, TODAY)),
      countChangeWords(3, 1, 'the 30 days before'),
      countChangeWords(1, 3, '30 days ago'),
      countChangeWords(2, 2, '30 days ago'),
      perDayWords(0),
      perDayWords(0.4),
      perDayWords(8.6),
      newMemberPlanWords('active', 'Monthly'),
      newMemberPlanWords('never', null),
      newMemberPlanWords('upcoming', 'Quarterly'),
    ];
    expect(words).toContain('2 more than the 30 days before');
    expect(words).toContain('2 fewer than 30 days ago');
    expect(words).toContain('Same as 30 days ago');
    expect(words).toContain('about 9 a day');
    for (const w of words) expect(w).not.toMatch(/\b(volume|PRs?|session)\b/i);
  });
});
