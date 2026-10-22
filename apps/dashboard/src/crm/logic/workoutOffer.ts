/**
 * The workout offer (OWNER-INBOX #49 step 2, 23 Oct 2026; R-82): "Train 10 times in 30 days, get 3
 * extra days". PURE: the shapes of the server's answers (supabase/migrations/0025_workout_offer.sql:
 * owner_offers, owner_save_offer, staff_give_reward, owner_undo_reward) read tolerantly, the owner's
 * form checked, each member's state, and plain words for every refusal.
 *
 * A workout counts only on a day the gym's own register shows a check-in, and only when the member's
 * phone logged a live workout of 20+ minutes with 6+ working sets that day. The phone sends only the
 * DATES, only after "Join the offer"; the server keeps a date only when its check-in table agrees,
 * and counts them itself. Per offer the owner picks how the days are given: by themselves, or by the
 * desk with one tap ("Ready for reward"). Either way it is free days, not a sale: no receipt, no GST.
 */

import { addDays, formatDay, isValidDateISO, type DateISO } from './dates';
import { letterCount } from './messageWords';

export const OFFER_LIMITS = {
  workouts: { min: 4, max: 30, start: 10 },
  windowDays: { min: 7, max: 60, start: 30 },
  rewardDays: { min: 1, max: 7, start: 3 },
  /** Joining stays open at most this many days ahead. */
  joinAheadMax: 90,
  joinAheadStart: 30,
} as const;

/** What the phone checks for each workout (the server tells the phone; fixed for now). */
export const OFFER_MIN_MINUTES = 20;
export const OFFER_MIN_SETS = 6;

export const OFFER_TITLE_MAX = 60;

export interface WorkoutOffer {
  id: string;
  title: string;
  workouts: number;
  windowDays: number;
  rewardDays: number;
  minMinutes: number;
  minSets: number;
  startsOn: DateISO;
  joinUntil: DateISO;
  countAppCheckins: boolean;
  autoGive: boolean;
  /** Epoch ms. */
  createdAt: number;
  createdByName: string | null;
  /** Epoch ms, or null while it runs. */
  stoppedAt: number | null;
  /** Members can join today. */
  open: boolean;
  joined: number;
  inNow: number;
  ready: number;
  given: number;
}

export interface OfferMember {
  offerId: string;
  /** The member's id on the gym's list. */
  rosterId: string;
  joinedOn: DateISO;
  windowEndsOn: DateISO;
  /** The server's own count of dates that matched a check-in. */
  counted: number;
  deskDays: number;
  appDays: number;
  left: boolean;
  earnedAt: number | null;
  givenAt: number | null;
  givenAuto: boolean | null;
  givenByName: string | null;
  givenDays: number | null;
  oldEnd: DateISO | null;
  newEnd: DateISO | null;
  undoneAt: number | null;
  undoneByName: string | null;
}

