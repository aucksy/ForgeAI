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

// R-600 (fresh eyes, 16 Nov 2026): a member who rejoined showed "joined 14 days ago" (the new plan's start), though they
// joined in March 2025. The shown number is the real joining day; who is counted is unchanged (both 10+ days old).
describe('"joined N days ago" counts from the joining day (R-600)', () => {
  function rejoinGym(): CrmSnapshot {
    const base = fixtureGym();
    const members = [
      makeMember({ id: 'r_back', fullName: 'Rekha Das', phone: '+919700000011', joinedOn: '2025-03-01' }),
      makeMember({ id: 'r_new', fullName: 'Kavita Joshi', phone: '+919700000012', joinedOn: '2026-10-31' }),
    ];
    const memberships = [
      makeMembership({ id: 'ms_r_back_old', memberId: 'r_back', startsOn: '2025-03-01', endsOn: '2025-03-31' }),
      // Rejoined after a long gap: this run started 14 days ago, and they have not come since.
      makeMembership({ id: 'ms_r_back', memberId: 'r_back', planName: 'Yearly', startsOn: '2026-10-29', endsOn: '2027-10-28' }),
      makeMembership({ id: 'ms_r_new', memberId: 'r_new', planName: 'Yearly', startsOn: '2026-10-31', endsOn: '2027-10-30' }),
    ];
    return { ...base, members, memberships, payments: [], visits: [] };
  }
  const rejoinData = () => {
    const snapshot = rejoinGym();
    const allViews = viewsOf(snapshot);
    return answerData({ snapshot, views: allViews, allViews });
  };

  it('a rejoined member shows the days since they first joined; a new member the days since joining', () => {
    const d = rejoinData();
    const group = (membersInGroup(away(), d) ?? []).map((v) => v.member.id).sort();
    expect(group).toEqual(['r_back', 'r_new']);
    const idea = todaySuggestions(d).find((s) => s.id === 'away')!;
    expect(idea.count).toBe(2);
    // 1 Mar 2025 to 12 Nov 2026 is 621 days (not 14, the new plan's start).
    expect(idea.who).toContainEqual({ text: '{name}: joined {days} days ago, no visit yet', vars: { name: 'Rekha', days: 621 } });
    expect(idea.who).toContainEqual({ text: '{name}: joined {days} days ago, no visit yet', vars: { name: 'Kavita', days: 12 } });
  });

  it('the counting rule is unchanged: a rejoin whose new plan is under 10 days old is not counted', () => {
    const snapshot = rejoinGym();
    const memberships = snapshot.memberships.map((m) => (m.id === 'ms_r_back' ? { ...m, startsOn: '2026-11-05' } : m));
    const s2 = { ...snapshot, memberships };
    const allViews = viewsOf(s2);
    const d = answerData({ snapshot: s2, views: allViews, allViews });
    expect((membersInGroup(away(), d) ?? []).map((v) => v.member.id)).toEqual(['r_new']);
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

// R-608 (owner, 16 Nov 2026: "the birthdays are set to be automated but the AI assistant is still suggesting that"): with
// the gym's automatic birthday wish on, a member whose app is linked to their record (appUserId) is wished by their own
// phone at 9:30 am. The birthday idea then counts, names, asks for and lists only the others; none left: no idea.
// Off, or not known (offline, still loading): every birthday, as before.
describe('R-608 the birthday idea with the automatic birthday wish', () => {
  /** Preeti (birthday today, no app linked) and Arjun (birthday today, app linked). */
  function bdayGym(preetiApp = false): CrmSnapshot {
    const base = fixtureGym();
    const members = base.members.map((m) => (m.id === 'm_preeti' && preetiApp ? { ...m, appUserId: 'user_preeti' } : m));
    members.push(makeMember({ id: 'm_arjun', fullName: 'Arjun Nair', phone: '+919800000099', dateOfBirth: '1992-11-12', joinedOn: '2026-01-05', appUserId: 'user_arjun' }));
    return { ...base, members };
  }
  const idea = (birthdayAuto: boolean | null | undefined, preetiApp = false) =>
    todaySuggestions(answerData({ snapshot: bdayGym(preetiApp), birthdayAuto })).find((s) => s.id === 'birthdays');
  const listCard = (r: AnswerResult) => {
    if (r.kind !== 'card') throw new Error(`expected a card, got ${r.kind}`);
    return r.card;
  };
  const birthdayList = (over: Partial<ToolInputs['list_members']> & { withoutAutoWish?: boolean } = {}) => ({ group: 'birthday_today' as const, days: 0, plan: '', batch: '', trainer: '', gender: '' as const, ...over });

  it('switch on, one with the app and one without: the idea is about the one without, and See who lists the same', () => {
    const s = idea(true)!;
    expect(s.count).toBe(1);
    expect(s.words).toEqual({ text: 'Birthdays today, not in the app: {n}', vars: { n: 1 } });
    expect(s.action).toEqual({ text: 'Write birthday wishes' });
    expect(s.who).toEqual([{ text: '{names}', vars: { names: 'Preeti' } }]);
    expect(s.request).toBe('Send birthday wishes to Preeti Sharma');
    expect(s.show?.input.withoutAutoWish).toBe(true);
    const d = answerData({ snapshot: bdayGym(), birthdayAuto: true });
    const card = listCard(answerAsk('list_members', s.show!.input, d));
    expect(card.rows.map((r) => r.memberId)).toEqual(['m_preeti']);
    expect(card.headline).toEqual({ text: 'Birthdays today, not in the app' });
    expect(card.followUps).toEqual([{ label: { text: 'Send birthday wishes' }, request: 'Send birthday wishes to Preeti Sharma' }]);
  });

  it('switch on and every birthday member has the app: no birthday idea at all', () => {
    expect(idea(true, true)).toBeUndefined();
  });

  it('switch off: every birthday, as before', () => {
    const s = idea(false)!;
    expect(s.count).toBe(2);
    expect(s.words).toEqual({ text: 'Birthdays today: {n}', vars: { n: 2 } });
    expect(s.request).toBe('Send birthday wishes to members whose birthday is today');
    expect(s.show?.input.withoutAutoWish).toBeUndefined();
    const card = listCard(answerAsk('list_members', s.show!.input, answerData({ snapshot: bdayGym(), birthdayAuto: false })));
    expect(card.rows.map((r) => r.memberId).sort()).toEqual(['m_arjun', 'm_preeti']);
  });

  it('not known (offline, loading, an old server): every birthday, as before', () => {
    for (const notKnown of [null, undefined]) {
      const s = idea(notKnown)!;
      expect(s.count, String(notKnown)).toBe(2);
      expect(s.words.text).toBe('Birthdays today: {n}');
      expect(s.request).toBe('Send birthday wishes to members whose birthday is today');
    }
  });

  it('"whose birthday is today?" still lists everyone; with the switch on each app member says so, and the button asks only for the rest', () => {
    const on = listCard(answerAsk('list_members', birthdayList(), answerData({ snapshot: bdayGym(), birthdayAuto: true })));
    expect(on.rows.map((r) => r.memberId).sort()).toEqual(['m_arjun', 'm_preeti']);
    expect(on.rows.find((r) => r.memberId === 'm_arjun')?.detail).toEqual({ text: 'Gets the automatic wish at 9:30 am' });
    expect(on.rows.find((r) => r.memberId === 'm_preeti')?.detail).toBeNull();
    expect(on.followUps).toEqual([{ label: { text: 'Wish the ones not in the app' }, request: 'Send birthday wishes to Preeti Sharma' }]);
    const allApp = listCard(answerAsk('list_members', birthdayList(), answerData({ snapshot: bdayGym(true), birthdayAuto: true })));
    expect(allApp.rows).toHaveLength(2);
    expect(allApp.followUps).toEqual([]);
    const off = listCard(answerAsk('list_members', birthdayList(), answerData({ snapshot: bdayGym(), birthdayAuto: false })));
    expect(off.followUps).toEqual([{ label: { text: 'Send birthday wishes' }, request: 'Send birthday wishes to members whose birthday is today' }]);
    expect(off.rows.every((r) => r.detail === null)).toBe(true);
  });

  it('a message drafted for "birthday_today" (the AI picked the group) still reaches every birthday member', () => {
    const group = membersInGroup(birthdayList(), answerData({ snapshot: bdayGym(), birthdayAuto: true }));
    expect(group?.map((v) => v.member.id).sort()).toEqual(['m_arjun', 'm_preeti']);
  });
});
