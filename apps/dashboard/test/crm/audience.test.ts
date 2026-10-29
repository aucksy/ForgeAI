/**
 * Messages & offers step 1 (22 Oct 2026): "who gets it", worked out from the gym's own records, and
 * who of them has the app (matched by mobile number the way the server reads numbers).
 */
import { describe, expect, it } from 'vitest';

import {
  appPhones,
  audienceMembers,
  audiencePlans,
  hasApp,
  phone10,
  reachOf,
  everyoneCount,
  startingAudience,
  withoutApp,
  type AudienceData,
} from '../../src/crm/logic/audience';
import { MIN_REGISTER_DAYS } from '../../src/crm/logic/attendance';
import { addDays } from '../../src/crm/logic/dates';
import { buildMemberView } from '../../src/crm/logic/membership';
import type { Member, Membership, Visit } from '../../src/crm/types';
import { makeMember, makeMembership, makePlan, makeVisit } from './fixtures';

const TODAY = '2026-10-22';

const monthly = makePlan({ id: 'plan_m', name: 'Monthly', durationCount: 1, sortOrder: 1 });
const quarterly = makePlan({ id: 'plan_q', name: 'Quarterly', durationCount: 3, sortOrder: 2 });
const pt = makePlan({ id: 'plan_pt', name: 'PT 12', ptSessions: 12, sortOrder: 3 });
const old = makePlan({ id: 'plan_old', name: 'Old plan', active: false, sortOrder: 0 });

const member = (id: string, fullName: string, phone: string, over: Partial<Member> = {}) =>
  makeMember({ id, fullName, phone, joinedOn: addDays(TODAY, -300), ...over });

const asha = member('a', 'Asha Verma', '+919829011111', { batch: 'Morning 6-8' });
const bharat = member('b', 'Bharat Singh', '+919829022222', { batch: 'morning  6-8', dateOfBirth: '1990-10-22' });
const chetan = member('c', 'Chetan Rao', '+919829033333');
const deepa = member('d', 'Deepa Nair', '+919829044444');
const esha = member('e', 'Esha Gupta', '+919829055555');
const farhan = member('f', 'Farhan Ali', '+919829066666', { archived: true });
const gita = member('g', 'Gita Bose', '+919829077777', { appUserId: 'user_g' });

const term = (memberId: string, planId: string, startsOn: string, endsOn: string): Membership =>
  makeMembership({ memberId, planId, planName: planId === 'plan_m' ? 'Monthly' : 'Quarterly', startsOn, endsOn });

const memberships: Membership[] = [
  term('a', 'plan_m', addDays(TODAY, -27), addDays(TODAY, 3)), // ends in 3 days
  term('b', 'plan_q', addDays(TODAY, -30), addDays(TODAY, 60)),
  term('c', 'plan_m', addDays(TODAY, -40), addDays(TODAY, -10)), // ended 10 days ago
  term('d', 'plan_m', addDays(TODAY, -70), addDays(TODAY, -40)), // ended 40 days ago
  term('e', 'plan_q', addDays(TODAY, -30), addDays(TODAY, 60)),
  term('f', 'plan_q', addDays(TODAY, -30), addDays(TODAY, 60)),
];

const visits: Visit[] = [
  // The register is in use (logic/attendance.ts says nothing about a gym that never checks in).
  ...Array.from({ length: MIN_REGISTER_DAYS }, (_, i) => makeVisit({ memberId: 'filler', visitedOn: addDays(TODAY, -i) })),
  makeVisit({ memberId: 'b', visitedOn: addDays(TODAY, -1) }),
  makeVisit({ memberId: 'e', visitedOn: addDays(TODAY, -30) }), // stopped coming
];

const members = [asha, bharat, chetan, deepa, esha, farhan, gita];
const views = members
  .filter((m) => !m.archived)
  .map((m) =>
    buildMemberView(
      m,
      memberships.filter((t) => t.memberId === m.id),
      [],
      visits.filter((v) => v.memberId === m.id),
      TODAY,
    ),
  );
const data: AudienceData = { views, members, memberships, visits, today: TODAY };
const ids = (type: Parameters<typeof audienceMembers>[0]) => audienceMembers(type, data).map((v) => v.member.id);