export interface OffersAnswer {
  offers: WorkoutOffer[];
  members: OfferMember[];
  /** The server's India day, when it said. */
  today: DateISO | null;
}

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const int = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const day = (v: unknown): DateISO | null => (isValidDateISO(v) ? (v as DateISO) : null);
const time = (v: unknown): number | null => {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/** One offer row (owner_offers' list, owner_save_offer, owner_stop_offer). Null when it is not one. PURE. */
export function offerFromRow(raw: unknown): WorkoutOffer | null {
  if (!isRow(raw)) return null;
  const id = str(raw.id);
  const title = typeof raw.title === 'string' ? raw.title : null;
  const startsOn = day(raw.startsOn);
  const joinUntil = day(raw.joinUntil);
  if (!id || title === null || !startsOn || !joinUntil) return null;
  return {
    id,
    title,
    workouts: int(raw.workouts, OFFER_LIMITS.workouts.start),
    windowDays: int(raw.windowDays, OFFER_LIMITS.windowDays.start),
    rewardDays: int(raw.rewardDays, OFFER_LIMITS.rewardDays.start),
    minMinutes: int(raw.minMinutes, OFFER_MIN_MINUTES),
    minSets: int(raw.minSets, OFFER_MIN_SETS),
    startsOn,
    joinUntil,
    countAppCheckins: raw.countAppCheckins !== false,
    autoGive: raw.autoGive === true,
    createdAt: time(raw.createdAt) ?? 0,
    createdByName: str(raw.createdByName),
    stoppedAt: time(raw.stoppedAt),
    open: raw.open === true,
    joined: int(raw.joined, 0),
    inNow: int(raw.inNow, 0),
    ready: int(raw.ready, 0),
    given: int(raw.given, 0),
  };
}

/** One member row of owner_offers. Null when it is not one. PURE. */
export function offerMemberFromRow(raw: unknown): OfferMember | null {
  if (!isRow(raw)) return null;
  const offerId = str(raw.offerId);
  const rosterId = str(raw.rosterId);
  const joinedOn = day(raw.joinedOn);
  const windowEndsOn = day(raw.windowEndsOn);
  if (!offerId || !rosterId || !joinedOn || !windowEndsOn) return null;
  return {
    offerId,
    rosterId,
    joinedOn,
    windowEndsOn,
    counted: int(raw.counted, 0),
    deskDays: int(raw.deskDays, 0),
    appDays: int(raw.appDays, 0),
    left: raw.left === true,
    earnedAt: time(raw.earnedAt),
    givenAt: time(raw.givenAt),
    givenAuto: typeof raw.givenAuto === 'boolean' ? raw.givenAuto : null,
    givenByName: str(raw.givenByName),
    givenDays: raw.givenDays == null ? null : int(raw.givenDays, 0) || null,
    oldEnd: day(raw.oldEnd),
    newEnd: day(raw.newEnd),
    undoneAt: time(raw.undoneAt),
    undoneByName: str(raw.undoneByName),
  };
}

/** owner_offers' whole answer. Anything else (an empty list from an odd server) is no offers. PURE. */
export function offersFromAnswer(raw: unknown): OffersAnswer {
  if (!isRow(raw)) return { offers: [], members: [], today: null };
  const offers = (Array.isArray(raw.offers) ? raw.offers : []).map(offerFromRow).filter((o): o is WorkoutOffer => o !== null);
  const members = (Array.isArray(raw.members) ? raw.members : [])
    .map(offerMemberFromRow)
    .filter((m): m is OfferMember => m !== null);
  return { offers, members, today: day(raw.today) };
}

export interface GiveAnswer {
  alreadyGiven: boolean;
  days: number;
  oldEnd: DateISO | null;
  newEnd: DateISO | null;
}

/** staff_give_reward's answer. Null when it is not one. PURE. */
export function giveFromAnswer(raw: unknown): GiveAnswer | null {
  if (!isRow(raw) || raw.ok !== true) return null;
  return { alreadyGiven: raw.alreadyGiven === true, days: int(raw.days, 0), oldEnd: day(raw.oldEnd), newEnd: day(raw.newEnd) };
}

/** owner_undo_reward's answer: the plan's last day again. Null when it is not one. PURE. */
export function undoFromAnswer(raw: unknown): { endsOn: DateISO } | null {
  if (!isRow(raw) || raw.ok !== true) return null;
  const endsOn = day(raw.endsOn);
  return endsOn ? { endsOn } : null;
}

// ---------------------------------------------------------------- the running offer

/** The offer still running (not stopped), else null. The server allows one at a time. PURE. */
export function runningOffer(offers: readonly WorkoutOffer[]): WorkoutOffer | null {
  return offers.find((o) => o.stoppedAt === null) ?? null;
}

// ---------------------------------------------------------------- one member's state

export type OfferMemberState = 'in' | 'ready' | 'given' | 'takenBack' | 'left' | 'ended';

/** Where a member stands. A reward taken back stays "taken back" (the owner may give it again). PURE. */
export function memberState(m: OfferMember, today: DateISO): OfferMemberState {
  if (m.givenAt !== null) return 'given';
  if (m.earnedAt !== null) return m.undoneAt !== null ? 'takenBack' : 'ready';
  if (m.left) return 'left';
  if (m.windowEndsOn < today) return 'ended';
  return 'in';
}

export const STATE_WORDS: Record<OfferMemberState, string> = {
  in: 'In the offer',
  ready: 'Ready for reward',
  given: 'Rewarded',
  takenBack: 'Reward taken back',
  left: 'Left the offer',
  ended: 'Window over',
};

/**
 * May this row get a Give button? Earned and not given. A reward the owner took back is given again
 * by the owner only (the server answers the desk TAKEN_BACK, review fix 23 Oct 2026). PURE.
 */
export function canGive(m: OfferMember, owner: boolean): boolean {
  return m.earnedAt !== null && m.givenAt === null && (m.undoneAt === null || owner);
}

/** "6 of 10 workouts · desk 5 · app 1 · until 21 Nov 2026". PURE. */
export function progressLine(m: OfferMember, o: Pick<WorkoutOffer, 'workouts'>): string {
  const parts = [`${Math.min(m.counted, o.workouts)} of ${o.workouts} workouts`];
  if (m.counted > 0) parts.push(`desk ${m.deskDays}`, `app ${m.appDays}`);
  parts.push(`until ${formatDay(m.windowEndsOn)}`);
  return parts.join(' · ');
}

/** "Extended free by 3 days (reward) · automatic · new last day 3 Dec 2026". PURE. */
export function givenLine(m: OfferMember): string {
  const days = m.givenDays ?? 0;
  const head = `Extended free by ${days === 1 ? '1 day' : `${days} days`} (reward)`;
  const who = m.givenAuto ? 'automatic' : m.givenByName ? `by ${m.givenByName}` : null;
  const end = m.newEnd ? `new last day ${formatDay(m.newEnd)}` : null;
  return [head, who, end].filter(Boolean).join(' · ');
}

/** "Joined 4 · Ready 1 · Rewarded 2". PURE. */
export function countsLine(o: Pick<WorkoutOffer, 'joined' | 'ready' | 'given'>): string {
  return `Joined ${o.joined} · Ready ${o.ready} · Rewarded ${o.given}`;
}

export function modeWords(autoGive: boolean): string {
  return autoGive ? 'The days are given by themselves when a member qualifies.' : 'The desk gives the days with one tap.';
}

/** How many rewards wait for the desk across the offers. PURE. */
export function rewardsToGive(a: OffersAnswer): number {
  return a.members.filter((m) => m.earnedAt !== null && m.givenAt === null && m.undoneAt === null).length;
}

// ---------------------------------------------------------------- the owner's form

export interface OfferDraft {
  workouts: string;
  windowDays: string;
  rewardDays: string;
  joinUntil: DateISO;
  countAppCheckins: boolean;
  autoGive: boolean;
}

export function startingDraft(today: DateISO): OfferDraft {
  return {
    workouts: String(OFFER_LIMITS.workouts.start),
    windowDays: String(OFFER_LIMITS.windowDays.start),
    rewardDays: String(OFFER_LIMITS.rewardDays.start),
    joinUntil: addDays(today, OFFER_LIMITS.joinAheadStart),
    countAppCheckins: true,
    autoGive: false,
  };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** The offer's name, as members see it: "Train 10 times in 30 days, get 3 extra days". PURE. */
export function offerTitle(workouts: number, windowDays: number, rewardDays: number): string {
  return `Train ${plural(workouts, 'time', 'times')} in ${plural(windowDays, 'day', 'days')}, get ${plural(rewardDays, 'extra day', 'extra days')}`;
}

/** The card line members see under it. PURE. */
export function offerRuleLine(minMinutes = OFFER_MIN_MINUTES, minSets = OFFER_MIN_SETS): string {
  return `Check in at the gym and log a workout of ${minMinutes}+ minutes with ${minSets}+ sets.`;
}

const whole = (s: string): number | null => (/^\d{1,3}$/.test(s.trim()) ? Number(s.trim()) : null);

export interface CheckedDraft {
  title: string;
  workouts: number;
  windowDays: number;
  rewardDays: number;
  joinUntil: DateISO;
  countAppCheckins: boolean;
  autoGive: boolean;
}

/** The form checked: the numbers to send, or the first problem in plain words. PURE. */
export function checkDraft(d: OfferDraft, today: DateISO): { ok: true; offer: CheckedDraft } | { ok: false; problem: string } {
  const L = OFFER_LIMITS;
  const workouts = whole(d.workouts);
  const windowDays = whole(d.windowDays);
  const rewardDays = whole(d.rewardDays);
  if (workouts === null || workouts < L.workouts.min || workouts > L.workouts.max)
    return { ok: false, problem: `Workouts: a whole number from ${L.workouts.min} to ${L.workouts.max}.` };
  if (windowDays === null || windowDays < L.windowDays.min || windowDays > L.windowDays.max)
    return { ok: false, problem: `Within: a whole number of days from ${L.windowDays.min} to ${L.windowDays.max}.` };
  if (rewardDays === null || rewardDays < L.rewardDays.min || rewardDays > L.rewardDays.max)
    return { ok: false, problem: `Reward: a whole number of days from ${L.rewardDays.min} to ${L.rewardDays.max}.` };
  if (workouts > windowDays) return { ok: false, problem: 'At most one workout counts a day: give more days than workouts.' };
  if (!isValidDateISO(d.joinUntil) || d.joinUntil < today || d.joinUntil > addDays(today, L.joinAheadMax))
    return { ok: false, problem: `Members can join until: today or a day in the next ${L.joinAheadMax} days.` };
  const title = offerTitle(workouts, windowDays, rewardDays);
  if (letterCount(title) > OFFER_TITLE_MAX) return { ok: false, problem: 'The offer name is too long.' };
  return {
    ok: true,
    offer: { title, workouts, windowDays, rewardDays, joinUntil: d.joinUntil, countAppCheckins: d.countAppCheckins, autoGive: d.autoGive },
  };
}

// ---------------------------------------------------------------- errors

const textOf = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err) return String((err as { message?: unknown }).message ?? '');
  return String(err ?? '');
};

