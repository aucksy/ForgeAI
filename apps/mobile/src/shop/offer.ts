/**
 * The gym's workout offer in the member app (OWNER-INBOX #49 step 2) — the PURE half: the server's
 * answers read (supabase/migrations/0025_workout_offer.sql: member_offers, member_join_offer,
 * member_offer_days), what the card says, which workout dates may leave the phone, and when.
 * OfferCard.tsx lays it out; offerActions.ts makes the calls.
 *
 * WHAT LEAVES THE PHONE: only the DATES of workouts that count, inside the member's window, and only
 * after the member pressed "Join the offer" on the consent screen (a consent record kept on this
 * phone) AND the gym says they are in the offer, not left, not already earned. Never an exercise,
 * weight, set, workout length or body weight. The gym keeps a date only when its own register
 * shows a check-in that day; the count on the card is the gym's, never the phone's.
 */
import { tinyDateWithYear } from '@/lib/date';

import { OFFER_WORDS, type OfferNumbers } from './offerWords';
import type { CountRow } from './workoutCode';

export type OfferCanJoin =
  | 'yes'
  | 'JOINED'
  | 'CLOSED'
  | 'NO_PLAN'
  | 'NO_PHONE'
  | 'GYM_NOT_ONLINE'
  | 'NOT_ON_ROSTER'
  | 'SHARED_NUMBER'
  | 'NAME_MISMATCH'
  | 'NONE';
const CAN_JOIN: readonly OfferCanJoin[] = ['yes', 'JOINED', 'CLOSED', 'NO_PLAN', 'NO_PHONE', 'GYM_NOT_ONLINE', 'NOT_ON_ROSTER', 'SHARED_NUMBER', 'NAME_MISMATCH', 'NONE'];

export interface MemberOffer {
  id: string;
  title: string;
  workouts: number;
  windowDays: number;
  rewardDays: number;
  minMinutes: number;
  minSets: number;
  joinUntil: string;
  countAppCheckins: boolean;
  open: boolean;
}

export interface OfferMe {
  joinedOn: string;
  windowEndsOn: string;
  /** The gym's own count of matched dates. */
  counted: number;
  days: string[];
  left: boolean;
  earned: boolean;
  given: boolean;
  givenDays: number | null;
  newEnd: string | null;
  undone: boolean;
}

export interface OffersAnswer {
  gymName: string;
  offer: MemberOffer | null;
  me: OfferMe | null;
  canJoin: OfferCanJoin;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const day = (v: unknown): string | null => (typeof v === 'string' && ISO.test(v) ? v : null);
const int = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

function offerFrom(v: unknown): MemberOffer | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const workouts = int(v.workouts, 1, 60);
  const windowDays = int(v.windowDays, 1, 90);
  const rewardDays = int(v.rewardDays, 1, 30);
  const minMinutes = int(v.minMinutes, 1, 240);
  const minSets = int(v.minSets, 1, 60);
  const joinUntil = day(v.joinUntil);
  if (!id || workouts == null || windowDays == null || rewardDays == null || minMinutes == null || minSets == null || !joinUntil) return null;
  return {
    id,
    title: str(v.title),
    workouts,
    windowDays,
    rewardDays,
    minMinutes,
    minSets,
    joinUntil,
    countAppCheckins: v.countAppCheckins !== false,
    open: v.open === true,
  };
}

function meFrom(v: unknown): OfferMe | null {
  if (!isObj(v)) return null;
  const joinedOn = day(v.joinedOn);
  const windowEndsOn = day(v.windowEndsOn);
  const counted = int(v.counted, 0, 1000);
  if (!joinedOn || !windowEndsOn || counted == null) return null;
  return {
    joinedOn,
    windowEndsOn,
    counted,
    days: Array.isArray(v.days) ? v.days.map(day).filter((d): d is string => d !== null) : [],
    left: v.left === true,
    earned: v.earned === true,
    given: v.given === true,
    givenDays: int(v.givenDays, 1, 30),
    newEnd: day(v.newEnd),
    undone: v.undone === true,
  };
}

