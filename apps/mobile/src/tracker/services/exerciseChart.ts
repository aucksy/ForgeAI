/**
 * Redesign R5 — the exercise page's Summary chart, as Hevy's (PLAN §4.6). PURE.
 *
 * One chart, a row of chips for what it shows, and a range (3 months · Year · All time). The
 * chips follow how the exercise is logged (Hevy's sets):
 *   weight × reps, added weight  Heaviest weight · Estimated 1-rep max · Kg lifted in best set ·
 *                                Kg lifted · Total reps
 *   bodyweight reps              Most reps · Total reps
 *   assisted                     Least help · Most reps · Total reps
 *   timed (plank, stair climber) Best time (Longest time for cardio) · Total time
 *   distance                     Longest distance · Total distance
 *   distance + time (a run)      Longest distance · Longest time · Total distance
 * ("Kg lifted", "Total …" = in the whole workout; 13 Oct 2026 renames.)
 * Our words, never Hevy's "volume" / "session" (test/lib/memberWords.test.ts): kg lifted and
 * workout. Kg lifted follows the one volume rule (both dumbbells, body weight on pull-ups) — the
 * page's history arrives with it already applied (`historyWithVolume`), and the best set comes
 * from `bestSetSeriesFor`, the same as before. Easy-week workouts stay out, as on every chart.
 */
