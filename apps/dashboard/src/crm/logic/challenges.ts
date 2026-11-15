/**
 * Challenges and the leaderboard in the admin app (R-133, 26 Oct 2026). PURE helpers: the server's
 * answers read back (supabase/migrations/0037_leaderboard.sql: owner_challenges, owner_board), the
 * owner's form checked into what Save sends, and plain words for every number and every refusal.
 *
 * The rules are the server's own (a refusal there is INVALID / OVERLAP / OWNER_ONLY): 7 to 31 days,
 * it may start today or later and at most 60 days ahead, free days 0 to 60, a goal nobody could
 * reach (more than 3 workouts a day) is a typing slip. Spec: docs/research/R-leaderboard.md.
 */

import { t } from '../lang/lang';

import { addDays, diffDays, formatDay, formatDayShort, isValidDateISO, type DateISO } from './dates';
import { countOf } from './plural';

/**
 * What a challenge counts. 'checkins' (visits: days the gym's register shows the member, at the desk or with the QR
 * code) only once the gym's server has 0091 (ChallengesAnswer.checkins). The leaderboard itself ranks only workouts
 * and kg (BoardMeasure).
 */
export type ChallengeMeasure = 'workouts' | 'kg' | 'checkins';
export type BoardMeasure = 'workouts' | 'kg';
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
  /** 0091: one visit a day at most, so 31 days cannot reach more than 31. */
  checkinsGoalMax: 31,
} as const;

/**
 * F143 (0047): what happened to a winner's free days once the challenge was over. The server adds them to
 * the member's plan by itself, or marks the member to be given them by hand.
 *   pending  - not added yet (the gym was paused); added on a later read.
 *   added    - added to the plan that ends last; `newEnd` is its new last day.
 *   by_hand  - `reason`: no_plan (no plan running today or later), no_match (the app member could not be
 *              matched to the gym's list), left (left the gym before the days were added).
 *   none     - the challenge had no free days, or (`reason` skipped, 0048) the owner skipped this winner.
 *   confirm  - 0048: waiting for the owner to give (or skip) them: owner_confirm_challenge_reward.
 */
export type RewardState = 'confirm' | 'pending' | 'added' | 'by_hand' | 'none';
export type RewardReason = 'no_plan' | 'no_match' | 'left' | 'skipped';

export interface HitterReward {
  state: RewardState;
  reason: RewardReason | null;
  days: number;
  newEnd: DateISO | null;
}

