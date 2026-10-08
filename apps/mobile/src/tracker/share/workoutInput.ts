/** A finished workout's summary → what its share picture shows (Phase 3). PURE. */
import { fromISO, shortDate } from '@/lib/date';
import { fmtInt, kgText } from '@/lib/format';
import { kgToShown, weightUnitOf } from '@/lib/units';

import { fmtDistance, fmtDuration, fmtTotalDistance, weightIsEach, type DistUnit, type LoadMode, type LogType } from '../engine/logTypes';
import { RECORD_LABEL, sessionUnit } from '../engine/records';
import { setVolumeKg } from '../engine/volume';
import type { SetMeta } from '../db/trackerSets';
import { dayTypeLabel, formatDuration, type SessionSummaryData } from '../services/finishSummary';
import type { RecordEventRow } from '../services/recordsService';
import { recordValueText } from '../services/recordText';
import type { WorkoutShareInput } from './workoutCard';

interface Set_ {
  id: string;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}

/** The one set worth naming for an exercise: heaviest, most reps, longest — by how it is logged. */
export function bestSetText(
  sets: readonly Set_[],
  kind: { logType: LogType; loadMode: LoadMode; distUnit: DistUnit },
  meta: Readonly<Record<string, SetMeta | undefined>>,
): string | null {
  const working = sets.filter((s) => !s.isWarmup);
  if (working.length === 0) return null;
  const lt = kind.logType;
  const dur = (s: Set_) => meta[s.id]?.durationSec ?? 0;
  const dist = (s: Set_) => meta[s.id]?.distanceM ?? 0;
  if (lt === 'time') {
    const best = Math.max(...working.map(dur));
    return best > 0 ? fmtDuration(best) : null;
  }
  if (lt === 'distance' || lt === 'time_distance') {
    const top = [...working].sort((a, b) => dist(b) - dist(a) || dur(b) - dur(a))[0];
    if (dist(top) > 0) return lt === 'time_distance' && dur(top) > 0 ? `${fmtDistance(dist(top), kind.distUnit)} · ${fmtDuration(dur(top))}` : fmtDistance(dist(top), kind.distUnit);
    return dur(top) > 0 ? fmtDuration(dur(top)) : null;
  }
  if (lt === 'reps' || lt === 'weighted' || lt === 'assisted') {
    // Most reps; on a weighted move the heaviest belt weight first; on an assisted one the least help.
    const top = [...working].sort((a, b) =>
      lt === 'reps' ? b.reps - a.reps : b.weightKg - a.weightKg || b.reps - a.reps,
    )[0];
    if (top.weightKg > 0) return `+${kgText(top.weightKg)} × ${top.reps}`;
    if (top.weightKg < 0) return `${kgText(-top.weightKg)} help × ${top.reps}`;
    return `${top.reps} ${top.reps === 1 ? 'rep' : 'reps'}`;
  }
  const top = [...working].sort((a, b) => b.weightKg - a.weightKg || b.reps - a.reps)[0];
  if (top.reps <= 0) return null;
  return `${kgText(top.weightKg)}${weightIsEach(kind.loadMode) ? ' each' : ''} × ${top.reps}`;
}

/** "Tue, 6 Oct 2026". */
export function shareDate(dateISO: string): string {
  return `${shortDate(dateISO)} ${fromISO(dateISO).getFullYear()}`;
}

/** "5.2 km" or "800 m" — a picture's total distance across exercises. PURE. */
export const totalDistanceText = fmtTotalDistance;

/**
 * What the picture says was lifted: the weight on the bar, the dumbbells, the machine or the
 * belt, never the member's body weight. PURE.
 *
 * Phase 3, third review: the app's volume adds body weight on pull-ups and dips, so a
 * pull-up workout's picture read "KG LIFTED 3,104" beside "40 reps" — 77.6 kg, the member's
 * body weight, on a picture that promises nothing about their body. When nothing but body
 * weight moved, the picture counts the reps instead. The finish screen keeps the full volume.
 *
 * v0.25.1: a workout of only runs, rides or planks read "KG LIFTED 0". It now says how far
 * it went (DISTANCE), or — timed work with no distance — how many exercises it had.
 */