/** member_offers' answer (also what Join and the dates send answer when they work); null when it is not one. PURE. */
export function offersFromRow(raw: unknown): OffersAnswer | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || r.ok !== true) return null;
  const canJoin = CAN_JOIN.find((c) => c === r.canJoin);
  if (!canJoin) return null;
  const offer = r.offer == null ? null : offerFrom(r.offer);
  // An offer the server sent but that can't be read: show nothing rather than half a card.
  if (r.offer != null && !offer) return null;
  const me = r.me == null ? null : meFrom(r.me);
  if (r.me != null && !me) return null;
  return { gymName: str(r.gymName) || 'Your gym', offer, me, canJoin };
}

/** An answer back in the server's own shape, to keep on the phone (read back with offersFromRow). PURE. */
export function offersToRow(a: OffersAnswer): Record<string, unknown> {
  return { ok: true, gymName: a.gymName, offer: a.offer, me: a.me, canJoin: a.canJoin };
}

/** The refusal code in an answer like {error:'NO_PLAN'}; null when there is none. PURE. */
export function offerErrorOf(raw: unknown): string | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  return isObj(r) && typeof r.error === 'string' && /^[A-Z_]{2,30}$/.test(r.error) ? r.error : null;
}

// ------------------------------------------------------------------ counting

/**
 * The offer's rule for one workout (workoutCode.ts's workoutCounts with the offer's own numbers):
 * logged live in the app's workout screen, finished, at least `minMinutes` long, with at least
 * `minSets` saved sets that are not warm-ups. PURE.
 */
export function offerCounts(r: CountRow, minMinutes: number, minSets: number): boolean {
  return r.source === 'manual' && r.endedAt != null && r.endedAt - r.startedAt >= minMinutes * 60_000 && r.workingSets >= minSets;
}

/** The most dates one send carries (the server takes at most 60). */
export const MAX_DATES = 60;

/**
 * The dates to send: days with a workout that counts, from the day the member joined to the end of
 * their window (never after today), one per day, oldest first, at most 60. Only dates. PURE.
 */
export function datesToSend(rows: readonly CountRow[], me: Pick<OfferMe, 'joinedOn' | 'windowEndsOn'>, today: string, minMinutes: number, minSets: number): string[] {
  const to = me.windowEndsOn < today ? me.windowEndsOn : today;
  const out = new Set<string>();
  for (const r of rows) {
    if (r.dateISO >= me.joinedOn && r.dateISO <= to && offerCounts(r, minMinutes, minSets)) out.add(r.dateISO);
  }
  return [...out].sort().slice(-MAX_DATES);
}

// ------------------------------------------------------------------ consent

/** The member pressed "Join the offer" on this phone, for this offer, after these words. */
export interface OfferConsent {
  memberId: string;
  offerId: string;
  noticeVersion: string;
  at: number;
}

/** Kept on the phone: the consent record; a Leave the gym has not heard yet; the last answer. */
export const OFFER_CONSENT_KEY = 'forgeai-offer-consent';
export const OFFER_LEAVE_KEY = 'forgeai-offer-leave';
export const OFFER_KEPT_KEY = 'forgeai-offer-kept';
/** The last set of dates sent, so the same set is not sent again on every gym check. */
export const OFFER_SENT_KEY = 'forgeai-offer-sent';
/** Every key above: Leave the gym and Erase all data remove them all. */
export const OFFER_STORAGE_KEYS = [OFFER_CONSENT_KEY, OFFER_LEAVE_KEY, OFFER_KEPT_KEY, OFFER_SENT_KEY] as const;

/** The last dates sent for an offer: which offer, the dates (sorted, joined by commas), the day sent. */
export interface OfferSent {
  offerId: string;
  days: string;
  on: string;
}

/** A kept "last sent" record, checked; null when it is not one. PURE. */
export function sentFromRaw(raw: unknown): OfferSent | null {
  if (!isObj(raw)) return null;
  const offerId = str(raw.offerId);
  const on = str(raw.on);
  if (!offerId || !on || typeof raw.days !== 'string') return null;
  return { offerId, days: raw.days, on };
}

/**
 * Send these dates now? A day with a workout but no check-in never matches at the gym, so the same
 * set would otherwise go on every gym check (review fix, 23 Oct 2026). Only when the set changed
 * since the last send for this offer, or once a day (a check-in the desk types in late still
 * counts). PURE.
 */
export function shouldSendDates(last: OfferSent | null, offerId: string, days: readonly string[], today: string): boolean {
  if (!last || last.offerId !== offerId) return true;
  return last.days !== days.join(',') || last.on !== today;
}

