/**
 * Volume everywhere — Phase 2. Every screen that shows a volume number reads it through
 * here, so the Home card, History, the finish screen, Progress, the exercise page, the
 * coach and the export all apply the SAME rule (`engine/volume.ts`):
 *   pull-ups and dips count body weight, dumbbells counted "each" count both, time and
 *   distance sets count 0 kg, warm-ups never count.
 *
 * The frozen reads (`getSessionDetail`, `getWeeklyVolume`, `getConsistency`…) still sum
 * `weight × reps`; they stay untouched for their other callers. Here they are either
 * corrected after the fact (session details keep their exact shape, only the volume
 * numbers change) or replaced by an equivalent read.
 */
import { getDb } from '@/db';
import { getRecentSessionDetails, getSessionDetail } from '@/db/repos/workoutRepo';
import { buildInsight } from '@/engine/insights';
import { computeRecovery } from '@/engine/recovery';
import { addDays, todayISO, weekStartISO } from '@/lib/date';
import type { ConsistencyCell, DashboardData, MuscleGroup, RecoveryStatus, SessionDetail, VolumePoint } from '@/types/models';

import { getTrackerExercisesByIds, type TrackerExercise } from '../db/exerciseInfo';
import { isLoadMode, type LoadMode } from '../engine/logTypes';
import {
  bodyweightOn,
  missesBodyweight,
  muscleSets,
  setVolumeKg,
  type BodyweightPoint,
  type MuscleSetsSlice,
  type VolumeExercise,
  type VolumeSession,
} from '../engine/volume';

export interface VolumeContext {
  bw: BodyweightPoint[];
  exercises: Map<string, TrackerExercise>;
  /** Sets that keep their own counting (logged before the member changed it), by set id. */
  setModes?: Map<string, LoadMode>;
}

/** Body weight entries, oldest first. */
export async function getBodyweightTimeline(): Promise<BodyweightPoint[]> {
  const rows = await getDb().getAllAsync<{ date_iso: string; weight_kg: number }>(
    'SELECT date_iso, weight_kg FROM body_weight ORDER BY date_iso ASC',
  );
  return rows.map((r) => ({ dateISO: r.date_iso, weightKg: r.weight_kg }));
}

/**
 * Sets of these exercises that keep their own counting. Few: only sets logged before the
 * member changed an exercise's counting, and Hevy rows imported into an "each" exercise.
 */
export async function getSetModes(exerciseIds: readonly string[]): Promise<Map<string, LoadMode>> {
  const out = new Map<string, LoadMode>();
  const unique = [...new Set(exerciseIds)];
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    const rows = await getDb().getAllAsync<{ id: string; load_mode: string | null }>(
      `SELECT id, load_mode FROM set_entries
        WHERE load_mode IS NOT NULL AND exercise_id IN (${chunk.map(() => '?').join(', ')})`,
      chunk,
    );
    for (const r of rows) if (isLoadMode(r.load_mode)) out.set(r.id, r.load_mode);
  }
  return out;
}

/** What the volume rule needs for these exercise ids (plus the body-weight timeline). */
export async function getVolumeContext(exerciseIds: readonly string[]): Promise<VolumeContext> {
  const [bw, exercises, setModes] = await Promise.all([
    getBodyweightTimeline(),
    getTrackerExercisesByIds(exerciseIds),
    getSetModes(exerciseIds).catch(() => new Map<string, LoadMode>()),
  ]);
  return { bw, exercises, setModes };
}

const PLAIN: Omit<VolumeExercise, 'id' | 'muscles'> = { logType: 'weight_reps', loadMode: 'one', bwShare: 0 };

/** A session detail with every volume number recomputed by the Phase 2 rule. PURE. */
export function applyVolume(detail: SessionDetail, ctx: VolumeContext): SessionDetail {
  const body = bodyweightOn(ctx.bw, detail.dateISO);
  const exercises = detail.exercises.map((g) => {
    const info = ctx.exercises.get(g.exercise.id);
    const rule = info ?? PLAIN;
    const volumeKg = g.sets.reduce(
      (sum, s) => sum + setVolumeKg({ ...s, loadMode: ctx.setModes?.get(s.id) ?? null }, rule, body),
      0,
    );
    return { ...g, volumeKg };
  });
  return { ...detail, exercises, totalVolumeKg: exercises.reduce((sum, g) => sum + g.volumeKg, 0) };
}