export function liftedOnPicture(data: SessionSummaryData): {
  label: 'KG LIFTED' | 'LB LIFTED' | 'REPS' | 'DISTANCE' | 'EXERCISES';
  value: string;
} {
  let kg = 0;
  let reps = 0;
  let metres = 0;
  let exercises = 0;
  for (const g of data.session.exercises) {
    const kind = data.kinds[g.exercise.id];
    const logType: LogType = kind?.logType ?? 'weight_reps';
    const rule = { logType, loadMode: kind?.loadMode ?? ('one' as const), bwShare: 0 };
    let working = 0;
    for (const s of g.sets) {
      if (s.isWarmup) continue;
      working += 1;
      kg += setVolumeKg({ weightKg: s.weightKg, reps: s.reps, isWarmup: false, loadMode: data.setMeta[s.id]?.loadMode ?? null }, rule, null);
      if (logType !== 'time' && logType !== 'distance' && logType !== 'time_distance') reps += Math.max(0, s.reps);
      metres += Math.max(0, data.setMeta[s.id]?.distanceM ?? 0);
    }
    if (working > 0) exercises += 1;
  }
  // "KG LIFTED" / "LB LIFTED", by the member's choice.
  const lifted = weightUnitOf() === 'lb' ? ('LB LIFTED' as const) : ('KG LIFTED' as const);
  if (kg > 0) return { label: lifted, value: fmtInt(kgToShown(kg)) };
  if (reps > 0) return { label: 'REPS', value: fmtInt(reps) };
  if (metres > 0) return { label: 'DISTANCE', value: totalDistanceText(metres) };
  if (exercises > 0) return { label: 'EXERCISES', value: String(exercises) };
  return { label: lifted, value: fmtInt(kgToShown(kg)) };
}

/**
 * A record the picture can print. "Best session" on a pull-up or dip with added weight is a
 * kilo total with body weight in it, so it stays off (it still counts in RECORDS and in
 * "and N more"); every other record names the set itself ("+10 kg", "40 reps"). PURE.
 */
export function recordFitsPicture(r: Pick<RecordEventRow, 'kind' | 'exerciseId' | 'info'>, kinds: SessionSummaryData['kinds']): boolean {
  return !(r.kind === 'best_session' && sessionUnit(r.info.logType) === 'kg' && (kinds[r.exerciseId]?.bwShare ?? 0) > 0);
}

export function workoutShareInput(data: SessionSummaryData): WorkoutShareInput {
  const s = data.session;
  const lifted = liftedOnPicture(data);
  const records = data.records ?? [];
  return {
    title: dayTypeLabel(s.dayType),
    dateText: shareDate(s.dateISO),
    durationText: data.durationSec > 0 ? formatDuration(data.durationSec) : null,
    volumeLabel: lifted.label,
    volumeText: lifted.value,
    sets: data.workingSetCount,
    exercises: s.exercises
      .map((g) => {
        const kind = data.kinds[g.exercise.id] ?? { logType: 'weight_reps' as const, loadMode: 'one' as const, distUnit: 'km' as const };
        return {
          name: g.exercise.name,
          sets: g.sets.filter((x) => !x.isWarmup).length,
          best: bestSetText(g.sets, kind, data.setMeta),
        };
      })
      .filter((e) => e.sets > 0),
    records: records
      .filter((r) => recordFitsPicture(r, data.kinds))
      .map((r) => ({ exerciseName: r.exerciseName, label: RECORD_LABEL[r.kind], value: recordValueText(r, r.info) })),
    recordCount: records.length,
    muscles: data.muscles,
  };
}
