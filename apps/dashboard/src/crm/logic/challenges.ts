/**
 * Challenges and the leaderboard in the admin app (R-133, 26 Oct 2026). PURE helpers: the server's
 * answers read back (supabase/migrations/0037_leaderboard.sql: owner_challenges, owner_board), the
 * owner's form checked into what Save sends, and plain words for every number and every refusal.
 *
 * The rules are the server's own (a refusal there is INVALID / OVERLAP / OWNER_ONLY): 7 to 31 days,
 * it may start today or later and at most 60 days ahead, free days 0 to 60, a goal nobody could
 * reach (more than 3 workouts a day) is a typing slip. Spec: docs/research/R-leaderboard.md.
 */

import { addDays, diffDays, formatDay, formatDayShort, isValidDateISO, type DateISO } from './dates';
import { countOf } from './plural';

export type ChallengeMeasure = 'workouts' | 'kg';
export type ChallengeStatus = 'upcoming' | 'running' | 'ended' | 'cancelled';

export const CHALLENGE_LIMITS = {
  titleMax: 60,
  daysMin: 7,
  daysMax: 31,
  aheadMax: 60,
  prizeMax: 60,
  /** The app counts at most 3 workouts a day, so 31 days cannot reach more than 93. */
  workoutsGoalMax: 93,
  kgGoalMax: 1_860_000,
} as const;

export interface Hitter {
  memberId: string;
  name: string;
  phone: string | null;
  value: number;
}

export interface Challenge {
  id: string;
  title: string;
  measure: ChallengeMeasure;
  goal: number;
  startsOn: DateISO;
  endsOn: DateISO;
  prizeDays: number;
  createdByName: string | null;
  /** Epoch ms. */
  createdAt: number;
  /** Epoch ms, or null. */
  cancelledAt: number | null;
  status: ChallengeStatus;
  /** Members with any workout inside its dates. */
  entrants: number;
  /** Everyone who reached the goal (empty for one that was cancelled). */
  hitters: Hitter[];
}

export interface ChallengesAnswer {
  /** The owner (or an old owner key) may change challenges; the front desk may only read. */
  canEdit: boolean;
  /** Newest first. */
  challenges: Challenge[];
}

export interface BoardRow {
  rank: number;
  memberId: string;
  /** The full name: this is the gym's own view. */
  name: string;
  phone: string | null;
  value: number;
  /** The gym hid this member: members never see them on the list. */
  hidden: boolean;
}

export interface HiddenMember {
  memberId: string;
  name: string;
}

