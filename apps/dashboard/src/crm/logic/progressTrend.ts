/**
 * R-535 / R-537 (owner, 14 Nov 2026): Training progress must show WHERE a member is going, not one week. PURE.
 * Built only from what the member's phone already shares (0053: up to 30 workouts of the last 92 days; a newer app
 * with 0084: up to 12 months), each workout carrying, per exercise, its best set and how many sets.
 *
 *  - strengthScore: the member app's own "Estimated 1-rep max" (apps/mobile/src/lib/e1rm.ts): Epley,
 *    kg × (1 + reps / 30), a single is itself, reps above 12 count as 12. The SAME maths, so the gym and the
 *    member never see two different numbers for one set (a test reads the app's file to keep them equal).
 *  - exerciseTrends: per exercise, one point per day (the day's best), the most-done exercises first.
 *  - trendOf: the tag. The best of the last 6 weeks against the best of the 6 weeks before: 3% or more higher is
 *    "Getting stronger", 3% or more lower is "Dropping", in between "Steady"; under 3 workouts with it in those
 *    12 weeks, or none in either half, "Not enough data yet".
 *  - overallTrend: more main exercises up than down is "Getting stronger", and the other way round "Dropping".
 *  - weeklyWorkouts: workouts per week over everything shared (the weekly summary for its 12 weeks, counted from
 *    the shared workouts before that).
 */

import { addDays, diffDays, type DateISO } from './dates';
import type { RecentWorkout } from './memberProgress';
import type { TrainerSummary } from './trainerView';

/** = E1RM_MAX_REPS in apps/mobile/src/lib/e1rm.ts (test/crm/progressTrend.test.ts reads that file). */
export const SCORE_MAX_REPS = 12;
/** The tag compares the last TREND_WEEKS weeks with the TREND_WEEKS weeks before them. */
export const TREND_WEEKS = 6;
/** Percent up or down before a tag says so. */
export const TREND_PCT = 3;
/** Fewer workouts with an exercise than this (in the 12 weeks the tag reads): "Not enough data yet". */
export const TREND_MIN_POINTS = 3;
/** Main exercises: the most-done ones, at most this many. */
export const MAIN_EXERCISES = 6;
/** Weeks on the workouts line, at most (a year and a week). */
export const MAX_WEEKS = 53;

export type Trend = 'up' | 'steady' | 'down' | 'unknown';

/** words: NEW (R-535), owner checks at UAT. */
export const TREND_WORDS: Record<Trend, string> = {
  up: 'Getting stronger',
  steady: 'Steady',
  down: 'Dropping',
  unknown: 'Not enough data yet',
};

/**
 * The member app's estimated 1-rep max for one set (kg). 0 for a set with no weight or no reps (a body-weight
 * move has no score; its line is reps instead). PURE.
 */
export function strengthScore(kg: number, reps: number): number {
  if (!(kg > 0) || !(reps >= 1)) return 0;
  const r = Math.min(reps, SCORE_MAX_REPS);
  return r === 1 ? kg : kg * (1 + r / 30);
}

/** One decimal, the way the app shows kg. PURE. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface ScorePoint {
  d: DateISO;
  /** The strength score (kg), or the reps for a body-weight move. */
  v: number;
  /** The set behind it. */
  w: number;
  r: number;
}

export interface ExerciseTrend {
  n: string;
  /** 'kg': strength score; 'reps': a body-weight move, most reps in one set. */
  kind: 'kg' | 'reps';
  /** Oldest first, one per day. */
  points: ScorePoint[];
  /** Workouts with it. */
  times: number;
  /** Its best point. */
  best: ScorePoint;
  trend: Trend;
  /** The two bests the tag compared (null when it could not). */
  before: number | null;
  now: number | null;
}

/** The tag for one exercise's points. PURE. */
export function trendOf(points: readonly Pick<ScorePoint, 'd' | 'v'>[], today: DateISO): { trend: Trend; before: number | null; now: number | null } {
  const split = addDays(today, -7 * TREND_WEEKS);
  const start = addDays(today, -7 * TREND_WEEKS * 2);
  let before: number | null = null;
  let now: number | null = null;
  let n = 0;
  for (const p of points) {
    if (p.d <= start || p.d > today || !(p.v > 0)) continue;
    n += 1;
    if (p.d > split) now = Math.max(now ?? 0, p.v);
    else before = Math.max(before ?? 0, p.v);
  }
  if (n < TREND_MIN_POINTS || before == null || now == null) return { trend: 'unknown', before: null, now: null };
  const pct = ((now - before) / before) * 100;
  const trend: Trend = pct >= TREND_PCT ? 'up' : pct <= -TREND_PCT ? 'down' : 'steady';
  return { trend, before: round1(before), now: round1(now) };
}

