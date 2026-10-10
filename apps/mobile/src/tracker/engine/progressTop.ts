/**
 * Progress leads with the answer — audit Phase 5 (UX-1, PG-05, PG-06, PG-08, PG-09, PG-25,
 * PG-27, PG-28). PURE.
 *
 *  - "This week vs your usual": workouts, working sets and lifts that beat a best (D10, the one
 *    record rule) this week (Monday to today) against the average full week of the 8 before it
 *    (fewer when the member started more recently). Plus the lift that went up most: its best
 *    this week against its typical (median) workout in those weeks — weight lifts by estimated
 *    1-rep max, bodyweight lifts by their best set of reps. Easy-week workouts count as workouts
 *    but never as strength (a planned lighter week is not a dip), and a median means one typo
 *    ("300 kg" for 30) can't make a lift "go up".
 *  - "Your lifts": the member's most-trained lifts with a point per workout.
 *  - Small honest-number rules for the sections below.
 */
import { epleyE1rm } from '@/engine/overload';
import { addDays, tinyDate, weekStartISO } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { kgToShown, weightUnitOf } from '@/lib/units';
import type { UnitSystem } from '@/types/models';

import type { Muscle } from '../catalog/muscles';
import { liftsBeatingBest } from './headline';
import type { LogType } from './logTypes';
import type { MuscleSetsSlice } from './volume';

/** One workout in the window. */
export interface ProgressSession {
  id: string;
  dateISO: string;
  /** Logged during an easy (lighter) week. */
  easy: boolean;
}

/** One set in the window. */
export interface ProgressSet {
  sessionId: string;
  dateISO: string;
  easy: boolean;
  exerciseId: string;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}

export interface ProgressLiftInfo {
  id: string;
  name: string;
  logType: LogType;
}

/** How many full weeks make "your usual". */
export const USUAL_WEEKS = 8;
/** Sets with more reps than this say little about a 1-rep max (as the year's biggest gain). */
const MAX_E1RM_REPS = 12;

export type LiftUnit = 'kg' | 'reps';

export interface LiftPoint {
  dateISO: string;
  /**
   * Estimated 1-rep max (kg) or best set of reps — what "up most" compares. 0 for a workout of
   * only sets over 12 reps (no honest 1-rep max); such a point still carries its `best` set.
   */
  value: number;
  /** The workout's best set: heaviest weight (then most reps), or most reps. */
  best: { weightKg: number; reps: number };
}

export interface LiftSeries {
  exerciseId: string;
  name: string;
  unit: LiftUnit;
  /** One per workout, oldest first. */
  points: LiftPoint[];
}

const isWeighty = (t: LogType): boolean => t === 'weight_reps' || t === 'weighted';
const isRepsOnly = (t: LogType): boolean => t === 'reps';

/**
 * A point per (non-easy) workout for every lift that can be compared: weight lifts by their
 * best estimated 1-rep max (sets of 1–12 reps with weight), bodyweight lifts by their best set
 * of reps. A weight lift never logged with weight reads as reps (never "0 kg"). Assisted, timed
 * and distance work is left out.
 */
