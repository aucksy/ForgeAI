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
import { buildMonthReport, buildYearReview, type MonthReport, type ReportSession, type StrengthPoint, type YearReview } from '../engine/reports';
import { monthDays, monthOf, shiftMonth, yearDays } from '../lib/months';
import { getRecordEvents, type RecordEventRow } from './recordsService';
import { getBodyweightTimeline, getMuscleSetsBetween, withVolume } from './volumeService';

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
 */
export function reportIndex(trainedMonths: readonly string[], today: string): { month: string | null; year: number | null } {
  const thisMonth = monthOf(today);
  const finished = trainedMonths.filter((m) => m < thisMonth).sort().reverse();
  const month = finished[0] ?? (trainedMonths.includes(thisMonth) ? thisMonth : null);
  const thisYear = Number(today.slice(0, 4));
  const years = new Set(trainedMonths.map((m) => Number(m.slice(0, 4))));
  const year = years.has(thisYear) ? thisYear : years.has(thisYear - 1) ? thisYear - 1 : null;
  return { month, year };
}

export interface MonthReportData {
  report: MonthReport;
  /** The month's records with everything a list needs, newest first. */
  records: RecordEventRow[];
}

export async function getMonthReport(month: string, today: string = todayISO()): Promise<MonthReportData> {
  const { from, to } = monthDays(month);
  const prev = monthDays(shiftMonth(month, -1));
  const [cur, before, records, muscles, bw] = await Promise.all([
    getSessionDetailsBetween(from, to).then(withVolume),
    getSessionDetailsBetween(prev.from, prev.to).then(withVolume),
    getRecordEvents({ from, to }),
    getMuscleSetsBetween(from, to),
    getBodyweightTimeline(),
  ]);
  const report = buildMonthReport({
    month,
    complete: today > to,
    sessions: toReportSessions(cur),
    previous: toReportSessions(before),
    records,
    muscles,
    bodyweight: bw,
    from,
    to,
  });
  return { report, records };
}

/** Best estimated 1-rep max per workout of each weight × reps exercise. PURE. */
export function strengthPoints(details: readonly SessionDetail[], weightExercises: ReadonlySet<string>): StrengthPoint[] {
  const out: StrengthPoint[] = [];
  for (const d of details) {
    for (const g of d.exercises) {
      if (!weightExercises.has(g.exercise.id)) continue;
      let best = 0;
      for (const s of g.sets) {
        if (s.isWarmup || s.weightKg <= 0 || s.reps <= 0) continue;
        best = Math.max(best, epleyE1rm(s.weightKg, s.reps));
      }
      if (best > 0) out.push({ exerciseId: g.exercise.id, name: g.exercise.name, dateISO: d.dateISO, e1rm: best });
    }
  }
  return out;
}

export async function getYearReview(year: number, today: string = todayISO()): Promise<YearReview> {
  const { from, to } = yearDays(year);
  const [raw, records, muscles, bw] = await Promise.all([
    getSessionDetailsBetween(from, to),
    getRecordEvents({ from, to }),
    getMuscleSetsBetween(from, to),
    getBodyweightTimeline(),
  ]);
  const [details, infos] = await Promise.all([
    withVolume(raw),
    getTrackerExercisesByIds([...new Set(raw.flatMap((d) => d.exercises.map((g) => g.exercise.id)))]),
  ]);
  const weightIds = new Set([...infos.values()].filter((e) => e.logType === 'weight_reps').map((e) => e.id));
  const complete = today > to;
  return buildYearReview({
    year,
    complete,
    lastMonth: complete ? `${year}-12` : monthOf(today),
    sessions: toReportSessions(details),
    recordCount: records.length,
    strength: strengthPoints(details, weightIds),
    muscles,
    bodyweight: bw,
  });
}
