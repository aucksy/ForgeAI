/**
 * F123 (4 Nov 2026): pass members (FITPASS, cultpass...). No plan, no dues, never on the renewal list;
 * each check-in is a pass visit, counted per company per month (logic/passMembers.ts).
 */
import { describe, expect, it } from 'vitest';

import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { cameInWithProblem } from '../../src/crm/logic/cameInToday';
import { atRiskList } from '../../src/crm/logic/attendance';
import { buildMemberView, needsAttentionToday, STATE_LABEL } from '../../src/crm/logic/membership';
import { aheadWindow, renewalsDue } from '../../src/crm/logic/ownerNumbers';
import {
  isPassMember,
  normalizePassCompany,
  passCompanyChoices,
  passCompanyOfVisit,
  passExportRows,
  passFields,
  passMonthLabel,
  passMonthRows,
  passMonths,
  passPeopleInMonth,
  passVisitLines,
} from '../../src/crm/logic/passMembers';
import type { MemberDraft } from '../../src/crm/types';
import { makeMember, makeMembership, makeVisit } from './fixtures';

const TODAY = '2026-11-04';

describe('the pass company name', () => {
  it('known companies keep their own spelling however they are typed', () => {
    expect(normalizePassCompany('fitpass')).toBe('FITPASS');
    expect(normalizePassCompany(' Fit  Pass ')).toBe('FITPASS');
    expect(normalizePassCompany('Cult Pass')).toBe('cultpass');
    expect(normalizePassCompany('CULTPASS')).toBe('cultpass');
  });

  it('another company stays as typed, tidied; blank is no pass', () => {
    expect(normalizePassCompany('  Fitternity   Plus ')).toBe('Fitternity Plus');
    expect(normalizePassCompany('   ')).toBeNull();
    expect(normalizePassCompany(null)).toBeNull();
    expect(normalizePassCompany(undefined)).toBeNull();
    expect(normalizePassCompany('x'.repeat(60))).toHaveLength(40);
  });

  it('the form offers FITPASS and cultpass first, then the gym’s own, most used first', () => {
    const members = [
      makeMember({ passCompany: 'Fitternity' }),
      makeMember({ passCompany: 'GymPik' }),
      makeMember({ passCompany: 'gympik' }),
      makeMember({ passCompany: 'fitpass' }),
      makeMember({ passCompany: null }),
    ];
    expect(passCompanyChoices(members)).toEqual(['FITPASS', 'cultpass', 'GymPik', 'Fitternity']);
  });

  it('ticking keeps the first day, unticking clears both', () => {
    expect(passFields(true, 'fitpass', undefined, TODAY)).toEqual({ passCompany: 'FITPASS', passSince: TODAY });
    const before = { passCompany: 'FITPASS', passSince: '2026-10-01' };
    expect(passFields(true, 'cultpass', before, TODAY)).toEqual({ passCompany: 'cultpass', passSince: '2026-10-01' });
    expect(passFields(false, 'cultpass', before, TODAY)).toEqual({ passCompany: null, passSince: null });
    expect(passFields(true, '  ', before, TODAY)).toEqual({ passCompany: null, passSince: null });
  });
});

describe('a pass member is never chased', () => {
  const pass = makeMember({ id: 'p1', passCompany: 'FITPASS', passSince: '2026-10-01' });

  it('shows as "Pass member", not "No membership", and is off the renewal list', () => {
    const v = buildMemberView(pass, [], [], [], TODAY);
    expect(v.state).toBe('pass');
    expect(STATE_LABEL[v.state]).toBe('Pass member');
    expect(v.outstandingP).toBe(0);
    expect(needsAttentionToday(v)).toBe(false);
    expect(isPassMember(pass)).toBe(true);
  });

  it('even with an old plan that just ended (a paying member who moved to a pass)', () => {
    const old = makeMembership({ memberId: 'p1', startsOn: '2026-09-01', endsOn: '2026-11-01' });
    const v = buildMemberView(pass, [old], [], [], TODAY);
    expect(v.state).toBe('pass');
    expect(v.daysRemaining).toBeNull();
    expect(needsAttentionToday(v)).toBe(false);
    // The same member without the pass would be on the renewal list.
    expect(needsAttentionToday(buildMemberView({ ...pass, passCompany: null }, [old], [], [], TODAY))).toBe(true);
  });

  it('is not counted in Today -> Your numbers -> Renewals due (found in the UAT picture, 5 Nov 2026)', () => {
    const old = makeMembership({ memberId: 'p1', startsOn: '2026-10-08', endsOn: '2026-11-07' });
    const w = aheadWindow({ kind: '30' }, TODAY);
    expect(renewalsDue([pass], [old], w, TODAY)).toEqual([]);
    expect(renewalsDue([{ ...pass, passCompany: null }], [old], w, TODAY)).toHaveLength(1);
  });

  it('coming in today is not "no plan bought"', () => {
    const v = buildMemberView(pass, [], [], [], TODAY);
    expect(cameInWithProblem([makeVisit({ memberId: 'p1', visitedOn: TODAY })], [v], TODAY)).toEqual([]);
  });

  it('is never on the "losing the habit" list', () => {
    const running = makeMembership({ memberId: 'p1', startsOn: '2026-08-01', endsOn: '2027-07-31' });
    const visits = [];
    for (let d = 1; d <= 30; d += 1) visits.push(makeVisit({ memberId: 'other', visitedOn: `2026-10-${String(d).padStart(2, '0')}` }));
    const rows = atRiskList([pass], [running], visits, TODAY);
    expect(rows.map((r) => r.member.id)).not.toContain('p1');
  });
});

