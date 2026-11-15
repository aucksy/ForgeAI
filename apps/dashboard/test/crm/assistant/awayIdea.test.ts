// R-593 (live, Crispy Curves, 15 Nov 2026): the AI card's "Not seen for 10+ days: 1" counted a member who JOINED TODAY
// (an annual plan from 15 Nov, no visit yet). Now "never came" counts only when the plan's run and the joining are both
// 10 days old or more. And (owner, 16 Nov: "both are good") the idea names its members and has "See who".
import { describe, expect, it } from 'vitest';

import { answerAsk, awayDays, membersInGroup, type AnswerResult } from '../../../src/crm/assistant/answer';
import type { ToolInputs } from '../../../src/crm/assistant/catalogue';
import { WHO_NAMED, todaySuggestions, whoLines } from '../../../src/crm/assistant/suggestions';
import { coverageStartsOn } from '../../../src/crm/logic/membership';
import type { CrmSnapshot } from '../../../src/crm/data/adapter';
import { makeMember, makeMembership, makeVisit } from '../fixtures';
import { answerData, fixtureGym, TODAY, viewsOf } from './gym';

// TODAY is Thursday 12 Nov 2026.
const away = (over: Partial<ToolInputs['list_members']> = {}): ToolInputs['list_members'] => ({ group: 'away', days: 10, plan: '', batch: '', trainer: '', gender: '', ...over });

/** A gym of the four cases the coordinator listed, plus a renewal after a gap, on an annual plan each. */
function gym(): CrmSnapshot {
  const base = fixtureGym();
  let n = 0;
  const member = (id: string, fullName: string, joinedOn: string) => makeMember({ id, fullName, phone: `+91970000000${(n += 1)}`, joinedOn });
  const annual = (id: string, startsOn: string, endsOn = '2027-11-11') => makeMembership({ id: `ms_${id}`, memberId: id, planName: 'Yearly', startsOn, endsOn });
  const members = [
    member('a_today', 'Digvijay Rathore', TODAY), // joined today, no visit: NOT counted (the live bug)
    member('a_12', 'Kavita Joshi', '2026-10-31'), // joined 12 days ago, no visit: counted
    member('a_11', 'Manoj Yadav', '2026-06-01'), // last came 11 days ago: counted
    member('a_9', 'Sunil Pal', '2026-06-01'), // last came 9 days ago: not
    member('a_back', 'Rekha Das', '2025-01-05'), // a plan long ago, lapsed; a new one from today, never came: not
  ];
  const memberships = [
    annual('a_today', TODAY, '2027-11-11'),
    annual('a_12', '2026-10-31', '2027-10-30'),
    annual('a_11', '2026-06-01', '2027-05-31'),
    annual('a_9', '2026-06-01', '2027-05-31'),
    makeMembership({ id: 'ms_a_back_old', memberId: 'a_back', startsOn: '2025-01-05', endsOn: '2025-02-04' }),
    annual('a_back', TODAY, '2027-11-11'),
  ];
  const visits = [
    makeVisit({ memberId: 'a_11', visitedOn: '2026-11-01', checkedInAt: Date.parse('2026-11-01T07:00:00+05:30') }),
    makeVisit({ memberId: 'a_9', visitedOn: '2026-11-03', checkedInAt: Date.parse('2026-11-03T07:00:00+05:30') }),
  ];
  return { ...base, members, memberships, payments: [], visits };
}

function data() {
  const snapshot = gym();
  const allViews = viewsOf(snapshot);
  return answerData({ snapshot, views: allViews, allViews });
}

const ids = (r: AnswerResult) => (r.kind === 'card' ? r.card.rows.map((x) => x.memberId) : []);

