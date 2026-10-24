/**
 * R-86: automatic reminders from the gym — which ones, when, the priority, one a day, renewals and
 * leaving, and the defaults when the gym's server has no 0029 yet. Pure planner (shop/autoReminders.ts).
 */
import { describe, expect, it } from 'vitest';

import {
  AUTO_CASES,
  AUTO_WORDS,
  CASE_NUMBERS,
  DEFAULT_ON,
  GYM_REMINDER_PREFIX,
  OLD_GYM_REMINDER_PREFIX,
  HORIZON_DAYS,
  autoAnswerFromRow,
  autoAnswerToRow,
  defaultAutoSettings,
  deliveredOnly,
  firstSlotDay,
  fallbackAnswer,
  gymRemindersCaption,
  nextYearly,
  planGymReminders,
  settingsFromRow,
  type AutoSettings,
  type MemberDates,
  type PlanInput,
} from '@/shop/autoReminders';
import { membershipFromRow, type MembershipAnswer } from '@/shop/membership';
import { offersFromRow, type OffersAnswer } from '@/shop/offer';

const GYM = "RAM'S FITNESS";
/** Friday 23 Oct 2026, 8:00 am local: today's 9:30 is still ahead. */
const EARLY = new Date(2026, 9, 23, 8, 0);
/** The same day at 11:00: today's 9:30 has gone. */
const LATE = new Date(2026, 9, 23, 11, 0);

function plan(over: Record<string, unknown> = {}): MembershipAnswer {
  return membershipFromRow({
    ok: true,
    gymName: GYM,
    memberName: 'Asha',
    day: '2026-10-23',
    current: { planName: 'Monthly', startsOn: '2026-10-03', endsOn: '2026-11-02', ptSessions: null, ptUsed: 0, trainer: null },
    next: null,
    lastEndedOn: '2026-10-02',
    visitsThisMonth: 9,
    ...over,
  })!;
}

const NO_DATES: MemberDates = { birthday: null, joinedOn: null, lastVisitOn: null };

function settings(change: Partial<Record<(typeof AUTO_CASES)[number], { on: boolean; days?: number[] }>> = {}): AutoSettings {
  return settingsFromRow(change);
}

function input(over: Partial<PlanInput> = {}): PlanInput {
  return { now: EARLY, memberId: 'm1', gymName: GYM, settings: defaultAutoSettings(), membership: plan(), dates: NO_DATES, offer: null, sent: {}, ...over };
}

const kinds = (o: PlanInput) => planGymReminders(o).reminders.map((r) => `${r.day} ${r.kase}`);

function offer(me: Record<string, unknown> | null, over: Record<string, unknown> = {}): OffersAnswer {
  return offersFromRow({
    ok: true,
    gymName: GYM,
    canJoin: me ? 'JOINED' : 'yes',
    offer: { id: 'o1', title: 'T', workouts: 10, windowDays: 30, rewardDays: 3, minMinutes: 20, minSets: 6, joinUntil: '2026-11-30', countAppCheckins: true, open: true },
    me: me && { joinedOn: '2026-10-10', windowEndsOn: '2026-11-08', counted: 4, days: [], left: false, earned: false, given: false, givenDays: null, newEnd: null, undone: false, ...me },
    ...over,
  })!;
}

