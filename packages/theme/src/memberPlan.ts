/**
 * F56 (R-242, R-461): MettleUp Plus, the member app's paid plan for people who train WITHOUT a MettleUp gym.
 * ONE file shared by the member app (apps/mobile) and the admin app (apps/dashboard), so both read the same
 * switches, prices and rules. PURE: no storage, no network, no clock (every function takes "today").
 *
 * WHAT IS FREE, FOREVER: logging workouts, history, routines, the rest timer on the phone, backup and export,
 * and charts of the last 3 months.
 * WHAT IS PAID (MettleUp Plus): the watch app, charts older than 3 months, weight suggestions (the Target),
 * the calculators (1-rep max, plates), and more than 7 exercises of your own.
 *
 * WHO GETS EVERY FEATURE FREE (checked in this order):
 *   1. everyone, while MEMBER_PLAN_GATE_ON is false (today: nothing is locked for anyone);
 *   2. owners and desk staff of a MettleUp gym (proved with their admin-app PIN, R-458's door);
 *   3. members of a MettleUp gym whose plan (or pass) the gym's list shows, until 7 days after it ends; after
 *      that the GYM OWNER's switch decides (lock the extras, or keep them free; default below);
 *   4. people who bought MettleUp Plus (Google Play);
 *   5. new people, for 30 days from the first day this phone runs the plan, with no card.
 * Everyone else has the free part. NOTHING is ever deleted or hidden from the member's own data (history,
 * routines, records): only the paid extras close.
 */

/**
 * THE SWITCH. While false, every feature is open for everyone, the free month's clock never starts and the
 * MettleUp Plus screen cannot be reached in a store build. QA builds can turn it on for the cloud phone test
 * (the 'memberPlan' stand-in and mettleup://qa-plan). Turned on together with MEMBER_PAYMENTS_LIVE, only after
 * the owner says "payments live" (R-461): locking a feature nobody can buy would be wrong.
 */
export const MEMBER_PLAN_GATE_ON = false;

/**
 * TEST MODE. While false the app never starts a real Google Play purchase: QA builds use a stand-in store that
 * says on screen that no money is taken. Set to true only on the owner's "payments live" (R-461).
 */
export const MEMBER_PAYMENTS_LIVE = false;

/** The free month: every feature, no card, counted by the app itself from its first day with the plan. */
export const MEMBER_TRIAL_DAYS = 30;
/** Days before the free month ends when the app says once what stays free and what is paid ("around day 25"). */
export const MEMBER_TRIAL_WARN_DAYS = 5;
/** Charts on the free part show this many months back. */
export const FREE_CHART_MONTHS = 3;
/** Exercises of your own on the free part (Hevy's free plan has the same 7). */
export const FREE_OWN_EXERCISES = 7;
/** After a gym plan ends, the extras stay open this many more days whatever the gym's switch says. */
export const GYM_UNLOCK_GRACE_DAYS = 7;

/**
 * DECIDED by the owner (12 Nov 2026, R-461, his reply "A"): the gym-owner switch "Lock MettleUp Plus when a
 * member's plan ends" starts ON for every gym. true = a former member's paid extras lock 7 days after their plan
 * ends (their own data never locks); the owner can switch it off for his gym. The admin app's switch and the
 * member app both read this ONE constant; the server's column default (0070) must match it (a test checks).
 */
export const GYM_LOCK_AFTER_END_DEFAULT = true;

/** The paid features. Everything else in the member app is free and never asks. */
export type PaidFeature = 'watch' | 'olderCharts' | 'weightSuggestions' | 'calculators' | 'ownExercises';
export const PAID_FEATURES: readonly PaidFeature[] = ['watch', 'olderCharts', 'weightSuggestions', 'calculators', 'ownExercises'];

/** The three ways to buy. */
export type PlusOption = 'monthly' | 'yearly' | 'lifetime';
export const PLUS_OPTIONS: readonly PlusOption[] = ['monthly', 'yearly', 'lifetime'];

/**
 * The approved prices (owner's yes, 31 Oct 2026, R-242), in whole rupees. Google Play shows and charges its own
 * price for each product (set in Play Console to these numbers); this list is only shown while Play has not
 * answered. Google keeps 15%.
 */
export const PLUS_PRICES: Readonly<Record<PlusOption, number>> = { monthly: 149, yearly: 999, lifetime: 2_499 };

/**
 * The Google Play products (to be made in Play Console, test mode first):
 *  - subscription `mettleup_plus` with two auto-renewing base plans: `monthly` (1 month, Rs 149) and
 *    `yearly` (1 year, Rs 999); no free trial offer in Play (the app's own free month needs no card);
 *  - one-time product `mettleup_plus_lifetime` (Rs 2,499), not consumable.
 */
export const PLAY_PLUS_SUBSCRIPTION = 'mettleup_plus';
export const PLAY_PLUS_BASE_PLANS: Readonly<Record<'monthly' | 'yearly', string>> = { monthly: 'monthly', yearly: 'yearly' };
export const PLAY_PLUS_LIFETIME = 'mettleup_plus_lifetime';

// ------------------------------------------------------------------ days (India calendar days, 'YYYY-MM-DD')

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A day string, or null when it is not one. PURE. */
export function planDay(v: unknown): string | null {
  if (typeof v !== 'string' || !ISO.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  // Date.parse rolls 2026-11-31 over to 1 December: only a day that reads back the same is a real day.
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v ? v : null;
}

/** `day` moved by `n` days. PURE. */
export function planAddDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b - a). PURE. */
export function planDaysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