export interface Hitter {
  memberId: string;
  name: string;
  phone: string | null;
  value: number;
  /** F143: null while the challenge runs, and for winners kept before the server gave rewards by itself. */
  reward: HitterReward | null;
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
  /** F143: the gym's server adds the free days by itself when a challenge ends (0047 is applied). */
  autoRewards: boolean;
  /** 0091: the gym's server can count visits (check-ins), so check-in challenges can be offered. */
  checkins: boolean;
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

/** One winner's reward as the server says it (owner_challenges' hitters, owner_confirm_challenge_reward). PURE. */
export function rewardFrom(raw: unknown): HitterReward | null {
  const r = obj(unwrap(raw));
  if (!r) return null;
  const state =
    r.state === 'confirm' || r.state === 'pending' || r.state === 'added' || r.state === 'by_hand' || r.state === 'none' ? r.state : null;
  if (!state) return null;
  const reason = r.reason === 'no_plan' || r.reason === 'no_match' || r.reason === 'left' || r.reason === 'skipped' ? r.reason : null;
  return { state, reason, days: num(r.days), newEnd: isValidDateISO(r.newEnd) ? r.newEnd : null };
}

function hitterFrom(raw: unknown): Hitter | null {
  const r = obj(raw);
  if (!r || !text(r.memberId)) return null;
  return {
    memberId: text(r.memberId),
    name: text(r.name).trim() || 'A member',
    phone: text(r.phone).trim() || null,
    value: num(r.value),
    reward: rewardFrom(r.reward),
  };
}

function challengeFrom(raw: unknown): Challenge | null {
  const r = obj(raw);
  if (!r || !text(r.id) || !isValidDateISO(r.startsOn) || !isValidDateISO(r.endsOn)) return null;
  const status = r.status === 'upcoming' || r.status === 'running' || r.status === 'ended' || r.status === 'cancelled' ? r.status : 'ended';
  return {
    id: text(r.id),
    title: text(r.title).trim(),
    measure: r.measure === 'kg' || r.measure === 'checkins' ? r.measure : 'workouts',
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
  if (!r) return { canEdit: false, autoRewards: false, checkins: false, challenges: [] };
  const list = Array.isArray(r.challenges) ? r.challenges : [];
  return {
    canEdit: r.canEdit === true,
    autoRewards: r.autoRewards === true,
    checkins: r.checkins === true,
    challenges: list.map(challengeFrom).filter((c): c is Challenge => c !== null),
  };
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

const START_GOAL: Record<ChallengeMeasure, string> = { workouts: '12', kg: '50000', checkins: '12' };

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

/** Switching between Workouts, Kg lifted and Visits: a goal still at the old one's starting number follows. PURE. */
export function withMeasure(d: ChallengeDraft, measure: ChallengeMeasure): ChallengeDraft {
  if (measure === d.measure) return d;
  return { ...d, measure, goal: d.goal.trim() === START_GOAL[d.measure] ? START_GOAL[measure] : d.goal };
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
  if (!title) return fail(t('Give the challenge a name, like “November challenge”.'));
  if (title.length > L.titleMax) return fail(t('The name can be at most {n} letters.', { n: L.titleMax }));

  const goalText = d.goal.replace(/,/g, '').trim();
  const goal = Number(goalText);
  if (!goalText || !Number.isFinite(goal) || goal <= 0) return fail(t('Type the goal as a number above 0.'));
  if (d.measure === 'workouts' && (!Number.isInteger(goal) || goal > L.workoutsGoalMax)) {
    return fail(t('The workouts goal must be a whole number from 1 to {max} (the app counts up to 3 workouts a day).', { max: L.workoutsGoalMax }));
  }
  if (d.measure === 'kg' && goal > L.kgGoalMax) return fail(t('The kg goal can be at most {max}.', { max: L.kgGoalMax.toLocaleString('en-IN') }));
  if (d.measure === 'checkins' && (!Number.isInteger(goal) || goal > L.checkinsGoalMax)) {
    return fail(t('The visits goal must be a whole number from 1 to {max}, because a member counts once a day.', { max: L.checkinsGoalMax }));
  }

  if (!isValidDateISO(d.startsOn)) return fail(t('Pick the day it starts.'));
  if (d.startsOn < today) return fail(t('It can start today or later, not on a day that has passed.'));
  if (d.startsOn > addDays(today, L.aheadMax)) return fail(t('It can start at most {n} days from today.', { n: L.aheadMax }));

  const days = wholeNumber(d.days);
  if (days === null || days < L.daysMin || days > L.daysMax) return fail(t('It must run from {min} to {max} days.', { min: L.daysMin, max: L.daysMax }));

  const prize = wholeNumber(d.prizeDays);
  if (prize === null || prize > L.prizeMax) return fail(t('Free days must be a whole number from 0 to {max}.', { max: L.prizeMax }));
  if (d.measure === 'checkins' && goal > days) return fail(t('The visits goal cannot be more than the number of days the challenge runs.'));

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
// Every line here is in the owner's language (R-561, 15 Nov 2026: the running challenge and the leaderboard follow
// Hinglish too). The English is the key in lang/hinglish.ts; numbers, names and days go in as {values}.

const trim1 = (n: number): string => String(Math.round(n * 10) / 10);

/** "16 workouts", "20,000 kg" or "12 visits". The same in both languages. PURE. */
export function valueWords(measure: ChallengeMeasure, value: number): string {
  if (measure === 'kg') return `${Number(trim1(value)).toLocaleString('en-IN')} kg`;
  return measure === 'checkins' ? countOf(Math.round(value), 'visit') : countOf(Math.round(value), 'workout');
}

/** "Workouts", "Kg lifted" or "Visits". */
export function measureLabel(measure: ChallengeMeasure): string {
  return measure === 'kg' ? t('Kg lifted') : measure === 'checkins' ? t('Visits') : t('Workouts');
}

/** "7 free days", "1 free day" or "No free days". */
export function prizeWords(days: number): string {
  if (days <= 0) return t('No free days');
  return days === 1 ? t('1 free day') : t('{n} free days', { n: days });
}

/** "1 Nov to 30 Nov 2026". */
export function periodWords(c: Pick<Challenge, 'startsOn' | 'endsOn'>): string {
  return t('{start} to {end}', { start: formatDayShort(c.startsOn), end: formatDay(c.endsOn) });
}

/** What it asks of members, in one line: "Log 16 workouts to win 7 free days". */
export function askWords(c: Pick<Challenge, 'measure' | 'goal' | 'prizeDays'>): string {
  const n = Math.round(c.goal);
  const goal =
    c.measure === 'kg'
      ? t('Lift {kg}', { kg: valueWords('kg', c.goal) })
      : c.measure === 'checkins'
        ? n === 1
          ? t('Check in on 1 day')
          : t('Check in on {n} days', { n })
        : n === 1
          ? t('Log 1 workout')
          : t('Log {n} workouts', { n });
  return c.prizeDays > 0 ? t('{goal} to win {prize}', { goal, prize: prizeWords(c.prizeDays) }) : goal;
}

/** "Last day today", "6 days left", "Starts tomorrow", "Starts in 5 days". */
export function whenWords(c: Pick<Challenge, 'status' | 'startsOn' | 'endsOn'>, today: DateISO): string {
  if (c.status === 'cancelled') return t('Cancelled');
  if (c.status === 'ended') return t('Finished {day}', { day: formatDayShort(c.endsOn) });
  if (c.status === 'running') {
    const left = diffDays(today, c.endsOn);
    return left <= 0 ? t('Last day today') : left === 1 ? t('1 day left') : t('{n} days left', { n: left });
  }
  const to = diffDays(today, c.startsOn);
  return to <= 0 ? t('Starts today') : to === 1 ? t('Starts tomorrow') : t('Starts in {n} days', { n: to });
}

/** "Running now", "Not started", "Finished", "Cancelled". */
export function statusLabel(status: ChallengeStatus): string {
  return status === 'running' ? t('Running now') : status === 'upcoming' ? t('Not started') : status === 'cancelled' ? t('Cancelled') : t('Finished');
}

/** "3 of 12 members reached the goal." */
export function reachedWords(c: Pick<Challenge, 'hitters' | 'entrants'> & Partial<Pick<Challenge, 'measure'>>): string {
  const n = c.hitters.length;
  if (c.entrants === 0) {
    return c.measure === 'checkins'
      ? t('No member with the MettleUp app has checked in during these days yet.')
      : t('No member has logged a workout in these days yet.');
  }
  if (n === 0) {
    return c.entrants === 1
      ? t('Nobody has reached the goal yet. 1 member took part.')
      : t('Nobody has reached the goal yet. {n} members took part.', { n: c.entrants });
  }
  return c.entrants === 1 ? t('{n} of 1 member reached the goal.', { n }) : t('{n} of {total} members reached the goal.', { n, total: c.entrants });
}

/**
 * F143: what happened to one winner's free days, in a few words for their line on the list, or null when
 * there is nothing to say (no free days, a challenge still running, or a winner kept before the server
 * gave rewards by itself).
 */
export function rewardWords(h: Pick<Hitter, 'reward'>): string | null {
  const r = h.reward;
  if (r?.state === 'none' && r.reason === 'skipped') return t('Skipped');
  if (!r || r.state === 'none' || r.days <= 0) return null;
  const prize = prizeWords(r.days);
  if (r.state === 'confirm') return t('Won {prize}. Waiting for the owner.', { prize });
  if (r.state === 'added') {
    return r.newEnd ? t('{prize} added. Plan now ends {day}.', { prize, day: formatDayShort(r.newEnd) }) : t('{prize} added.', { prize });
  }
  if (r.state === 'pending') return t('{prize} not added yet. They will be added soon.', { prize });
  if (r.reason === 'left') return t('Left the gym. No free days added.');
  if (r.reason === 'no_match') return t('Give by hand: {prize}. Not matched to a member on your list.', { prize });
  return t('Give by hand: {prize}. No active membership.', { prize });
}

/** 0048: true when this winner's free days wait for the owner's Give or Skip. PURE. */
export function needsConfirm(h: Pick<Hitter, 'reward'>): boolean {
  return h.reward?.state === 'confirm' && h.reward.days > 0;
}

/** The owner's button for one winner: "Give 7 free days" / "Give 1 free day". */
export function giveLabel(days: number): string {
  return t('Give {prize}', { prize: prizeWords(days).toLowerCase() });
}

/** The owner's button for every winner still waiting: "Give all 3 their free days". */
export function giveAllLabel(n: number): string {
  return t('Give all {n} their free days', { n });
}

/** What the owner's Give or Skip did, for the toast. */
export function confirmedWords(name: string, r: HitterReward | null): string {
  if (!r) return t('Saved.');
  if (r.state === 'none') return t('Skipped. {name} gets no free days.', { name });
  const prize = prizeWords(r.days);
  if (r.state === 'added') {
    return r.newEnd
      ? t('{prize} added for {name}. Plan now ends {day}.', { prize, name, day: formatDayShort(r.newEnd) })
      : t('{prize} added for {name}.', { prize, name });
  }
  if (r.state === 'pending') return t('{prize} for {name} will be added soon.', { prize, name });
  if (r.state === 'by_hand') return t('{name}: give the {prize} by hand (see their line).', { name, prize: prize.toLowerCase() });
  return t('Saved.');
}

/** True when this winner's free days must be given by hand at the desk. PURE. */
export function needsHand(h: Pick<Hitter, 'reward'>): boolean {
  return h.reward?.state === 'by_hand' && h.reward.reason !== 'left' && h.reward.days > 0;
}

/** A past challenge's line: "3 reached the goal" or "3 reached the goal, 1 to give by hand". */
export function pastSummary(c: Pick<Challenge, 'hitters'>): string {
  const hand = c.hitters.filter(needsHand).length;
  const wait = c.hitters.filter(needsConfirm).length;
  return [
    t('{n} reached the goal', { n: c.hitters.length }),
    wait > 0 ? t('{n} waiting for the owner', { n: wait }) : '',
    hand > 0 ? t('{n} to give by hand', { n: hand }) : '',
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * The line under the winners about the free days, or null when there are none to give. `autoRewards`:
 * the server adds them by itself (0047). Winners kept before that still get the old by-hand line.
 */
export function prizeNote(
  c: Pick<Challenge, 'prizeDays' | 'status' | 'hitters'>,
  canEdit: boolean,
  autoRewards: boolean,
): string | null {
  if (c.prizeDays <= 0 || c.status === 'cancelled' || c.hitters.length === 0) return null;
  const prize = prizeWords(c.prizeDays);
  const byHand = canEdit
    ? t('To give the {prize}: open the member and tap Freeze / extra days.', { prize })
    : t('The owner gives the {prize} (the member’s page, Freeze / extra days). Share this list with them.', { prize });
  if (!autoRewards) return byHand;
  if (c.status === 'running' || c.status === 'upcoming') {
    return t('When it ends, each winner gets the {prize} added to their plan by themselves, and a message in the app.', { prize });
  }
  const kept = c.hitters.filter((h) => h.reward !== null);
  if (kept.length < c.hitters.length) return byHand;
  // 0048: the owner gives (or skips) each winner's days first.
  if (kept.some(needsConfirm)) {
    return canEdit
      ? t('Check each winner, then tap {give} or {skip}. The days go on their plan, and they get a message in the app.', {
          give: giveLabel(c.prizeDays),
          skip: t('Skip'),
        })
      : t('The owner gives each winner the {prize} here. Ask them to look at this list.', { prize });
  }
  if (kept.some(needsHand)) {
    return canEdit
      ? t('For each member marked “Give by hand”: open the member and tap Freeze / extra days. They got a message to ask at the front desk.')
      : t('For each member marked “Give by hand”, the owner adds the days (the member’s page, Freeze / extra days). They got a message to ask at the front desk.');
  }
  if (kept.some((h) => h.reward?.state === 'pending')) return t('The free days will be added soon. Each winner will get a message in the app.');
  return t('The free days were added to each winner’s plan by themselves. Each winner got a message in the app.');
}

/** The list of winners as plain text to copy and send or print. */
export function winnersText(c: Challenge): string {
  const head = [`${c.title}`, `${periodWords(c)}`, `${askWords(c)}`, ''];
  if (c.hitters.length === 0) return [...head, t('Nobody has reached the goal yet.')].join('\n');
  const lines = c.hitters.map((h, i) => {
    const reward = rewardWords(h);
    return `${i + 1}. ${h.name}${h.phone ? `, ${h.phone}` : ''}, ${valueWords(c.measure, h.value)}${reward ? `. ${reward}` : ''}`;
  });
  return [...head, t('Reached the goal ({n}):', { n: c.hitters.length }), ...lines].join('\n');
}

/** Plain words for a refused action, or null when it is not one of these codes. */
export function challengeErrorWords(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  if (/\bOWNER_ONLY\b|\bNOT_OWNER\b/.test(msg)) return t('Only the owner can do this.');
  if (/\bGONE\b/.test(msg)) return t('This is no longer there. The list is up to date now.');
  if (/\bOVERLAP\b/.test(msg)) return t('Another challenge already uses some of these days. Pick days that are free, or cancel the other challenge first.');
  if (/\bINVALID\b/.test(msg)) return t('Your gym’s server could not take this. Check each box and try again. A challenge that has started can only be cancelled.');
  return null;
}

/** Under the winners list: the numbers come from members' phones, so a surprising one is worth a word with the member. */
export const COUNTED_FROM_PHONE = 'Counted from each member’s phone. Check a surprising number with the member before giving free days.';
/** 0091: a check-in challenge counts the gym's own visit register, not the phone. */
export const COUNTED_FROM_REGISTER =
  'Counted from your visit register: one visit a day, at the desk or with the QR code. Only members who use the MettleUp app take part.';

/** The line under the winners list for this challenge, in the owner's language. */
export function countedWords(measure: ChallengeMeasure): string {
  return t(measure === 'checkins' ? COUNTED_FROM_REGISTER : COUNTED_FROM_PHONE);
}
export const MEMBERS_SEE_CHALLENGE =
  'Members see the challenge on the Gym tab of the MettleUp app, with how far they have got. It can take up to 10 minutes to show up.';
export const MEMBERS_SEE_LEADERBOARD =
  'Members see the top 10 and their own place. Their name shows only if they switch it on in the app (first name and initial). Everyone else shows as “A member”.';
