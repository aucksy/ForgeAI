/**
 * Dashboard service — assembles the full DashboardData snapshot from repos + engine.
 *
 * Audit Phase 8 (packet C): the newest 12 workouts come from three batched reads (they were
 * two reads per workout), and Home's own loader (`tracker/services/dashboardPhase2`) can hand
 * in what it already read and skip what only a hidden card uses (`buildDashboardData`).
 * `getDashboardData()` itself returns exactly what it always did.
 */
import { getDb } from '@/db';
import { getNutritionDay } from '@/db/repos/nutritionRepo';
import { getAllPrs } from '@/db/repos/prRepo';
import { getBodyWeightHistory, getLatestBodyWeight, getProfile } from '@/db/repos/userRepo';
import {
  getExerciseHistory,
  getSessionsBetween,
  getStreakDays,
  getWeeklyVolume,
} from '@/db/repos/workoutRepo';
import { buildInsight } from '@/engine/insights';
import { computeRecovery } from '@/engine/recovery';
import { computeStrengthScore } from '@/engine/strength';
import { addDays, todayISO, weekStartISO } from '@/lib/date';
import { STREAK_LOOKBACK_DAYS, weekStreak } from '@/lib/streak';
import { getTodaysWorkout } from '@/services/coach';
import { getRecentSessionDetailsBatched } from '@/tracker/db/sessionDetails';
import type { DashboardData, MuscleGroup, SessionDetail, TodaysWorkout } from '@/types/models';

/** Sessions read for the recovery score and the last workout. */
const RECENT_SESSIONS = 12;

export async function getDashboardData(): Promise<DashboardData> {
  return buildDashboardData();
}

/** Audit Phase 8 (packet C): what a caller already read, and what it can skip. */
export interface DashboardInputs {
  /** Today's workout, already read (Home reads it with the v2 Targets) — the v1 read is skipped. */
  todaysWorkout?: TodaysWorkout;
  /** The newest 12 workouts (frozen-rule details, newest first), already being read. */
  recentDetails?: Promise<SessionDetail[]>;
  /** Look for a flat lift for the insight line — only the coach shows it (default true). */
  plateau?: boolean;
  /**
   * Read the stored records for the strength score — only the coach's score tiles show it
   * (default true). Skipped, the score has no key lifts: the "can't be worked out" score that
   * `scoreTiles` never shows.
   */
  strength?: boolean;
}

/** `getDashboardData()`, from what the caller already has. With no inputs, the same snapshot. */
export async function buildDashboardData(inputs: DashboardInputs = {}): Promise<DashboardData> {
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
    streakSessions,
  ] = await Promise.all([
    inputs.todaysWorkout ? Promise.resolve(inputs.todaysWorkout) : getTodaysWorkout(),
    getProfile(),
    getNutritionDay(today),
    getLatestBodyWeight(),
    getBodyWeightHistory(30),
    getStreakDays(today),
    getSessionsBetween(weekStartISO(today), today),
    inputs.recentDetails ?? getRecentSessionDetailsBatched(RECENT_SESSIONS),
    getWeeklyVolume(6), // Monday buckets asc; last = current (partial) week
    inputs.strength === false ? Promise.resolve([]) : getAllPrs(),
    // Only the days count for the streak (was every column of ~3 years of workouts).
    getDb().getAllAsync<{ date_iso: string }>('SELECT date_iso FROM workout_sessions WHERE date_iso BETWEEN ? AND ?', [
      addDays(today, -STREAK_LOOKBACK_DAYS),
      today,
    ]),
  ]);
  // Phase 3 (D9): THE streak is weeks in a row, the same rule as Progress and History.
  const streakWeeks = weekStreak(streakSessions.map((s) => s.date_iso), today);

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

  const plateauedExercise =
    inputs.plateau === false
      ? null
      : await findPlateau(todaysWorkout.targets.map((t) => ({ id: t.exerciseId, name: t.exerciseName })));

  // Phase 3 (D10, SH-05): the stored PR table calls a first-ever set a "PR", so it never
  // speaks here; the lifts that beat a best are counted by the one record rule in
  // `tracker/services/dashboardPhase2`.
  const insight = buildInsight({
    streakWeeks,
    proteinGapG: Math.round(profile.proteinTargetG - nutrition.proteinG),
    liftsUp: 0,
    plateauedExercise,
    weeklyVolumeDeltaPct,
    todayTrained,
  });

  const lastDetail = recentDetails.length > 0 ? recentDetails[0] : null;

  return {
    todaysWorkout,
    streakDays,
    streakWeeks,
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
