/**
 * R-319 item 11: the gym's live "Progress" on a member's page also lists the member's recent workouts
 * (supabase/migrations/0053_ask_trainer_and_progress.sql, member_trainer_share2). The PURE half: what this phone
 * sends while "Share my workouts with my trainers" is on, next to 0050's weekly summary (trainerShare.ts):
 *   at most 30 workouts from the last 92 days, newest first: the day, the workout's name, and per exercise (at most
 *   20) its best working set (heaviest, most reps on a tie) and how many working sets there were.
 * Never notes, photos, body weight, food, warm-ups or a list of every set. Names are cut to whole characters (a
 * cut emoji half would make the server refuse the lot). Kept well under the server's 40000-character cap.
 */
import { addDays } from '@/lib/date';

export const RECENT_DAYS = 92;
export const RECENT_WORKOUTS = 30;
export const RECENT_EXERCISES = 20;
/** The server refuses more than 40000 characters; this leaves room. */
export const RECENT_CHARS = 36000;

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
export function recentFrom(today: string): string {
  return addDays(today, -(RECENT_DAYS - 1));
}

/**
 * The recent workouts. `rows`: working sets from `recentFrom(today)` to today, in the order they were done.
 * `names`: each workout's name as the app shows it. PURE.
 */
export function trainerRecentFrom(rows: readonly RecentSetRow[], names: ReadonlyMap<string, string>, today: string): RecentWorkout[] {
  const from = recentFrom(today);
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
    .slice(0, RECENT_WORKOUTS)
    .map(([id, wk]) => ({ d: wk.d, n: cut(names.get(id) ?? '', 60) || 'Workout', x: [...wk.ex.values()].slice(0, RECENT_EXERCISES) }));
  // Never over the server's cap: the oldest go first.
  while (list.length > 0 && JSON.stringify(list).length > RECENT_CHARS) list.pop();
  return list;
}
