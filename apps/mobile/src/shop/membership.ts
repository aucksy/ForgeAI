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
      /**
       * F123 (supabase 0055): the pass company (FITPASS, cultpass...) when the member trains here on
       * a pass, else null. A server without 0055 sends none: null.
       */
      pass?: string | null;
      /** QA builds only: the pass came from the device UAT's stand-in plan (withQaPassStandIn). */
      qaStandIn?: boolean;
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
    pass: str(r.pass).slice(0, 40) || null,
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
  // F123: a pass member (FITPASS, cultpass...) has no plan to renew; the gym counts each visit for the company.
  // Checked before a running plan: the desk may move a paying member to a pass while an old plan still runs,
  // and the admin panel then shows them as a pass member too (logic/membership.ts there).
  if (a.pass) {
    const lines = [
      `You train at ${a.gymName} with ${a.pass}. There is no plan to renew.`,
      `Scan the gym's check-in QR when you arrive. The gym counts it as a ${a.pass} visit.`,
      visits,
    ];
    if (a.qaStandIn) lines.push(QA_PASS_STAND_IN_NOTE);
    return { tone: 'good', title: `${a.pass} member`, when: null, lines };
  }
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

/**
 * F123 device UAT, QA builds only (qa-device.yml writes extra.qaStandIns with 'passMember' into app.json before it
 * builds the emulator APK; store and GitHub builds never carry it). Until the gym's server has 0055 it cannot say
 * "pass member", so the UAT gym gives the test member a running plan with this name (qa/uat_gym.py make-pass): the
 * old server then lets the check-in through, as 0055 does, and this build reads the plan as the pass it stands for.
 * The card says on screen that it is test data. Once 0055 is live the server's own `pass` wins.
 */
export const QA_PASS_PLAN_PREFIX = 'QA pass stand-in: ';
export const QA_PASS_STAND_IN_NOTE = "Test build: a stand-in pass, because your gym's server does not have this yet.";

/** True when this build was made for the device UAT with the pass-member stand-in. PURE. */
export function hasQaPassStandIn(extra: unknown): boolean {
  const list = extra && typeof extra === 'object' ? (extra as { qaStandIns?: unknown }).qaStandIns : undefined;
  return Array.isArray(list) && list.includes('passMember');
}

/** The answer as a QA build with the stand-in reads it; any other answer or build is returned unchanged. PURE. */
export function withQaPassStandIn(a: MembershipAnswer, on: boolean): MembershipAnswer {
  if (!on || !a.ok || a.pass || !a.current || !a.current.planName.startsWith(QA_PASS_PLAN_PREFIX)) return a;
  const company = a.current.planName.slice(QA_PASS_PLAN_PREFIX.length).trim().slice(0, 40);
  if (!company) return a;
  return { ...a, current: null, next: null, pass: company, qaStandIn: true };
}

