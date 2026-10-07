/**
 * Records in words — Phase 3. PURE. One wording for a record wherever it shows: the live
 * pop-up, the finish screen, the exercise page, Progress, the monthly report and the
 * share picture.
 */
import { fmtInt, kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import type { UnitSystem } from '@/types/models';

import { fmtDistance, fmtDuration, weightIsEach, type DistUnit, type LoadMode, type LogType } from '../engine/logTypes';
import { fmtPace, RECORD_LABEL, sessionUnit, type RecordHit } from '../engine/records';
import { monthOf, monthTitle } from '../lib/months';

export interface RecordTextContext {
  logType: LogType;
  loadMode: LoadMode;
  distUnit: DistUnit;
  units?: UnitSystem;
}

function kg(n: number, units: UnitSystem): string {
  return `${trimNum(kgToDisplay(n, units))} ${weightUnit(units)}`;
}

/** "each" when the typed weight is one of two dumbbells. */
function each(hit: RecordHit, ctx: RecordTextContext): string {
  const mode = hit.set?.loadMode ?? ctx.loadMode;
  return ctx.logType === 'weight_reps' && weightIsEach(mode) ? ' each' : '';
}

/** The record's number as a member reads it: "85 kg", "80 kg × 8", "15 reps", "1:30", "5:12 /km", "5 km". */
export function recordValueText(hit: RecordHit, ctx: RecordTextContext): string {
  const units = ctx.units ?? 'metric';
  const s = hit.set;
  switch (hit.kind) {
    case 'weight':
      return ctx.logType === 'weighted' ? `+${kg(hit.value, units)}` : `${kg(hit.value, units)}${each(hit, ctx)}`;
    case 'e1rm':
      return kg(hit.value, units);
    case 'best_set': {
      if (!s) return kg(hit.value, units);
      if (ctx.logType === 'weighted' || ctx.logType === 'reps' || ctx.logType === 'assisted') {
        return s.weightKg > 0 ? `+${kg(s.weightKg, units)} × ${s.reps}` : `${s.reps} reps`;
      }
      return `${kg(s.weightKg, units)}${each(hit, ctx)} × ${s.reps}`;
    }
    case 'best_session':
      return sessionUnit(ctx.logType) === 'reps' ? `${Math.round(hit.value)} reps` : `${fmtInt(kgToDisplay(hit.value, units))} ${weightUnit(units)}`;
    case 'reps':
      return `${Math.round(hit.value)} reps`;
    case 'duration':
      return fmtDuration(hit.value);
    case 'pace':
      return fmtPace(hit.value, ctx.distUnit);
    case 'distance':
      return fmtDistance(hit.value, ctx.distUnit);
    default:
      return trimNum(hit.value);
  }
}

/**
 * A short second line, or null: "3 reps", "from 85 kg × 4", "680 kg in one set", "at +10 kg",
 * "5 km in 26:00".
 */
export function recordDetailText(hit: RecordHit, ctx: RecordTextContext): string | null {
  const units = ctx.units ?? 'metric';
  const s = hit.set;
  switch (hit.kind) {
    case 'weight':
      return s ? `${s.reps} ${s.reps === 1 ? 'rep' : 'reps'}` : null;
    case 'e1rm':
      return s ? `from ${kg(s.weightKg, units)}${each(hit, ctx)} × ${s.reps}` : null;
    case 'best_set':
      return `${fmtInt(kgToDisplay(hit.value, units))} ${weightUnit(units)} in one set`;
    case 'best_session':
      return 'in one workout';
    case 'reps':
      if (!s) return null;
      if (s.weightKg > 0) return `at +${kg(s.weightKg, units)}`;
      if (s.weightKg < 0) return `with ${kg(-s.weightKg, units)} of help`;
      return null;
    case 'pace':
      return s && (s.distanceM ?? 0) > 0 && (s.durationSec ?? 0) > 0
        ? `${fmtDistance(s.distanceM ?? 0, ctx.distUnit)} in ${fmtDuration(s.durationSec ?? 0)}`
        : null;
    default:
      return null;
  }
}

/** The pop-up line: "Best set · 85 kg × 8". */
export function recordToastLabel(hit: RecordHit, ctx: RecordTextContext): string {
  return `${RECORD_LABEL[hit.kind]} · ${recordValueText(hit, ctx)}`;
}

export type MonthItem<T> = { kind: 'month'; key: string; title: string } | { kind: 'record'; key: string; row: T };

/** A newest-first list of records with a heading at each new month (the full records list). */
export function withMonthHeadings<T extends { dateISO: string; exerciseId: string; kind: string; sessionId: string }>(
  rows: readonly T[],
): MonthItem<T>[] {
  const out: MonthItem<T>[] = [];
  let month = '';
  rows.forEach((row, i) => {
    const m = monthOf(row.dateISO);
    if (m !== month) {
      month = m;
      out.push({ kind: 'month', key: `m-${m}`, title: monthTitle(m) });
    }
    out.push({ kind: 'record', key: `r-${i}-${row.exerciseId}-${row.kind}-${row.sessionId}`, row });
  });
  return out;
}

/** Records grouped per exercise, keeping their order (one row per exercise on a summary). */
export function groupByExercise<T extends { exerciseId: string; exerciseName: string }>(
  records: readonly T[],
): { exerciseId: string; exerciseName: string; rows: T[] }[] {
  const out: { exerciseId: string; exerciseName: string; rows: T[] }[] = [];
  for (const r of records) {
    const g = out.find((x) => x.exerciseId === r.exerciseId);
    if (g) g.rows.push(r);
    else out.push({ exerciseId: r.exerciseId, exerciseName: r.exerciseName, rows: [r] });
  }
  return out;
}