describe('the switches', () => {
  it('starts the common ones on and the touchy ones off', () => {
    const d = defaultAutoSettings();
    expect(AUTO_CASES.filter((c) => d[c].on)).toEqual(['birthday', 'plan_ends_today', 'plan_ends_soon', 'plan_ended', 'offer_reward', 'welcome']);
    expect(d.plan_ends_soon.days).toEqual([7, 3]);
    expect(d.plan_ended.days).toEqual([7, 1]);
    expect(d.miss_you).toEqual({ on: false, days: [14] });
    expect(d.birthday.days).toEqual([]);
    for (const c of AUTO_CASES) expect(d[c].on).toBe(DEFAULT_ON[c]);
  });

  it("reads the owner's saved switches over the defaults; a bad entry keeps its default", () => {
    const s = settingsFromRow({
      birthday: { on: false },
      plan_ends_soon: { on: true, days: [1, 30, 1, 31, 0, 2.5, 'x', 14] },
      miss_you: { on: true, days: [10] },
      welcome: { on: 'yes' },
      nonsense: { on: true },
    });
    expect(s.birthday.on).toBe(false);
    // Out of range dropped, repeats dropped, largest first, at most 3.
    expect(s.plan_ends_soon.days).toEqual([30, 14, 1]);
    expect(s.miss_you).toEqual({ on: true, days: [10] });
    expect(s.welcome.on).toBe(true);
    expect(settingsFromRow(null)).toEqual(defaultAutoSettings());
    expect(settingsFromRow({ plan_ended: { on: true, days: [] } }).plan_ended.days).toEqual([7, 1]);
  });

  it('reads the server answer; no answer (a server before 0029) is the defaults with no dates', () => {
    const a = autoAnswerFromRow({ ok: true, day: '2026-10-23', settings: { birthday: { on: false } }, birthday: '03-09', joinedOn: '2025-10-20', lastVisitOn: '2026-10-20' });
    expect(a).toMatchObject({ saved: true, dates: { birthday: '03-09', joinedOn: '2025-10-20', lastVisitOn: '2026-10-20' } });
    expect(a!.settings.birthday.on).toBe(false);
    expect(autoAnswerFromRow(autoAnswerToRow(a!))).toEqual(a);
    const none = autoAnswerFromRow({ ok: true, settings: null, birthday: '1994-03-09', joinedOn: 'x', lastVisitOn: null });
    expect(none).toEqual({ settings: defaultAutoSettings(), saved: false, dates: NO_DATES });
    expect(autoAnswerFromRow({ error: 'X' })).toBeNull();
    expect(fallbackAnswer()).toEqual({ settings: defaultAutoSettings(), saved: false, dates: NO_DATES });
  });

  it('every case with a number has a sensible range', () => {
    for (const [c, n] of Object.entries(CASE_NUMBERS)) {
      expect(n!.min, c).toBeGreaterThanOrEqual(1);
      expect(n!.default.every((d) => d >= n!.min && d <= n!.max), c).toBe(true);
      expect(n!.default.length, c).toBeLessThanOrEqual(n!.most);
    }
  });
});

describe('the plan ending', () => {
  it('7 and 3 days before, on the day, and 1 and 7 days after (the defaults)', () => {
    expect(kinds(input())).toEqual(['2026-10-26 plan_ends_soon', '2026-10-30 plan_ends_soon', '2026-11-02 plan_ends_today', '2026-11-03 plan_ended', '2026-11-09 plan_ended']);
  });

  it('at 9:30 am local, one id per day, titled with the gym', () => {
    const r = planGymReminders(input()).reminders[0];
    const at = new Date(r.at);
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2026, 9, 26, 9, 30]);
    expect(r.id).toBe(`${GYM_REMINDER_PREFIX}2026-10-26`);
    expect(r.title).toBe(GYM);
    expect(r.body).toBe('Your plan ends in 7 days, on 2 Nov. Renew at the desk to keep training.');
  });

  it('a renewal already paid cancels every plan reminder', () => {
    const renewed = plan({ next: { planName: 'Monthly', startsOn: '2026-11-03', endsOn: '2026-12-02' } });
    expect(kinds(input({ membership: renewed }))).toEqual([]);
  });

  it("follows the owner's days and switches", () => {
    const s = settings({ plan_ends_soon: { on: true, days: [1] }, plan_ends_today: { on: false }, plan_ended: { on: false } });
    expect(kinds(input({ settings: s }))).toEqual(['2026-11-01 plan_ends_soon']);
    expect(planGymReminders(input({ settings: s })).reminders[0].body).toBe('Your plan ends tomorrow. Renew at the desk to keep training.');
  });

  it("never sets a morning that has passed: at 11 am today's is skipped", () => {
    const ends = plan({ current: { planName: 'M', startsOn: '2026-09-24', endsOn: '2026-10-23', ptSessions: null, ptUsed: 0 } });
    expect(kinds(input({ membership: ends, now: EARLY }))[0]).toBe('2026-10-23 plan_ends_today');
    expect(kinds(input({ membership: ends, now: LATE }))[0]).toBe('2026-10-24 plan_ended');
  });

  it('a plan that already ended: 1 and 7 days after its end, then stop', () => {
    const lapsed = plan({ current: null, lastEndedOn: '2026-10-22' });
    expect(kinds(input({ membership: lapsed }))).toEqual(['2026-10-23 plan_ended', '2026-10-29 plan_ended']);
    expect(planGymReminders(input({ membership: lapsed })).reminders[0].body).toBe('Your plan ended on 22 Oct. Renew at the desk to keep your progress going.');
    expect(kinds(input({ membership: plan({ current: null, lastEndedOn: '2026-08-01' }) }))).toEqual([]);
  });

  it('nothing without a plan the gym can show (no check-in yet, a name mismatch...)', () => {
    const notYet = membershipFromRow({ error: 'NO_PHONE', gymName: GYM })!;
    expect(kinds(input({ membership: notYet }))).toEqual([]);
    expect(kinds(input({ membership: null }))).toEqual([]);
  });
});

