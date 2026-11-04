import { describe, expect, it } from 'vitest';

import {
  endsLine,
  hasQaPassStandIn,
  keptLine,
  membershipFromRow,
  membershipView,
  QA_PASS_STAND_IN_NOTE,
  RENEW_SOON_DAYS,
  withQaPassStandIn,
} from '@/shop/membership';

const today = '2026-10-18';
const row = (over: Record<string, unknown> = {}) => ({
  ok: true,
  gymName: "RAM'S FITNESS",
  memberName: 'Asha',
  day: today,
  current: { planName: 'Quarterly + PT', startsOn: '2026-08-01', endsOn: '2026-10-30', ptSessions: 12, ptUsed: 3, trainer: 'Ravi' },
  next: null,
  lastEndedOn: '2026-07-31',
  visitsThisMonth: 9,
  ...over,
});
const view = (over: Record<string, unknown> = {}) => membershipView(membershipFromRow(row(over))!);

describe('My membership (OWNER-INBOX #6): reading the answer', () => {
  it('reads a full answer', () => {
    const a = membershipFromRow(row());
    expect(a).toMatchObject({ ok: true, day: today, current: { planName: 'Quarterly + PT', ptSessions: 12, ptUsed: 3, trainer: 'Ravi' }, visitsThisMonth: 9 });
  });
  it('reads the three "can\'t show it" answers', () => {
    for (const problem of ['NO_PHONE', 'NOT_ON_ROSTER', 'GYM_NOT_ONLINE', 'NAME_MISMATCH', 'SHARED_NUMBER']) {
      expect(membershipFromRow({ error: problem, gymName: 'G' })).toEqual({ ok: false, problem, gymName: 'G' });
    }
  });
  it('refuses what it cannot trust', () => {
    expect(membershipFromRow(null)).toBeNull();
    expect(membershipFromRow({ error: 'SOMETHING' })).toBeNull();
    expect(membershipFromRow(row({ day: '18/10/2026' }))).toBeNull();
    // A plan whose dates can't be read hides the card (never a wrong "No plan yet"); bad counts are none.
    expect(membershipFromRow(row({ current: { planName: 'X', startsOn: 'x', endsOn: '2026-10-30' } }))).toBeNull();
    expect(membershipFromRow(row({ visitsThisMonth: -2 }))).toMatchObject({ visitsThisMonth: 0 });
  });
  it('never carries money, even if the server sent some', () => {
    const a = membershipFromRow(row({ priceP: 900000, current: { ...row().current, priceP: 900000 } }));
    expect(JSON.stringify(a)).not.toMatch(/price/i);
  });
});