/** The volume-rule view of a session (for muscle sets and the body-weight hint). PURE. */
export function toVolumeSession(detail: SessionDetail, ctx: VolumeContext): VolumeSession {
  return {
    dateISO: detail.dateISO,
    dayType: detail.dayType,
    exercises: detail.exercises.map((g) => {
      const info = ctx.exercises.get(g.exercise.id);
      const exercise: VolumeExercise = info
        ? { id: info.id, logType: info.logType, loadMode: info.loadMode, bwShare: info.bwShare, muscles: info.muscles }
        : { id: g.exercise.id, ...PLAIN, muscles: { primary: [], secondary: [] } };
      return { exercise, sets: g.sets };
    }),
  };
}

/** Recompute a batch of details (one context read for all of them). */
export async function withVolume(details: SessionDetail[]): Promise<SessionDetail[]> {
  if (details.length === 0) return details;
  const ids = details.flatMap((d) => d.exercises.map((g) => g.exercise.id));
  const ctx = await getVolumeContext(ids);
  return details.map((d) => applyVolume(d, ctx));
}

/** The frozen `getSessionDetail`, with Phase 2 volume. */
export async function getSessionDetailWithVolume(id: string): Promise<SessionDetail | null> {
  const d = await getSessionDetail(id);
  if (!d) return null;
  return (await withVolume([d]))[0];
}

/** The frozen `getRecentSessionDetails`, with Phase 2 volume. */
export async function getRecentSessionDetailsWithVolume(limit: number): Promise<SessionDetail[]> {
  return withVolume(await getRecentSessionDetails(limit));
}

/** A muscle worked only by timed or distance sets (a plank, a run) still counts as worked. */
const WORKED_TOKEN_KG = 1e-6;

/** Per-session muscle volume (main muscle full, the others half), like the frozen dashboard. */
function muscleVolumesOf(detail: SessionDetail): { muscleGroup: MuscleGroup; volumeKg: number }[] {
  const acc = new Map<MuscleGroup, number>();
  const bump = (m: MuscleGroup, v: number) => acc.set(m, (acc.get(m) ?? 0) + v);
  for (const g of detail.exercises) {
    const v = g.volumeKg > 0 ? g.volumeKg : g.sets.some((s) => !s.isWarmup) ? WORKED_TOKEN_KG : 0;
    bump(g.exercise.muscleGroup, v);
    for (const m of g.exercise.secondaryMuscles) bump(m, v * 0.5);
  }
  return [...acc.entries()].map(([muscleGroup, volumeKg]) => ({ muscleGroup, volumeKg }));
}

/**
 * Home's recovery score by the Phase 2 volume rule: the frozen dashboard's maths, fed
 * Phase 2 session volumes and weeks — pull-ups and dips now mark their muscles as worked,
 * and the "volume is X% above your usual week" note agrees with the Volume card. PURE.
 */
export function phase2Recovery(details: readonly SessionDetail[], weeks: readonly { volumeKg: number }[], today: string): RecoveryStatus {
  const floor = addDays(today, -6);
  const fullWeeks = weeks.slice(0, -1).slice(-4);
  const avgWeeklyVolumeKg = fullWeeks.length > 0 ? fullWeeks.reduce((s, w) => s + w.volumeKg, 0) / fullWeeks.length : 0;
  return computeRecovery({
    todayISO: today,
    recentSessions: details
      .filter((d) => d.dateISO >= floor && d.dateISO <= today)
      .map((d) => ({ dateISO: d.dateISO, dayType: d.dayType, volumeKg: d.totalVolumeKg, muscleVolumes: muscleVolumesOf(d) })),
    avgWeeklyVolumeKg,
  });
}

/** The exercise the frozen insight called flat, if that is what it said. */
function plateauFrom(insight: string): string | null {
  const m = /^(.+) has been flat for three weeks/.exec(insight);
  return m ? m[1] : null;
}

