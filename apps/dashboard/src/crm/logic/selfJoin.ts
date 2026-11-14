/**
 * R-513 Join online, phase 1 (14 Nov 2026). A new member fills the gym's "Become a member" page on their own phone
 * (app.mettleup.fit/m/<code>, public/join-online.html): name, a number checked with WhatsApp, a plan, a start day,
 * two ticked boxes. The gym server (supabase 0077 self_join_send) keeps it as an ordinary enquiry with a `selfJoin`
 * block, and Today lists it under "Joined online" until the desk taps "Make member": the usual Add member form,
 * filled in, then the usual Sell membership sheet on the plan they picked. Nothing is paid online yet: they pay at
 * the desk.
 *
 * F210 (supabase 0088, NOT live until the owner's yes): the owner may switch on a free trial (1, 3 or 7 days) in
 * Settings -> Member app. A person who picks "Try free for 3 days" sends the same request with no plan and no money;
 * the block then carries `trial` {days, endsOn}. Today shows "Let them in until <day>": the person is not a member,
 * so they do not check in; the desk lets them in until that day, then "Make member" as usual (the desk picks the plan).
 *
 * PURE (no screen code, no storage): reading the block defensively, the waiting list, and what the desk's sheets
 * open with.
 */

import type { GymRecord } from '../data/adapter';
import type { DateISO, Enquiry, EnquirySelfJoin, EnquirySelfJoinTrial, Gender, Plan } from '../types';
import { addDays, isValidDateISO } from './dates';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const paise = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const GENDERS: readonly Gender[] = ['male', 'female', 'other'];

/** F210: the free trial's lengths the owner may pick (0088 accepts exactly these). */
export const JOIN_TRIAL_DAYS = [1, 3, 7] as const;

/** F210: a trial on the block, read defensively: a whole number of days and a last day on or after the start. PURE. */
function trialOfBlock(x: Record<string, unknown>, startsOn: DateISO): EnquirySelfJoinTrial | null {
  const tr = x.trial;
  if (!isObj(tr)) return null;
  const days = tr.days;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 60) return null;
  if (typeof tr.endsOn !== 'string' || !isValidDateISO(tr.endsOn) || tr.endsOn < startsOn) return null;
  return { days, endsOn: tr.endsOn as DateISO, feeP: paise(tr.feeP) ?? 0 };
}

/** The enquiry's online request, or null for one the desk typed (or a damaged one). PURE. */
export function selfJoinOf(e: Pick<Enquiry, 'selfJoin'> | null | undefined): EnquirySelfJoin | null {
  const x = e?.selfJoin as unknown;
  if (!isObj(x)) return null;
  const planId = typeof x.planId === 'string' ? x.planId.trim() : '';
  const planName = typeof x.planName === 'string' ? x.planName.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const startsOn = typeof x.startsOn === 'string' && isValidDateISO(x.startsOn) ? (x.startsOn as DateISO) : null;
  if (!startsOn) return null;
  // F210: a free trial has no plan and no amounts (0088 writes planId '' and 0s).
  const trial = trialOfBlock(x, startsOn);
  const priceP = paise(x.priceP) ?? (trial ? 0 : null);
  const joiningFeeP = paise(x.joiningFeeP) ?? 0;
  const totalP = paise(x.totalP) ?? (priceP !== null ? priceP + joiningFeeP : null);
  if (!trial && (!planId || !planName || priceP === null || totalP === null)) return null;
  const c = isObj(x.consents) ? x.consents : {};
  const out: EnquirySelfJoin = {
    v: 1,
    name: typeof x.name === 'string' ? x.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '',
    gender: GENDERS.find((g) => g === x.gender) ?? null,
    planId,
    planName,
    durationUnit: x.durationUnit === 'day' ? 'day' : 'month',
    durationCount: typeof x.durationCount === 'number' && x.durationCount > 0 ? Math.floor(x.durationCount) : 1,
    priceP: priceP ?? 0,
    joiningFeeP,
    totalP: totalP ?? 0,
    startsOn,
    pay: 'desk',
    paid: x.paid === true,
    phoneChecked: x.phoneChecked === true,
    lang: x.lang === 'hi' ? 'hi' : 'en',
    consents: {
      adultAt: typeof c.adultAt === 'number' ? c.adultAt : 0,
      healthAt: typeof c.healthAt === 'number' ? c.healthAt : 0,
      wording: typeof c.wording === 'string' ? c.wording : '',
    },
    at: typeof x.at === 'number' ? x.at : 0,
  };
  if (trial) out.trial = trial;
  return out;
}

/**
 * F210: where a free trial stands today (India): before its first day, on (they may visit, the last day included),
 * or ended. null = not a trial. PURE.
 */
export function trialState(join: EnquirySelfJoin | null | undefined, today: DateISO): { kind: 'soon' | 'on' | 'ended'; trial: EnquirySelfJoinTrial } | null {
  const trial = join?.trial;
  if (!join || !trial) return null;
  if (today > trial.endsOn) return { kind: 'ended', trial };
  return { kind: today < join.startsOn ? 'soon' : 'on', trial };
}

/** F210: the owner's free trial days on the gym's details (1, 3 or 7), or null when off. PURE. */
export function joinTrialDays(gym: Pick<GymRecord, 'joinTrialDays'> | null | undefined): number | null {
  const d = gym?.joinTrialDays;
  return JOIN_TRIAL_DAYS.some((x) => x === d) ? (d as number) : null;
}

/** F210: the last day of a trial that starts on `startsOn`. PURE. */
export function trialEndsOn(startsOn: DateISO, days: number): DateISO {
  return addDays(startsOn, Math.max(1, Math.floor(days)) - 1);
}

export interface OnlineJoin {
  enquiry: Enquiry;
  join: EnquirySelfJoin;
}

/** Today's "Joined online": still open, newest request first. PURE. */
export function waitingOnlineJoins(enquiries: readonly Enquiry[] | null | undefined): OnlineJoin[] {
  const out: OnlineJoin[] = [];
  for (const enquiry of enquiries ?? []) {
    if (enquiry.status !== 'open') continue;
    const join = selfJoinOf(enquiry);
    if (join) out.push({ enquiry, join });
  }
  return out.sort((a, b) => b.join.at - a.join.at || a.enquiry.id.localeCompare(b.enquiry.id));
}

/** The plan to open Sell membership on: the one they picked, while the gym still sells it. PURE. */
export function sellPlanFor(join: EnquirySelfJoin | null, plans: readonly Plan[]): string | undefined {
  // F210: a free trial picked no plan (planId '').
  if (!join || join.trial || !join.planId) return undefined;
  return plans.some((p) => p.id === join.planId && p.active) ? join.planId : undefined;
}

/** The start day to open Sell membership on: the one they picked, unless it has passed (then the usual day). PURE. */
export function sellStartFor(join: EnquirySelfJoin | null, today: DateISO): DateISO | undefined {
  // F210: after a free trial the plan starts on the usual day (the trial's own start day was for the trial).
  if (!join || join.trial || join.startsOn < today) return undefined;
  return join.startsOn;
}

/** The Add member form's first values: the enquiry's name and number, and the gender they gave. PURE. */
export function memberPrefill(e: Pick<Enquiry, 'name' | 'phone' | 'selfJoin'>): { fullName: string; phone: string; gender?: Gender } {
  const join = selfJoinOf(e);
  return join?.gender ? { fullName: e.name, phone: e.phone, gender: join.gender } : { fullName: e.name, phone: e.phone };
}