/** Every exercise in the shared workouts, the most-done first (then by name). PURE. */
export function exerciseTrends(recent: readonly RecentWorkout[], today: DateISO): ExerciseTrend[] {
  type Acc = { n: string; times: number; kg: Map<DateISO, ScorePoint>; reps: Map<DateISO, ScorePoint> };
  const by = new Map<string, Acc>();
  for (const w of recent) {
    for (const x of w.x) {
      let a = by.get(x.n);
      if (!a) {
        a = { n: x.n, times: 0, kg: new Map(), reps: new Map() };
        by.set(x.n, a);
      }
      a.times += 1;
      const score = strengthScore(x.w, x.r);
      if (score > 0) {
        const cur = a.kg.get(w.d);
        if (!cur || score > cur.v) a.kg.set(w.d, { d: w.d, v: round1(score), w: x.w, r: x.r });
      } else if (x.w <= 0 && x.r > 0) {
        const cur = a.reps.get(w.d);
        if (!cur || x.r > cur.v) a.reps.set(w.d, { d: w.d, v: x.r, w: 0, r: x.r });
      }
    }
  }
  const out: ExerciseTrend[] = [];
  for (const a of by.values()) {
    // An exercise done with weight is drawn as its strength score; its body-weight days are left out.
    const kind = a.kg.size > 0 ? 'kg' : 'reps';
    const points = [...(kind === 'kg' ? a.kg : a.reps).values()].sort((p, q) => (p.d < q.d ? -1 : p.d > q.d ? 1 : 0));
    if (points.length === 0) continue;
    const best = points.reduce((b, p) => (p.v > b.v ? p : b), points[0]!);
    out.push({ n: a.n, kind, points, times: a.times, best, ...trendOf(points, today) });
  }
  return out.sort((p, q) => q.times - p.times || p.n.localeCompare(q.n));
}

/** The main exercises: the most-done ones. PURE. */
export function mainExercises(trends: readonly ExerciseTrend[], max = MAIN_EXERCISES): ExerciseTrend[] {
  return trends.slice(0, max);
}

/** One tag for the member, from their main exercises. PURE. */
export function overallTrend(main: readonly Pick<ExerciseTrend, 'trend'>[]): Trend {
  let up = 0;
  let down = 0;
  let known = 0;
  for (const e of main) {
    if (e.trend === 'unknown') continue;
    known += 1;
    if (e.trend === 'up') up += 1;
    if (e.trend === 'down') down += 1;
  }
  if (known === 0) return 'unknown';
  return up > down ? 'up' : down > up ? 'down' : 'steady';
}

/** The main exercise to name on the list: the most-done one whose tag is known. PURE. */
export function headlineExercise(main: readonly ExerciseTrend[]): ExerciseTrend | null {
  return main.find((e) => e.trend !== 'unknown') ?? null;
}

/** The list's tag and the exercise it names, from one member's shared workouts. PURE. */
export function progressTag(recent: readonly RecentWorkout[], today: DateISO): { overall: Trend; headline: ExerciseTrend | null } {
  const main = mainExercises(exerciseTrends(recent, today));
  return { overall: overallTrend(main), headline: headlineExercise(main) };
}

// ---------------------------------------------------------------- workouts per week

export interface WeekCount {
  /** The week's Monday. */
  w: DateISO;
  n: number;
}

/** The Monday of a day's week. PURE. */
export const mondayOf = (d: DateISO): DateISO => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

/**
 * Workouts per week, oldest first, this week last: at least the 12 weeks of the weekly summary, and back to the
 * week of the oldest shared workout (at most a year). The summary's own count for its 12 weeks (it counts every
 * workout); before that, the shared workouts are counted. A week with nothing is 0. PURE.
 */
export function weeklyWorkouts(summary: TrainerSummary, recent: readonly RecentWorkout[], today: DateISO): WeekCount[] {
  const thisWeek = mondayOf(today);
  const summaryStart = addDays(thisWeek, -7 * 11);
  const oldest = recent.reduce<DateISO | null>((o, w) => (w.d <= today && (!o || w.d < o) ? w.d : o), null);
  let start = oldest && oldest < summaryStart ? mondayOf(oldest) : summaryStart;
  const floor = addDays(thisWeek, -7 * (MAX_WEEKS - 1));
  if (start < floor) start = floor;
  const fromSummary = new Map(summary.weeks.map((w) => [w.w, w.n]));
  const counted = new Map<DateISO, number>();
  for (const w of recent) {
    if (w.d > today) continue;
    const m = mondayOf(w.d);
    counted.set(m, (counted.get(m) ?? 0) + 1);
  }
  const useSummary = summary.weeks.length > 0;
  const out: WeekCount[] = [];
  for (let w = start; w <= thisWeek; w = addDays(w, 7)) {
    const n = useSummary && w >= summaryStart ? (fromSummary.get(w) ?? 0) : (counted.get(w) ?? 0);
    out.push({ w, n });
  }
  return out;
}

