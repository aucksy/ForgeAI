/**
 * "My membership" (OWNER-INBOX #6, decided 18 Oct 2026) — the PURE half. The gym's own records say
 * which plan the member is on (supabase/migrations/0023_member_membership.sql): its name and end,
 * days left, a renewal already paid, personal-training sessions used, and days at the gym this
 * month. No money is ever shown: the member's number is not verified (see 0023). This file reads
 * the answer and picks every word; MembershipCard.tsx lays them out.
 */
import { daysBetween, tinyDateWithYear } from '@/lib/date';

export type MembershipProblem = 'NO_PHONE' | 'NOT_ON_ROSTER' | 'GYM_NOT_ONLINE' | 'NAME_MISMATCH' | 'SHARED_NUMBER';
const PROBLEMS: readonly MembershipProblem[] = ['NO_PHONE', 'NOT_ON_ROSTER', 'GYM_NOT_ONLINE', 'NAME_MISMATCH', 'SHARED_NUMBER'];

export interface PlanSpan {
  planName: string;
  startsOn: string;
  endsOn: string;
}

export interface CurrentPlan extends PlanSpan {
  ptSessions: number | null;
  ptUsed: number;
  trainer: string | null;
}

export type MembershipAnswer =
  | {
      ok: true;
      gymName: string;
      memberName: string;
      /** The gym's today (India), from the server. */
      day: string;
      current: CurrentPlan | null;
      next: PlanSpan | null;
      lastEndedOn: string | null;
      visitsThisMonth: number;
    }
  | { ok: false; problem: MembershipProblem; gymName: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const day = (v: unknown): string | null => (typeof v === 'string' && ISO.test(v) ? v : null);

function spanFrom(v: unknown): PlanSpan | null {
  if (!isObj(v)) return null;
  const startsOn = day(v.startsOn);
  const endsOn = day(v.endsOn);
  if (!startsOn || !endsOn) return null;
  return { planName: str(v.planName) || 'Your plan', startsOn, endsOn };
}

/** The server's answer, checked; null when it is not one. PURE. */
export function membershipFromRow(raw: unknown): MembershipAnswer | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r)) return null;
  const gymName = str(r.gymName) || 'Your gym';
  const problem = PROBLEMS.find((p) => p === r.error);
  if (problem) return { ok: false, problem, gymName };
  if (r.ok !== true) return null;
  const today = day(r.day);
  if (!today) return null;
  const span = spanFrom(r.current);
  // A plan the server sent but whose dates can't be read: show nothing rather than "No plan yet".
  if (r.current != null && !span) return null;
  const c = isObj(r.current) ? r.current : {};
  const pt = typeof c.ptSessions === 'number' && Number.isInteger(c.ptSessions) && c.ptSessions > 0 ? c.ptSessions : null;
  const used = typeof c.ptUsed === 'number' && Number.isInteger(c.ptUsed) && c.ptUsed >= 0 ? c.ptUsed : 0;
  const visits = typeof r.visitsThisMonth === 'number' && Number.isInteger(r.visitsThisMonth) && r.visitsThisMonth >= 0 ? r.visitsThisMonth : 0;
  return {
    ok: true,
    gymName,
    memberName: str(r.memberName),
    day: today,
    current: span ? { ...span, ptSessions: pt, ptUsed: used, trainer: str(c.trainer) || null } : null,
    next: spanFrom(r.next),
    lastEndedOn: day(r.lastEndedOn),
    visitsThisMonth: visits,
  };
}

/** The last answer, kept on the phone per member: { memberId, answer, at }. Erase all data removes it. */
export const MEMBERSHIP_STORAGE_KEY = 'forgeai-membership';

/** Within this many days of the end, the card asks the member to renew (with nothing paid after it). */
export const RENEW_SOON_DAYS = 7;

export type MembershipTone = 'good' | 'soon' | 'ended' | 'none';

