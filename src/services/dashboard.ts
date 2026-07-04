/**
 * Dashboard service — assembles the full DashboardData snapshot from repos + engine.
 */
import { getNutritionDay } from '@/db/repos/nutritionRepo';
import { getAllPrs } from '@/db/repos/prRepo';
import { getBodyWeightHistory, getLatestBodyWeight, getProfile } from '@/db/repos/userRepo';
import {
  getExerciseHistory,
  getRecentSessionDetails,
  getSessionsBetween,
  getStreakDays,
  getWeeklyVolume,
} from '@/db/repos/workoutRepo';
import { buildInsight } from '@/engine/insights';
import { computeRecovery } from '@/engine/recovery';
import { computeStrengthScore } from '@/engine/strength';
import { addDays, todayISO, weekStartISO } from '@/lib/date';
import { getTodaysWorkout } from '@/services/coach';
import type { DashboardData, MuscleGroup, SessionDetail } from '@/types/models';

export async function getDashboardData(): Promise<DashboardData> {
  const today = todayISO();
  const [
    todaysWorkout,
    profile,
    nutrition,
    latestWeight,
    weightHistory,
    streakDays,
    weekSessions,
    recentDetails,
    weeklyBuckets,
    allPrs,
  ] = await Promise.all([
    getTodaysWorkout(),
    getProfile(),
    getNutritionDay(today),
    getLatestBodyWeight(),
    getBodyWeightHistory(30),
    getStreakDays(today),
    getSessionsBetween(weekStartISO(today), today),
    getRecentSessionDetails(12),
    getWeeklyVolume(6), // Monday buckets asc; last = current (partial) week
    getAllPrs(),
  ]);

  const cur = weeklyBuckets.length > 0 ? weeklyBuckets[weeklyBuckets.length - 1].volumeKg : 0;
  const prev = weeklyBuckets.length > 1 ? weeklyBuckets[weeklyBuckets.length - 2].volumeKg : 0;
  const weeklyVolumeDeltaPct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0;

  // Trailing mean of up to 4 FULL weeks before the current one.
  const fullWeeks = weeklyBuckets.slice(0, -1).slice(-4);
  const avgWeeklyVolumeKg =
    fullWeeks.length > 0 ? fullWeeks.reduce((s, w) => s + w.volumeKg, 0) / fullWeeks.length : 0;

  const sevenDayFloor = addDays(today, -6);
  const recovery = computeRecovery({
    todayISO: today,
    recentSessions: recentDetails
      .filter((s) => s.dateISO >= sevenDayFloor && s.dateISO <= today)
      .map((s) => ({
        dateISO: s.dateISO,
        dayType: s.dayType,
        volumeKg: s.totalVolumeKg,
        muscleVolumes: muscleVolumesOf(s),
      })),
    avgWeeklyVolumeKg,
  });

  const strength = computeStrengthScore({
    bodyWeightKg: latestWeight ? latestWeight.weightKg : 0,
    lifts: allPrs
      .filter((p) => p.kind === 'e1rm')
      .map((p) => ({ exerciseName: p.exerciseName, e1rmKg: p.value })),
  });

  const todayTrained = weekSessions.some((s) => s.dateISO === today);
  const prExercises = new Set(
    allPrs.filter((p) => p.dateISO >= sevenDayFloor).map((p) => p.exerciseId),
  );

  const plateauedExercise = await findPlateau(
    todaysWorkout.targets.map((t) => ({ id: t.exerciseId, name: t.exerciseName })),
  );

  const insight = buildInsight({
    streakDays,
    proteinGapG: Math.round(profile.proteinTargetG - nutrition.proteinG),
    recentPrCount: prExercises.size,
    plateauedExercise,
    weeklyVolumeDeltaPct,
    todayTrained,
  });

  const lastDetail = recentDetails.length > 0 ? recentDetails[0] : null;

  return {
    todaysWorkout,
    streakDays,
    workoutsThisWeek: weekSessions.length,
    caloriesToday: nutrition.calories,
    proteinTodayG: nutrition.proteinG,
    calorieTarget: profile.calorieTarget,
    proteinTargetG: profile.proteinTargetG,
    recovery,
    strength,
    weeklyVolumeKg: cur,
    weeklyVolumeDeltaPct,
    bodyWeightKg: latestWeight ? latestWeight.weightKg : null,
    bodyWeightTrend: weightHistory.map((w) => ({ dateISO: w.dateISO, weightKg: w.weightKg })),
    insight,
    lastWorkout: lastDetail
      ? { dateISO: lastDetail.dateISO, dayType: lastDetail.dayType, volumeKg: lastDetail.totalVolumeKg }
      : null,
  };
}

/** Per-session muscle volume: primary muscle full, secondaries count 50%. */
function muscleVolumesOf(detail: SessionDetail): { muscleGroup: MuscleGroup; volumeKg: number }[] {
  const acc = new Map<MuscleGroup, number>();
  for (const ex of detail.exercises) {
    bump(acc, ex.exercise.muscleGroup, ex.volumeKg);
    for (const m of ex.exercise.secondaryMuscles) bump(acc, m, ex.volumeKg * 0.5);
  }
  return Array.from(acc.entries()).map(([muscleGroup, volumeKg]) => ({ muscleGroup, volumeKg }));
}

function bump(map: Map<MuscleGroup, number>, key: MuscleGroup, v: number): void {
  map.set(key, (map.get(key) ?? 0) + v);
}

/** First of today's exercises whose last 3 sessions are flat on both top weight and reps. */
async function findPlateau(exs: { id: string; name: string }[]): Promise<string | null> {
  for (const ex of exs) {
    const history = await getExerciseHistory(ex.id, 3);
    if (history.length < 3) continue;
    const tops: { w: number; r: number }[] = [];
    for (const h of history) {
      const t = topSet(h.sets);
      if (!t) break;
      tops.push(t);
    }
    if (tops.length < 3) continue;
    const [a, b, c] = tops;
    if (a.w === b.w && b.w === c.w && a.r === b.r && b.r === c.r) return ex.name;
  }
  return null;
}

function topSet(sets: { weightKg: number; reps: number }[]): { w: number; r: number } | null {
  if (sets.length === 0) return null;
  let w = sets[0].weightKg;
  let r = sets[0].reps;
  for (const s of sets) {
    if (s.weightKg > w) {
      w = s.weightKg;
      r = s.reps;
    } else if (s.weightKg === w && s.reps > r) {
      r = s.reps;
    }
  }
  return { w, r };
}