// ---------------------------------------------------------------- what range is shown

/** The 0053 app's limits: 30 workouts, 92 days. */
export const OLD_APP_WORKOUTS = 30;
export const OLD_APP_DAYS = 92;

export interface SharedRange {
  n: number;
  from: DateISO;
  to: DateISO;
  /**
   * True when an older app's 30-workout limit probably cut older workouts off. R-551: an updated app shares up to
   * 400 workouts since joining, so 30 in under 85 days may also be all there is: the words say "may".
   */
  capped: boolean;
}

/** What the shared workouts cover. null: none. PURE. */
export function sharedRange(recent: readonly RecentWorkout[], today: DateISO): SharedRange | null {
  if (recent.length === 0) return null;
  let from = recent[0]!.d;
  let to = recent[0]!.d;
  for (const w of recent) {
    if (w.d < from) from = w.d;
    if (w.d > to) to = w.d;
  }
  const capped = recent.length === OLD_APP_WORKOUTS && diffDays(from, today) < OLD_APP_DAYS - 7;
  return { n: recent.length, from, to, capped };
}

// ---------------------------------------------------------------- the line chart's geometry

export interface Pt {
  x: number;
  y: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The smooth line through the points without overshoot (monotone cubic), the same curve as the member app's
 * charts (apps/mobile/src/components/charts/util.ts monotonePath). PURE.
 */
export function monotonePath(pts: readonly Pt[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${r2(pts[0]!.x)} ${r2(pts[0]!.y)}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1]!.x - pts[i]!.x;
    dx.push(h);
    slope.push((pts[i + 1]!.y - pts[i]!.y) / (h || 1e-9));
  }
  const t: number[] = [slope[0]!];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1]! * slope[i]! <= 0) t.push(0);
    else {
      const w1 = 2 * dx[i]! + dx[i - 1]!;
      const w2 = dx[i]! + 2 * dx[i - 1]!;
      t.push((w1 + w2) / (w1 / slope[i - 1]! + w2 / slope[i]!));
    }
  }
  t.push(slope[n - 2]!);
  let d = `M${r2(pts[0]!.x)} ${r2(pts[0]!.y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3;
    d += ` C${r2(pts[i]!.x + h)} ${r2(pts[i]!.y + h * t[i]!)} ${r2(pts[i + 1]!.x - h)} ${r2(pts[i + 1]!.y - h * t[i + 1]!)} ${r2(pts[i + 1]!.x)} ${r2(pts[i + 1]!.y)}`;
  }
  return d;
}

/** 1, 2, 2.5 or 5 times a power of ten: a tidy gap between grid lines. PURE. */
function niceStep(span: number, lines: number): number {
  const raw = span / Math.max(1, lines);
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

/** The y range and its grid lines for some values; `zero` keeps 0 at the bottom (counts). PURE. */
export function yScale(values: readonly number[], zero: boolean): { lo: number; hi: number; ticks: number[] } {
  const max = Math.max(0, ...values);
  const min = values.length ? Math.min(...values) : 0;
  if (!(max > 0)) return { lo: 0, hi: zero ? 4 : 1, ticks: zero ? [0, 2, 4] : [0, 1] };
  let lo = zero ? 0 : min - Math.max((max - min) * 0.25, max * 0.05);
  if (lo < 0) lo = 0;
  const hiRaw = max + Math.max((max - (zero ? 0 : min)) * 0.15, zero ? 0.5 : max * 0.03);
  const step = niceStep(hiRaw - lo, 3);
  lo = Math.floor(lo / step) * step;
  const hi = Math.ceil(hiRaw / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}

/** Each point's place: x by its real day between `from` and `to`, y by value (y grows down). PURE. */
export function placePoints(
  data: readonly { x: DateISO; y: number }[],
  box: { left: number; right: number; top: number; bottom: number },
  from: DateISO,
  to: DateISO,
  lo: number,
  hi: number,
): Pt[] {
  const span = Math.max(1, diffDays(from, to));
  return data.map((p) => ({
    x: r2(box.left + (Math.min(span, Math.max(0, diffDays(from, p.x))) / span) * (box.right - box.left)),
    y: r2(box.bottom - ((Math.min(hi, Math.max(lo, p.y)) - lo) / (hi - lo || 1)) * (box.bottom - box.top)),
  }));
}
