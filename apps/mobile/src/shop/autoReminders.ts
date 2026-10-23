/**
 * Automatic reminders from the gym (R-86, 23 Oct 2026) — the PURE half. The phone sets each one
 * itself as a phone notification from what it already knows: the plan (My membership, 0023), the
 * workout offer (0025), and the owner's switches plus three dates (member_auto_reminders, 0029).
 * No server sends anything, so they work offline and cost nothing. Research and the full list:
 * docs/overhaul/research/R-auto-reminders.md. gymReminders.ts does the scheduling.
 *
 * RULES (all here, all tested):
 *  - at 9:30 am local time, never at night; at most ONE gym reminder a day (one id per day);
 *  - when two fall on one day the case earlier in AUTO_CASES wins. Date-bound cases keep their day
 *    or are dropped; one-off news (welcome, days added, almost there, personal training, "we
 *    haven't seen you") moves to the next free morning within a week, and is set only once;
 *  - a plan already paid after the current one (`next`) means no plan-ending reminders at all;
 *  - nothing for a member who left the gym or turned "Reminders from my gym" off (the caller);
 *  - member words never say "volume", "PR" or "session", and never money.
 */
import { addDays, daysBetween, fromISO, tinyDateWithYear, toISO } from '@/lib/date';

import type { MembershipAnswer } from './membership';
import type { OffersAnswer } from './offer';

/** Every case, in priority order (first wins a crowded day). The server knows the same keys (0029). */
export const AUTO_CASES = [
  'birthday',
  'plan_ends_today',
  'plan_ends_soon',
  'plan_ended',
  'offer_reward',
  'offer_ending',
  'offer_near',
  'pt_low',
  'welcome',
  'miss_you',
  'anniversary',
] as const;
export type AutoCase = (typeof AUTO_CASES)[number];

/** The owner's number for a case: which values are allowed and how many. */
export interface CaseNumbers {
  default: number[];
  min: number;
  max: number;
  most: number;
}

/** Cases with a number (days; for pt_low "left"). Same ranges as the server's check (0029). */
export const CASE_NUMBERS: Partial<Record<AutoCase, CaseNumbers>> = {
  plan_ends_soon: { default: [7, 3], min: 1, max: 30, most: 3 },
  plan_ended: { default: [7, 1], min: 1, max: 60, most: 3 },
  offer_ending: { default: [3], min: 1, max: 14, most: 1 },
  pt_low: { default: [2], min: 1, max: 5, most: 1 },
  miss_you: { default: [14], min: 5, max: 60, most: 1 },
};

/** On until the owner says otherwise: the common ones (research: every gym system sends them). */
export const DEFAULT_ON: Record<AutoCase, boolean> = {
  birthday: true,
  plan_ends_today: true,
  plan_ends_soon: true,
  plan_ended: true,
  offer_reward: true,
  offer_ending: false,
  offer_near: false,
  pt_low: false,
  welcome: true,
  miss_you: false,
  anniversary: false,
};

export interface CaseRule {
  on: boolean;
  /** Largest first; empty for a case without a number. */
  days: number[];
}
export type AutoSettings = Record<AutoCase, CaseRule>;

/** The built-in defaults (also what a phone uses while the gym's server lacks 0029). PURE. */
export function defaultAutoSettings(): AutoSettings {
  const out = {} as AutoSettings;
  for (const c of AUTO_CASES) out[c] = { on: DEFAULT_ON[c], days: [...(CASE_NUMBERS[c]?.default ?? [])] };
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: unknown): string | null => (typeof v === 'string' && ISO.test(v) ? v : null);

/**
 * The owner's saved switches over the defaults. A case missing, or one that can't be read, keeps its
 * default: a bad entry never turns everything off. PURE.
 */
export function settingsFromRow(raw: unknown): AutoSettings {
  const out = defaultAutoSettings();
  if (!isObj(raw)) return out;
  for (const c of AUTO_CASES) {
    const v = raw[c];
    if (!isObj(v) || typeof v.on !== 'boolean') continue;
    const nums = CASE_NUMBERS[c];
    let days = out[c].days;
    if (nums && Array.isArray(v.days)) {
      const ok = [...new Set(v.days.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= nums.min && n <= nums.max))];
      if (ok.length > 0) days = ok.sort((a, b) => b - a).slice(0, nums.most);
    }
    out[c] = { on: v.on, days };
  }
  return out;
}

/** The member's own dates from the gym's list (0029), each null when the gym did not give it. */
export interface MemberDates {
  /** 'MM-DD', never the year. */
  birthday: string | null;
  joinedOn: string | null;
  lastVisitOn: string | null;
}