describe('one a day, by priority', () => {
  it('a birthday on the plan\'s last day wins; the plan reminder that day is dropped', () => {
    const r = planGymReminders(input({ dates: { ...NO_DATES, birthday: '11-02' } })).reminders;
    expect(r.map((x) => `${x.day} ${x.kase}`)).toContain('2026-11-02 birthday');
    expect(r.filter((x) => x.day === '2026-11-02')).toHaveLength(1);
    expect(r.find((x) => x.kase === 'birthday')!.body).toBe("Happy birthday, Asha! Best wishes from all of us at RAM'S FITNESS.");
  });

  it('never two on one day, over many crowded inputs', () => {
    const all = settingsFromRow(Object.fromEntries(AUTO_CASES.map((c) => [c, { on: true }])));
    const r = planGymReminders(
      input({
        settings: all,
        dates: { birthday: '10-26', joinedOn: '2025-10-30', lastVisitOn: '2026-10-01' },
        membership: plan({ current: { planName: 'PT 12', startsOn: '2026-10-20', endsOn: '2026-11-02', ptSessions: 12, ptUsed: 11 }, lastEndedOn: null }),
        offer: offer({ counted: 9, given: false }),
      }),
    ).reminders;
    const days = r.map((x) => x.day);
    expect(new Set(days).size).toBe(days.length);
    expect(r.map((x) => x.id)).toEqual(days.map((d) => `${GYM_REMINDER_PREFIX}${d}`));
    for (const x of r) expect(new Date(x.at).getHours()).toBe(9);
  });

  it('one-off news moves to the next free morning', () => {
    // Joined 2 days ago (a new member): the welcome wants today, but plan reminders hold the next days.
    const busy = plan({ current: { planName: 'M', startsOn: '2026-10-21', endsOn: '2026-10-24', ptSessions: null, ptUsed: 0 }, lastEndedOn: null });
    const s = settings({ plan_ends_soon: { on: true, days: [1] } });
    expect(kinds(input({ membership: busy, settings: s, dates: { ...NO_DATES, joinedOn: '2026-10-21' } }))).toEqual([
      '2026-10-23 plan_ends_soon',
      '2026-10-24 plan_ends_today',
      '2026-10-25 plan_ended',
      '2026-10-26 welcome',
      '2026-10-31 plan_ended',
    ]);
  });

  it('sets nothing beyond the 60-day window', () => {
    const far = plan({ current: { planName: 'Yearly', startsOn: '2026-01-01', endsOn: '2026-12-31', ptSessions: null, ptUsed: 0 } });
    expect(kinds(input({ membership: far }))).toEqual([]);
    const r = planGymReminders(input({ dates: { ...NO_DATES, birthday: '10-24' } })).reminders;
    expect(r.every((x) => x.day <= '2026-12-21')).toBe(true);
    expect(HORIZON_DAYS).toBe(60);
  });
});