import { addDays, twelveMonthsFrom } from '@/lib/date';
import { estimatedOneRepMax } from '@/lib/e1rm';
import { fmtCompact, fmtInt, kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import { liftedWords } from '@/lib/units';
import type { UnitSystem } from '@/types/models';

import type { ExerciseHistoryEntry } from '../db/exerciseHistory';
import { speedToShown, speedUnit } from '../engine/cardioMachine';
import { distanceToUnit, fmtDuration, shownDistUnit, type DistUnit, type LogType } from '../engine/logTypes';
import type { BestSetPoint } from './exerciseAnalytics';

/**
 * F64: the machine chips an exercise's history can draw — only for a detail some set carries, so
 * an exercise logged without them shows exactly the chips it always did. PURE.
 */
export function machineChartMetrics(history: readonly ExerciseHistoryEntry[]): ChartMetric[] {
  let speed = false;
  let incline = false;
  let level = false;
  for (const h of history) {
    if (h.easyWeek) continue;
    for (const s of h.sets) {
      if (s.machine?.speedKmh != null) speed = true;
      if (s.machine?.inclinePct != null) incline = true;
      if (s.machine?.level != null) level = true;
    }
  }
  const out: ChartMetric[] = [];
  if (speed) out.push('topSpeed');
  if (incline) out.push('topIncline');
  if (level) out.push('topLevel');
  return out;
}

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
  | 'workoutDistance'
  // F64: a cardio machine's details, offered only when some set carries them.
  | 'topSpeed'
  | 'topIncline'
  | 'topLevel';

export type ChartRange = '3m' | '1y' | 'all';

export const CHART_RANGES: readonly { id: ChartRange; label: string }[] = [
  { id: '3m', label: '3 months' },
  // C2-8 (16 Oct 2026 audit): a rolling 12 months, as Statistics and Profile say — not "Year".
  { id: '1y', label: '12 months' },
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

/**
 * R-141 (owner, 27 Oct 2026): opened from a live workout, the chart starts on the per-workout total
 * — "Kg lifted" for a weight lift, total reps / time / distance for the rest — so today's total sits
 * beside last time's. PURE.
 */
export function workoutChartMetric(shownAs: LogType): ChartMetric {
  switch (shownAs) {
    case 'weight_reps':
    case 'weighted':
      return 'workoutLifted';
    case 'reps':
    case 'assisted':
      return 'workoutReps';
    case 'time':
      return 'workoutTime';
    case 'distance':
    case 'time_distance':
    default:
      return 'workoutDistance';
  }
}

/**
 * A chip's words. `cardio`: a timed exercise that is cardio (a stair climber) has a longest time,
 * not a best hold. 13 Oct 2026 (owner: "Workout kg lifted" read oddly): the app's own words —
 * "Kg lifted" as in Statistics, "Estimated 1-rep max" as the design language says, and each
 * per-workout sum is a "Total …". PURE.
 */
export function metricLabel(m: ChartMetric, units: UnitSystem, o: { shownAs?: LogType; cardio?: boolean } = {}): string {
  switch (m) {
    case 'heaviest':
      return 'Heaviest weight';
    case 'e1rm':
      return 'Estimated 1-rep max';
    case 'bestSet':
      return `${liftedWords(units, true)} in best set`;
    case 'workoutLifted':
      return liftedWords(units, true);
    case 'totalReps':
      return 'Total reps';
    case 'mostReps':
      return 'Most reps';
    case 'workoutReps':
      return 'Total reps';
    case 'leastHelp':
      return 'Least help';
    case 'bestTime':
      return o.cardio || o.shownAs === 'time_distance' ? 'Longest time' : 'Best time';
    case 'workoutTime':
      return 'Total time';
    case 'longestDistance':
      return 'Longest distance';
    case 'topSpeed':
      return 'Fastest speed'; // member-words
    case 'topIncline':
      return 'Steepest incline'; // member-words
    case 'topLevel':
      return 'Highest level'; // member-words
    case 'workoutDistance':
    default:
      return 'Total distance';
  }
}

export type MetricUnit = 'weight' | 'reps' | 'seconds' | 'distance' | 'speed' | 'percent' | 'level';

export function metricUnit(m: ChartMetric): MetricUnit {
  if (m === 'heaviest' || m === 'e1rm' || m === 'bestSet' || m === 'workoutLifted' || m === 'leastHelp') return 'weight';
  if (m === 'bestTime' || m === 'workoutTime') return 'seconds';
  if (m === 'longestDistance' || m === 'workoutDistance') return 'distance';
  if (m === 'topSpeed') return 'speed';
  if (m === 'topIncline') return 'percent';
  if (m === 'topLevel') return 'level';
  return 'reps';
}

/**
 * A number on the chart and its readout: whole and grouped the phone's way from 1,000 up
 * ("1,330", as everywhere else — 13 Oct 2026, the owner saw "1330 kg"), trimmed below it
 * ("82.5"). PURE.
 */
export function chartNumber(n: number, dp = 1): string {
  return Math.abs(n) >= 1000 ? fmtInt(n) : trimNum(n, dp);
}

/**
 * A y-axis label: `chartNumber`, and the short form ("125k") only from 100,000 up, where the
 * grouped number would not fit beside the axis. PURE.
 */
export function chartAxisNumber(n: number): string {
  return Math.abs(n) >= 100_000 ? fmtCompact(n) : chartNumber(n);
}

/** How a y value reads ("82.5 kg", "1,330 kg", "12 reps", "1:30", "5.2 km"). PURE. */
export function metricValueText(m: ChartMetric, y: number, units: UnitSystem, distUnit: DistUnit): string {
  switch (metricUnit(m)) {
    case 'weight':
      // C2-5 (16 Oct 2026 audit): a set's own weight reads as the set table does ("61.25 kg").
      return `${chartNumber(y, setWeightDp(m, units))} ${weightUnit(units)}`;
    case 'seconds':
      return fmtDuration(y);
    case 'distance':
      return `${chartNumber(y, 2)} ${shownDistUnit(distUnit)}`;
    case 'speed':
      return `${chartNumber(y)} ${speedUnit(units)}`; // member-words
    case 'percent':
      return `incline ${chartNumber(y)}%`; // member-words
    case 'level':
      return `level ${chartNumber(y)}`; // member-words
    case 'reps':
    default:
      return `${chartNumber(y)} ${y === 1 ? 'rep' : 'reps'}`;
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
/**
 * C2-5: decimals for a chip whose value is ONE set's weight (heaviest, least help): 2 in kg, as the
 * set table and "Last time" rows (61.25 kg, never "61.3"); 1 in lb. Totals and estimates keep 1.
 */
export function setWeightDp(m: ChartMetric, units: UnitSystem): number {
  return (m === 'heaviest' || m === 'leastHelp') && units !== 'imperial' ? 2 : 1;
}
const roundTo = (n: number, dp: number): number => Math.round(n * 10 ** dp) / 10 ** dp;
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
        // 13 Oct 2026 audit (B1): the records' estimate (reps above 12 count as 12).
        y = kgToDisplay(maxOf(sets.map((s) => estimatedOneRepMax(s.weightKg, s.reps))), units);
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
      case 'topSpeed': {
        const v = maxOf(sets.map((s) => s.machine?.speedKmh ?? 0));
        y = v > 0 ? speedToShown(v, units) : null;
        break;
      }
      case 'topIncline':
      case 'topLevel': {
        const vals = sets.map((s) => (m === 'topIncline' ? s.machine?.inclinePct : s.machine?.level)).filter((v): v is number => v != null);
        y = vals.length > 0 ? maxOf(vals) : null;
        break;
      }
      default:
        y = null;
    }
    // Distances keep their own rounding (5.25 km); the rest read to one place (82.5 kg).
    if (y != null && Number.isFinite(y)) out.push({ x: h.dateISO, y: metricUnit(m) === 'distance' ? y : roundTo(y, setWeightDp(m, units)) });
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
  if (range === '1y') return twelveMonthsFrom(today); // C2-1/C2-8: the 12 months ending today
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
