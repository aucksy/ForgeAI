/**
 * R-513 Join online, phase 1 (14 Nov 2026). A new member fills the gym's "Become a member" page on their own phone
 * (app.mettleup.fit/m/<code>, public/join-online.html): name, a number checked with WhatsApp, a plan, a start day,
 * two ticked boxes. The gym server (supabase 0077 self_join_send) keeps it as an ordinary enquiry with a `selfJoin`
 * block, and Today lists it under "Joined online" until the desk taps "Make member": the usual Add member form,
 * filled in, then the usual Sell membership sheet on the plan they picked. Nothing is paid online yet: they pay at
 * the desk.
 *
 * PURE (no screen code, no storage): reading the block defensively, the waiting list, and what the desk's sheets
 * open with.
 */

import type { DateISO, Enquiry, EnquirySelfJoin, Gender, Plan } from '../types';
import { isValidDateISO } from './dates';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const paise = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const GENDERS: readonly Gender[] = ['male', 'female', 'other'];

/** The enquiry's online request, or null for one the desk typed (or a damaged one). PURE. */
export function selfJoinOf(e: Pick<Enquiry, 'selfJoin'> | null | undefined): EnquirySelfJoin | null {
  const x = e?.selfJoin as unknown;
  if (!isObj(x)) return null;
  const planId = typeof x.planId === 'string' ? x.planId.trim() : '';
  const planName = typeof x.planName === 'string' ? x.planName.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const startsOn = typeof x.startsOn === 'string' && isValidDateISO(x.startsOn) ? (x.startsOn as DateISO) : null;
  const priceP = paise(x.priceP);
  const joiningFeeP = paise(x.joiningFeeP) ?? 0;
  const totalP = paise(x.totalP) ?? (priceP !== null ? priceP + joiningFeeP : null);
  if (!planId || !planName || !startsOn || priceP === null || totalP === null) return null;
  const c = isObj(x.consents) ? x.consents : {};
  return {
    v: 1,
    name: typeof x.name === 'string' ? x.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '',
    gender: GENDERS.find((g) => g === x.gender) ?? null,
    planId,
    planName,
    durationUnit: x.durationUnit === 'day' ? 'day' : 'month',
    durationCount: typeof x.durationCount === 'number' && x.durationCount > 0 ? Math.floor(x.durationCount) : 1,
    priceP,
    joiningFeeP,
    totalP,
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
  if (!join) return undefined;
  return plans.some((p) => p.id === join.planId && p.active) ? join.planId : undefined;
}

/** The start day to open Sell membership on: the one they picked, unless it has passed (then the usual day). PURE. */
export function sellStartFor(join: EnquirySelfJoin | null, today: DateISO): DateISO | undefined {
  if (!join || join.startsOn < today) return undefined;
  return join.startsOn;
}

/** The Add member form's first values: the enquiry's name and number, and the gender they gave. PURE. */
export function memberPrefill(e: Pick<Enquiry, 'name' | 'phone' | 'selfJoin'>): { fullName: string; phone: string; gender?: Gender } {
  const join = selfJoinOf(e);
  return join?.gender ? { fullName: e.name, phone: e.phone, gender: join.gender } : { fullName: e.name, phone: e.phone };
}