export interface BoardAnswer {
  canEdit: boolean;
  /** Members with a workout in the last 30 days. */
  members: number;
  workouts: BoardRow[];
  kg: BoardRow[];
  hiddenMembers: HiddenMember[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const unwrap = (raw: unknown): unknown => (Array.isArray(raw) ? raw[0] : raw);

function hitterFrom(raw: unknown): Hitter | null {
  const r = obj(raw);
  if (!r || !text(r.memberId)) return null;
  return { memberId: text(r.memberId), name: text(r.name).trim() || 'A member', phone: text(r.phone).trim() || null, value: num(r.value) };
}

function challengeFrom(raw: unknown): Challenge | null {
  const r = obj(raw);
  if (!r || !text(r.id) || !isValidDateISO(r.startsOn) || !isValidDateISO(r.endsOn)) return null;
  const status = r.status === 'upcoming' || r.status === 'running' || r.status === 'ended' || r.status === 'cancelled' ? r.status : 'ended';
  return {
    id: text(r.id),
    title: text(r.title).trim(),
    measure: r.measure === 'kg' ? 'kg' : 'workouts',
    goal: num(r.goal),
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    prizeDays: num(r.prizeDays),
    createdByName: text(r.createdByName).trim() || null,
    createdAt: num(r.createdAt),
    cancelledAt: typeof r.cancelledAt === 'number' ? r.cancelledAt : null,
    status,
    entrants: num(r.entrants),
    hitters: Array.isArray(r.hitters) ? r.hitters.map(hitterFrom).filter((h): h is Hitter => h !== null) : [],
  };
}

/** owner_challenges' answer, checked. PURE. */
export function challengesFromAnswer(raw: unknown): ChallengesAnswer {
  const r = obj(unwrap(raw));
  if (!r) return { canEdit: false, challenges: [] };
  const list = Array.isArray(r.challenges) ? r.challenges : [];
  return { canEdit: r.canEdit === true, challenges: list.map(challengeFrom).filter((c): c is Challenge => c !== null) };
}

function rowFrom(raw: unknown): BoardRow | null {
  const r = obj(raw);
  if (!r || !text(r.memberId)) return null;
  return {
    rank: num(r.rank),
    memberId: text(r.memberId),
    name: text(r.name).trim() || 'A member',
    phone: text(r.phone).trim() || null,
    value: num(r.value),
    hidden: r.hidden === true,
  };
}

function listFrom(raw: unknown): BoardRow[] {
  const top = obj(raw)?.top;
  return Array.isArray(top) ? top.map(rowFrom).filter((x): x is BoardRow => x !== null) : [];
}

/** owner_board's answer, checked. PURE. */
export function boardFromAnswer(raw: unknown): BoardAnswer {
  const r = obj(unwrap(raw));
  if (!r) return { canEdit: false, members: 0, workouts: [], kg: [], hiddenMembers: [] };
  const hidden = Array.isArray(r.hiddenMembers) ? r.hiddenMembers : [];
  return {
    canEdit: r.canEdit === true,
    members: num(r.members),
    workouts: listFrom(r.workouts),
    kg: listFrom(r.kg),
    hiddenMembers: hidden
      .map((h) => {
        const o = obj(h);
        return o && text(o.memberId) ? { memberId: text(o.memberId), name: text(o.name).trim() || 'A member' } : null;
      })
      .filter((h): h is HiddenMember => h !== null),
  };
}

// ---------------------------------------------------------------- what is running, what is next, what is over

/** The challenge running now, or null. PURE. */
export function runningChallenge(list: readonly Challenge[]): Challenge | null {
  return list.find((c) => c.status === 'running') ?? null;
}

/** Not started yet, soonest first. PURE. */
export function upcomingChallenges(list: readonly Challenge[]): Challenge[] {
  return list.filter((c) => c.status === 'upcoming').sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0));
}

/** Finished or cancelled, newest first (the server's order). PURE. */
export function pastChallenges(list: readonly Challenge[]): Challenge[] {
  return list.filter((c) => c.status === 'ended' || c.status === 'cancelled');
}

// ---------------------------------------------------------------- the form

export interface ChallengeDraft {
  /** Set while changing one that has not started. */
  id: string | null;
  title: string;
  measure: ChallengeMeasure;
  goal: string;
  startsOn: string;
  days: string;
  prizeDays: string;
}

export interface ChallengePayload {
  id?: string;
  title: string;
  measure: ChallengeMeasure;
  goal: number;
  startsOn: DateISO;
  endsOn: DateISO;
  prizeDays: number;
}

const START_GOAL: Record<ChallengeMeasure, string> = { workouts: '12', kg: '50000' };

/** A fresh form: starts today, 30 days, 7 free days. PURE. */
export function newDraft(today: DateISO): ChallengeDraft {
  return { id: null, title: '', measure: 'workouts', goal: START_GOAL.workouts, startsOn: today, days: '30', prizeDays: '7' };
}

/** The form filled from a challenge that has not started, to change it. PURE. */
export function draftFromChallenge(c: Challenge): ChallengeDraft {
  return {
    id: c.id,
    title: c.title,
    measure: c.measure,
    goal: String(c.goal),
    startsOn: c.startsOn,
    days: String(diffDays(c.startsOn, c.endsOn) + 1),
    prizeDays: String(c.prizeDays),
  };
}

