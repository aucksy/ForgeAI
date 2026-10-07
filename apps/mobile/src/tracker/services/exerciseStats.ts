/**
 * The exercise page's numbers, for every exercise type (Phase 2).
 *
 * Weight × reps (and added-weight) exercises keep the frozen page's shape — best set,
 * estimated 1-rep max, averages, a progress series — but their volume follows the one
 * volume rule. Bodyweight reps, assisted, timed and distance exercises get the numbers
 * that mean something for them: most reps, least help, longest hold, longest distance,
 * best pace. PURE builders + one reader.
 */
import { epleyE1rm } from '@/engine/overload';
import type { ExerciseProgressPoint, ExerciseStats } from '@/types/models';

import { getBoundedExerciseHistory, type ExerciseHistoryEntry } from '../db/exerciseHistory';
import { getTrackerExercise, type TrackerExercise } from '../db/exerciseInfo';
import { distanceToUnit, fmtDistance, fmtDuration, isTimedCardio, type DistUnit, type LogType } from '../engine/logTypes';
import { exerciseRecords, type ExerciseRecords, type RecordSession } from '../engine/records';
import { bodyweightOn, setVolumeKg, type BodyweightPoint } from '../engine/volume';
import { bestSetVolumeSeries, type BestSetPoint } from './exerciseAnalytics';
import { getBodyweightTimeline } from './volumeService';

export interface OverviewTile {
  label: string;
  value: string;
}

export interface OverviewSeries {
  title: string;
  points: { x: string; y: number }[];
  /** How to print a y value. */
  unit: 'reps' | 'kg' | 'seconds' | 'distance';
}

export interface ExerciseOverview {
  exercise: TrackerExercise;
  /** Newest first; volume by the Phase 2 rule. */
  history: ExerciseHistoryEntry[];
  /** Weight × reps / added weight: the frozen page's stats, volume corrected. */
  weightStats: ExerciseStats | null;
  /** Other types: three tiles and one chart. */
  tiles: OverviewTile[];
  series: OverviewSeries | null;
  /** Best single set per workout, by the same volume rule as the Volume chart. */
  bestSet: BestSetPoint[];
  /** Phase 3: every record this exercise keeps (heaviest, best set, most reps, longest…). */
  records: ExerciseRecords;
}

/**
 * The exercise page's history (newest first, ordered by start time) as the record rule's
 * workouts. PURE.
 */
export function recordSessionsFromHistory(history: readonly ExerciseHistoryEntry[]): RecordSession[] {
  const n = history.length;
  return history.map((h, i) => ({
    sessionId: h.sessionId,
    dateISO: h.dateISO,
    // The list is already in start-time order; its position stands in for the time.
    startedAt: n - i,
    sets: h.sets.map((s) => ({
      weightKg: s.weightKg,
      reps: s.reps,
      durationSec: s.durationSec ?? null,
      distanceM: s.distanceM ?? null,
      loadMode: s.loadMode ?? null,
    })),
  }));
}

/**
 * Tiles that do not repeat the Records card (Phase 3): the card now carries most reps,
 * longest time and longest distance with their dates, so only the other facts stay as
 * tiles — least help, best pace, all-time distance, the busiest workout, and the count. PURE.
 */
