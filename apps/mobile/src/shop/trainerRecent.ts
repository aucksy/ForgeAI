/**
 * R-319 item 11: the gym's live "Progress" on a member's page also lists the member's recent workouts
 * (supabase/migrations/0053_ask_trainer_and_progress.sql, member_trainer_share2). The PURE half: what this phone
 * sends while "Share my workouts with my trainers" is on, next to 0050's weekly summary (trainerShare.ts):
 *   at most 30 workouts from the last 92 days, newest first: the day, the workout's name, and per exercise (at most
 *   20) its best working set (heaviest, most reps on a tie) and how many working sets there were.
 * Never notes, photos, body weight, food, warm-ups or a list of every set. Names are cut to whole characters (a
 * cut emoji half would make the server refuse the lot). Kept well under the server's 40000-character cap.
 *
 * R-537 (owner, 14 Nov 2026: the gym's lines must cover "at least last one year"): with the server's
 * member_trainer_share3 (supabase/migrations/0084_progress_year.sql, NOT LIVE until the owner's yes) the same list
 * covers up to 12 months: at most 400 workouts from the last 366 days, kept under 280000 characters (the server
 * refuses over 300000). Without 0084 the phone cuts that year back to 3 months (`threeMonthsOf`) and sends it the
 * 0053 way. What each workout carries does not change.
 */
import { addDays } from '@/lib/date';

export const RECENT_DAYS = 92;
export const RECENT_WORKOUTS = 30;
export const RECENT_EXERCISES = 20;
/** The server refuses more than 40000 characters; this leaves room. */
export const RECENT_CHARS = 36000;

/**
 * R-537: OFF until the owner approves the member's new sharing words (draft: docs/progress/SINCE-JOINING.md). The
 * Settings caption (trainerShare.ts TRAINER_WORDS.shareCaptionRecent) still tells the member "the last 3 months", so
 * this phone must not send more than that. Turn it on in the same change as the approved words (a test holds the
 * two together). Off: exactly 0053's 3 months, and member_trainer_share3 is never called.
 */
export const SHARE_A_YEAR: boolean = false;

/** 0084: a year of workouts (the server takes at most 400, 366 days, 300000 characters). */
export const YEAR_DAYS = 366;
export const YEAR_WORKOUTS = 400;
export const YEAR_CHARS = 280000;

export interface RecentLimits {
  days: number;
  workouts: number;
  chars: number;
}

/** 0053's limits (member_trainer_share2). */
export const THREE_MONTHS: RecentLimits = { days: RECENT_DAYS, workouts: RECENT_WORKOUTS, chars: RECENT_CHARS };
/** 0084's limits (member_trainer_share3). */
export const ONE_YEAR: RecentLimits = { days: YEAR_DAYS, workouts: YEAR_WORKOUTS, chars: YEAR_CHARS };

/** One working set as this phone reads it (warm-ups already left out), in the order it was done. */
export interface RecentSetRow {
  workoutId: string;
  dateISO: string;
  /** ms since 1970, to order two workouts of one day. */
  startedAt: number;
  exerciseId: string;
  name: string;
  weightKg: number;
  reps: number;
}

export interface RecentExercise {
  n: string;
  w: number;
  r: number;
  s: number;
}

export interface RecentWorkout {
  d: string;
  n: string;
  x: RecentExercise[];
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const cut = (s: string, max: number): string => Array.from(String(s ?? '').replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim();
const kg1 = (w: number): number => Math.round(Math.min(1000, Math.max(0, finite(w))) * 10) / 10;
const reps = (r: number): number => Math.min(1000, Math.max(0, Math.floor(finite(r))));

/** The first day sent. PURE. */
export function recentFrom(today: string, limits: RecentLimits = THREE_MONTHS): string {
  return addDays(today, -(limits.days - 1));
}

/** Newest first: the workouts inside `limits`, the oldest dropped first to stay under its characters. PURE. */
export function cutToLimits(list: readonly RecentWorkout[], today: string, limits: RecentLimits): RecentWorkout[] {
  const from = recentFrom(today, limits);
  const out = list.filter((w) => w.d >= from && w.d <= today).slice(0, limits.workouts);
  while (out.length > 0 && JSON.stringify(out).length > limits.chars) out.pop();
  return out;
}

/** A year's list cut back to what a server without 0084 takes (3 months, 30 workouts). PURE. */
export function threeMonthsOf(year: readonly RecentWorkout[], today: string): RecentWorkout[] {
  return cutToLimits(year, today, THREE_MONTHS);
}

/**
 * The recent workouts. `rows`: working sets from `recentFrom(today, limits)` to today, in the order they were done.
 * `names`: each workout's name as the app shows it. `limits`: 3 months (0053, the default) or a year (0084). PURE.
 */
export function trainerRecentFrom(
  rows: readonly RecentSetRow[],
  names: ReadonlyMap<string, string>,
  today: string,
  limits: RecentLimits = THREE_MONTHS,
): RecentWorkout[] {
  const from = recentFrom(today, limits);
  type W = { d: string; at: number; ex: Map<string, { n: string; w: number; r: number; s: number }> };
  const byWorkout = new Map<string, W>();
  for (const row of rows) {
    if (!row.workoutId || !row.exerciseId || !ISO_DAY.test(row.dateISO) || row.dateISO < from || row.dateISO > today) continue;
    const name = cut(row.name, 40);
    const w = kg1(row.weightKg);
    const r = reps(row.reps);
    if (!name || (w === 0 && r === 0)) continue;
    let wk = byWorkout.get(row.workoutId);
    if (!wk) {
      wk = { d: row.dateISO, at: finite(row.startedAt), ex: new Map() };
      byWorkout.set(row.workoutId, wk);
    }
    const e = wk.ex.get(row.exerciseId);
    if (!e) wk.ex.set(row.exerciseId, { n: name, w, r, s: 1 });
    else {
      e.s = Math.min(100, e.s + 1);
      if (w > e.w || (w === e.w && r > e.r)) {
        e.w = w;
        e.r = r;
      }
    }
  }
  const list = [...byWorkout.entries()]
    .sort((a, b) => (a[1].d < b[1].d ? 1 : a[1].d > b[1].d ? -1 : b[1].at - a[1].at))
    .slice(0, limits.workouts)
    .map(([id, wk]) => ({ d: wk.d, n: cut(names.get(id) ?? '', 60) || 'Workout', x: [...wk.ex.values()].slice(0, RECENT_EXERCISES) }));
  // Never over the server's cap: the oldest go first.
  return cutToLimits(list, today, limits);
}
