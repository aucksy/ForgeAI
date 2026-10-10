/**
 * Reads for the monthly report and the year in review (Phase 3). The numbers come from the
 * same rules as everywhere else: volume by the one volume rule, records by the one record
 * rule, sets per muscle as on Progress.
 */
import { getDb } from '@/db';
import { epleyE1rm } from '@/engine/overload';
import { todayISO } from '@/lib/date';
import type { SessionDetail } from '@/types/models';

import { getTrackerExercisesByIds } from '../db/exerciseInfo';
import { getSessionDetailsBetween } from '../db/sessionDetails';
import { hasReps } from '../engine/logTypes';
import { liftsBeatingBest } from '../engine/headline';
import { buildMonthReport, buildYearReview, type MonthReport, type PictureTotals, type ReportSession, type StrengthPoint, type YearReview } from '../engine/reports';
import { setVolumeKg } from '../engine/volume';
import { monthDays, monthName, monthOf, monthTitle, shiftMonth, yearDays } from '../lib/months';
import { getRecordEvents, type RecordEventRow } from './recordsService';
import { applyVolume, getBodyweightTimeline, getMuscleSetsBetween, getVolumeContext, type VolumeContext } from './volumeService';

/**
 * What the month / year share picture may say was moved (v0.25.1 review): the weight on the
 * bar, dumbbells, machine or belt only — the workout picture's rule (`liftedOnPicture`), so
 * a month of pull-ups never shares a number that divides back to body weight — plus the
 * reps and the distance for a period with no kilos. PURE (exported for tests).
 */
export function pictureTotals(details: readonly SessionDetail[], ctx: Pick<VolumeContext, 'exercises' | 'setModes'>, distanceM: number): PictureTotals {
  let kg = 0;
  let reps = 0;
  for (const d of details) {
    for (const g of d.exercises) {
      const info = ctx.exercises.get(g.exercise.id);
      const logType = info?.logType ?? 'weight_reps';
      const rule = { logType, loadMode: info?.loadMode ?? ('one' as const), bwShare: 0 };
      for (const s of g.sets) {
        if (s.isWarmup) continue;
        kg += setVolumeKg({ weightKg: s.weightKg, reps: s.reps, isWarmup: false, loadMode: ctx.setModes?.get(s.id) ?? null }, rule, null);
        if (hasReps(logType)) reps += Math.max(0, s.reps);
      }
    }
  }
  return { kg, reps, distanceM: Math.max(0, distanceM) };
}

/** Distance in the working sets of workouts between two days (inclusive). */
async function distanceBetween(from: string, to: string): Promise<number> {
  const row = await getDb().getFirstAsync<{ m: number | null }>(
    `SELECT TOTAL(se.distance_m) AS m FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE ws.date_iso BETWEEN ? AND ? AND se.is_warmup = 0`,
    [from, to],
  );
  return row?.m ?? 0;
}

const exerciseIdsOf = (details: readonly SessionDetail[]): string[] => [...new Set(details.flatMap((d) => d.exercises.map((g) => g.exercise.id)))];

/** Session details → what the reports count. PURE (exported for tests). */
export function toReportSessions(details: readonly SessionDetail[]): ReportSession[] {
  return details.map((d) => {
    const exercises = d.exercises.map((g) => ({
      exerciseId: g.exercise.id,
      name: g.exercise.name,
      sets: g.sets.filter((s) => !s.isWarmup).length,
    }));
    return {
      sessionId: d.id,
      dateISO: d.dateISO,
      durationSec: d.endedAt != null ? Math.max(0, Math.round((d.endedAt - d.startedAt) / 1000)) : 0,
      volumeKg: d.totalVolumeKg,
      sets: exercises.reduce((n, e) => n + e.sets, 0),
      exercises,
    };
  });
}

/** Workouts per month ('YYYY-MM' → count): Progress's reports card. */
export async function getMonthCounts(): Promise<Map<string, number>> {
  const rows = await getDb().getAllAsync<{ ym: string; n: number }>(
    'SELECT substr(date_iso, 1, 7) AS ym, COUNT(*) AS n FROM workout_sessions GROUP BY ym',
  );
  return new Map(rows.map((r) => [r.ym, r.n]));
}

/** Months with at least one workout, newest first ('YYYY-MM'). */
export async function getTrainedMonths(): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ ym: string }>(
    'SELECT DISTINCT substr(date_iso, 1, 7) AS ym FROM workout_sessions ORDER BY ym DESC',
  );
  return rows.map((r) => r.ym).filter((m) => /^\d{4}-\d{2}$/.test(m));
}

/**
 * Which reports Progress offers, from the months that have workouts. PURE.
 *  - month: the latest FINISHED month with workouts (Hevy shows last month's report); a new
 *    member with only this month's workouts gets "this month so far".
 *  - year: this year so far, or last year's review when this year has nothing yet.
 *  - lastYear (audit PG-15): through January, last year's review stays offered beside "this
 *    year so far" — the first workout of January no longer hides it.
 */