describe('welcome, birthday, one year', () => {
  it('welcomes a phone that joined the gym in the app this week, once, never again after it came', () => {
    const fresh = input({ appJoinedAt: new Date(2026, 9, 22, 18, 0).getTime(), membership: null });
    const first = planGymReminders(fresh);
    expect(first.reminders.map((r) => `${r.day} ${r.kase}`)).toEqual(['2026-10-23 welcome']);
    expect(first.reminders[0].body).toBe("Welcome to RAM'S FITNESS! Your plan and the gym's news are in MettleUp.");
    expect(first.sent).toEqual({ 'welcome:m1': '2026-10-23' });
    // The next day: it was delivered (its morning passed), so it is not set again.
    const next = planGymReminders({ ...fresh, now: new Date(2026, 9, 24, 8, 0), sent: first.sent });
    expect(next.reminders).toEqual([]);
    expect(next.sent).toEqual({ 'welcome:m1': '2026-10-23' });
    // Joined in the app 10 days ago, or before R-86 (no record): no welcome.
    expect(kinds(input({ appJoinedAt: new Date(2026, 9, 13, 18, 0).getTime(), membership: null }))).toEqual([]);
    expect(kinds(input({ appJoinedAt: null, membership: null }))).toEqual([]);
  });

  it('review SHOULD 1: a recent "joined on" alone is not a new member; the plan must be new too', () => {
    // The admin app filled "joined on" with today on import: a long-time member, plan from August.
    const old = plan({ current: { planName: 'Yearly', startsOn: '2026-08-01', endsOn: '2027-07-31', ptSessions: null, ptUsed: 0 } });
    expect(kinds(input({ membership: old, dates: { ...NO_DATES, joinedOn: '2026-10-22' } }))).toEqual([]);
    expect(kinds(input({ membership: null, dates: { ...NO_DATES, joinedOn: '2026-10-22' } }))).toEqual([]);
    // Joined this week AND the plan started this week: welcome.
    const fresh = plan({ current: { planName: 'Monthly', startsOn: '2026-10-22', endsOn: '2027-01-21', ptSessions: null, ptUsed: 0 }, lastEndedOn: null });
    expect(kinds(input({ membership: fresh, dates: { ...NO_DATES, joinedOn: '2026-10-22' } }))).toEqual(['2026-10-23 welcome']);
    // A new plan this week but joined long ago (a renewal after a gap): no welcome.
    expect(kinds(input({ membership: fresh, dates: { ...NO_DATES, joinedOn: '2024-01-10' } }))).toEqual([]);
  });

  it('without the gym list (server before 0029), a first plan that started this week is a new member', () => {
    const firstPlan = plan({ current: { planName: 'M', startsOn: '2026-10-21', endsOn: '2027-01-20', ptSessions: null, ptUsed: 0 }, lastEndedOn: null });
    expect(kinds(input({ membership: firstPlan }))).toEqual(['2026-10-23 welcome']);
    // A renewal is not a new member.
    const renewal = plan({ current: { planName: 'M', startsOn: '2026-10-21', endsOn: '2027-01-20', ptSessions: null, ptUsed: 0 }, lastEndedOn: '2026-10-20' });
    expect(kinds(input({ membership: renewal }))).toEqual([]);
  });

  it('a one-off set for a later morning is planned again (not "delivered") until its day passes', () => {
    const fresh = input({ appJoinedAt: new Date(2026, 9, 22, 18, 0).getTime(), membership: null, now: LATE });
    const a = planGymReminders(fresh);
    expect(a.sent).toEqual({ 'welcome:m1': '2026-10-24' });
    const again = planGymReminders({ ...fresh, sent: a.sent });
    expect(again.reminders.map((r) => r.day)).toEqual(['2026-10-24']);
  });

  it('the birthday every year (29 Feb on 28 Feb), one year with the gym off by default', () => {
    expect(nextYearly('03-09', '2026-10-23')).toBe('2027-03-09');
    expect(nextYearly('10-23', '2026-10-23')).toBe('2026-10-23');
    expect(nextYearly('02-29', '2026-10-23')).toBe('2027-02-28');
    expect(nextYearly('02-29', '2027-03-01')).toBe('2028-02-29');
    expect(kinds(input({ membership: null, dates: { ...NO_DATES, birthday: '11-10' } }))).toEqual(['2026-11-10 birthday']);
    const yr = { ...NO_DATES, joinedOn: '2024-11-05' };
    expect(kinds(input({ membership: null, dates: yr }))).toEqual([]);
    const on = planGymReminders(input({ membership: null, dates: yr, settings: settings({ anniversary: { on: true } }) })).reminders;
    expect(on.map((r) => `${r.day} ${r.kase}`)).toEqual(['2026-11-05 anniversary']);
    expect(on[0].body).toBe("2 years with RAM'S FITNESS today. Thank you for training with us!");
    // Joined this year: no "0 years".
    expect(kinds(input({ membership: null, dates: { ...NO_DATES, joinedOn: '2026-01-05' }, settings: settings({ anniversary: { on: true }, welcome: { on: false } }) }))).toEqual([]);
  });

  it('turned off by the owner: no birthday wish even with the date', () => {
    expect(kinds(input({ membership: null, dates: { ...NO_DATES, birthday: '11-10' }, settings: settings({ birthday: { on: false } }) }))).toEqual([]);
  });
});