describe('My membership: the words', () => {
  it('a plan with time left: its name, the end, days left, PT and visits', () => {
    expect(view()).toEqual({
      tone: 'good',
      title: 'Quarterly + PT',
      when: 'Ends 30 Oct · 12 days left',
      lines: ['Personal training: 3 of 12 used, with Ravi.', '9 days at the gym this month.'],
    });
  });
  it(`within ${RENEW_SOON_DAYS} days: asks to renew, unless the next plan is already paid`, () => {
    const soon = view({ current: { ...row().current, endsOn: '2026-10-23', ptSessions: null } });
    expect(soon.tone).toBe('soon');
    expect(soon.lines[0]).toBe('Renew at the desk before it ends.');
    const paid = view({ current: { ...row().current, endsOn: '2026-10-23', ptSessions: null }, next: { planName: 'Quarterly', startsOn: '2026-10-24', endsOn: '2027-01-23' } });
    expect(paid.tone).toBe('good');
    expect(paid.lines).toEqual(['Next: Quarterly, from 24 Oct.', '9 days at the gym this month.']);
  });
  it('ends today and tomorrow, and dates in another year carry the year', () => {
    expect(endsLine('2026-10-18', today)).toBe('Ends today, 18 Oct');
    expect(endsLine('2026-10-19', today)).toBe('Ends tomorrow, 19 Oct');
    expect(endsLine('2027-01-17', today)).toBe('Ends 17 Jan 2027 · 91 days left');
  });
  it('no plan today: the paid one ahead, else when it ended, else ask the desk', () => {
    expect(view({ current: null, next: { planName: 'Monthly', startsOn: '2026-10-20', endsOn: '2026-11-19' } })).toMatchObject({ tone: 'good', title: 'Monthly', when: 'Starts 20 Oct' });
    expect(view({ current: null })).toMatchObject({ tone: 'ended', title: 'Your plan has ended', when: 'Ended 31 Jul', lines: ['Renew at the desk to keep training.', '9 days at the gym this month.'] });
    expect(view({ current: null, lastEndedOn: null })).toMatchObject({ tone: 'none', title: 'No plan yet' });
  });
  it('PT never shows more used than bought; one day reads "1 day"', () => {
    expect(view({ current: { ...row().current, ptUsed: 14, trainer: null }, visitsThisMonth: 1 }).lines).toEqual(['Personal training: 12 of 12 used.', '1 day at the gym this month.']);
    expect(view({ visitsThisMonth: 0 }).lines.at(-1)).toBe('No days at the gym yet this month.');
  });
  it('the problems say what to do', () => {
    expect(membershipView({ ok: false, problem: 'NO_PHONE', gymName: 'G' }).lines[0]).toMatch(/Scan G's check-in QR/);
    expect(membershipView({ ok: false, problem: 'NOT_ON_ROSTER', gymName: 'G' }).lines[0]).toMatch(/Ask the desk/);
    expect(membershipView({ ok: false, problem: 'GYM_NOT_ONLINE', gymName: 'G' }).title).toBe('Not available yet');
    // Never names the other person on the gym's list.
    expect(membershipView({ ok: false, problem: 'NAME_MISMATCH', gymName: 'G' })).toMatchObject({ title: 'Ask the desk to check your name' });
    expect(membershipView({ ok: false, problem: 'SHARED_NUMBER', gymName: 'G' }).lines[0]).toMatch(/own/);
  });
  it('member words never say volume, PR or session', () => {
    const all = [view(), view({ current: null }), membershipView({ ok: false, problem: 'NO_PHONE', gymName: 'G' })].flatMap((v) => [v.title, v.when ?? '', ...v.lines]).join(' ');
    expect(all).not.toMatch(/\bvolume\b|\bPR\b|\bsession/i);
  });
  it('an answer kept from before says so', () => {
    const at = new Date(2026, 9, 18, 18, 42).getTime();
    expect(keptLine(at, at + 3600_000, () => '6:42 pm')).toBe('No internet. As of 6:42 pm today.');
    expect(keptLine(at, at + 2 * 86400_000, () => '6:42 pm')).toMatch(/earlier day/);
  });
});

describe('My membership: a pass member (F123, supabase 0055)', () => {
  it('reads the pass company; a server without 0055 sends none', () => {
    expect(membershipFromRow(row({ pass: '  FITPASS ' }))).toMatchObject({ ok: true, pass: 'FITPASS' });
    expect(membershipFromRow(row())).toMatchObject({ ok: true, pass: null });
    expect(membershipFromRow(row({ pass: 42 }))).toMatchObject({ pass: null });
  });
  it('no plan to renew: the company, the QR, and the days at the gym', () => {
    expect(view({ current: null, lastEndedOn: '2026-07-31', pass: 'FITPASS' })).toEqual({
      tone: 'good',
      title: 'FITPASS member',
      when: null,
      lines: [
        "You train at RAM'S FITNESS with FITPASS. There is no plan to renew.",
        "Scan the gym's check-in QR when you arrive. The gym counts it as a FITPASS visit.",
        '9 days at the gym this month.',
      ],
    });
  });
  it('an old plan still running does not win: the desk moved them to a pass (as the admin panel shows them)', () => {
    const v = view({ pass: 'cultpass' });
    expect(v.title).toBe('cultpass member');
    expect(v.lines.join(' ')).not.toMatch(/Renew/);
  });
});

describe('My membership: the F123 device-UAT stand-in (QA builds only)', () => {
  const stand = (over: Record<string, unknown> = {}) =>
    membershipFromRow(row({ current: { planName: 'QA pass stand-in: FITPASS', startsOn: '2026-10-17', endsOn: '2026-11-17' }, ...over }))!;
  it('only a build with the flag uses it', () => {
    expect(hasQaPassStandIn({ qaStandIns: ['friendInvite', 'passMember'] })).toBe(true);
    expect(hasQaPassStandIn({ qaStandIns: ['friendInvite'] })).toBe(false);
    expect(hasQaPassStandIn(undefined)).toBe(false);
    expect(withQaPassStandIn(stand(), false)).toEqual(stand());
  });
  it('reads the stand-in plan as the pass, and says on screen it is test data', () => {
    const a = withQaPassStandIn(stand(), true);
    expect(a).toMatchObject({ ok: true, pass: 'FITPASS', current: null, qaStandIn: true });
    const v = membershipView(a);
    expect(v.title).toBe('FITPASS member');
    expect(v.lines[v.lines.length - 1]).toBe(QA_PASS_STAND_IN_NOTE);
  });
  it('a real plan, or a server that already says the pass (0055 live), is left alone', () => {
    const real = membershipFromRow(row())!;
    expect(withQaPassStandIn(real, true)).toBe(real);
    const live = stand({ pass: 'FITPASS' });
    expect(withQaPassStandIn(live, true)).toBe(live);
    expect(membershipView(live).lines).not.toContain(QA_PASS_STAND_IN_NOTE);
  });
});