/** Switching between Workouts and Kg lifted: a goal still at the other one's starting number follows. PURE. */
export function withMeasure(d: ChallengeDraft, measure: ChallengeMeasure): ChallengeDraft {
  if (measure === d.measure) return d;
  const other: ChallengeMeasure = measure === 'kg' ? 'workouts' : 'kg';
  return { ...d, measure, goal: d.goal.trim() === START_GOAL[other] ? START_GOAL[measure] : d.goal };
}

const wholeNumber = (s: string): number | null => {
  const t = s.replace(/,/g, '').trim();
  return /^\d+$/.test(t) ? Number(t) : null;
};

/**
 * What Save sends, or the plain-words problem (the server refuses the same things). `today` is
 * today in India. PURE.
 */
export function challengePayload(d: ChallengeDraft, today: DateISO): { payload: ChallengePayload | null; problem: string | null } {
  const L = CHALLENGE_LIMITS;
  const fail = (problem: string) => ({ payload: null, problem });
  const title = d.title.trim();
  if (!title) return fail('Give the challenge a name, like “November challenge”.');
  if (title.length > L.titleMax) return fail(`The name can be at most ${L.titleMax} letters.`);

  const goalText = d.goal.replace(/,/g, '').trim();
  const goal = Number(goalText);
  if (!goalText || !Number.isFinite(goal) || goal <= 0) return fail('Type the goal as a number above 0.');
  if (d.measure === 'workouts' && (!Number.isInteger(goal) || goal > L.workoutsGoalMax)) {
    return fail(`The workouts goal must be a whole number from 1 to ${L.workoutsGoalMax} (the app counts up to 3 workouts a day).`);
  }
  if (d.measure === 'kg' && goal > L.kgGoalMax) return fail(`The kg goal can be at most ${L.kgGoalMax.toLocaleString('en-IN')}.`);

  if (!isValidDateISO(d.startsOn)) return fail('Pick the day it starts.');
  if (d.startsOn < today) return fail('It can start today or later, not on a day that has passed.');
  if (d.startsOn > addDays(today, L.aheadMax)) return fail(`It can start at most ${L.aheadMax} days from today.`);

  const days = wholeNumber(d.days);
  if (days === null || days < L.daysMin || days > L.daysMax) return fail(`It must run from ${L.daysMin} to ${L.daysMax} days.`);

  const prize = wholeNumber(d.prizeDays);
  if (prize === null || prize > L.prizeMax) return fail(`Free days must be a whole number from 0 to ${L.prizeMax}.`);

  const payload: ChallengePayload = {
    ...(d.id ? { id: d.id } : {}),
    title,
    measure: d.measure,
    goal: d.measure === 'kg' ? Math.round(goal * 10) / 10 : goal,
    startsOn: d.startsOn,
    endsOn: addDays(d.startsOn, days - 1),
    prizeDays: prize,
  };
  return { payload, problem: null };
}

// ---------------------------------------------------------------- words

const trim1 = (n: number): string => String(Math.round(n * 10) / 10);

/** "16 workouts" or "20,000 kg". PURE. */
export function valueWords(measure: ChallengeMeasure, value: number): string {
  return measure === 'kg' ? `${Number(trim1(value)).toLocaleString('en-IN')} kg` : countOf(Math.round(value), 'workout');
}

/** "Workouts" or "Kg lifted". PURE. */
export function measureLabel(measure: ChallengeMeasure): string {
  return measure === 'kg' ? 'Kg lifted' : 'Workouts';
}

/** "7 free days", "1 free day" or "No free days". PURE. */
export function prizeWords(days: number): string {
  return days <= 0 ? 'No free days' : `${countOf(days, 'free day')}`;
}

