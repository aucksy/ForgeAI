// "Your growth" (owner, 30 Oct 2026): every number on the page against a small gym worked out by hand.
import { describe, expect, it } from 'vitest';

import { DEMO_START_DAYS_AGO, demoSnapshot } from '../../src/crm/data/demo';
import {
  GROWTH_CSV_HEADERS,
  RENEW_GRACE_DAYS,
  changeWords,
  countedTerms,
  endOutcome,
  formatMetric,
  growthCsvRows,
  shownValue,
  growthReport,
  mettleUpStart,
  monthLabel,
  notYetWords,
  summaryLead,
  summaryLines,
  type GrowthSnapshot,
} from '../../src/crm/logic/businessGrowth';
import { addDays } from '../../src/crm/logic/dates';
import type { Member, Membership, Payment, Visit } from '../../src/crm/types';

const TODAY = '2026-06-20';
const OLD = 'import-old';

function noon(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

function member(id: string, joinedOn: string, imported = true, archived = false): Member {
  return {
    id,
    gymId: 'g',
    importId: imported ? OLD : null,
    fullName: id,
    phone: '+919800000000',
    email: null,
    gender: null,
    dateOfBirth: null,
    address: null,
    emergencyName: null,
    emergencyPhone: null,
    joinedOn,
    photoUri: null,
    notes: null,
    archived,
    appUserId: null,
    // An import is typed in later than the history it carries: on the import day (after the start).
    createdAt: imported ? noon('2026-03-12') : noon(joinedOn),
    updatedAt: 0,
  };
}

let seq = 0;
function term(memberId: string, startsOn: string, endsOn: string, extra: Partial<Membership> = {}): Membership {
  return {
    id: `ms${(seq += 1)}`,
    gymId: 'g',
    memberId,
    planId: 'p',
    planName: 'Plan',
    priceP: 100_000,
    joiningFeeP: 0,
    listPriceP: 100_000,
    startsOn,
    endsOn,
    cancelled: false,
    notes: null,
    soldBy: null,
    importId: startsOn < '2026-03-10' ? OLD : null,
    createdAt: startsOn < '2026-03-10' ? noon('2026-03-12') : noon(startsOn),
    updatedAt: 0,
    ...extra,
  };
}

function pay(memberId: string, paidOn: string, rupees: number, voided = false): Payment {
  return {
    id: `pay${(seq += 1)}`,
    gymId: 'g',
    memberId,
    membershipId: null,
    amountP: rupees * 100,
    method: 'cash',
    paidOn,
    receiptNo: `R${seq}`,
    reference: null,
    note: null,
    voided,
    voidReason: voided ? 'typed twice' : null,
    collectedBy: null,
    importId: paidOn < '2026-03-10' ? OLD : null,
    createdAt: paidOn < '2026-03-10' ? noon('2026-03-12') : noon(paidOn),
  };
}

function visit(memberId: string, day: string, fromRegister = false): Visit {
  return {
    id: `v${(seq += 1)}`,
    gymId: 'g',
    memberId,
    visitedOn: day,
    // A paper-register row has no real time.
    checkedInAt: fromRegister ? 0 : noon(day),
    source: fromRegister ? 'import' : 'desk',
  };
}

/**
 * The hand-worked gym. Started on MettleUp on 10 Mar 2026 (so March is the start month); today is
 * 20 Jun 2026. Imported history: A, B, C from Dec 2025.
 *
 *   month  money    active at end      joined  plans ended (renewed / lost / waiting)   check-ins
 *   Dec    4000     A B = 2            A B     -                                          -
 *   Jan    2000     A C = 2            C       A renewed (Feb 1), B lost (14 Jan)          4 (2 from the register)
 *   Feb    6000     A C = 2            -       C renewed (5 Mar, inside 15 days)           -
 *   Mar    2000     (start month, in neither average)
 *   Apr    1500     A C D = 3          D       -                                          6
 *          (a 999 receipt cancelled; E's day pass and A's PT pack never count)
 *   May    4500     A D E = 3          E       C lost (4 May), D renewed (20 May)         9
 *   Jun    0 so far A E = 2            -       D waiting (19 Jun)                          -
 */
function handGym(gymStart = '2026-03-10'): GrowthSnapshot {
  seq = 0;
  return {
    gym: { createdAt: noon(gymStart) },
    members: [member('A', '2025-12-01'), member('B', '2025-12-15', true, true), member('C', '2026-01-01'), member('D', '2026-04-10', false), member('E', '2026-05-02', false)],
    memberships: [
      term('A', '2025-12-01', '2026-01-31'),
      term('A', '2026-02-01', '2026-07-31'),
      term('A', '2026-03-01', '2026-03-31', { ptSessions: 12 }),
      term('B', '2025-12-15', '2026-01-14'),
      term('B', '2026-02-01', '2026-02-28', { cancelled: true }),
      term('C', '2026-01-01', '2026-02-28'),
      term('C', '2026-03-05', '2026-05-04'),
      term('D', '2026-04-10', '2026-05-09'),
      term('D', '2026-05-20', '2026-06-19'),
      term('E', '2026-04-03', '2026-04-03'),
      term('E', '2026-05-02', '2026-08-01'),
    ],
    payments: [
      pay('A', '2025-12-01', 3000),
      pay('B', '2025-12-15', 1000),
      pay('C', '2026-01-01', 2000),
      pay('A', '2026-02-01', 6000),
      pay('C', '2026-03-05', 2000),
      pay('D', '2026-04-10', 1500),
      pay('D', '2026-04-11', 999, true),
      pay('E', '2026-05-02', 3000),
      pay('D', '2026-05-20', 1500),
    ],
    visits: [
      visit('A', '2026-01-05', true),
      visit('A', '2026-01-06', true),
      visit('C', '2026-01-07'),
      visit('C', '2026-01-08'),
      ...['01', '02', '03', '04', '05', '06'].map((d) => visit('A', `2026-04-${d}`)),
      ...['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((d) => visit('E', `2026-05-${d}`)),
    ],
  };
}

describe('the start on MettleUp', () => {
  it('is the day the gym was made', () => {
    expect(mettleUpStart(handGym(), TODAY)).toBe('2026-03-10');
  });

  it('moves earlier for a record typed into the app before that (a gym moved to the cloud), never for an imported one', () => {
    const s = handGym();
    const typed = member('Z', '2026-02-01', false);
    expect(mettleUpStart({ ...s, members: [...s.members, typed] }, TODAY)).toBe('2026-02-01');
    const imported = { ...member('Y', '2025-01-01'), createdAt: noon('2025-01-01') };
    expect(mettleUpStart({ ...s, members: [...s.members, imported] }, TODAY)).toBe('2026-03-10');
  });

  it('ignores a missing date', () => {
    expect(mettleUpStart({ gym: { createdAt: 0 }, members: [], memberships: [], payments: [], visits: [] }, TODAY)).toBe(TODAY);
  });
});

describe('the plans that count', () => {
  it('leaves out cancelled plans, day passes and PT packs beside a gym plan', () => {
    const t = countedTerms(handGym().memberships);
    expect(t.get('A')).toHaveLength(2);
    expect(t.get('B')).toHaveLength(1);
    expect(t.get('E')).toEqual([{ startsOn: '2026-05-02', endsOn: '2026-08-01' }]);
  });
});

describe(`the ${RENEW_GRACE_DAYS}-day grace window`, () => {
  const old = { startsOn: '2026-04-01', endsOn: '2026-04-30' };
  it('a new plan starting on the 15th day after the last day is a renewal', () => {
    expect(RENEW_GRACE_DAYS).toBe(15);
    const next = { startsOn: '2026-05-15', endsOn: '2026-06-14' };
    expect(endOutcome(old, [old, next], TODAY)).toBe('renewed');
  });
  it('a day later is a member lost', () => {
    const next = { startsOn: '2026-05-16', endsOn: '2026-06-15' };
    expect(endOutcome(old, [old, next], TODAY)).toBe('lost');
  });
  it('an early renewal (bought before the old plan ended) is a renewal', () => {
    const next = { startsOn: '2026-04-20', endsOn: '2026-07-19' };
    expect(endOutcome(old, [old, next], TODAY)).toBe('renewed');
  });
  it('inside the window with no new plan yet: still waiting, not lost', () => {
    expect(endOutcome(old, [old], '2026-05-15')).toBe('waiting');
    expect(endOutcome(old, [old], '2026-05-16')).toBe('lost');
  });
});

describe('month by month', () => {
  const r = growthReport(handGym(), TODAY);
  const row = (m: string) => r.rows.find((x) => x.month === m)!;

  it('covers the months with history, oldest first, and marks before / start / since', () => {
    expect(r.rows.map((x) => x.month)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
    expect(r.rows.map((x) => x.phase)).toEqual(['before', 'before', 'before', 'start', 'since', 'since', 'since']);
    expect(r.chartRows).toHaveLength(7);
    expect(row('2026-06').complete).toBe(false);
    expect(row('2026-06').to).toBe(TODAY);
  });

  it('money collected: receipts by their date, the cancelled one left out', () => {
    expect(r.rows.map((x) => x.moneyP / 100)).toEqual([4000, 2000, 6000, 2000, 1500, 4500, 0]);
  });

  it('active members on the last day of the month (today for this month); an archived member stays in the past', () => {
    expect(r.rows.map((x) => x.active)).toEqual([2, 2, 2, 2, 3, 3, 2]);
  });

  it('new members by join date', () => {
    expect(r.rows.map((x) => x.joined)).toEqual([2, 1, 0, 0, 1, 1, 0]);
  });

  it('renewed, lost and still waiting, by the month the plan ended', () => {
    expect(r.rows.map((x) => [x.renewed, x.lost, x.waiting])).toEqual([
      [0, 0, 0],
      [1, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 0],
      [0, 0, 1],
    ]);
    expect(row('2026-01').renewalRate).toBe(0.5);
    expect(row('2026-04').renewalRate).toBeNull();
    expect(row('2026-06').settled).toBe(false);
  });

  it('visits per member: check-ins / active members; register rows count; no check-ins = no figure', () => {
    expect(row('2026-01').visits).toBe(4);
    expect(row('2026-01').visitsPerMember).toBe(2);
    expect(row('2026-02').visitsPerMember).toBeNull();
    expect(row('2026-04').visitsPerMember).toBe(2);
    expect(row('2026-05').visitsPerMember).toBe(3);
  });

  it('a month whose renewals are not known yet shows no renewal rate and no members lost', () => {
    expect(shownValue(row('2026-06'), 'renewal')).toBeNull();
    expect(shownValue(row('2026-06'), 'lost')).toBeNull();
    expect(shownValue(row('2026-06'), 'active')).toBe(2);
    expect(shownValue(row('2026-05'), 'lost')).toBe(1);
  });

  it('averages read as a gym owner says them: whole rupees, whole members', () => {
    expect(formatMetric('money', 6_680_166.67)).toBe('₹66,802');
    expect(formatMetric('active', 71.33)).toBe('71');
    expect(formatMetric('joined', 6.67)).toBe('6.7');
    expect(formatMetric('renewal', 0.547)).toBe('55%');
    expect(formatMetric('visits', 8)).toBe('8.0');
    expect(formatMetric('lost', null)).toBe('–');
  });

  it('a month before the start is on record only when a plan ended in it', () => {
    expect(r.rows.filter((x) => x.onRecord).map((x) => x.month)).toEqual(['2026-01', '2026-02']);
  });
});

describe('before MettleUp vs since MettleUp', () => {
  const r = growthReport(handGym(), TODAY);
  it('averages Jan + Feb against Apr + May, leaving out the start month and this month', () => {
    expect(r.mode).toBe('mettleup');
    expect(r.beforeMonthsOnRecord).toBe(2);
    const c = r.compare;
    expect([c.money.before, c.money.after]).toEqual([400_000, 300_000]);
    expect(c.money.change).toBe(-25);
    expect(c.money.better).toBe(false);
    expect([c.active.before, c.active.after, c.active.change, c.active.better]).toEqual([2, 3, 50, true]);
    expect([c.joined.before, c.joined.after, c.joined.change]).toEqual([0.5, 1, 100]);
    // Renewals: 2 of 3 before, 1 of 2 since; the change is in points.
    expect(c.renewal.before).toBeCloseTo(2 / 3);
    expect(c.renewal.after).toBe(0.5);
    expect(c.renewal.change).toBe(-17);
    expect(changeWords(c.renewal)).toBe('17 points');
    // Members lost: 0.5 a month on both sides: no change, so neither green nor red.
    expect([c.lost.before, c.lost.after, c.lost.change, c.lost.better]).toEqual([0.5, 0.5, 0, null]);
    expect([c.visits.before, c.visits.after, c.visits.change]).toEqual([2, 2.5, 25]);
  });

  it('fewer members lost is the good direction', () => {
    const s = handGym();
    // C renews in May after all: May has no member lost.
    const r2 = growthReport({ ...s, memberships: [...s.memberships, term('C', '2026-05-10', '2026-06-09')] }, TODAY);
    expect(r2.compare.lost.after).toBe(0);
    expect(r2.compare.lost.better).toBe(true);
  });

  it('says it in plain words, only the numbers it has', () => {
    expect(summaryLead(r)).toBe('Since you started MettleUp in March 2026, compared with the months before:');
    expect(summaryLines(r)).toEqual([
      'Money collected: down 25% a month',
      'Active members: up 1 (2 to 3)',
      'Renewals: down from 67% to 50%',
      'Visits per member: up from 2.0 to 2.5 a month',
    ]);
  });

  it('a month still inside the grace window never counts for renewals or members lost', () => {
    const s = handGym();
    // Today 10 Jun: May ended 10 days ago, so its renewals are not known yet.
    const r2 = growthReport(s, '2026-06-10');
    expect(r2.rows.find((x) => x.month === '2026-05')!.settled).toBe(false);
    expect(r2.compare.lost.afterMonths).toBe(1);
    expect(r2.compare.money.afterMonths).toBe(2);
  });
});

describe('not enough history before MettleUp', () => {
  it('with fewer than 2 months on record before the start: first months against latest months, said plainly', () => {
    // Started in December: nothing before it was brought in.
    const r = growthReport(handGym('2025-12-20'), TODAY);
    expect(r.beforeMonthsOnRecord).toBe(0);
    expect(r.mode).toBe('firstLatest');
    // Finished months since: Jan..May. Two on each side: Jan + Feb against Apr + May.
    expect(r.firstMonths).toEqual(['2026-01', '2026-02']);
    expect(r.latestMonths).toEqual(['2026-04', '2026-05']);
    expect([r.compare.money.before, r.compare.money.after]).toEqual([400_000, 300_000]);
    expect(summaryLead(r)).toBe('Your latest 2 months on MettleUp, compared with your first 2 months:');
  });

  it('one month on record is not enough', () => {
    const s = handGym();
    // Without C's February ending, only January is on record before the start.
    const r = growthReport({ ...s, memberships: s.memberships.filter((m) => !(m.memberId === 'C' && m.endsOn === '2026-02-28')) }, TODAY);
    expect(r.beforeMonthsOnRecord).toBe(1);
    expect(r.mode).not.toBe('mettleup');
  });

  it('a brand-new gym: no comparison and no made-up line, only when one will show', () => {
    const r = growthReport({ gym: { createdAt: noon('2026-06-02') }, members: [], memberships: [], payments: [], visits: [] }, TODAY);
    expect(r.mode).toBe('none');
    expect(summaryLines(r)).toEqual([]);
    expect(summaryLead(r)).toBe('You started MettleUp in June 2026.');
    expect(notYetWords(r, TODAY)).toBe('Your first comparison shows after 1 Sep 2026, once you have 2 full months on MettleUp.');
    expect(r.rows.map((x) => x.month)).toEqual(['2026-06']);
  });
});

describe('the Excel file', () => {
  it('has a row per month with the same figures as the page', () => {
    const r = growthReport(handGym(), TODAY);
    const rows = growthCsvRows(r);
    expect(rows).toHaveLength(r.rows.length);
    for (const row of rows) expect(row).toHaveLength(GROWTH_CSV_HEADERS.length);
    expect(rows[4]).toEqual([monthLabel('2026-04'), 'Since MettleUp', 'Yes', 1500, 3, 1, 0, 0, 0, 0, '', 6, 2]);
    expect(rows[6].slice(0, 3)).toEqual(['Jun 2026', 'Since MettleUp', 'No, so far']);
  });
});

describe('the demo gym tells a growth story', () => {
  const today = '2026-10-17';
  const s = demoSnapshot(today);
  const r = growthReport(s, today);
  it('started on MettleUp about seven months ago, with six months of imported history before it', () => {
    expect(r.start).toBe(addDays(today, -DEMO_START_DAYS_AGO));
    expect(r.mode).toBe('mettleup');
    expect(r.beforeMonthsOnRecord).toBe(6);
    expect(s.members.filter((m) => m.joinedOn < r.start).every((m) => m.importId)).toBe(true);
    expect(s.payments.filter((p) => p.paidOn >= r.start).some((p) => p.importId)).toBe(false);
  });
  it('is a believable success since the start: more money, members and visits, better renewals, fewer lost', () => {
    for (const m of ['money', 'active', 'visits', 'renewal', 'lost'] as const) expect(r.compare[m].better, m).toBe(true);
    // Not perfect: some month since the start still loses more members than the month before it.
    const since = r.chartRows.filter((x) => x.phase === 'since' && x.settled).map((x) => x.lost);
    expect(since.some((n, i) => i > 0 && n > since[i - 1])).toBe(true);
    expect(summaryLines(r).length).toBeGreaterThanOrEqual(3);
  });
});
