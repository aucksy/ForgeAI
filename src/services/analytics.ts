/**
 * Analytics service — per-exercise stats and the full analytics bundle.
 */
import { getAllExercises, getExerciseById } from '@/db/repos/exerciseRepo';
import { getNutritionRange } from '@/db/repos/nutritionRepo';
import { getAllPrs, getPrHistory } from '@/db/repos/prRepo';
import { getBodyWeightHistory } from '@/db/repos/userRepo';
import {
  getConsistency,
  getExerciseHistory,
  getMuscleGroupVolume,
  getWeeklyVolume,
  getWorkoutFrequency,
} from '@/db/repos/workoutRepo';
import { epleyE1rm } from '@/engine/overload';
import { computeStrengthScore } from '@/engine/strength';
import { addDays, fromISO, toISO, todayISO } from '@/lib/date';
import type {
  ConsistencyCell,
  ExerciseProgressPoint,
  ExerciseStats,
  MuscleVolumeSlice,
  NutritionDay,
  PersonalRecord,
  VolumePoint,
} from '@/types/models';

export async function getExerciseStats(exerciseId: string): Promise<ExerciseStats> {
  const exercise = await getExerciseById(exerciseId);
  if (!exercise) throw new Error(`Unknown exercise: ${exerciseId}`);
  const history = await getExerciseHistory(exerciseId); // newest first, working sets

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
      if (
        !bestSet ||
        s.weightKg > bestSet.weightKg ||
        (s.weightKg === bestSet.weightKg && s.reps > bestSet.reps)
      ) {
        bestSet = { weightKg: s.weightKg, reps: s.reps, dateISO: h.dateISO };
      }
    }
    progress.push({ dateISO: h.dateISO, topWeightKg: topW, e1rmKg: round1(sessionE1rm), volumeKg: h.volumeKg });
  }
  progress.reverse(); // chronological for charts

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

export async function getAnalyticsBundle(rangeDays: 30 | 90 | 180): Promise<{
  weight: { dateISO: string; weightKg: number }[];
  weeklyVolume: VolumePoint[];
  frequency: { weekISO: string; sessions: number }[];
  calories: NutritionDay[];
  muscleVolume: MuscleVolumeSlice[];
  consistency: ConsistencyCell[];
  prTimeline: (PersonalRecord & { exerciseName: string })[];
  strengthTrend: { dateISO: string; score: number }[]; // monthly points
}> {
  const today = todayISO();
  const from = addDays(today, -(rangeDays - 1));
  const weeks = Math.ceil(rangeDays / 7);

  const [weightEntries, weeklyVolume, frequency, calories, muscleVolume, consistency, prTimeline] =
    await Promise.all([
      getBodyWeightHistory(rangeDays),
      getWeeklyVolume(weeks),
      getWorkoutFrequency(weeks),
      getNutritionRange(from, today),
      getMuscleGroupVolume(from, today),
      getConsistency(rangeDays),
      getAllPrs(), // best per exercise, date desc
    ]);

  const strengthTrend = await buildStrengthTrend(from, today);

  return {
    weight: weightEntries.map((w) => ({ dateISO: w.dateISO, weightKg: w.weightKg })),
    weeklyVolume,
    frequency,
    calories,
    muscleVolume,
    consistency,
    prTimeline,
    strengthTrend,
  };
}

/** Mirrors the key-lift matching inside computeStrengthScore (limits PR queries). */
const KEY_LIFT = /bench|squat|deadlift|overhead|shoulder press|row/i;

/**
 * End-of-month strength score using body weight + best e1RM PRs recorded UP TO
 * each month end — approximate but monotone-consistent (PR bests never regress).
 */
async function buildStrengthTrend(
  from: string,
  today: string,
): Promise<{ dateISO: string; score: number }[]> {
  const [exercises, weights] = await Promise.all([getAllExercises(), getBodyWeightHistory()]);
  const keyExercises = exercises.filter((e) => KEY_LIFT.test(e.name));
  const histories = await Promise.all(keyExercises.map((e) => getPrHistory(e.id))); // asc

  const progressions = keyExercises
    .map((e, i) => ({ name: e.name, prs: histories[i].filter((p) => p.kind === 'e1rm') }))
    .filter((p) => p.prs.length > 0);

  return monthEndPoints(from, today).map((dateISO) => {
    const lifts = progressions
      .map((p) => {
        let best = 0;
        for (const pr of p.prs) {
          if (pr.dateISO > dateISO) break;
          if (pr.value > best) best = pr.value;
        }
        return { exerciseName: p.name, e1rmKg: best };
      })
      .filter((l) => l.e1rmKg > 0);
    const score = computeStrengthScore({ bodyWeightKg: bodyWeightAt(weights, dateISO), lifts }).score;
    return { dateISO, score };
  });
}

function bodyWeightAt(entries: { dateISO: string; weightKg: number }[], dateISO: string): number {
  let latest = 0;
  for (const e of entries) {
    // asc
    if (e.dateISO <= dateISO) latest = e.weightKg;
    else break;
  }
  if (latest > 0) return latest;
  return entries.length > 0 ? entries[0].weightKg : 0; // earliest known as approximation
}

/** Calendar month-end points from `from` through `to` (always ends with `to`). */
function monthEndPoints(from: string, to: string): string[] {
  const points: string[] = [];
  const start = fromISO(from);
  let d = new Date(start.getFullYear(), start.getMonth() + 1, 0); // end of from's month
  const end = fromISO(to);
  while (d.getTime() < end.getTime()) {
    points.push(toISO(d));
    d = new Date(d.getFullYear(), d.getMonth() + 2, 0); // end of the next month
  }
  points.push(to);
  return points;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
