/**
 * The free-trial banner for gym owners (R-97, migration 0030). PURE: no React, no network.
 *
 * Every gym gets a free trial of 3 months (MettleUp HQ can make it longer, up to 6). The owner's
 * Today screen says how long is left; in the last 14 days a stronger line adds "See prices"; after
 * the end it says the trial ended and that the members' app keeps working. Nothing is ever locked:
 * this is only words. No banner at all when the server has not sent the trial (before 0030 is
 * applied, a browser-only gym, a demo gym, or a gym that already has a plan).
 */

/** What the server says about the gym's trial and plan (owner_hq_access "trial", 0030). */
export interface GymTrial {
  startsAt: string | null;
  endsAt: string | null;
  plan: 'starter' | 'pro' | 'ai' | null;
  billing: 'monthly' | 'yearly' | 'lifetime' | null;
  paidUntil: string | null;
}

export type TrialTone = 'calm' | 'strong' | 'ended';

export interface TrialBannerWords {
  tone: TrialTone;
  text: string;
  /** Show the "See prices" link (the last 14 days, and after the end). */
  showPlans: boolean;
}

/** The landing page's price list (opens in a new tab). */
export const PLANS_URL = 'https://mettleup.fit/#pricing';
export const SEE_PLANS = 'See prices';
/** From this many days left, the banner gets stronger and offers the plans. */
export const STRONG_FROM_DAYS = 14;

const IST_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v)) ? v : null);

/** The server's "trial" object, checked field by field; null when it is missing or has no end. PURE. */
export function trialFromRow(raw: unknown): GymTrial | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const endsAt = str(r.endsAt);
  if (!endsAt) return null;
  const plan = r.plan === 'starter' || r.plan === 'pro' || r.plan === 'ai' ? r.plan : null;
  const billing = r.billing === 'monthly' || r.billing === 'yearly' || r.billing === 'lifetime' ? r.billing : null;
  return { startsAt: str(r.startsAt), endsAt, plan, billing, paidUntil: str(r.paidUntil) };
}

/** "24 Jan 2027" in India time. PURE. */
export function trialDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}

/** India calendar days from today to the end day (0 = the end is today). PURE. */
export function trialDaysLeft(endsAt: string, nowMs: number): number {
  const day = (ms: number) => Math.floor((ms + IST_MS) / DAY_MS);
  return day(Date.parse(endsAt)) - day(nowMs);
}

/** The banner's words, or null for no banner. PURE. */
export function trialBanner(trial: GymTrial | null, nowMs: number): TrialBannerWords | null {
  if (!trial || !trial.endsAt) return null;
  // A gym with a plan is not on a free trial any more.
  if (trial.plan) return null;
  const end = Date.parse(trial.endsAt);
  const on = trialDate(trial.endsAt);
  if (end <= nowMs) {
    return {
      tone: 'ended',
      text: `Your free trial ended on ${on}. Pick a MettleUp pack to keep going. Your members’ app keeps working.`,
      showPlans: true,
    };
  }
  const left = trialDaysLeft(trial.endsAt, nowMs);
  const strong = left <= STRONG_FROM_DAYS;
  const howLong = left <= 0 ? 'last day today' : left === 1 ? '1 day left' : `${left} days left`;
  return {
    tone: strong ? 'strong' : 'calm',
    text: strong
      ? `Free trial: ${howLong} (ends ${on}). Pick a MettleUp pack to keep going after that.`
      : `Free trial: ${howLong} (ends ${on})`,
    showPlans: strong,
  };
}

/** The direct sign-up link (https://app.mettleup.fit/start; the old address's /start moves there) opens "Start my gym" first. PURE. */
export function isStartLink(pathname: string): boolean {
  return /^\/start\/?$/i.test(pathname);
}

/** The one line above the "Start my gym" form. */
export const START_PROMISE = 'Free for 3 months. No card. Your members’ app is free, always.';