describe("we haven't seen you (off by default)", () => {
  const s = settings({ miss_you: { on: true, days: [14] }, plan_ends_soon: { on: false }, plan_ends_today: { on: false }, plan_ended: { on: false } });
  it('14 days after the last check-in, once per absence, never with an offer in it', () => {
    const r = planGymReminders(input({ settings: s, dates: { ...NO_DATES, lastVisitOn: '2026-10-15' } }));
    expect(r.reminders.map((x) => `${x.day} ${x.kase}`)).toEqual(['2026-10-29 miss_you']);
    expect(r.reminders[0].body).toBe("We haven't seen you for 14 days, Asha. Come in when you can.");
    expect(r.reminders[0].body).not.toMatch(/offer|off|discount|₹|free/i);
    // Delivered; a later run with the same last visit sets nothing more.
    const later = planGymReminders(input({ settings: s, now: new Date(2026, 9, 30, 8), dates: { ...NO_DATES, lastVisitOn: '2026-10-15' }, sent: r.sent }));
    expect(later.reminders).toEqual([]);
    // Came back on the 30th (on a longer plan): a new absence, a new reminder 14 days later.
    const longer = plan({ current: { planName: 'Yearly', startsOn: '2026-01-01', endsOn: '2026-12-31', ptSessions: null, ptUsed: 0 } });
    const back = planGymReminders(input({ settings: s, membership: longer, now: new Date(2026, 9, 30, 8), dates: { ...NO_DATES, lastVisitOn: '2026-10-30' }, sent: r.sent }));
    expect(back.reminders.map((x) => `${x.day} ${x.kase}`)).toEqual(['2026-11-13 miss_you']);
    expect(back.sent).toEqual({ 'away:2026-10-15': '2026-10-29', 'away:2026-10-30': '2026-11-13' });
  });
  it('off by default, and never past the plan (the plan-ended reminder speaks then)', () => {
    expect(kinds(input({ dates: { ...NO_DATES, lastVisitOn: '2026-10-15' }, settings: settings({ plan_ends_soon: { on: false }, plan_ends_today: { on: false }, plan_ended: { on: false } }) }))).toEqual([]);
    expect(kinds(input({ settings: s, dates: { ...NO_DATES, lastVisitOn: '2026-10-25' } }))).toEqual([]);
  });
  it('already away longer: once, at the next morning, with the real number of days', () => {
    const r = planGymReminders(input({ settings: s, dates: { ...NO_DATES, lastVisitOn: '2026-10-01' } })).reminders;
    expect(r.map((x) => `${x.day} ${x.kase}`)).toEqual(['2026-10-23 miss_you']);
    expect(r[0].body).toContain('22 days');
  });
});

