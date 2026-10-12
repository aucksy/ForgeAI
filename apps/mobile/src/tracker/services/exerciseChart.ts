/**
 * Redesign R5 — the exercise page's Summary chart, as Hevy's (PLAN §4.6). PURE.
 *
 * One chart, a row of chips for what it shows, and a range (3 months · Year · All time). The
 * chips follow how the exercise is logged (Hevy's sets):
 *   weight × reps, added weight  Heaviest weight · One rep max · Best set kg lifted ·
 *                                Workout kg lifted · Total reps
 *   bodyweight reps              Most reps · Workout reps
 *   assisted                     Least help · Most reps · Workout reps
 *   timed (plank, stair climber) Best time (Longest time for cardio) · Workout time
 *   distance                     Longest distance · Workout distance
 *   distance + time (a run)      Longest distance · Longest time · Workout distance
 * Our words, never Hevy's "volume" / "session" (test/lib/memberWords.test.ts): kg lifted and
 * workout. Kg lifted follows the one volume rule (both dumbbells, body weight on pull-ups) — the
 * page's history arrives with it already applied (`historyWithVolume`), and the best set comes
 * from `bestSetSeriesFor`, the same as before. Easy-week workouts stay out, as on every chart.
 */
import { epleyE1rm } from '@/engine/overload';
import { addDays } from '@/lib/date';
import { kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { liftedWords } from '@/lib/units';
import type { UnitSystem } from '@/types/models';

import type { ExerciseHistoryEntry } from '../db/exerciseHistory';
import { distanceToUnit, fmtDuration, shownDistUnit, type DistUnit, type LogType } from '../engine/logTypes';
import type { BestSetPoint } from './exerciseAnalytics';

export type ChartMetric =
  | 'heaviest'
  | 'e1rm'
  | 'bestSet'
  | 'workoutLifted'
  | 'totalReps'
  | 'mostReps'
  | 'workoutReps'
  | 'leastHelp'
  | 'bestTime'
  | 'workoutTime'
  | 'longestDistance'
  | 'workoutDistance';

export type ChartRange = '3m' | '1y' | 'all';

export const CHART_RANGES: readonly { id: ChartRange; label: string }[] = [
  { id: '3m', label: '3 months' },
  { id: '1y', label: 'Year' },
  { id: 'all', label: 'All time' },
];

/** The chips for an exercise, in Hevy's order. PURE. */
export function chartMetrics(shownAs: LogType): ChartMetric[] {
  switch (shownAs) {
    case 'weight_reps':
    case 'weighted':
      return ['heaviest', 'e1rm', 'bestSet', 'workoutLifted', 'totalReps'];
    case 'reps':
      return ['mostReps', 'workoutReps'];
    case 'assisted':
      return ['leastHelp', 'mostReps', 'workoutReps'];
    case 'time':
      return ['bestTime', 'workoutTime'];
    case 'distance':
      return ['longestDistance', 'workoutDistance'];
    case 'time_distance':
    default:
      return ['longestDistance', 'bestTime', 'workoutDistance'];
  }
}

/** A chip's words. `cardio`: a timed exercise that is cardio (a stair climber) has a longest time, not a best hold. PURE. */
export function metricLabel(m: ChartMetric, units: UnitSystem, o: { shownAs?: LogType; cardio?: boolean } = {}): string {
  switch (m) {
    case 'heaviest':
      return 'Heaviest weight';
    case 'e1rm':
      return 'One rep max';
    case 'bestSet':
      return `Best set ${liftedWords(units)}`;
    case 'workoutLifted':
      return `Workout ${liftedWords(units)}`;
    case 'totalReps':
      return 'Total reps';
    case 'mostReps':
      return 'Most reps';
    case 'workoutReps':
      return 'Workout reps';
    case 'leastHelp':
      return 'Least help';
    case 'bestTime':
      return o.cardio || o.shownAs === 'time_distance' ? 'Longest time' : 'Best time';
    case 'workoutTime':
      return 'Workout time';
    case 'longestDistance':
      return 'Longest distance';
    case 'workoutDistance':
    default:
      return 'Workout distance';
  }
}

export type MetricUnit = 'weight' | 'reps' | 'seconds' | 'distance';

export function metricUnit(m: ChartMetric): MetricUnit {
  if (m === 'heaviest' || m === 'e1rm' || m === 'bestSet' || m === 'workoutLifted' || m === 'leastHelp') return 'weight';
  if (m === 'bestTime' || m === 'workoutTime') return 'seconds';
  if (m === 'longestDistance' || m === 'workoutDistance') return 'distance';
  return 'reps';
}

/** How a y value reads ("82.5 kg", "12 reps", "1:30", "5.2 km"). PURE. */
export function metricValueText(m: ChartMetric, y: number, units: UnitSystem, distUnit: DistUnit): string {
  switch (metricUnit(m)) {
    case 'weight':
      return `${trimNum(y)} ${weightUnit(units)}`;
    case 'seconds':
      return fmtDuration(y);
    case 'distance':
      return `${trimNum(y, 2)} ${shownDistUnit(distUnit)}`;
    case 'reps':
    default:
      return `${trimNum(y)} ${y === 1 ? 'rep' : 'reps'}`;
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const maxOf = (xs: readonly number[]): number => xs.reduce((a, b) => (b > a ? b : a), 0);
const sumOf = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * The points of one chip, oldest first; y in the member's units (kg or lb, km or miles). Workouts
 * that say nothing for the chip (a run without a time on "Longest time") are left out. PURE.
 */
export function metricSeries(
  m: ChartMetric,
  history: readonly ExerciseHistoryEntry[],
  bestSet: readonly BestSetPoint[],
  units: UnitSystem,
  distUnit: DistUnit,
): { x: string; y: number }[] {
  if (m === 'bestSet') {
    // Already oldest first, by the one volume rule.
    return bestSet.filter((p) => p.bestSetVolumeKg > 0).map((p) => ({ x: p.dateISO, y: round1(kgToDisplay(p.bestSetVolumeKg, units)) }));
  }
  const out: { x: string; y: number }[] = [];
  // History arrives newest first; easy weeks stay out of the charts.
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.easyWeek || h.sets.length === 0) continue;
    const sets = h.sets;
    let y: number | null = null;
    switch (m) {
      case 'heaviest':
        y = kgToDisplay(maxOf(sets.map((s) => s.weightKg)), units);
        break;
      case 'e1rm':
        y = kgToDisplay(maxOf(sets.map((s) => epleyE1rm(s.weightKg, s.reps))), units);
        break;
      case 'workoutLifted':
        y = h.volumeKg > 0 ? kgToDisplay(h.volumeKg, units) : null;
        break;
      case 'totalReps':
      case 'workoutReps':
        y = sumOf(sets.map((s) => Math.max(0, s.reps)));
        break;
      case 'mostReps':
        y = maxOf(sets.map((s) => s.reps));
        break;
      case 'leastHelp':
        // Assisted sets are stored as negative kg (the help); less help is stronger.
        y = kgToDisplay(Math.min(...sets.map((s) => Math.max(0, -s.weightKg))), units);
        break;
      case 'bestTime': {
        const t = maxOf(sets.map((s) => s.durationSec ?? 0));
        y = t > 0 ? t : null;
        break;
      }
      case 'workoutTime': {
        const t = sumOf(sets.map((s) => s.durationSec ?? 0));
        y = t > 0 ? t : null;
        break;
      }
      case 'longestDistance': {
        const d = maxOf(sets.map((s) => s.distanceM ?? 0));
        y = d > 0 ? distanceToUnit(d, distUnit) : null;
        break;
      }
      case 'workoutDistance': {
        const d = sumOf(sets.map((s) => s.distanceM ?? 0));
        y = d > 0 ? distanceToUnit(d, distUnit) : null;
        break;
      }
      default:
        y = null;
    }
    // Distances keep their own rounding (5.25 km); the rest read to one place (82.5 kg).
    if (y != null && Number.isFinite(y)) out.push({ x: h.dateISO, y: metricUnit(m) === 'distance' ? y : round1(y) });
  }
  return out;
}

/**
 * One point per day: the day's best for the chip (the least help for an assisted lift, the most
 * for every other chip). Two workouts on one day (a morning 300 kg test and an evening 105 kg
 * back-off) used to be two points a few pixels apart, which the chart drew as a cliff straight
 * down (owner's emulator, 12 Oct 2026). Points arrive oldest first and leave oldest first. PURE.
 */
export function bestPerDay(m: ChartMetric, points: readonly { x: string; y: number }[]): { x: string; y: number }[] {
  const lowerIsBetter = m === 'leastHelp';
  // Grouped by day with a map, not only against the previous point: the list is sorted by start
  // time, and a past-logged or imported workout's start time need not match its date, so two
  // same-day points can arrive apart (design-pass review, 12 Oct 2026).
  const best = new Map<string, number>();
  for (const p of points) {
    const had = best.get(p.x);
    if (had === undefined || (lowerIsBetter ? p.y < had : p.y > had)) best.set(p.x, p.y);
  }
  return [...best.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([x, y]) => ({ x, y }));
}

/** The first day a range shows (null = all time). PURE. */
export function rangeStart(range: ChartRange, today: string): string | null {
  if (range === '3m') return addDays(today, -90);
  if (range === '1y') return addDays(today, -364);
  return null;
}

/** The points inside a range. PURE. */
export function pointsInRange<T extends { x: string }>(points: readonly T[], range: ChartRange, today: string): T[] {
  const from = rangeStart(range, today);
  return from ? points.filter((p) => p.x >= from) : [...points];
}

/**
 * The range a page opens on: Hevy's 3 months — unless nothing was done in them, then the
 * smallest range that shows something (an exercise last done in spring opens on its year, or
 * all time), so the chart is never empty while there is history. PURE.
 */
export function openingRange(dates: readonly string[], today: string): ChartRange {
  for (const r of ['3m', '1y'] as const) {
    const from = rangeStart(r, today)!;
    if (dates.some((d) => d >= from)) return r;
  }
  return 'all';
}