/**
 * PostgREST's "no function with these argument names" (PGRST202): the gym's server has not had
 * 0025 yet. The panel then behaves exactly as before the offer existed. PURE.
 */
export function isNoSuchFunction(err: unknown): boolean {
  if (typeof err === 'object' && err && (err as { code?: unknown }).code === 'PGRST202') return true;
  return /\bPGRST202\b|Could not find the function/i.test(textOf(err));
}

/** Plain words for a refused offer action, or null when it is not one of the offer's codes. PURE. */
export function offerErrorWords(err: unknown): string | null {
  const t = textOf(err);
  if (/\bOWNER_ONLY\b/.test(t)) return 'Only the owner can do this.';
  if (/\bONE_RUNNING\b/.test(t)) return 'An offer is already running. Stop it first to start a new one.';
  if (/\bNOT_EARNED\b/.test(t)) return 'This member has not reached the target yet.';
  if (/\bNO_PLAN\b/.test(t)) return 'No gym plan running. Give it when they renew.';
  if (/\bCHANGED\b/.test(t)) return 'Their plan changed since; change the days by hand with Freeze / extra days.';
  if (/\bTAKEN_BACK\b/.test(t)) return 'The owner took this reward back. Only the owner can give it again.';
  if (/\bNOT_GIVEN\b/.test(t)) return 'This reward was not given, so there is nothing to take back.';
  if (/\bGONE\b/.test(t)) return 'That offer is no longer there. The list is fresh now.';
  if (/\bINVALID\b/.test(t)) return 'The server did not accept these numbers. Check them and try again.';
  return null;
}