describe('the workout offer and personal training', () => {
  const quiet = settings({ plan_ends_soon: { on: false }, plan_ends_today: { on: false }, plan_ended: { on: false } });
  it('days added: once, the next morning (on by default)', () => {
    const given = offer({ counted: 10, earned: true, given: true, givenDays: 3, newEnd: '2026-11-05' });
    const r = planGymReminders(input({ settings: quiet, offer: given }));
    expect(r.reminders.map((x) => `${x.day} ${x.kase}`)).toEqual(['2026-10-23 offer_reward']);
    expect(r.reminders[0].body).toBe('3 extra days added to your plan for your workouts. It now ends on 5 Nov.');
    expect(planGymReminders(input({ settings: quiet, offer: given, now: new Date(2026, 9, 24, 8), sent: r.sent })).reminders).toEqual([]);
  });
  it('ending soon and almost there are off by default; on, they follow the count', () => {
    expect(kinds(input({ settings: quiet, offer: offer({ counted: 8 }) }))).toEqual([]);
    const on = settingsFromRow({ ...Object.fromEntries(['plan_ends_soon', 'plan_ends_today', 'plan_ended'].map((c) => [c, { on: false }])), offer_ending: { on: true, days: [3] }, offer_near: { on: true } });
    const r = planGymReminders(input({ settings: on, offer: offer({ counted: 8 }) })).reminders;
    expect(r.map((x) => `${x.day} ${x.kase}`)).toEqual(['2026-10-23 offer_near', '2026-11-05 offer_ending']);
    expect(r[0].body).toBe('2 more workouts for your 3 extra days. Check in and train today.');
    expect(r[1].body).toBe('Your workout offer ends on 8 Nov: 2 more workouts for 3 extra days.');
    // Left the offer, or not in it: nothing.
    expect(kinds(input({ settings: on, offer: offer({ counted: 8, left: true }) }))).toEqual([]);
    expect(kinds(input({ settings: on, offer: offer(null) }))).toEqual([]);
    // Far from the goal: no "almost there".
    expect(kinds(input({ settings: on, offer: offer({ counted: 3 }) }))).toEqual(['2026-11-05 offer_ending']);
  });
  it('personal training running low (off by default): once per pack (review SHOULD 2)', () => {
    const pt = plan({ current: { planName: 'PT 12', startsOn: '2026-09-01', endsOn: '2027-02-28', ptSessions: 12, ptUsed: 10, trainer: 'Ravi' } });
    expect(kinds(input({ settings: quiet, membership: pt }))).toEqual([]);
    const s = settingsFromRow({ plan_ends_soon: { on: false }, plan_ends_today: { on: false }, plan_ended: { on: false }, pt_low: { on: true, days: [2] } });
    const out = planGymReminders(input({ settings: s, membership: pt }));
    const r = out.reminders;
    expect(r.map((x) => `${x.day} ${x.kase}`)).toEqual(['2026-10-23 pt_low']);
    expect(r[0].body).toBe('Personal training: 2 of 12 left. Ask the desk to add more.');
    expect(out.sent).toEqual({ 'pt:2026-09-01': '2026-10-23' });
    // Next week one more is used (1 left): the same pack, so no second reminder.
    const oneLeft = plan({ current: { planName: 'PT 12', startsOn: '2026-09-01', endsOn: '2027-02-28', ptSessions: 12, ptUsed: 11 } });
    expect(planGymReminders(input({ settings: s, membership: oneLeft, now: new Date(2026, 9, 30, 8), sent: out.sent })).reminders).toEqual([]);
    // A new pack (another start day) gets its own reminder.
    const newPack = plan({ current: { planName: 'PT 12', startsOn: '2026-10-28', endsOn: '2027-04-28', ptSessions: 12, ptUsed: 11 } });
    expect(kinds(input({ settings: s, membership: newPack, now: new Date(2026, 9, 30, 8), sent: out.sent }))).toEqual(['2026-10-30 pt_low']);
    const allUsed = plan({ current: { planName: 'PT 12', startsOn: '2026-09-01', endsOn: '2027-02-28', ptSessions: 12, ptUsed: 12 } });
    expect(kinds(input({ settings: s, membership: allUsed }))).toEqual([]);
  });
});

