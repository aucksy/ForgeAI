/**
 * R-319 item 11 "Gym sees member progress": the live Progress card on a member's page (server: owner_member_progress
 * in supabase/migrations/0053_ask_trainer_and_progress.sql). For the owner and the member's own ticked trainer, and
 * only while the member's "Share my workouts with my trainers" switch is on. PURE:
 *  - the server's answer read defensively (0050's weekly summary + up to 30 recent workouts);
 *  - kg lifted per week as line-chart points (12 weeks, gaps as 0) and the SVG path;
 *  - best lifts with the day they were done, new bests, the recent workouts list;
 *  - the gentle staff-only line ("No new best in 6 weeks…"). The member never sees it.
 * What the phone sends: never body weight, photos or notes.
 */

import { addDays, diffDays, type DateISO } from './dates';
import { setText, summaryFrom, type TrainerSet, type TrainerSummary } from './trainerView';

export interface RecentExercise extends TrainerSet {
  /** Working sets done. */
  s: number;
}

export interface RecentWorkout {
  d: DateISO;
  n: string;
  x: RecentExercise[];
}

export interface MemberProgress {
  /** False: a trainer who does not train this member (the card stays hidden). */
  allowed: boolean;
  /** The member's switch is on and their phone has sent something. */
  shared: boolean;
  summary: TrainerSummary;
  recent: RecentWorkout[];
  /** The phone sends recent workouts (an older app sends only the summary). */
  hasRecent: boolean;
  updatedAt: number | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Workouts read, at most: 0053's 30, or a year from a newer app (0084 keeps at most 400). */
export const RECENT_MAX = 400;

/** The recent workouts as the server keeps them; anything unreadable is left out. Newest first. PURE. */
export function recentWorkoutsFrom(v: unknown): RecentWorkout[] {
  const out: RecentWorkout[] = [];
  for (const w of Array.isArray(v) ? v.slice(0, RECENT_MAX) : []) {
    if (!isObj(w) || typeof w.d !== 'string' || !DAY.test(w.d)) continue;
    const x: RecentExercise[] = [];
    for (const e of Array.isArray(w.x) ? w.x.slice(0, 20) : []) {
      if (!isObj(e)) continue;
      const n = str(e.n, 40);
      const wt = num(e.w);
      const r = num(e.r);
      if (n && wt != null && r != null) x.push({ n, w: Math.max(0, wt), r: Math.max(0, r), s: Math.max(1, num(e.s) ?? 1) });
    }
    out.push({ d: w.d as DateISO, n: str(w.n, 60) || 'Workout', x });
  }
  return out.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
}

/** owner_member_progress' answer; null when it is not one. PURE. */
export function memberProgressFrom(raw: unknown): MemberProgress | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || r.ok !== true) return null;
  const allowed = r.allowed === true;
  const shared = allowed && r.shared === true;
  return {
    allowed,
    shared,
    summary: summaryFrom(shared ? r.summary : null),
    recent: shared ? recentWorkoutsFrom(r.recent) : [],
    hasRecent: shared && r.hasRecent === true,
    updatedAt: shared ? num(r.updatedAt) : null,
  };
}

// ---------------------------------------------------------------- the chart

export interface WeekPoint {
  /** The week's Monday. */
  w: DateISO;
  kg: number;
  n: number;
}

const mondayOf = (d: DateISO): DateISO => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

/** The 12 weeks, oldest first, with this week last; a week with no workout is 0. PURE. */
export function weekPoints(s: TrainerSummary, today: DateISO): WeekPoint[] {
  const by = new Map(s.weeks.map((w) => [w.w, w]));
  const start = mondayOf(today);
  const out: WeekPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const w = addDays(start, -7 * i);
    const x = by.get(w);
    out.push({ w, kg: Math.round(x?.kg ?? 0), n: x?.n ?? 0 });
  }
  return out;
}