export interface AutoRemindersAnswer {
  settings: AutoSettings;
  /** The owner saved switches (false: the defaults). */
  saved: boolean;
  dates: MemberDates;
}

const MM_DD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** member_auto_reminders' answer, checked; null when it is not one. PURE. */
export function autoAnswerFromRow(raw: unknown): AutoRemindersAnswer | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || r.ok !== true) return null;
  return {
    settings: settingsFromRow(r.settings),
    saved: isObj(r.settings),
    dates: {
      birthday: typeof r.birthday === 'string' && MM_DD.test(r.birthday) ? r.birthday : null,
      joinedOn: day(r.joinedOn),
      lastVisitOn: day(r.lastVisitOn),
    },
  };
}

/** Back in the server's shape, to keep on the phone (read back with autoAnswerFromRow). PURE. */
export function autoAnswerToRow(a: AutoRemindersAnswer): Record<string, unknown> {
  return { ok: true, settings: a.saved ? a.settings : null, birthday: a.dates.birthday, joinedOn: a.dates.joinedOn, lastVisitOn: a.dates.lastVisitOn };
}

/** The phone has no answer (server before 0029, or never asked): the defaults and no dates. PURE. */
export function fallbackAnswer(): AutoRemindersAnswer {
  return { settings: defaultAutoSettings(), saved: false, dates: { birthday: null, joinedOn: null, lastVisitOn: null } };
}

// ------------------------------------------------------------------ the words

const many = (n: number, one: string, more: string): string => (n === 1 ? `1 ${one}` : `${n} ${more}`);

/** What each reminder says (the title is the gym's name). Never volume, PR, session or money. PURE. */
export const AUTO_WORDS = {
  planEndsSoon: (n: number, endsOn: string, today: string): string =>
    n === 1
      ? 'Your plan ends tomorrow. Renew at the desk to keep training.'
      : `Your plan ends in ${n} days, on ${tinyDateWithYear(endsOn, today)}. Renew at the desk to keep training.`,
  planEndsToday: (): string => 'Your plan ends today. Renew at the desk to keep training.',
  planEnded: (endedOn: string, today: string): string =>
    `Your plan ended on ${tinyDateWithYear(endedOn, today)}. Renew at the desk to keep your progress going.`,
  birthday: (name: string, gym: string): string => `Happy birthday${name ? `, ${name}` : ''}! Best wishes from all of us at ${gym}.`,
  welcome: (name: string, gym: string): string => `Welcome to ${gym}${name ? `, ${name}` : ''}! Your plan and the gym's news are in ForgeAI.`,
  offerReward: (days: number, newEnd: string, today: string): string =>
    `${many(days, 'extra day', 'extra days')} added to your plan for your workouts. It now ends on ${tinyDateWithYear(newEnd, today)}.`,
  offerEnding: (endsOn: string, left: number, reward: number, today: string): string =>
    `Your workout offer ends on ${tinyDateWithYear(endsOn, today)}: ${many(left, 'more workout', 'more workouts')} for ${many(reward, 'extra day', 'extra days')}.`,
  offerNear: (left: number, reward: number): string =>
    `${many(left, 'more workout', 'more workouts')} for your ${many(reward, 'extra day', 'extra days')}. Check in and train today.`,
  ptLow: (left: number, total: number): string => `Personal training: ${left} of ${total} left. Ask the desk to add more.`,
  missYou: (days: number, name: string): string => `We haven't seen you for ${days} days${name ? `, ${name}` : ''}. Come in when you can.`,
  anniversary: (years: number, gym: string): string =>
    `${years === 1 ? '1 year' : `${years} years`} with ${gym} today. Thank you for training with us!`,
} as const;

/** Settings → Your gym, under "Reminders from my gym". PURE. */
export function gymRemindersCaption(gym: string): string {
  return `Your plan ending, birthday wishes and other news from ${gym.trim() || 'your gym'}, at 9:30 am. Never more than one a day.`;
}

// ------------------------------------------------------------------ the plan

/** 9:30 am, local time. */
export const SLOT_MINUTES = 9 * 60 + 30;
/** How far ahead reminders are set (re-planned at every gym check). */
export const HORIZON_DAYS = 60;
/** One-off news moves to the next free morning within this many days. */
export const FLOAT_DAYS = 7;
/** A new member: joined within this many days (today counts). */
export const WELCOME_WITHIN_DAYS = 7;
/** Every gym reminder's id starts with this; the day follows, so one a day is built in. */
export const GYM_REMINDER_PREFIX = 'forgeai-gym-';
/** Where a tap goes: the gym's tab (the offer card and My membership are at its top). */
export const GYM_REMINDER_ROUTE = '/shop';

