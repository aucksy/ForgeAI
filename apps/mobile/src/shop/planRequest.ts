/**
 * "Pause my plan" / "Renew my plan" (F150) - the PURE half. The member asks the gym's desk to pause
 * (freeze) their plan for some days, or to renew it on a plan they pick. The desk approves with its
 * own freeze and renew tools (F81); a renewal is still paid at the desk. The server side is
 * supabase/migrations/0044_plan_requests.sql. This file reads the server's answers, checks the
 * member's choice before it is sent, and picks every word; MembershipCard.tsx lays them out.
 * No price is ever shown (0023's rule: the member's number is not verified).
 * Member words: never "volume", "PR" or "session".
 */
import { addDays, daysBetween, tinyDateWithYear } from '@/lib/date';

export type PlanRequestKind = 'freeze' | 'renew';
export type PlanRequestStatus = 'pending' | 'approved' | 'declined';

export interface PlanRequest {
  id: string;
  kind: PlanRequestKind;
  /** A pause's first and last day (both counted); null on a renewal. */
  from: string | null;
  to: string | null;
  planName: string | null;
  status: PlanRequestStatus;
  /** After approval: the plan's dates from the gym's records (pause: the new end; renew: the new plan). */
  startsOn: string | null;
  endsOn: string | null;
}

export interface RenewChoice {
  id: string;
  name: string;
  /** "3 months", "1 year" (built from the plan's length; empty when it can't be read). */
  length: string;
}

export type PlanRequestsAnswer =
  | { ok: true; day: string; plans: RenewChoice[]; requests: PlanRequest[] }
  /** The member's identity problem (0023): the plan card already explains it, so no buttons. */
  | { ok: false; problem: string };

/** The longest pause one request may ask for, and how far ahead it may start (the server's limits). */
export const PAUSE_MAX_DAYS = 365;
export const PAUSE_START_WITHIN_DAYS = 90;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const day = (v: unknown): string | null => (typeof v === 'string' && ISO.test(v) ? v : null);

const UNIT_WORD: Record<string, [string, string]> = {
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years'],
};

/** "3 months", "1 year"; '' when the plan's length can't be read. PURE. */
export function planLength(unit: unknown, count: unknown): string {
  const w = typeof unit === 'string' ? UNIT_WORD[unit] : undefined;
  if (!w || typeof count !== 'number' || !Number.isInteger(count) || count < 1) return '';
  return `${count} ${count === 1 ? w[0] : w[1]}`;
}

/** One request from the server; null when it is not one. PURE. */
export function planRequestFromRow(v: unknown): PlanRequest | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const kind = v.kind === 'freeze' || v.kind === 'renew' ? v.kind : null;
  const status = v.status === 'pending' || v.status === 'approved' || v.status === 'declined' ? v.status : null;
  if (!id || !kind || !status) return null;
  const from = day(v.from);
  const to = day(v.to);
  if (kind === 'freeze' && (!from || !to)) return null;
  return {
    id,
    kind,
    from: kind === 'freeze' ? from : null,
    to: kind === 'freeze' ? to : null,
    planName: str(v.planName) || null,
    status,
    startsOn: day(v.startsOn),
    endsOn: day(v.endsOn),
  };
}

/** member_plan_requests' answer, checked; null when it is not one. PURE. */
export function planRequestsFromRow(raw: unknown): PlanRequestsAnswer | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r)) return null;
  if (typeof r.error === 'string' && r.error) return { ok: false, problem: r.error };
  if (r.ok !== true) return null;
  const today = day(r.day);
  if (!today) return null;
  const plans: RenewChoice[] = [];
  for (const p of Array.isArray(r.plans) ? r.plans : []) {
    if (!isObj(p)) continue;
    const id = str(p.id);
    const name = str(p.name);
    if (id && name) plans.push({ id, name, length: planLength(p.durationUnit, p.durationCount) });
  }
  const requests: PlanRequest[] = [];
  for (const q of Array.isArray(r.requests) ? r.requests : []) {
    const req = planRequestFromRow(q);
    if (req) requests.push(req);
  }
  return { ok: true, day: today, plans, requests };
}

/** member_ask_plan_change's answer: the new request, or the server's refusal code. PURE. */
export function askAnswerFromRow(raw: unknown): { ok: true; request: PlanRequest } | { ok: false; refused: string } | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r)) return null;
  if (typeof r.error === 'string' && r.error) return { ok: false, refused: r.error };
  const request = r.ok === true ? planRequestFromRow(r.request) : null;
  return request ? { ok: true, request } : null;
}

/** The number of days a pause covers (first and last day both count). PURE. */
export function pauseDays(from: string, to: string): number {
  return daysBetween(from, to) + 1;
}

/**
 * Is this pause one the server will take? null = yes, else the words to show. Same limits as the
 * server (0044): starts today or within 90 days, ends on or after it starts, at most 365 days. PURE.
 */
export function pauseProblem(from: string | null, to: string | null, today: string): string | null {
  if (!from) return PLAN_REQUEST_WORDS.pickStart;
  if (!to) return PLAN_REQUEST_WORDS.pickEnd;
  if (daysBetween(today, from) < 0) return PLAN_REQUEST_WORDS.startPast;
  if (daysBetween(today, from) > PAUSE_START_WITHIN_DAYS) return PLAN_REQUEST_WORDS.startFar;
  if (daysBetween(from, to) < 0) return PLAN_REQUEST_WORDS.endBeforeStart;
  if (pauseDays(from, to) > PAUSE_MAX_DAYS) return PLAN_REQUEST_WORDS.tooLong;
  return null;
}