export function liftPoints(sets: readonly ProgressSet[], infos: ReadonlyMap<string, ProgressLiftInfo>): Map<string, LiftSeries> {
  const byExercise = new Map<string, ProgressSet[]>();
  for (const s of sets) {
    if (s.isWarmup || s.easy) continue;
    const list = byExercise.get(s.exerciseId) ?? [];
    list.push(s);
    byExercise.set(s.exerciseId, list);
  }
  const out = new Map<string, LiftSeries>();
  for (const [exerciseId, list] of byExercise) {
    const info = infos.get(exerciseId);
    if (!info) continue;
    let unit: LiftUnit | null = null;
    if (isWeighty(info.logType)) unit = list.some((s) => s.weightKg > 0 && s.reps > 0) ? 'kg' : 'reps';
    else if (isRepsOnly(info.logType)) unit = 'reps';
    if (!unit) continue;
    // Workouts in the order the sets came (oldest first), one point each.
    const order: string[] = [];
    const bySession = new Map<string, ProgressSet[]>();
    for (const s of list) {
      if (!bySession.has(s.sessionId)) {
        bySession.set(s.sessionId, []);
        order.push(s.sessionId);
      }
      bySession.get(s.sessionId)!.push(s);
    }
    const points: LiftPoint[] = [];
    for (const id of order) {
      const ws = bySession.get(id)!;
      let value = 0;
      let best: LiftPoint['best'] | null = null;
      for (const s of ws) {
        if (unit === 'kg') {
          if (!(s.weightKg > 0) || !(s.reps > 0)) continue;
          if (s.reps <= MAX_E1RM_REPS) value = Math.max(value, epleyE1rm(s.weightKg, s.reps));
          if (!best || s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps)) best = { weightKg: s.weightKg, reps: s.reps };
        } else {
          if (!(s.reps > 0)) continue;
          value = Math.max(value, s.reps);
          if (!best || s.reps > best.reps) best = { weightKg: 0, reps: s.reps };
        }
      }
      if (best) points.push({ dateISO: ws[0].dateISO, value, best });
    }
    points.sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
    if (points.length > 0) out.set(exerciseId, { exerciseId, name: info.name, unit, points });
  }
  return out;
}