describe('Not seen for 10+ days (R-593)', () => {
  it('joined today with no visit is NOT counted; joined 12 days ago with no visit is; last came 11 days ago is; 9 days is not', () => {
    const d = data();
    const group = (membersInGroup(away(), d) ?? []).map((v) => v.member.id);
    expect(group).toEqual(['a_12', 'a_11']);
    expect(group).not.toContain('a_today');
    expect(group).not.toContain('a_9');
    // A new plan from today after a long gap: they have not had 10 days either.
    expect(group).not.toContain('a_back');
    // The assistant's own answer is the same list (one rule for the idea and the question).
    expect(ids(answerAsk('list_members', away(), d))).toEqual(['a_12', 'a_11']);
  });

  it('the days are counted from the last visit, else from the later of the plan run start and joining', () => {
    const d = data();
    const v = (id: string) => d.views.find((x) => x.member.id === id)!;
    const terms = (id: string) => d.snapshot.memberships.filter((m) => m.memberId === id);
    expect(awayDays(v('a_today'), terms('a_today'), TODAY)).toBe(0);
    expect(awayDays(v('a_12'), terms('a_12'), TODAY)).toBe(12);
    expect(awayDays(v('a_11'), terms('a_11'), TODAY)).toBe(11);
    expect(awayDays(v('a_9'), terms('a_9'), TODAY)).toBe(9);
    expect(awayDays(v('a_back'), terms('a_back'), TODAY)).toBe(0);
  });

  it('a shorter window works the same way ("5 din se kaun nahi aaya")', () => {
    expect((membersInGroup(away({ days: 5 }), data()) ?? []).map((x) => x.member.id)).toEqual(['a_12', 'a_11', 'a_9']);
  });

  it('the run of back-to-back terms starts at its first term; a gap starts a new run', () => {
    const t = (startsOn: string, endsOn: string) => makeMembership({ startsOn, endsOn });
    expect(coverageStartsOn([t('2026-09-01', '2026-09-30'), t('2026-10-01', '2026-10-31'), t('2026-11-01', '2026-11-30')], TODAY)).toBe('2026-09-01');
    expect(coverageStartsOn([t('2026-08-01', '2026-08-31'), t('2026-11-01', '2026-11-30')], TODAY)).toBe('2026-11-01');
    expect(coverageStartsOn([t('2026-08-01', '2026-08-31')], TODAY)).toBeNull();
    expect(coverageStartsOn([{ ...t('2026-09-01', '2026-11-30'), cancelled: true }], TODAY)).toBeNull();
  });
});

describe('the idea names its members and has "See who" (R-593)', () => {
  it('1-3 members: each by first name with their days; the number agrees', () => {
    const idea = todaySuggestions(data()).find((s) => s.id === 'away')!;
    expect(idea.count).toBe(2);
    expect(idea.words).toEqual({ text: 'Not seen for {days}+ days: {n}', vars: { days: 10, n: 2 } });
    expect(idea.who).toEqual([
      { text: '{name}: joined {days} days ago, no visit yet', vars: { name: 'Kavita', days: 12 } },
      { text: '{name}: no visit in {days} days', vars: { name: 'Manoj', days: 11 } },
    ]);
    expect(idea.show).toEqual({ tool: 'list_members', input: away() });
  });

  it('more than 3: two names and how many more', () => {
    const views = viewsOf(fixtureGym()).filter((v) => !v.member.archived);
    expect(views.length).toBeGreaterThan(WHO_NAMED);
    expect(whoLines(views)).toEqual([{ text: '{names} and {n} more', vars: { names: 'Preeti, Pooja', n: views.length - 2 } }]);
    expect(whoLines(views.slice(0, 2))).toEqual([{ text: '{names}', vars: { names: 'Preeti, Pooja' } }]);
    expect(whoLines([])).toEqual([]);
  });

  it('two shown with the same first name get their full names', () => {
    const rahuls = viewsOf(fixtureGym()).filter((v) => v.member.fullName.startsWith('Rahul'));
    expect(whoLines(rahuls)).toEqual([{ text: '{names}', vars: { names: 'Rahul Singh, Rahul Mehta' } }]);
  });

  it('every member idea has its list; a festival, the fees and the week name nobody', () => {
    const s = todaySuggestions(answerData());
    for (const idea of s) {
      if (idea.id === 'dues' || idea.id === 'festival' || idea.id === 'week') {
        expect(idea.who, idea.id).toEqual([]);
        expect(idea.show, idea.id).toBeNull();
      } else {
        expect(idea.who.length, idea.id).toBeGreaterThan(0);
        expect(idea.show?.tool, idea.id).toBe('list_members');
      }
    }
    expect(s.find((x) => x.id === 'birthdays')?.who).toEqual([{ text: '{names}', vars: { names: 'Preeti' } }]);
  });
});