export interface PlannedReminder {
  id: string;
  /** Local 'YYYY-MM-DD'. */
  day: string;
  /** Epoch ms (local 9:30 am that day). */
  at: number;
  kase: AutoCase;
  title: string;
  body: string;
  /** Set once (one-off news): this key goes in the "sent" history. */
  onceKey: string | null;
}

export interface PlanInput {
  now: Date;
  memberId: string;
  gymName: string;
  settings: AutoSettings;
  membership: MembershipAnswer | null;
  dates: MemberDates;
  offer: OffersAnswer | null;
  /** onceKey -> the day it was set for, from earlier runs. */
  sent: Readonly<Record<string, string>>;
}

export interface PlanOutput {
  reminders: PlannedReminder[];
  /** The history to keep: one-offs already delivered (their day has passed) and the ones set now. */
  sent: Record<string, string>;
}

interface Fixed {
  kase: AutoCase;
  day: string;
  body: string;
}
interface Once {
  kase: AutoCase;
  key: string;
  earliest: string;
  body: (day: string) => string;
}

/** The first day of 'MM-DD' on or after `from` ('YYYY-MM-DD'); 29 Feb is 28 Feb in other years. PURE. */
export function nextYearly(mmdd: string, from: string): string {
  const y = Number(from.slice(0, 4));
  const at = (year: number): string => {
    const [m, d] = mmdd.split('-').map(Number);
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const dd = m === 2 && d === 29 && !leap ? 28 : d;
    return `${year}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  };
  const here = at(y);
  return here >= from ? here : at(y + 1);
}

/**
 * Every gym reminder to set from now on. PURE: the same input always gives the same answer, so the
 * caller re-plans at every gym check and only touches Android when something changed.
 */
export function planGymReminders(o: PlanInput): PlanOutput {
  const today = toISO(o.now);
  const nowMin = o.now.getHours() * 60 + o.now.getMinutes();
  // Today's 9:30 still ahead, or tomorrow's.
  const first = nowMin < SLOT_MINUTES ? today : addDays(today, 1);
  const last = addDays(first, HORIZON_DAYS - 1);
  const inRange = (d: string): boolean => d >= first && d <= last;
  const s = o.settings;
  const on = (c: AutoCase): boolean => s[c].on;
  const gym = o.gymName.trim() || 'Your gym';
  const m = o.membership && o.membership.ok ? o.membership : null;
  const name = m?.memberName.trim() ?? '';
  const fixed: Fixed[] = [];
  const once: Once[] = [];

  // ---- the plan (none at all when a renewal is already paid)
  if (m && !m.next) {
    const cur = m.current;
    if (cur) {
      if (on('plan_ends_soon')) for (const n of s.plan_ends_soon.days) fixed.push({ kase: 'plan_ends_soon', day: addDays(cur.endsOn, -n), body: AUTO_WORDS.planEndsSoon(n, cur.endsOn, today) });
      if (on('plan_ends_today')) fixed.push({ kase: 'plan_ends_today', day: cur.endsOn, body: AUTO_WORDS.planEndsToday() });
    }
    const ended = cur ? cur.endsOn : m.lastEndedOn;
    if (ended && on('plan_ended')) for (const n of s.plan_ended.days) fixed.push({ kase: 'plan_ended', day: addDays(ended, n), body: AUTO_WORDS.planEnded(ended, today) });
  }
  // ---- personal training running low (the plan running now)
  const cur = m?.current ?? null;
  if (cur && cur.ptSessions && on('pt_low')) {
    const left = cur.ptSessions - Math.min(cur.ptUsed, cur.ptSessions);
    const total = cur.ptSessions;
    if (left >= 1 && left <= (s.pt_low.days[0] ?? 0)) once.push({ kase: 'pt_low', key: `pt:${cur.startsOn}:${left}`, earliest: first, body: () => AUTO_WORDS.ptLow(left, total) });
  }

  // ---- birthday and one year with the gym (the gym's list, 0029)
  if (o.dates.birthday && on('birthday')) fixed.push({ kase: 'birthday', day: nextYearly(o.dates.birthday, first), body: AUTO_WORDS.birthday(name, gym) });
  const joined = o.dates.joinedOn;
  if (joined && on('anniversary')) {
    const d = nextYearly(joined.slice(5), first);
    const years = Number(d.slice(0, 4)) - Number(joined.slice(0, 4));
    if (years >= 1) fixed.push({ kase: 'anniversary', day: d, body: AUTO_WORDS.anniversary(years, gym) });
  }

  // ---- welcome: a new member (joined the gym in the last 7 days; or, without the gym's list, a
  // first plan that started in the last 7 days)
  if (on('welcome')) {
    const recent = (d: string | null | undefined): boolean => !!d && d <= today && daysBetween(d, today) < WELCOME_WITHIN_DAYS;
    const firstPlan = !!cur && !m?.lastEndedOn && recent(cur.startsOn);
    if (recent(joined) || (!joined && firstPlan)) once.push({ kase: 'welcome', key: `welcome:${o.memberId}`, earliest: first, body: () => AUTO_WORDS.welcome(name, gym) });
  }

  // ---- we haven't seen you: N days after the last check-in, while a plan runs, once per absence
  const lastVisit = o.dates.lastVisitOn;
  if (cur && lastVisit && on('miss_you')) {
    const n = s.miss_you.days[0] ?? 14;
    const due = addDays(lastVisit, n);
    if (due <= cur.endsOn) once.push({ kase: 'miss_you', key: `away:${lastVisit}`, earliest: due, body: (d) => AUTO_WORDS.missYou(daysBetween(lastVisit, d), name) });
  }

  // ---- the workout offer (only a member in it)
  const a = o.offer;
  if (a && a.offer && a.me && a.canJoin === 'JOINED') {
    const off = a.offer;
    const me = a.me;
    const reward = off.rewardDays;
    if (me.given && me.newEnd && me.newEnd >= today && on('offer_reward')) {
      const days = me.givenDays ?? reward;
      const newEnd = me.newEnd;
      once.push({ kase: 'offer_reward', key: `reward:${off.id}`, earliest: first, body: () => AUTO_WORDS.offerReward(days, newEnd, today) });
    }
    const running = !me.left && !me.earned && !me.given && me.counted < off.workouts && me.windowEndsOn >= today;
    if (running) {
      const left = off.workouts - me.counted;
      if (on('offer_ending')) {
        const n = s.offer_ending.days[0] ?? 3;
        fixed.push({ kase: 'offer_ending', day: addDays(me.windowEndsOn, -n), body: AUTO_WORDS.offerEnding(me.windowEndsOn, left, reward, today) });
      }
      if (on('offer_near') && left <= 2) once.push({ kase: 'offer_near', key: `near:${off.id}:${left}`, earliest: first, body: () => AUTO_WORDS.offerNear(left, reward) });
    }
  }

  // ---- one a day: date-bound ones by priority, then one-offs into the free mornings
  const rank = (c: AutoCase): number => AUTO_CASES.indexOf(c);
  const taken = new Map<string, { kase: AutoCase; body: string; onceKey: string | null }>();
  for (const f of [...fixed].sort((x, y) => rank(x.kase) - rank(y.kase) || (x.day < y.day ? -1 : 1))) {
    if (inRange(f.day) && !taken.has(f.day)) taken.set(f.day, { kase: f.kase, body: f.body, onceKey: null });
  }
  const sent: Record<string, string> = {};
  // Delivered already (set for a morning that has passed): kept for a year, never set again.
  const yearAgo = addDays(today, -400);
  for (const [k, d] of Object.entries(o.sent)) if (d < first && d >= yearAgo) sent[k] = d;
  for (const x of [...once].sort((p, q) => rank(p.kase) - rank(q.kase))) {
    if (sent[x.key]) continue;
    const start = x.earliest > first ? x.earliest : first;
    for (let i = 0; i < FLOAT_DAYS; i++) {
      const d = addDays(start, i);
      if (!inRange(d)) break;
      if (taken.has(d)) continue;
      taken.set(d, { kase: x.kase, body: x.body(d), onceKey: x.key });
      sent[x.key] = d;
      break;
    }
  }

  const reminders: PlannedReminder[] = [...taken.entries()]
    .sort(([p], [q]) => (p < q ? -1 : 1))
    .map(([d, t]) => {
      const at = fromISO(d);
      at.setHours(Math.floor(SLOT_MINUTES / 60), SLOT_MINUTES % 60, 0, 0);
      return { id: `${GYM_REMINDER_PREFIX}${d}`, day: d, at: at.getTime(), kase: t.kase, title: gym, body: t.body, onceKey: t.onceKey };
    });
  return { reminders, sent };
}