/**
 * Phase 2: the frozen dashboard sums `weight × reps` and counts every stored record. Home
 * (and the coach's snapshot) must show the same volume as every other screen, so its
 * volume numbers, its recovery score and its insight line are recomputed with the one
 * volume rule and only records a member would recognise. PURE.
 */
export function withPhase2Volume(
  raw: DashboardData,
  weeks: { volumeKg: number }[],
  lastWorkoutVolumeKg: number | null,
  today: string,
  extra: {
    /** Exercises with a meaningful record in the last 7 days (null = unknown). */
    recentPrCount?: number | null;
    /** Recent sessions with Phase 2 volume, newest first (null = keep the frozen recovery). */
    recentDetails?: readonly SessionDetail[] | null;
  } = {},
): DashboardData {
  const cur = weeks.length > 0 ? weeks[weeks.length - 1].volumeKg : 0;
  const prev = weeks.length > 1 ? weeks[weeks.length - 2].volumeKg : 0;
  const delta = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0;
  const todayTrained = raw.lastWorkout?.dateISO === today;
  let insight: string;
  if (extra.recentPrCount != null) {
    // The frozen insight's own inputs, with the record count filtered and the new volume.
    insight = buildInsight({
      streakDays: raw.streakDays,
      proteinGapG: Math.round(raw.proteinTargetG - raw.proteinTodayG),
      recentPrCount: extra.recentPrCount,
      plateauedExercise: plateauFrom(raw.insight),
      weeklyVolumeDeltaPct: delta,
      todayTrained,
    });
  } else {
    // The frozen insight puts PRs, a plateau and protein ahead of volume; only when it
    // fell through to the volume / streak / rest lines can the new volume change it.
    // (The volume-up line also says "protein", so match the protein lines exactly.)
    const higherPriority = /\bPRs?\b|flat for three weeks|protein goal|of protein to go/.test(raw.insight);
    insight = higherPriority
      ? raw.insight
      : buildInsight({
          streakDays: raw.streakDays,
          proteinGapG: 0,
          recentPrCount: 0,
          plateauedExercise: null,
          weeklyVolumeDeltaPct: delta,
          todayTrained,
        });
  }
  return {
    ...raw,
    weeklyVolumeKg: cur,
    weeklyVolumeDeltaPct: delta,
    insight,
    recovery: extra.recentDetails ? phase2Recovery(extra.recentDetails, weeks, today) : raw.recovery,
    lastWorkout:
      raw.lastWorkout && lastWorkoutVolumeKg != null ? { ...raw.lastWorkout, volumeKg: lastWorkoutVolumeKg } : raw.lastWorkout,
  };
}

/** Did this session's pull-ups / dips miss out on body weight (none logged yet)? */
export async function sessionMissesBodyweight(detail: SessionDetail): Promise<boolean> {
  const ctx = await getVolumeContext(detail.exercises.map((g) => g.exercise.id));
  return missesBodyweight(toVolumeSession(detail, ctx), ctx.bw);
}

// ---------------------------------------------------------------- ranges

interface RangeRow {
  session_id: string;
  date_iso: string;
  exercise_id: string;
  weight_kg: number;
  reps: number;
  is_warmup: number;
  load_mode: string | null;
}

async function readRange(fromISO: string, toISO: string): Promise<{ rows: RangeRow[]; ctx: VolumeContext }> {
  const rows = await getDb().getAllAsync<RangeRow>(
    `SELECT se.session_id, ws.date_iso AS date_iso, se.exercise_id, se.weight_kg, se.reps, se.is_warmup, se.load_mode
       FROM set_entries se
       JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE ws.date_iso BETWEEN ? AND ?`,
    [fromISO, toISO],
  );
  const ctx = await getVolumeContext([...new Set(rows.map((r) => r.exercise_id))]);
  return { rows, ctx };
}

function rowVolume(r: RangeRow, ctx: VolumeContext): number {
  const info = ctx.exercises.get(r.exercise_id);
  return setVolumeKg(
    { weightKg: r.weight_kg, reps: r.reps, isWarmup: r.is_warmup === 1, loadMode: isLoadMode(r.load_mode) ? r.load_mode : null },
    info ?? PLAIN,
    bodyweightOn(ctx.bw, r.date_iso),
  );
}