describe('the words', () => {
  it('never say volume, PR, session or money', () => {
    const bodies = [
      AUTO_WORDS.planEndsSoon(7, '2026-11-02', '2026-10-23'),
      AUTO_WORDS.planEndsSoon(1, '2026-11-02', '2026-10-23'),
      AUTO_WORDS.planEndsToday(),
      AUTO_WORDS.planEnded('2026-10-22', '2026-10-23'),
      AUTO_WORDS.birthday('Asha', GYM),
      AUTO_WORDS.birthday('', GYM),
      AUTO_WORDS.welcome('Asha', GYM),
      AUTO_WORDS.offerReward(1, '2027-01-05', '2026-10-23'),
      AUTO_WORDS.offerEnding('2026-11-08', 1, 3, '2026-10-23'),
      AUTO_WORDS.offerNear(1, 1),
      AUTO_WORDS.ptLow(1, 12),
      AUTO_WORDS.missYou(14, ''),
      AUTO_WORDS.anniversary(1, GYM),
      gymRemindersCaption(GYM),
    ];
    for (const b of bodies) {
      expect(b, b).not.toMatch(/\bvolume\b|\bPRs?\b|session|₹|\bRs\b|price|dues|pay/i);
      expect(b, b).not.toMatch(/\b1 (days|workouts|years)\b/);
    }
    expect(AUTO_WORDS.offerReward(1, '2027-01-05', '2026-10-23')).toBe('1 extra day added to your plan for your workouts. It now ends on 5 Jan 2027.');
    expect(AUTO_WORDS.birthday('', GYM)).toBe("Happy birthday! Best wishes from all of us at RAM'S FITNESS.");
  });
});

describe('review NITs 4 and 9', () => {
  it('after a cancel, only one-offs whose morning passed stay delivered', () => {
    const sent = { 'welcome:m1': '2026-10-22', 'reward:o1': '2026-10-23', 'pt:2026-09-01': '2026-10-25' };
    // 8 am: today's 9:30 has not come, so today's one never arrived either.
    expect(deliveredOnly(sent, EARLY)).toEqual({ 'welcome:m1': '2026-10-22' });
    expect(deliveredOnly(sent, LATE)).toEqual({ 'welcome:m1': '2026-10-22', 'reward:o1': '2026-10-23' });
    expect(firstSlotDay(EARLY)).toBe('2026-10-23');
    expect(firstSlotDay(LATE)).toBe('2026-10-24');
  });
  it('ids carry the new prefix; the old one still covers them (old ids are cancelled with them)', () => {
    const r = planGymReminders(input()).reminders;
    expect(r[0].id).toBe('forgeai-gym-reminder-2026-10-26');
    expect(GYM_REMINDER_PREFIX.startsWith(OLD_GYM_REMINDER_PREFIX)).toBe(true);
    // Never the workout reminders' own ids.
    expect('forgeai-reminder-w0'.startsWith(OLD_GYM_REMINDER_PREFIX)).toBe(false);
  });
});