export interface MembershipView {
  tone: MembershipTone;
  /** The big line: the plan's name, or what is missing. */
  title: string;
  /** The line under it: when it ends, and how long that is. */
  when: string | null;
  /** Small lines below, in order (renew, next plan, personal training, days at the gym). */
  lines: string[];
}

const dayWord = (n: number): string => (n === 1 ? '1 day' : `${n} days`);

/** "Ends 30 Nov · 12 days left", "Ends today", "Ends tomorrow". PURE. */
export function endsLine(endsOn: string, today: string): string {
  const left = daysBetween(today, endsOn);
  const date = tinyDateWithYear(endsOn, today);
  if (left <= 0) return `Ends today, ${date}`;
  if (left === 1) return `Ends tomorrow, ${date}`;
  return `Ends ${date} · ${dayWord(left)} left`;
}

/** What the card says for an answer. PURE. */
export function membershipView(a: MembershipAnswer): MembershipView {
  if (!a.ok) {
    if (a.problem === 'NO_PHONE') {
      return { tone: 'none', title: 'Check in once to see your plan', when: null, lines: [`Scan ${a.gymName}'s check-in QR at the gym. After that, your plan and its end date show here.`] };
    }
    if (a.problem === 'NAME_MISMATCH') {
      return { tone: 'none', title: 'Ask the desk to check your name', when: null, lines: [`${a.gymName}'s list has a different name for the number you checked in with. Your plan shows here once they match.`] };
    }
    if (a.problem === 'SHARED_NUMBER') {
      return { tone: 'none', title: 'Your number is shared', when: null, lines: [`More than one ${a.gymName} member has this mobile number. Ask the desk to give each person their own.`] };
    }
    if (a.problem === 'NOT_ON_ROSTER') {
      return { tone: 'none', title: 'Your gym has a different number', when: null, lines: [`${a.gymName}'s list doesn't have the number you checked in with. Ask the desk to update it.`] };
    }
    return { tone: 'none', title: 'Not available yet', when: null, lines: [`${a.gymName} doesn't keep its members' plans in MettleUp yet. Ask the desk.`] };
  }
  const visits = a.visitsThisMonth === 0 ? 'No days at the gym yet this month.' : `${dayWord(a.visitsThisMonth)} at the gym this month.`;
  const nextLine = a.next ? `Next: ${a.next.planName}, from ${tinyDateWithYear(a.next.startsOn, a.day)}.` : null;
  const cur = a.current;
  if (cur) {
    const left = daysBetween(a.day, cur.endsOn);
    const soon = !a.next && left <= RENEW_SOON_DAYS;
    const lines: string[] = [];
    if (soon) lines.push('Renew at the desk before it ends.');
    if (nextLine) lines.push(nextLine);
    if (cur.ptSessions) {
      const usedAll = Math.min(cur.ptUsed, cur.ptSessions);
      lines.push(`Personal training: ${usedAll} of ${cur.ptSessions} used${cur.trainer ? `, with ${cur.trainer}` : ''}.`);
    }
    lines.push(visits);
    return { tone: soon ? 'soon' : 'good', title: cur.planName, when: endsLine(cur.endsOn, a.day), lines };
  }
  if (a.next) {
    return { tone: 'good', title: a.next.planName, when: `Starts ${tinyDateWithYear(a.next.startsOn, a.day)}`, lines: [visits] };
  }
  if (a.lastEndedOn) {
    return { tone: 'ended', title: 'Your plan has ended', when: `Ended ${tinyDateWithYear(a.lastEndedOn, a.day)}`, lines: ['Renew at the desk to keep training.', visits] };
  }
  return { tone: 'none', title: 'No plan yet', when: null, lines: [`${a.gymName} has no plan for you on record. Ask the desk.`] };
}

/** "Updated 6:42 pm" under an answer kept from before (offline). PURE. */
export function keptLine(atMs: number, nowMs: number, clock: (ms: number) => string): string {
  const sameDay = new Date(atMs).toDateString() === new Date(nowMs).toDateString();
  return sameDay ? `No internet. As of ${clock(atMs)} today.` : 'No internet. As of an earlier day: ask the desk if unsure.';
}