export function tilesBesideRecords(tiles: readonly OverviewTile[], logType: LogType): OverviewTile[] {
  const repeated: Record<LogType, readonly string[]> = {
    weight_reps: [],
    weighted: [],
    reps: ['Best set', 'Most in a workout'],
    assisted: ['Most reps'],
    time: ['Longest hold', 'Longest'],
    distance: ['Longest'],
    time_distance: ['Longest'],
  };
  return tiles.filter((t) => !repeated[logType].includes(t.label));
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** History with every session's volume recomputed by the Phase 2 rule. PURE. */
export function historyWithVolume(
  history: ExerciseHistoryEntry[],
  ex: Pick<TrackerExercise, 'logType' | 'loadMode' | 'bwShare'>,
  bw: readonly BodyweightPoint[],
): ExerciseHistoryEntry[] {
  return history.map((h) => {
    const body = bodyweightOn(bw, h.dateISO);
    return { ...h, volumeKg: h.sets.reduce((sum, s) => sum + setVolumeKg(s, ex, body), 0) };
  });
}

/**
 * Best single set per workout by the Phase 2 rule — a 25 kg × 10 set on dumbbells counted
 * as both reads 500 like the Volume chart, not 250; a weighted pull-up adds body weight. PURE.
 */
export function bestSetSeriesFor(
  history: ExerciseHistoryEntry[],
  ex: Pick<TrackerExercise, 'logType' | 'loadMode' | 'bwShare'>,
  bw: readonly BodyweightPoint[],
): BestSetPoint[] {
  return bestSetVolumeSeries(history, (s, dateISO) => setVolumeKg(s, ex, bodyweightOn(bw, dateISO)));
}

/** The frozen ExerciseStats maths over a (volume-corrected) history. PURE. */
export function weightStatsOf(exercise: TrackerExercise, history: ExerciseHistoryEntry[]): ExerciseStats {
  let bestSet: ExerciseStats['bestSet'] = null;
  let bestE1rm: number | null = null;
  let weightSum = 0;
  let repsSum = 0;
  let setCount = 0;
  const progress: ExerciseProgressPoint[] = [];
  for (const h of history) {
    if (h.sets.length === 0) continue;
    let topW = h.sets[0].weightKg;
    let topR = h.sets[0].reps;
    let sessionE1rm = 0;
    for (const s of h.sets) {
      weightSum += s.weightKg;
      repsSum += s.reps;
      setCount++;
      const e1 = epleyE1rm(s.weightKg, s.reps);
      if (e1 > sessionE1rm) sessionE1rm = e1;
      if (bestE1rm === null || e1 > bestE1rm) bestE1rm = e1;
      if (s.weightKg > topW || (s.weightKg === topW && s.reps > topR)) {
        topW = s.weightKg;
        topR = s.reps;
      }
      if (!bestSet || s.weightKg > bestSet.weightKg || (s.weightKg === bestSet.weightKg && s.reps > bestSet.reps)) {
        bestSet = { weightKg: s.weightKg, reps: s.reps, dateISO: h.dateISO };
      }
    }
    progress.push({ dateISO: h.dateISO, topWeightKg: topW, e1rmKg: round1(sessionE1rm), volumeKg: h.volumeKg });
  }
  progress.reverse();
  return {
    exercise,
    sessionsCount: history.length,
    bestSet,
    prE1rmKg: bestE1rm === null ? null : round1(bestE1rm),
    avgWeightKg: setCount > 0 ? round1(weightSum / setCount) : null,
    avgReps: setCount > 0 ? round1(repsSum / setCount) : null,
    progress,
    history,
  };
}

/** Seconds per km (or per 500 m for metre-based exercises like rowing). */
export function pace(durationSec: number, distanceM: number, unit: DistUnit): number | null {
  if (!(durationSec > 0) || !(distanceM > 0)) return null;
  return unit === 'm' ? durationSec / (distanceM / 500) : durationSec / (distanceM / 1000);
}

export function fmtPace(secPer: number, unit: DistUnit): string {
  return `${fmtDuration(Math.round(secPer))} /${unit === 'm' ? '500 m' : 'km'}`;
}

/** Tiles and the chart for a non-weight type. PURE. */
export function typedOverview(
  logType: LogType,
  history: ExerciseHistoryEntry[],
  unit: DistUnit,
  opts: { cardio?: boolean } = {},
): { tiles: OverviewTile[]; series: OverviewSeries | null } {
  const workouts: OverviewTile = { label: 'Workouts', value: String(history.length) };
  const chrono = [...history].reverse();
  if (logType === 'reps') {
    const best = Math.max(0, ...history.flatMap((h) => h.sets.map((s) => s.reps)));
    const mostInOne = Math.max(0, ...history.map((h) => h.sets.reduce((n, s) => n + s.reps, 0)));
    return {
      tiles: [
        { label: 'Best set', value: `${best} reps` },
        { label: 'Most in a workout', value: `${mostInOne} reps` },
        workouts,
      ],
      series: {
        title: 'Best set (reps)',
        unit: 'reps',
        points: chrono.map((h) => ({ x: h.dateISO, y: Math.max(0, ...h.sets.map((s) => s.reps)) })),
      },
    };
  }
  if (logType === 'assisted') {
    const helpOf = (w: number) => Math.max(0, -w);
    const all = history.flatMap((h) => h.sets);
    const least = all.length > 0 ? all.reduce((a, s) => (helpOf(s.weightKg) < helpOf(a.weightKg) || (helpOf(s.weightKg) === helpOf(a.weightKg) && s.reps > a.reps) ? s : a)) : null;
    const most = Math.max(0, ...all.map((s) => s.reps));
    return {
      tiles: [
        { label: 'Least help', value: least ? `${round1(helpOf(least.weightKg))} kg × ${least.reps}` : '—' },
        { label: 'Most reps', value: `${most}` },
        workouts,
      ],
      series: {
        title: 'Help used (kg) — lower is stronger',
        unit: 'kg',
        points: chrono.map((h) => ({ x: h.dateISO, y: Math.min(...h.sets.map((s) => helpOf(s.weightKg))) })),
      },
    };
  }
  if (logType === 'time') {
    const longest = Math.max(0, ...history.flatMap((h) => h.sets.map((s) => s.durationSec ?? 0)));
    const total = Math.max(0, ...history.map((h) => h.sets.reduce((n, s) => n + (s.durationSec ?? 0), 0)));
    // A stair climber or jump rope is not a "hold".
    const longestLabel = opts.cardio ? 'Longest' : 'Longest hold';
    return {
      tiles: [
        { label: longestLabel, value: longest > 0 ? fmtDuration(longest) : '—' },
        { label: 'Most in a workout', value: total > 0 ? fmtDuration(total) : '—' },
        workouts,
      ],
      series: {
        title: longestLabel,
        unit: 'seconds',
        points: chrono.map((h) => ({ x: h.dateISO, y: Math.max(0, ...h.sets.map((s) => s.durationSec ?? 0)) })),
      },
    };
  }
  // distance / time_distance
  const dist = (h: ExerciseHistoryEntry) => h.sets.reduce((n, s) => n + (s.distanceM ?? 0), 0);
  const longest = Math.max(0, ...history.flatMap((h) => h.sets.map((s) => s.distanceM ?? 0)));
  const total = history.reduce((n, h) => n + dist(h), 0);
  const paces = history.flatMap((h) =>
    h.sets.map((s) => pace(s.durationSec ?? 0, s.distanceM ?? 0, unit)).filter((p): p is number => p != null),
  );
  const tiles: OverviewTile[] = [{ label: 'Longest', value: longest > 0 ? fmtDistance(longest, unit) : '—' }];
  if (logType === 'time_distance') {
    tiles.push({ label: 'Best pace', value: paces.length > 0 ? fmtPace(Math.min(...paces), unit) : '—' });
  } else {
    tiles.push({ label: 'All time', value: total > 0 ? fmtDistance(total, unit) : '—' });
  }
  tiles.push(workouts);
  return {
    tiles,
    series: {
      title: `Distance (${unit})`,
      unit: 'distance',
      points: chrono.map((h) => ({ x: h.dateISO, y: distanceToUnit(dist(h), unit) })),
    },
  };
}

/** Everything the exercise page shows, or null when the exercise is gone. */
export async function getExerciseOverview(exerciseId: string): Promise<ExerciseOverview | null> {
  const [exercise, raw, bw] = await Promise.all([
    getTrackerExercise(exerciseId),
    getBoundedExerciseHistory(exerciseId),
    getBodyweightTimeline(),
  ]);
  if (!exercise) return null;
  const history = historyWithVolume(raw, exercise, bw);
  const records = exerciseRecords(recordSessionsFromHistory(history), exercise, bw);
  const weighty = exercise.logType === 'weight_reps' || exercise.logType === 'weighted';
  if (weighty) {
    return {
      exercise,
      history,
      weightStats: weightStatsOf(exercise, history),
      tiles: [],
      series: null,
      bestSet: bestSetSeriesFor(history, exercise, bw),
      records,
    };
  }
  const { tiles, series } = typedOverview(exercise.logType, history, exercise.distUnit, {
    cardio: isTimedCardio(exercise.logType, exercise.muscles.primary),
  });
  return { exercise, history, weightStats: null, tiles: tilesBesideRecords(tiles, exercise.logType), series, bestSet: [], records };
}