export function reportIndex(trainedMonths: readonly string[], today: string): { month: string | null; year: number | null; lastYear: number | null } {
  const thisMonth = monthOf(today);
  const finished = trainedMonths.filter((m) => m < thisMonth).sort().reverse();
  const month = finished[0] ?? (trainedMonths.includes(thisMonth) ? thisMonth : null);
  const thisYear = Number(today.slice(0, 4));
  const years = new Set(trainedMonths.map((m) => Number(m.slice(0, 4))));
  const year = years.has(thisYear) ? thisYear : years.has(thisYear - 1) ? thisYear - 1 : null;
  const january = today.slice(5, 7) === '01';
  const lastYear = january && year === thisYear && years.has(thisYear - 1) ? thisYear - 1 : null;
  return { month, year, lastYear };
}

/**
 * Every other report a member can open (audit PG-15, "Earlier reports"): each trained month
 * and each past year not already offered, newest first — months, then years. PURE.
 */
export function earlierReports(
  trainedMonths: readonly string[],
  today: string,
  shown: { month: string | null; year: number | null; lastYear: number | null },
): { period: string; title: string }[] {
  const thisMonth = monthOf(today);
  const thisYear = Number(today.slice(0, 4));
  const months = [...new Set(trainedMonths)]
    .filter((m) => /^\d{4}-\d{2}$/.test(m) && m !== shown.month && m <= thisMonth)
    .sort()
    .reverse()
    .map((m) => ({ period: m, title: m === thisMonth ? `${monthName(m)} ${m.slice(0, 4)} so far` : monthTitle(m) }));
  const years = [...new Set(trainedMonths.map((m) => Number(m.slice(0, 4))))]
    .filter((y) => Number.isFinite(y) && y < thisYear && y !== shown.year && y !== shown.lastYear)
    .sort((a, b) => b - a)
    .map((y) => ({ period: String(y), title: `${y} in review` }));
  return [...months, ...years];
}

export interface MonthReportData {
  report: MonthReport;
  /** The month's records with everything a list needs, newest first. */
  records: RecordEventRow[];
}

export async function getMonthReport(month: string, today: string = todayISO()): Promise<MonthReportData> {
  const { from, to } = monthDays(month);
  const prev = monthDays(shiftMonth(month, -1));
  const [rawCur, rawBefore, records, muscles, bw, metres] = await Promise.all([
    getSessionDetailsBetween(from, to),
    getSessionDetailsBetween(prev.from, prev.to),
    getRecordEvents({ from, to }),
    getMuscleSetsBetween(from, to),
    getBodyweightTimeline(),
    distanceBetween(from, to).catch(() => 0),
  ]);
  const ctx = await getVolumeContext(exerciseIdsOf([...rawCur, ...rawBefore]));
  const report = buildMonthReport({
    month,
    complete: today > to,
    sessions: toReportSessions(rawCur.map((d) => applyVolume(d, ctx))),
    previous: toReportSessions(rawBefore.map((d) => applyVolume(d, ctx))),
    records,
    muscles,
    bodyweight: bw,
    from,
    to,
    picture: pictureTotals(rawCur, ctx, metres),
  });
  return { report, records };
}

/**
 * Sets with more reps than this say little about a 1-rep max (Epley overshoots a 25-rep
 * set), so they never feed the year's "biggest gain" (PG-02).
 */
const MAX_E1RM_REPS = 12;

/** Best estimated 1-rep max per workout of each weight × reps exercise. PURE. */
export function strengthPoints(details: readonly SessionDetail[], weightExercises: ReadonlySet<string>): StrengthPoint[] {
  const out: StrengthPoint[] = [];
  for (const d of details) {
    for (const g of d.exercises) {
      if (!weightExercises.has(g.exercise.id)) continue;
      let best = 0;
      for (const s of g.sets) {
        if (s.isWarmup || s.weightKg <= 0 || s.reps <= 0 || s.reps > MAX_E1RM_REPS) continue;
        best = Math.max(best, epleyE1rm(s.weightKg, s.reps));
      }
      if (best > 0) out.push({ exerciseId: g.exercise.id, name: g.exercise.name, dateISO: d.dateISO, e1rm: best });
    }
  }
  return out;
}

export async function getYearReview(year: number, today: string = todayISO()): Promise<YearReview> {
  const { from, to } = yearDays(year);
  const [raw, records, muscles, bw, metres] = await Promise.all([
    getSessionDetailsBetween(from, to),
    getRecordEvents({ from, to }),
    getMuscleSetsBetween(from, to),
    getBodyweightTimeline(),
    distanceBetween(from, to).catch(() => 0),
  ]);
  const [ctx, infos] = await Promise.all([getVolumeContext(exerciseIdsOf(raw)), getTrackerExercisesByIds(exerciseIdsOf(raw))]);
  const details = raw.map((d) => applyVolume(d, ctx));
  const weightIds = new Set([...infos.values()].filter((e) => e.logType === 'weight_reps').map((e) => e.id));
  const complete = today > to;
  return buildYearReview({
    year,
    complete,
    lastMonth: complete ? `${year}-12` : monthOf(today),
    sessions: toReportSessions(details),
    // D10: lifts that beat a best, not every kind of record they set.
    recordCount: liftsBeatingBest(records),
    strength: strengthPoints(details, weightIds),
    muscles,
    bodyweight: bw,
    picture: pictureTotals(raw, ctx, metres),
  });
}