/** Weekly volume, Monday buckets, the trailing `weeks` weeks incl. this one (frozen shape). */
export async function getWeeklyVolumeKg(weeks: number): Promise<VolumePoint[]> {
  if (weeks <= 0) return [];
  const firstWeek = addDays(weekStartISO(todayISO()), -7 * (weeks - 1));
  const buckets = new Map<string, number>();
  for (let i = 0; i < weeks; i++) buckets.set(addDays(firstWeek, i * 7), 0);
  const { rows, ctx } = await readRange(firstWeek, '9999-12-31');
  for (const r of rows) {
    const week = weekStartISO(r.date_iso);
    if (buckets.has(week)) buckets.set(week, (buckets.get(week) ?? 0) + rowVolume(r, ctx));
  }
  return [...buckets.entries()].map(([dateISO, volumeKg]) => ({ dateISO, volumeKg }));
}

/**
 * Every day of the window, ascending; 0 on rest days, else the day's volume quartile
 * 1..4. A day with only timed or distance work is a workout day too: at least level 1.
 */
export async function getConsistencyCells(days: number): Promise<ConsistencyCell[]> {
  if (days <= 0) return [];
  const today = todayISO();
  const from = addDays(today, -(days - 1));
  const { rows, ctx } = await readRange(from, today);
  const sessions = await getDb().getAllAsync<{ date_iso: string }>(
    'SELECT DISTINCT date_iso FROM workout_sessions WHERE date_iso BETWEEN ? AND ?',
    [from, today],
  );
  const trained = new Set(sessions.map((s) => s.date_iso));
  const volumeByDay = new Map<string, number>();
  for (const r of rows) volumeByDay.set(r.date_iso, (volumeByDay.get(r.date_iso) ?? 0) + rowVolume(r, ctx));
  return consistencyLevels(from, days, trained, volumeByDay);
}

/** PURE: quartile levels; trained days are never level 0. */
export function consistencyLevels(
  from: string,
  days: number,
  trained: ReadonlySet<string>,
  volumeByDay: ReadonlyMap<string, number>,
): ConsistencyCell[] {
  const nonZero = [...volumeByDay.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const levelFor = (dateISO: string): ConsistencyCell['level'] => {
    const volume = volumeByDay.get(dateISO) ?? 0;
    if (volume <= 0 || nonZero.length === 0) return trained.has(dateISO) ? 1 : 0;
    let atOrBelow = 0;
    for (const v of nonZero) if (v <= volume) atOrBelow += 1;
    const quartile = Math.ceil((atOrBelow / nonZero.length) * 4);
    return Math.min(4, Math.max(1, quartile)) as ConsistencyCell['level'];
  };
  const cells: ConsistencyCell[] = [];
  for (let i = 0; i < days; i++) {
    const dateISO = addDays(from, i);
    cells.push({ dateISO, level: levelFor(dateISO) });
  }
  return cells;
}

/** Working sets per finer muscle between two days (inclusive). */
export async function getMuscleSetsBetween(fromISO: string, toISO: string): Promise<MuscleSetsSlice[]> {
  const { rows, ctx } = await readRange(fromISO, toISO);
  const bySession = new Map<string, VolumeSession>();
  for (const r of rows) {
    let s = bySession.get(r.session_id);
    if (!s) {
      s = { dateISO: r.date_iso, exercises: [] };
      bySession.set(r.session_id, s);
    }
    const info = ctx.exercises.get(r.exercise_id);
    if (!info) continue;
    let g = s.exercises.find((x) => x.exercise.id === r.exercise_id);
    if (!g) {
      g = {
        exercise: { id: info.id, logType: info.logType, loadMode: info.loadMode, bwShare: info.bwShare, muscles: info.muscles },
        sets: [],
      };
      s.exercises.push(g);
    }
    g.sets.push({ weightKg: r.weight_kg, reps: r.reps, isWarmup: r.is_warmup === 1 });
  }
  return muscleSets([...bySession.values()]);
}