/** A kept consent record, checked; null when it is not one. PURE. */
export function consentFromRaw(raw: unknown): OfferConsent | null {
  if (!isObj(raw)) return null;
  const memberId = str(raw.memberId);
  const offerId = str(raw.offerId);
  const noticeVersion = str(raw.noticeVersion);
  if (!memberId || !offerId || !noticeVersion || typeof raw.at !== 'number') return null;
  return { memberId, offerId, noticeVersion, at: raw.at };
}

/**
 * May this phone send workout dates now? Only with BOTH: the member's own "Join the offer" on this
 * phone for this member and this offer, and the gym saying they are in it (not left, not yet
 * earned or given). Anything else: nothing leaves the phone. PURE.
 */
export function mayShareDates(consent: OfferConsent | null, answer: OffersAnswer | null, memberId: string): boolean {
  if (!consent || !answer || !answer.offer || !answer.me) return false;
  if (consent.memberId !== memberId || consent.offerId !== answer.offer.id) return false;
  if (answer.canJoin !== 'JOINED') return false;
  const me = answer.me;
  return !me.left && !me.earned && !me.given;
}

// ------------------------------------------------------------------ the card

export type OfferCardState = 'join' | 'blocked' | 'progress' | 'earned' | 'given' | 'ended';

export interface OfferCardView {
  state: OfferCardState;
  eyebrow: string;
  title: string;
  lines: string[];
  /** Progress dots: `done` of `total` (joined only). */
  dots: { done: number; total: number } | null;
  /** The one button: join (opens the consent screen), leave, or none. */
  action: 'join' | 'leave' | null;
}

export function offerNumbers(o: MemberOffer, gymName: string): OfferNumbers {
  return { gym: gymName, n: o.workouts, w: o.windowDays, d: o.rewardDays, min: o.minMinutes, sets: o.minSets };
}

/**
 * What the Offers card shows; null = no card (no offer, a closed one, or a server without offers).
 * `today` is the phone's India day. PURE.
 */
export function offerView(a: OffersAnswer | null, today: string): OfferCardView | null {
  if (!a || !a.offer || a.canJoin === 'NONE' || a.canJoin === 'CLOSED') return null;
  const o = a.offer;
  const nums = offerNumbers(o, a.gymName);
  const joinCard = (action: 'join' | null, extra: string | null): OfferCardView => ({
    state: action ? 'join' : 'blocked',
    eyebrow: OFFER_WORDS.eyebrow(a.gymName),
    title: OFFER_WORDS.title(nums),
    lines: extra ? [OFFER_WORDS.how(nums), extra] : [OFFER_WORDS.how(nums)],
    dots: null,
    action,
  });
  if (a.canJoin !== 'JOINED') {
    if (!o.open) return null;
    if (a.canJoin === 'yes') return joinCard('join', null);
    if (a.canJoin === 'NO_PHONE') return joinCard(null, OFFER_WORDS.noPhone);
    if (a.canJoin === 'NO_PLAN') return joinCard(null, OFFER_WORDS.noPlan);
    return joinCard(null, OFFER_WORDS.askDesk);
  }
  const me = a.me;
  if (!me) return null;
  const n = o.workouts;
  const c = Math.min(me.counted, n);
  const base = { eyebrow: OFFER_WORDS.joinedEyebrow, dots: { done: c, total: n } };
  if (me.given && me.newEnd) {
    return { ...base, state: 'given', title: OFFER_WORDS.progress(n, n), lines: [OFFER_WORDS.given(tinyDateWithYear(me.newEnd, today))], action: null };
  }
  if (me.earned) {
    // Taken back by the gym (a mistake): no promise that days are coming.
    const line = me.undone ? OFFER_WORDS.earnedOnly(n) : OFFER_WORDS.earned(n, o.rewardDays);
    return { ...base, state: 'earned', title: OFFER_WORDS.progress(n, n), lines: [line], action: null };
  }
  if (me.windowEndsOn < today) {
    return { ...base, state: 'ended', title: OFFER_WORDS.progress(c, n), lines: [OFFER_WORDS.ended(c, n, o.windowDays)], action: null };
  }
  return {
    ...base,
    state: 'progress',
    title: OFFER_WORDS.progress(c, n),
    lines: [OFFER_WORDS.until(tinyDateWithYear(me.windowEndsOn, today)), OFFER_WORDS.counts],
    action: 'leave',
  };
}