/**
 * A tap on a day in the pause calendar: the first tap picks the start, the second the end (a day
 * before the start starts again from there). PURE.
 */
export function tapPauseDay(from: string | null, to: string | null, tapped: string): { from: string; to: string | null } {
  if (!from || to) return { from: tapped, to: null };
  if (daysBetween(from, tapped) < 0) return { from: tapped, to: null };
  return { from, to: tapped };
}

/** The last day the pause calendar offers as a start (today + 90). PURE. */
export function lastStartDay(today: string): string {
  return addDays(today, PAUSE_START_WITHIN_DAYS);
}

export const PLAN_REQUEST_WORDS = {
  pauseButton: 'Pause my plan', // member-words
  renewButton: 'Renew my plan', // member-words
  pauseTitle: 'Pause my plan', // member-words
  pauseHelp: 'Tap the first day you will be away, then the last day. The desk adds those days to the end of your plan.', // member-words
  renewTitle: 'Renew my plan', // member-words
  renewHelp: 'Pick a plan. The desk sets it up, and you pay at the desk.', // member-words
  noPlans: 'Your gym has no plans to pick here yet. Ask the desk.', // member-words
  send: 'Send to the desk', // member-words
  sent: 'Request sent. The desk will confirm.', // member-words
  takeBack: 'Take back my request', // member-words
  gotIt: 'Got it', // member-words
  pickStart: 'Tap the first day of your pause.', // member-words
  pickEnd: 'Now tap the last day of your pause.', // member-words
  startPast: 'Pick a day from today on.', // member-words
  startFar: 'A pause can start up to 90 days from today.', // member-words
  endBeforeStart: 'The last day must be on or after the first day.', // member-words
  tooLong: 'A pause can be up to 365 days.', // member-words
  failed: "Couldn't send it. Check your internet and try again.", // member-words
} as const;

/** The words for a refusal code from the server (0044). PURE. */
export function refusedWords(code: string): string {
  switch (code) {
    case 'ALREADY_ASKED':
      return 'You already asked for this. The desk will answer soon.'; // member-words
    case 'TOO_MANY':
      return 'You have sent a lot of requests today. Try again tomorrow, or ask the desk.'; // member-words
    case 'NO_PLAN':
      return 'You need a running plan to pause. Ask the desk.'; // member-words
    case 'BAD_PLAN':
      return 'That plan is no longer offered. Pick another.'; // member-words
    case 'BAD_DATES':
      return 'Those dates can’t be used. Pick them again.'; // member-words
    case 'SUSPENDED':
      return 'Your gym is not taking requests in the app right now. Ask the desk.'; // member-words
    default:
      return PLAN_REQUEST_WORDS.failed;
  }
}

/** "Pause 3 Nov to 9 Nov (7 days)" or "Renew: Gold 3 months". PURE. */
export function requestWhat(r: PlanRequest, today: string): string {
  if (r.kind === 'freeze' && r.from && r.to) {
    const n = pauseDays(r.from, r.to);
    return `Pause ${tinyDateWithYear(r.from, today)} to ${tinyDateWithYear(r.to, today)} (${n === 1 ? '1 day' : `${n} days`})`; // member-words
  }
  return `Renew: ${r.planName ?? 'your plan'}`; // member-words
}

/** The line the card shows for one request: waiting, done, or not done. PURE. */
export function requestLine(r: PlanRequest, today: string): string {
  const what = requestWhat(r, today);
  if (r.status === 'pending') return `${what}. ${PLAN_REQUEST_WORDS.sent}`; // member-words
  if (r.status === 'declined') return `${what}. The desk could not do this one. Ask them about it.`; // member-words
  if (r.kind === 'freeze') {
    return r.endsOn
      ? `Your plan is paused. It now ends ${tinyDateWithYear(r.endsOn, today)}.` // member-words
      : 'Your plan is paused. The desk added the days.'; // member-words
  }
  const plan = r.planName ?? 'Your new plan';
  return r.startsOn && r.endsOn
    ? `Renewed: ${plan}, ${tinyDateWithYear(r.startsOn, today)} to ${tinyDateWithYear(r.endsOn, today)}. Pay at the desk if you have not yet.` // member-words
    : `Renewed: ${plan}. Pay at the desk if you have not yet.`; // member-words
}

/** Which of the two buttons the card shows: none while one of that kind waits. PURE. */
export function planRequestButtons(a: PlanRequestsAnswer | null, hasCurrentPlan: boolean): { pause: boolean; renew: boolean } {
  if (!a || !a.ok) return { pause: false, renew: false };
  const waiting = (k: PlanRequestKind) => a.requests.some((r) => r.kind === k && r.status === 'pending');
  return { pause: hasCurrentPlan && !waiting('freeze'), renew: a.plans.length > 0 && !waiting('renew') };
}

/** The decided requests the member has now been shown (to tell the gym they were seen). PURE. */
export function decidedIds(a: PlanRequestsAnswer | null): string[] {
  if (!a || !a.ok) return [];
  return a.requests.filter((r) => r.status !== 'pending').map((r) => r.id);
}