/** A tidy top for the chart's scale (1, 2 or 5 times a power of ten, at least the highest week). PURE. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** The line's points in a box `width` x `height` (y grows down), and the SVG path through them. PURE. */
export function linePath(values: readonly number[], width: number, height: number, top = niceMax(Math.max(0, ...values))): { d: string; pts: { x: number; y: number }[] } {
  if (values.length === 0) return { d: '', pts: [] };
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values.map((v, i) => ({
    x: Math.round(i * step * 10) / 10,
    y: Math.round((height - (Math.max(0, Math.min(v, top)) / top) * height) * 10) / 10,
  }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  return { d, pts };
}

/** "12,480" (Indian grouping) or "12.5k" when short is asked for. PURE. */
export function kgShort(kg: number): string {
  if (kg >= 100000) return `${Math.round(kg / 1000)}k`;
  if (kg >= 10000) return `${(kg / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return Math.round(kg).toLocaleString('en-IN');
}

// ---------------------------------------------------------------- bests

export interface BestLift extends TrainerSet {
  /** The day it was done, or null when only the summary (no dates) is there. */
  d: DateISO | null;
  /** Workouts with this exercise. */
  t: number;
}

const better = (a: TrainerSet, b: TrainerSet): boolean => a.w > b.w || (a.w === b.w && a.r > b.r);

/**
 * Best lifts: each exercise's best set over the recent workouts and the first day it was done, the most-done
 * exercises first (at most 6). Without recent workouts (an older app), the summary's best sets, without days. PURE.
 */
export function bestLifts(p: Pick<MemberProgress, 'summary' | 'recent'>): BestLift[] {
  if (p.recent.length === 0) return p.summary.best.map((b) => ({ n: b.n, w: b.w, r: b.r, t: b.t, d: null }));
  const by = new Map<string, BestLift>();
  // Oldest first, so the day kept is the first time the best was reached.
  for (const w of [...p.recent].reverse()) {
    for (const x of w.x) {
      const cur = by.get(x.n);
      if (!cur) by.set(x.n, { n: x.n, w: x.w, r: x.r, t: 1, d: w.d });
      else {
        cur.t += 1;
        if (better(x, cur)) Object.assign(cur, { w: x.w, r: x.r, d: w.d });
      }
    }
  }
  return [...by.values()].sort((a, b) => b.t - a.t || a.n.localeCompare(b.n)).slice(0, 6);
}

/**
 * The last day any exercise got heavier than every earlier workout in the list (a first-ever exercise is not a
 * best). null: none in the list. PURE.
 */
export function lastNewBestDay(recent: readonly RecentWorkout[]): DateISO | null {
  const top = new Map<string, number>();
  let last: DateISO | null = null;
  for (const w of [...recent].reverse()) {
    for (const x of w.x) {
      const before = top.get(x.n);
      if (before != null && x.w > before && x.w > 0 && (!last || w.d > last)) last = w.d;
      if (before == null || x.w > before) top.set(x.n, x.w);
    }
  }
  return last;
}

/** Weeks with no new best before the staff line shows. */
export const STUCK_WEEKS = 6;
/** Workouts in those weeks: someone still training (a quiet member is a different talk). */
export const STUCK_MIN_WORKOUTS = 4;

/**
 * The gentle staff-only line: a member who keeps training but has had no new best for 6 weeks is a good person to
 * offer personal training. null when it does not apply, or when the data cannot tell (an older app, under 6 weeks
 * of workouts). Never shown to the member. PURE.
 */
export function upsellLine(p: Pick<MemberProgress, 'summary' | 'recent' | 'hasRecent'>, today: DateISO): string | null {
  if (!p.hasRecent || p.recent.length === 0) return null;
  const from = addDays(today, -7 * STUCK_WEEKS);
  const oldest = p.recent[p.recent.length - 1]!.d;
  // The list must reach back past the 6 weeks, or "no new best" is not known.
  if (oldest > from) return null;
  if (p.recent.filter((w) => w.d > from).length < STUCK_MIN_WORKOUTS) return null;
  if (p.summary.records.some((r) => r.d > from)) return null;
  const last = lastNewBestDay(p.recent);
  if (last && last > from) return null;
  // words: NEW (R-319 item 11), staff only; the owner checks it at UAT.
  return `No new best in ${STUCK_WEEKS} weeks. A good time to offer personal training.`;
}

/** "Leg press 120 kg × 9 · 3 sets" for one exercise of a recent workout. PURE. */
export function exerciseLine(x: RecentExercise): string {
  return `${setText(x)}${x.s > 1 ? ` · ${x.s} sets` : ''}`;
}

/** Days since the phone last sent, for "Updated 3 days ago". PURE. */
export function daysSince(ms: number | null, today: DateISO): number | null {
  if (ms == null) return null;
  const d = new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10) as DateISO;
  return Math.max(0, diffDays(d, today));
}