/** "1 Nov to 30 Nov 2026". PURE. */
export function periodWords(c: Pick<Challenge, 'startsOn' | 'endsOn'>): string {
  return `${formatDayShort(c.startsOn)} to ${formatDay(c.endsOn)}`;
}

/** What it asks of members, in one line: "Log 16 workouts and win 7 free days". PURE. */
export function askWords(c: Pick<Challenge, 'measure' | 'goal' | 'prizeDays'>): string {
  const goal = c.measure === 'kg' ? `Lift ${valueWords('kg', c.goal)}` : `Log ${valueWords('workouts', c.goal)}`;
  return c.prizeDays > 0 ? `${goal} to win ${prizeWords(c.prizeDays)}` : goal;
}

/** "Last day today", "6 days left", "Starts tomorrow", "Starts in 5 days". PURE. */
export function whenWords(c: Pick<Challenge, 'status' | 'startsOn' | 'endsOn'>, today: DateISO): string {
  if (c.status === 'cancelled') return 'Cancelled';
  if (c.status === 'ended') return `Finished ${formatDayShort(c.endsOn)}`;
  if (c.status === 'running') {
    const left = diffDays(today, c.endsOn);
    return left <= 0 ? 'Last day today' : `${countOf(left, 'day')} left`;
  }
  const to = diffDays(today, c.startsOn);
  return to <= 0 ? 'Starts today' : to === 1 ? 'Starts tomorrow' : `Starts in ${to} days`;
}

/** "Running now", "Not started", "Finished", "Cancelled". PURE. */
export function statusLabel(status: ChallengeStatus): string {
  return status === 'running' ? 'Running now' : status === 'upcoming' ? 'Not started' : status === 'cancelled' ? 'Cancelled' : 'Finished';
}

/** "3 of 12 members reached the goal". PURE. */
export function reachedWords(c: Pick<Challenge, 'hitters' | 'entrants'>): string {
  const n = c.hitters.length;
  if (c.entrants === 0) return 'No member has logged a workout in these days yet.';
  if (n === 0) return `Nobody has reached the goal yet. ${countOf(c.entrants, 'member')} took part.`;
  return `${n} of ${countOf(c.entrants, 'member')} reached the goal.`;
}

/** The list of winners as plain text to copy and send or print. PURE. */
export function winnersText(c: Challenge): string {
  const head = [`${c.title}`, `${periodWords(c)}`, `${askWords(c)}`, ''];
  if (c.hitters.length === 0) return [...head, 'Nobody has reached the goal yet.'].join('\n');
  const lines = c.hitters.map((h, i) => `${i + 1}. ${h.name}${h.phone ? `, ${h.phone}` : ''}, ${valueWords(c.measure, h.value)}`);
  return [...head, `Reached the goal (${c.hitters.length}):`, ...lines].join('\n');
}

/** Plain words for a refused action, or null when it is not one of these codes. PURE. */
export function challengeErrorWords(err: unknown): string | null {
  const t = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  if (/\bOWNER_ONLY\b/.test(t)) return 'Only the owner can do this.';
  if (/\bOVERLAP\b/.test(t)) return 'Another challenge already uses some of these days. Pick days that are free, or cancel the other challenge first.';
  if (/\bINVALID\b/.test(t)) return 'Your gym’s server could not take this. Check each box and try again. A challenge that has started can only be cancelled.';
  return null;
}

/** Under the winners list: the numbers come from members' phones, so a surprising one is worth a word with the member. */
export const COUNTED_FROM_PHONE = 'Counted from each member’s phone. Check a surprising number with the member before giving free days.';
export const MEMBERS_SEE_CHALLENGE =
  'Members see the challenge on the Gym tab of the MettleUp app, with how far they have got. It can take up to 10 minutes to show up.';
export const MEMBERS_SEE_LEADERBOARD =
  'Members see the top 10 and their own place. Their name shows only if they switch it on in the app (first name and initial). Everyone else shows as “A member”.';