describe('who gets it', () => {
  it('everyone is every member not archived', () => {
    expect(ids({ type: 'everyone' })).toEqual(['a', 'b', 'c', 'd', 'e', 'g']);
  });

  it('plan running today, ending within 7 days, ended in the last 30 days', () => {
    expect(ids({ type: 'active' })).toEqual(['a', 'b', 'e']);
    expect(ids({ type: 'ending7' })).toEqual(['a']);
    expect(ids({ type: 'ended30' })).toEqual(['c']);
  });

  it('stopped coming is the Away list (a member whose plan ends this week is the renewal list\'s)', () => {
    expect(ids({ type: 'away' })).toEqual(['e']);
  });

  it('birthdays today', () => {
    expect(ids({ type: 'birthday' })).toEqual(['b']);
  });

  it('one plan (running today), one batch (any spelling of it)', () => {
    expect(ids({ type: 'plan', planId: 'plan_m' })).toEqual(['a']);
    expect(ids({ type: 'plan', planId: 'plan_q' })).toEqual(['b', 'e']);
    expect(ids({ type: 'plan', planId: null })).toEqual([]);
    expect(ids({ type: 'batch', batch: 'morning 6-8' })).toEqual(['a', 'b']);
    expect(ids({ type: 'batch', batch: null })).toEqual([]);
  });

  it('a group can be picked by the plans still sold, never a PT add-on', () => {
    expect(audiencePlans([pt, quarterly, old, monthly]).map((p) => p.id)).toEqual(['plan_m', 'plan_q']);
    expect(startingAudience('plan', [quarterly, monthly, pt])).toEqual({ type: 'plan', planId: 'plan_m' });
    expect(startingAudience('plan', [pt])).toEqual({ type: 'everyone' });
    expect(startingAudience('birthday', [])).toEqual({ type: 'birthday' });
  });
});

describe('in the app, or not', () => {
  it('reads a mobile number the way the server does', () => {
    expect(phone10('+91 98290 11111')).toBe('9829011111');
    expect(phone10('098290 11111')).toBe('9829011111');
    expect(phone10('919829011111')).toBe('9829011111');
    expect(phone10('9829011111')).toBe('9829011111');
    expect(phone10('12345')).toBeNull();
    expect(phone10('+1 415 555 0100')).toBeNull();
    expect(phone10(null)).toBeNull();
  });

  const phones = appPhones([{ phone: '98290 11111' }, { phone: '+91 98290 99999' }, { phone: null }]);

  it('matches a member by mobile number, or by an app link already made', () => {
    expect([...phones]).toEqual(['9829011111', '9829099999']);
    expect(hasApp(views.find((v) => v.member.id === 'a')!, phones)).toBe(true);
    expect(hasApp(views.find((v) => v.member.id === 'g')!, phones)).toBe(true);
    expect(hasApp(views.find((v) => v.member.id === 'b')!, phones)).toBe(false);
  });

  it('"Everyone (N)" matches who a send reaches: app members joined only in the app count too', () => {
    const everyone = audienceMembers({ type: 'everyone' }, data);
    const listPhone = everyone.map((v) => v.member.phone).find((p) => p) ?? null;
    // App members already on the list add nobody; one who is not on the list adds one.
    expect(everyoneCount(everyone, [{ phone: listPhone }])).toBe(everyone.length);
    expect(everyoneCount(everyone, [{ phone: listPhone }, { phone: '9111122222' }])).toBe(everyone.length + 1);
    // The owner's case: nobody on the list yet, one member joined in the app.
    expect(everyoneCount([], [{ phone: '9111122222' }])).toBe(1);
    // App members not loaded yet (offline): the list.
    expect(everyoneCount(everyone, null)).toBe(everyone.length);
  });

  it('"In the app: N. Not in the app: M." — for everyone, N is every app member of the gym', () => {
    const everyone = audienceMembers({ type: 'everyone' }, data);
    expect(reachOf({ type: 'everyone' }, everyone, phones, 2)).toEqual({ group: 6, inApp: 2, notInApp: 4, widerInApp: false });
    // 5 app members, some not on the gym's list: the app message still reaches all 5.
    expect(reachOf({ type: 'everyone' }, everyone, phones, 5).inApp).toBe(5);
    // The server's count is the truth for "everyone": an old link on a record does not add to it.
    expect(reachOf({ type: 'everyone' }, everyone, phones, 0).inApp).toBe(0);
    expect(withoutApp(everyone, phones).map((v) => v.member.id)).toEqual(['b', 'c', 'd', 'e']);
  });

  it('a smaller group: its own members with the app, and the app message would reach more', () => {
    const ending = audienceMembers({ type: 'ending7' }, data);
    expect(reachOf({ type: 'ending7' }, ending, phones, 2)).toEqual({ group: 1, inApp: 1, notInApp: 0, widerInApp: true });
  });
});