/** The middle value (mean of the middle two for an even count). */
function median(values: readonly number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export interface TopLift {
  exerciseId: string;
  name: string;
  unit: LiftUnit;
  /** Best this week. */
  now: number;
  /** The typical workout of the usual weeks (median). */
  typical: number;
  pct: number;
}

export interface WeekVsUsual {
  /** Monday of this week. */
  weekFrom: string;
  week: { workouts: number; sets: number; liftsUp: number };
  /** The average full week before this one; null in a member's first week. */
  usual: { workouts: number; sets: number; weeks: number } | null;
  /**
   * Review fix (Phase 5): the usual week up to the SAME weekday (Monday → today's weekday), so
   * Wednesday's "2 workouts" is compared with what the member usually has by Wednesday — not
   * with a whole week, which read as "behind" every Monday. null with `usual`.
   */
  usualByNow: { workouts: number; sets: number } | null;
  topLift: TopLift | null;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function weekVsUsual(input: {
  sessions: readonly ProgressSession[];
  sets: readonly ProgressSet[];
  infos: ReadonlyMap<string, ProgressLiftInfo>;
  /** Record events (the one record rule); only this week's are counted. */
  events: readonly { exerciseId: string; dateISO: string }[];
  today: string;
  /** The member's first workout ever (null: none). */
  firstWorkoutISO: string | null;
}): WeekVsUsual {
  const { today } = input;
  const weekFrom = weekStartISO(today);
  const inWeek = (d: string): boolean => d >= weekFrom && d <= today;
  const working = (pred: (d: string) => boolean): number => input.sets.filter((s) => !s.isWarmup && pred(s.dateISO)).length;

  const week = {
    workouts: input.sessions.filter((s) => inWeek(s.dateISO)).length,
    sets: working(inWeek),
    liftsUp: liftsBeatingBest(input.events, weekFrom, today),
  };

  let usual: WeekVsUsual['usual'] = null;
  let usualByNow: WeekVsUsual['usualByNow'] = null;
  let usualFrom = addDays(weekFrom, -7 * USUAL_WEEKS);
  if (input.firstWorkoutISO != null && input.firstWorkoutISO < weekFrom) {
    const firstWeek = weekStartISO(input.firstWorkoutISO);
    if (firstWeek > usualFrom) usualFrom = firstWeek;
    const weeks = Math.round((Date.parse(`${weekFrom}T00:00:00Z`) - Date.parse(`${usualFrom}T00:00:00Z`)) / (7 * 86_400_000));
    if (weeks > 0) {
      const inUsual = (d: string): boolean => d >= usualFrom && d < weekFrom;
      usual = {
        workouts: round1(input.sessions.filter((s) => inUsual(s.dateISO)).length / weeks),
        sets: round1(working(inUsual) / weeks),
        weeks,
      };
      const todayIdx = dayOfWeek(today);
      const byNow = (d: string): boolean => inUsual(d) && dayOfWeek(d) <= todayIdx;
      usualByNow = {
        workouts: round1(input.sessions.filter((s) => byNow(s.dateISO)).length / weeks),
        sets: round1(working(byNow) / weeks),
      };
    }
  }

  let topLift: TopLift | null = null;
  if (usual) {
    for (const series of liftPoints(input.sets, input.infos).values()) {
      const pts = series.points.filter((p) => p.value > 0);
      const nowPts = pts.filter((p) => inWeek(p.dateISO));
      const before = pts.filter((p) => p.dateISO >= usualFrom && p.dateISO < weekFrom);
      if (nowPts.length === 0 || before.length < 2) continue;
      const now = Math.max(...nowPts.map((p) => p.value));
      const typical = median(before.map((p) => p.value));
      const pct = Math.round(((now - typical) / typical) * 100);
      if (pct < 1) continue;
      if (!topLift || pct > topLift.pct || (pct === topLift.pct && series.name.localeCompare(topLift.name) < 0)) {
        topLift = { exerciseId: series.exerciseId, name: series.name, unit: series.unit, now, typical, pct };
      }
    }
  }
  return { weekFrom, week, usual, usualByNow, topLift };
}

/** 0 = Monday … 6 = Sunday. */
function dayOfWeek(iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${weekStartISO(iso)}T00:00:00Z`)) / 86_400_000);
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "usually 1 by Wednesday" — the usual up to today's weekday; on Sunday the whole week. */
export function usualByText(n: number, today: string): string {
  const i = dayOfWeek(today);
  return i >= 6 ? usualText(n) : `${usualText(n)} by ${WEEKDAYS[i]}`;
}

/** "Estimated 1-rep max 99 kg · up 6% on your usual" / "Best set 25 reps · up 25% on your usual". */
export function topLiftText(t: Pick<TopLift, 'unit' | 'now' | 'pct'>, units: UnitSystem): string {
  const what = t.unit === 'kg' ? `Estimated 1-rep max ${Math.round(kgToShown(t.now, units))} ${weightUnitOf(units)}` : `Best set ${t.now} ${t.now === 1 ? 'rep' : 'reps'}`;
  return `${what} · up ${t.pct}% on your usual`;
}

/** "usually 3" — a usual week's number, to one decimal at most. */
export function usualText(n: number): string {
  return `usually ${trimNum(n)}`;
}

// ---------------------------------------------------------------- your lifts

/** The member's most-trained lifts (most workouts, then the latest, then the name). */
export function topLifts(series: ReadonlyMap<string, LiftSeries>, limit = 4): LiftSeries[] {
  return [...series.values()]
    .sort((a, b) => {
      if (b.points.length !== a.points.length) return b.points.length - a.points.length;
      const la = a.points[a.points.length - 1].dateISO;
      const lb = b.points[b.points.length - 1].dateISO;
      if (la !== lb) return la < lb ? 1 : -1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/**
 * Review fix (Phase 5): the lift row's sparkline plots what the lift chart below plots — the
 * heaviest weight of each workout (most reps for a bodyweight lift), easy weeks left out on
 * both. Before, the row drew estimated 1-rep max and the chart heaviest weight, so the two
 * could disagree about the same lift.
 */
export function liftTrendPoints(l: Pick<LiftSeries, 'unit' | 'points'>, units: UnitSystem): { x: string; y: number }[] {
  return l.points.map((p) => ({ x: p.dateISO, y: l.unit === 'kg' ? kgToShown(p.best.weightKg, units) : p.best.reps }));
}

/** "9 Oct", or "9 Oct 2025" when it isn't this year. */
export function dayText(iso: string, today: string): string {
  return iso.slice(0, 4) === today.slice(0, 4) ? tinyDate(iso) : `${tinyDate(iso)} ${iso.slice(0, 4)}`;
}

/** The lift's last workout: "82.5 kg × 6 · 15 Sep" / "20 reps · 1 Sep". */
export function liftLastText(l: Pick<LiftSeries, 'unit' | 'points'>, units: UnitSystem, today: string): string {
  const last = l.points[l.points.length - 1];
  if (!last) return '';
  const set = l.unit === 'kg' ? `${trimNum(kgToShown(last.best.weightKg, units))} ${weightUnitOf(units)} × ${last.best.reps}` : `${last.best.reps} ${last.best.reps === 1 ? 'rep' : 'reps'}`;
  return `${set} · ${dayText(last.dateISO, today)}`;
}

/** At most this many workouts when the lift was not done in the chosen range. */
const FALLBACK_POINTS = 20;

/**
 * PG-27: the points inside the chosen range; when the lift wasn't done in it, its last
 * workouts (at most 20) with a note that says so — never all of history in silence.
 */
export function rangeView<T extends { x: string }>(points: readonly T[], rangeDays: number, today: string): { points: T[]; note: string | null } {
  const from = addDays(today, -(rangeDays - 1));
  const inRange = points.filter((p) => p.x >= from);
  if (inRange.length > 0 || points.length === 0) return { points: inRange, note: null };
  const last = points.slice(-FALLBACK_POINTS);
  return { points: last, note: `Not done in the last ${rangeDays} days · last on ${dayText(last[last.length - 1].x, today)}` };
}

// ---------------------------------------------------------------- records (PG-05, PG-06)

/**
 * The link under the records list. More in the range than shown → "See all 14", opening
 * exactly those 14; otherwise, whenever older records exist → "See all records".
 */
export function recordsLink(inRange: number, all: number, shown: number): { label: string; scope: 'range' | 'all' } | null {
  if (inRange > shown) return { label: `See all ${inRange}`, scope: 'range' };
  if (all > inRange) return { label: 'See all records', scope: 'all' };
  return null;
}

/** Records between two days (inclusive; open when omitted). */
export function filterRecords<T extends { dateISO: string }>(rows: readonly T[], from?: string | null, to?: string | null): T[] {
  return rows.filter((r) => (from == null || r.dateISO >= from) && (to == null || r.dateISO <= to));
}

// ---------------------------------------------------------------- strength (PG-08)

/** What an empty strength score says: the real gap first. */
export function strengthEmpty(hasBodyWeight: boolean): { title: string; body: string; action?: 'weight' } {
  if (!hasBodyWeight) {
    return { title: 'Add your body weight', body: 'Your strength score compares your lifts with your body weight.', action: 'weight' };
  }
  return { title: 'No score yet', body: 'Do a bench press, squat or deadlift in a workout and your score shows here.' };
}

// ---------------------------------------------------------------- body (PG-25)

/**
 * The body-weight row when the range has no chart: "Log it" only when there are truly no
 * weigh-ins; otherwise the last one ("Last: 77.6 kg · 2 Aug"). null when the range has weigh-ins.
 */
export function bodyWeightSub(inRange: number, last: { dateISO: string; weightKg: number } | null, units: UnitSystem, today: string): string | null {
  if (inRange > 0) return null;
  if (!last) return 'Log it';
  return `Last: ${trimNum(kgToShown(last.weightKg, units))} ${weightUnitOf(units)} · ${dayText(last.dateISO, today)}`;
}

// ---------------------------------------------------------------- muscles (PG-28)

/** Muscles for a list: cardio is not a muscle (as on the report); no empty rows. */
export function musclesForList(data: readonly MuscleSetsSlice[]): MuscleSetsSlice[] {
  return data.filter((m) => m.sets > 0 && (m.muscle as Muscle) !== 'cardio');
}

// ---------------------------------------------------------------- the screen

/** A new member (no workout at all) sees one card; null = not read yet. */
export function progressMode(totalWorkouts: number | null): 'loading' | 'welcome' | 'full' {
  if (totalWorkouts == null) return 'loading';
  return totalWorkouts > 0 ? 'full' : 'welcome';
}
