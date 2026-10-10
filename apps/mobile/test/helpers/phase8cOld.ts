/**
 * Audit Phase 8 packet C — the reads AS THEY WERE before the packet, kept verbatim so the new
 * batched / kept / skipped reads can be proved to give the member the same answers.
 *
 * Every function here is a copy of the pre-Phase-8 code path, built only from the frozen repos
 * (which the packet did not touch) and the pure volume rule. Import AFTER `bootRealApp`.
 */
import { getDb } from '@/db';
import { getAllExercises } from '@/db/repos/exerciseRepo';
import { getNutritionDay } from '@/db/repos/nutritionRepo';
import { getAllPrs, getPrHistory } from '@/db/repos/prRepo';
import { getBodyWeightHistory, getLatestBodyWeight, getProfile } from '@/db/repos/userRepo';
import {
  getExerciseHistory,
  getRecentSessionDetails,
  getSessionDetail,
  getSessionsBetween,
  getStreakDays,
  getWeeklyVolume,
} from '@/db/repos/workoutRepo';
import { buildInsight } from '@/engine/insights';
import { computeRecovery } from '@/engine/recovery';
import { computeStrengthScore } from '@/engine/strength';
import { addDays, fromISO, toISO, todayISO, weekStartISO } from '@/lib/date';
import { STREAK_LOOKBACK_DAYS, weekStreak } from '@/lib/streak';
import { getTodaysWorkout } from '@/services/coach';
import { getTrackerExercisesByIds } from '@/tracker/db/exerciseInfo';
import type { SessionRow } from '@/tracker/db/sessionDetails';
import { getTodaysWorkoutWithTargets } from '@/tracker/services/coachTargets';
import { getLiftsUpThisWeek } from '@/tracker/services/dashboardPhase2';
import type { HistoryItem } from '@/tracker/services/historyFeed';
import {
  applyVolume,
  getBodyweightTimeline,
  getSetModes,
  getWeeklyVolumeKg,
  withPhase2Volume,
  type VolumeContext,
} from '@/tracker/services/volumeService';
import type { DashboardData, MuscleGroup, SessionDetail } from '@/types/models';

// ------------------------------------------------------------------ volume (old withVolume)

export async function oldWithVolume(details: SessionDetail[]): Promise<SessionDetail[]> {
  if (details.length === 0) return details;
  const ids = details.flatMap((d) => d.exercises.map((g) => g.exercise.id));
  const [bw, exercises, setModes] = await Promise.all([
    getBodyweightTimeline(),
    getTrackerExercisesByIds(ids),
    getSetModes(ids).catch(() => new Map()),
  ]);
  const ctx: VolumeContext = { bw, exercises, setModes };
  return details.map((d) => applyVolume(d, ctx));
}

// ------------------------------------------------------------------ Home (old)

function muscleVolumesOf(detail: SessionDetail): { muscleGroup: MuscleGroup; volumeKg: number }[] {
  const acc = new Map<MuscleGroup, number>();
  const bump = (k: MuscleGroup, v: number) => acc.set(k, (acc.get(k) ?? 0) + v);
  for (const ex of detail.exercises) {
    bump(ex.exercise.muscleGroup, ex.volumeKg);
    for (const m of ex.exercise.secondaryMuscles) bump(m, ex.volumeKg * 0.5);
  }
  return Array.from(acc.entries()).map(([muscleGroup, volumeKg]) => ({ muscleGroup, volumeKg }));
}

function topSet(sets: { weightKg: number; reps: number }[]): { w: number; r: number } | null {
  if (sets.length === 0) return null;
  let w = sets[0].weightKg;
  let r = sets[0].reps;
  for (const s of sets) {
    if (s.weightKg > w) {
      w = s.weightKg;
      r = s.reps;
    } else if (s.weightKg === w && s.reps > r) r = s.reps;
  }
  return { w, r };
}

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

/** The frozen getDashboardData as it was (N+1 recent read, v1 Targets, plateau check). */
export async function oldGetDashboardData(): Promise<DashboardData> {
  const today = todayISO();
  const [todaysWorkout, profile, nutrition, latestWeight, weightHistory, streakDays, weekSessions, recentDetails, weeklyBuckets, allPrs, streakSessions] =
    await Promise.all([
      getTodaysWorkout(),
      getProfile(),
      getNutritionDay(today),
      getLatestBodyWeight(),
      getBodyWeightHistory(30),
      getStreakDays(today),
      getSessionsBetween(weekStartISO(today), today),
      getRecentSessionDetails(12),
      getWeeklyVolume(6),
      getAllPrs(),
      getSessionsBetween(addDays(today, -STREAK_LOOKBACK_DAYS), today),
    ]);
  const streakWeeks = weekStreak(streakSessions.map((s) => s.dateISO), today);
  const cur = weeklyBuckets.length > 0 ? weeklyBuckets[weeklyBuckets.length - 1].volumeKg : 0;
  const prev = weeklyBuckets.length > 1 ? weeklyBuckets[weeklyBuckets.length - 2].volumeKg : 0;
  const weeklyVolumeDeltaPct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0;
  const fullWeeks = weeklyBuckets.slice(0, -1).slice(-4);
  const avgWeeklyVolumeKg = fullWeeks.length > 0 ? fullWeeks.reduce((s, w) => s + w.volumeKg, 0) / fullWeeks.length : 0;
  const sevenDayFloor = addDays(today, -6);
  const recovery = computeRecovery({
    todayISO: today,
    recentSessions: recentDetails
      .filter((s) => s.dateISO >= sevenDayFloor && s.dateISO <= today)
      .map((s) => ({ dateISO: s.dateISO, dayType: s.dayType, volumeKg: s.totalVolumeKg, muscleVolumes: muscleVolumesOf(s) })),
    avgWeeklyVolumeKg,
  });
  const strength = computeStrengthScore({
    bodyWeightKg: latestWeight ? latestWeight.weightKg : 0,
    lifts: allPrs.filter((p) => p.kind === 'e1rm').map((p) => ({ exerciseName: p.exerciseName, e1rmKg: p.value })),
  });
  const todayTrained = weekSessions.some((s) => s.dateISO === today);
  const plateauedExercise = await findPlateau(todaysWorkout.targets.map((t) => ({ id: t.exerciseId, name: t.exerciseName })));
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
    lastWorkout: lastDetail ? { dateISO: lastDetail.dateISO, dayType: lastDetail.dayType, volumeKg: lastDetail.totalVolumeKg } : null,
  };
}

