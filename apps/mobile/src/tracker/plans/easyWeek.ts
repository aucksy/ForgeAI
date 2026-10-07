/**
 * Easy weeks — Phase 4. PURE. (The research calls it a deload; members read "Easy week".)
 *
 * Research v3 §6.4: every few weeks, one lighter week — half the sets, the same weight,
 * stop with 3 or more reps left — so the body catches up. Athletes take one about every
 * 5–6 weeks; Hevy has none and its users ask for it (98 upvotes). Easy-week workouts stay
 * out of records and out of the Target's history, so next week picks up where the last
 * normal week left off.
 *
 * A followed plan keeps its schedule in its folder settings: how often (`every` weeks) and
 * a `base` week the count starts from. "Take an easy week now" and "Train normally this
 * week" only move that base, so the next easy week is always `every` weeks after the last
 * one the member had or skipped.
 */
import { daysBetween } from '@/lib/date';

export interface EasySchedule {
  /** An easy week every this many weeks. */
  every: number;
  /** The plan week the count starts from (0 = the plan's start). */
  base: number;
}

/** Default rhythm: research v3 §6.4 (about every 5–6 weeks). */
export const EASY_EVERY = 6;

/**
 * Whether the easy-week switch starts on when a member follows a program or builds a plan.
 * OPEN OWNER DECISION (research v3 §12, decision 2): on — Option A, the research's
 * recommendation — until the owner chooses. One line to flip.
 */
export const EASY_WEEKS_DEFAULT = true;

/** Shown behind the i on the Target line and the Today card. */
export const EASY_REASON =
  'Easy week: half the sets, the same weights, and stop with 3 or more reps left. Your body catches up, and next week you come back stronger. These workouts stay out of your records.';

/** Week of the plan for a day: 1 in the first 7 days from the start. */
export function planWeek(startISO: string, todayISO: string): number {
  return Math.max(1, Math.floor(Math.max(0, daysBetween(startISO, todayISO)) / 7) + 1);
}

export function isEasyWeek(s: EasySchedule | null | undefined, week: number): boolean {
  if (!s || !(s.every >= 2)) return false;
  return week > s.base && (week - s.base) % s.every === 0;
}

/** The next easy week at or after `week`, or null with no schedule. */
export function nextEasyWeek(s: EasySchedule | null | undefined, week: number): number | null {
  if (!s || !(s.every >= 2)) return null;
  for (let w = Math.max(week, s.base + 1); w <= week + s.every; w++) if (isEasyWeek(s, w)) return w;
  return null;
}

/** "Take an easy week now": this week becomes one; the next follows `every` weeks later. */
export function takeEasyNow(s: EasySchedule, week: number): EasySchedule {
  return { ...s, base: week - s.every };
}

/** "Train normally this week": no easy week now; the next comes `every` weeks later. */
export function skipEasyWeek(s: EasySchedule, week: number): EasySchedule {
  return { ...s, base: week };
}

/** Half the planned sets, at least one. */
export function easySets(targetSets: number): number {
  return Math.max(1, Math.ceil(targetSets / 2));
}