// ------------------------------------------------------------------ the facts and the answer

/** What the phone knows about the member's gym (from "My membership", the gym's own list). */
export interface GymUnlockFacts {
  gymName: string;
  /**
   * The last day of the plan the gym's list shows (the running plan, or the renewal after it, or the plan that
   * ended last); null = the member comes on a pass (FITPASS...), which has no end.
   */
  endsOn: string | null;
  /** The gym owner's switch (0070); null = not known yet: GYM_LOCK_AFTER_END_DEFAULT. */
  lockAfterEnd: boolean | null;
}

export interface MemberPlanFacts {
  /** Today, India calendar day. */
  today: string;
  /** MEMBER_PLAN_GATE_ON, or a QA build's test switch. */
  gateOn: boolean;
  /** The first day of the free month on this phone; null = not started (it starts the first day the gate is on). */
  trialStartedOn: string | null;
  /** What Google Play last said this account owns; null = nothing. */
  bought: { option: PlusOption } | null;
  /** Owner or desk staff of a MettleUp gym (proved with the admin-app PIN); null = no. */
  staff: { gymName: string } | null;
  /** The gym the app is joined to, when its list showed a plan or pass for this member; null = none. */
  gym: GymUnlockFacts | null;
}

export type MemberAccess =
  | { all: true; why: 'off' }
  | { all: true; why: 'staff'; gymName: string }
  /** `graceEndsOn`: set while the plan has ended and the 7 extra days run (or after them with the switch off). */
  | { all: true; why: 'gym'; gymName: string; endedOn: string | null; graceEndsOn: string | null }
  | { all: true; why: 'bought'; option: PlusOption }
  | { all: true; why: 'trial'; daysLeft: number; lastDay: string }
  /** `gymEnded`: the gym's plan ended and its owner locks the extras (so "Renew at <gym>" helps). */
  | { all: false; why: 'free'; trialEndedOn: string | null; gymEnded: { gymName: string; endedOn: string } | null };

/** The free month's last day (day 1 = the start day). PURE. */
export function trialLastDay(startedOn: string): string {
  return planAddDays(startedOn, MEMBER_TRIAL_DAYS - 1);
}

/** Does the gym still give this member every feature today? With the reason. PURE. */
export function gymUnlock(gym: GymUnlockFacts, today: string): { open: boolean; endedOn: string | null; graceEndsOn: string | null } {
  if (gym.endsOn == null) return { open: true, endedOn: null, graceEndsOn: null }; // a pass: no end
  if (today <= gym.endsOn) return { open: true, endedOn: null, graceEndsOn: null };
  const graceEndsOn = planAddDays(gym.endsOn, GYM_UNLOCK_GRACE_DAYS);
  if (today <= graceEndsOn) return { open: true, endedOn: gym.endsOn, graceEndsOn };
  const lock = gym.lockAfterEnd ?? GYM_LOCK_AFTER_END_DEFAULT;
  return { open: !lock, endedOn: gym.endsOn, graceEndsOn: lock ? null : graceEndsOn };
}

/** Who gets what today. PURE. */
export function memberAccess(f: MemberPlanFacts): MemberAccess {
  if (!f.gateOn) return { all: true, why: 'off' };
  if (f.staff) return { all: true, why: 'staff', gymName: f.staff.gymName };
  let gymEnded: { gymName: string; endedOn: string } | null = null;
  if (f.gym) {
    const g = gymUnlock(f.gym, f.today);
    if (g.open) return { all: true, why: 'gym', gymName: f.gym.gymName, endedOn: g.endedOn, graceEndsOn: g.graceEndsOn };
    if (g.endedOn) gymEnded = { gymName: f.gym.gymName, endedOn: g.endedOn };
  }
  if (f.bought) return { all: true, why: 'bought', option: f.bought.option };
  // No start day yet means today is day 1 (the store writes it the first time it looks).
  const start = f.trialStartedOn ?? f.today;
  const lastDay = trialLastDay(start);
  // A phone clock set back before the start day still reads as the start day (never more than 30 days).
  const today = f.today < start ? start : f.today;
  if (today <= lastDay) return { all: true, why: 'trial', daysLeft: planDaysBetween(today, lastDay) + 1, lastDay };
  return { all: false, why: 'free', trialEndedOn: lastDay, gymEnded };
}

/** May the member use this paid feature now? Every paid feature opens and closes together. PURE. */
export function canUse(a: MemberAccess, _feature: PaidFeature): boolean {
  return a.all;
}

/** May a chart show `months` back (null = all time)? The free part shows FREE_CHART_MONTHS. PURE. */
export function chartMonthsAllowed(a: MemberAccess, months: number | null): boolean {
  if (a.all) return true;
  return months != null && months <= FREE_CHART_MONTHS;
}

/** Would one more exercise of the member's own go over the free part? `have` = how many they made. PURE. */
export function ownExerciseLimitReached(a: MemberAccess, have: number): boolean {
  return !a.all && have >= FREE_OWN_EXERCISES;
}

/** Should the app say once that the free month ends soon? Only in its last MEMBER_TRIAL_WARN_DAYS days. PURE. */
export function trialEndsSoon(a: MemberAccess): boolean {
  return a.why === 'trial' && a.daysLeft <= MEMBER_TRIAL_WARN_DAYS;
}