describe('pass visits', () => {
  const asha = makeMember({ id: 'a', fullName: 'Asha Rao', phone: '+919876500001', passCompany: 'FITPASS', passSince: '2026-10-10' });
  const ben = makeMember({ id: 'b', fullName: 'Ben Das', phone: '+919876500002', passCompany: 'cultpass', passSince: '2026-09-01' });
  const paid = makeMember({ id: 'c', fullName: 'Chitra', passCompany: null });
  const visits = [
    // Asha paid the gym before 10 Oct: those visits are not pass visits.
    makeVisit({ memberId: 'a', visitedOn: '2026-10-05', source: 'desk' }),
    makeVisit({ memberId: 'a', visitedOn: '2026-10-12', source: 'app' }),
    makeVisit({ memberId: 'a', visitedOn: '2026-10-20', source: 'desk', passCompany: 'FITPASS' }),
    makeVisit({ memberId: 'a', visitedOn: '2026-11-02', source: 'app' }),
    makeVisit({ memberId: 'b', visitedOn: '2026-10-21', source: 'desk', passCompany: 'cultpass' }),
    // A visit the desk stamped FITPASS stays FITPASS even after Ben moved to cultpass.
    makeVisit({ memberId: 'b', visitedOn: '2026-08-30', source: 'desk', passCompany: 'FITPASS' }),
    makeVisit({ memberId: 'c', visitedOn: '2026-10-21', source: 'desk' }),
  ];

  it('a QR visit counts for the member’s company from the day they became a pass member', () => {
    expect(passCompanyOfVisit(visits[0]!, asha)).toBeNull();
    expect(passCompanyOfVisit(visits[1]!, asha)).toBe('FITPASS');
    expect(passCompanyOfVisit(visits[6]!, paid)).toBeNull();
    expect(passCompanyOfVisit(visits[5]!, ben)).toBe('FITPASS');
  });

  it('the monthly count per company: visits and people', () => {
    const lines = passVisitLines([asha, ben, paid], visits);
    expect(lines).toHaveLength(5);
    const rows = passMonthRows(lines);
    expect(rows).toEqual([
      { month: '2026-11', company: 'FITPASS', visits: 1, people: 1 },
      { month: '2026-10', company: 'FITPASS', visits: 2, people: 1 },
      { month: '2026-10', company: 'cultpass', visits: 1, people: 1 },
      { month: '2026-08', company: 'FITPASS', visits: 1, people: 1 },
    ]);
    expect(passMonths(rows, TODAY)).toEqual(['2026-11', '2026-10', '2026-08']);
    expect(passMonthLabel('2026-10')).toBe('Oct 2026');
  });

  it('this month is offered even with no pass visit yet', () => {
    expect(passMonths([], TODAY)).toEqual(['2026-11']);
  });

  it('who came in a month, most visits first', () => {
    const people = passPeopleInMonth(passVisitLines([asha, ben, paid], visits), '2026-10');
    expect(people).toEqual([
      { memberId: 'a', name: 'Asha Rao', company: 'FITPASS', visits: 2, lastOn: '2026-10-20' },
      { memberId: 'b', name: 'Ben Das', company: 'cultpass', visits: 1, lastOn: '2026-10-21' },
    ]);
  });

  it('the Excel file: one line per pass visit of the month, oldest first', () => {
    const rows = passExportRows(passVisitLines([asha, ben, paid], visits), '2026-10', (p) => p.replace('+91', ''));
    expect(rows).toEqual([
      ['2026-10-12', 'FITPASS', 'Asha Rao', '9876500001', 'MettleUp app QR'],
      ['2026-10-20', 'FITPASS', 'Asha Rao', '9876500001', 'Front desk'],
      ['2026-10-21', 'cultpass', 'Ben Das', '9876500002', 'Front desk'],
    ]);
  });
});

describe('the desk check-in of a pass member', () => {
  const draft = (over: Partial<MemberDraft>): MemberDraft => ({
    fullName: 'Asha Rao',
    phone: '+919876500001',
    email: null,
    gender: null,
    dateOfBirth: null,
    address: null,
    emergencyName: null,
    emergencyPhone: null,
    joinedOn: TODAY,
    photoUri: null,
    notes: null,
    archived: false,
    ...over,
  });

  it('writes the company on the visit; an ordinary member’s visit has none', async () => {
    let clock = 1_000;
    const db = new LocalCrmData({ store: memoryStore(), now: () => (clock += 1), seed: () => emptySnapshot(0, 'Test Gym') });
    await db.load();
    const a = await db.createMember(draft({ passCompany: 'FITPASS', passSince: TODAY }));
    const b = await db.createMember(draft({ fullName: 'Ben', phone: '+919876500002' }));
    const va = await db.checkIn(a.id, TODAY, 'desk', TODAY);
    const vb = await db.checkIn(b.id, TODAY, 'desk', TODAY);
    expect(va.passCompany).toBe('FITPASS');
    expect(vb.passCompany).toBeUndefined();
    // Checked in twice the same day: still one visit.
    expect((await db.checkIn(a.id, TODAY, 'desk', TODAY)).id).toBe(va.id);
  });
});