/** Home's loader as it was: the frozen dashboard, then the same 12 workouts read again. */
export async function oldGetDashboardDataPhase2(): Promise<DashboardData> {
  const raw = await oldGetDashboardData();
  const today = todayISO();
  const [tw, weeks, recent, liftsUp] = await Promise.all([
    getTodaysWorkoutWithTargets().catch(() => null),
    getWeeklyVolumeKg(6).catch(() => null),
    getRecentSessionDetails(12)
      .then((d) => oldWithVolume(d))
      .catch(() => null),
    getLiftsUpThisWeek(today).catch(() => null),
  ]);
  const data: DashboardData = tw ? { ...raw, todaysWorkout: tw } : raw;
  if (!weeks) return liftsUp != null ? { ...data, liftsUpThisWeek: liftsUp } : data;
  return withPhase2Volume(data, weeks, recent?.[0]?.totalVolumeKg ?? null, today, { liftsUp, recentDetails: recent });
}

// ------------------------------------------------------------------ History cards (old)

/** The cards for these workouts as the old page read built them (every column, exercise-wide modes). */
export async function oldHistoryItems(ids: readonly string[]): Promise<HistoryItem[]> {
  if (ids.length === 0) return [];
  const rows = await getDb().getAllAsync<SessionRow & { easy_week: number | null }>(
    `SELECT * FROM workout_sessions WHERE id IN (${ids.map(() => '?').join(', ')})`,
    [...ids],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const details: SessionDetail[] = [];
  for (const id of ids) {
    const d = await getSessionDetail(id);
    if (!d) throw new Error(`missing ${id}`);
    details.push({ ...d, title: byId.get(id)?.title ?? null });
  }
  const withVol = await oldWithVolume(details);
  const extras = await getDb().getAllAsync<{ id: string; easy_week: number | null; dist: number | null; sec: number | null }>(
    `SELECT ws.id, ws.easy_week,
            SUM(CASE WHEN se.is_warmup = 0 THEN COALESCE(se.distance_m, 0) ELSE 0 END) AS dist,
            SUM(CASE WHEN se.is_warmup = 0 THEN COALESCE(se.duration_sec, 0) ELSE 0 END) AS sec
       FROM workout_sessions ws LEFT JOIN set_entries se ON se.session_id = ws.id
      WHERE ws.id IN (${ids.map(() => '?').join(', ')}) GROUP BY ws.id`,
    [...ids],
  );
  const x = new Map(extras.map((r) => [r.id, r]));
  return withVol.map((d) => {
    const e = x.get(d.id);
    return { ...d, easyWeek: e?.easy_week === 1, distanceM: Number(e?.dist ?? 0), timedSec: Number(e?.sec ?? 0) };
  });
}

// ------------------------------------------------------------------ Progress strength trend (old)

const KEY_LIFT = /bench|squat|deadlift|overhead|shoulder press|row/i;

function bodyWeightAt(entries: { dateISO: string; weightKg: number }[], dateISO: string): number {
  let latest = 0;
  for (const e of entries) {
    if (e.dateISO <= dateISO) latest = e.weightKg;
    else break;
  }
  if (latest > 0) return latest;
  return entries.length > 0 ? entries[0].weightKg : 0;
}

function monthEndPoints(from: string, to: string): string[] {
  const points: string[] = [];
  const start = fromISO(from);
  let d = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const end = fromISO(to);
  while (d.getTime() < end.getTime()) {
    points.push(toISO(d));
    d = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  }
  points.push(to);
  return points;
}

/** The strength trend as it was: one record read per library lift whose name matches. */
export async function oldStrengthTrend(rangeDays: number): Promise<{ dateISO: string; score: number }[]> {
  const today = todayISO();
  const from = addDays(today, -(rangeDays - 1));
  const [exercises, weights] = await Promise.all([getAllExercises(), getBodyWeightHistory()]);
  const keyExercises = exercises.filter((e) => KEY_LIFT.test(e.name));
  const histories = await Promise.all(keyExercises.map((e) => getPrHistory(e.id)));
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
    return { dateISO, score: computeStrengthScore({ bodyWeightKg: bodyWeightAt(weights, dateISO), lifts }).score };
  });
}
