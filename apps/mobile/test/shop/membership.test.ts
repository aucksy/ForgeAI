import { describe, expect, it } from 'vitest';

import { endsLine, keptLine, membershipFromRow, membershipView, RENEW_SOON_DAYS } from '@/shop/membership';

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
