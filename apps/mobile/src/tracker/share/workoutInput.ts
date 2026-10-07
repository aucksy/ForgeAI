/** A finished workout's summary → what its share picture shows (Phase 3). PURE. */
import { fromISO, shortDate } from '@/lib/date';
import { fmtInt, trimNum } from '@/lib/format';

import { fmtDistance, fmtDuration, weightIsEach, type DistUnit, type LoadMode, type LogType } from '../engine/logTypes';
import { RECORD_LABEL } from '../engine/records';
import type { SetMeta } from '../db/trackerSets';
import { dayTypeLabel, formatDuration, type SessionSummaryData } from '../services/finishSummary';
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
    if (top.weightKg > 0) return `+${trimNum(top.weightKg)} kg × ${top.reps}`;
    if (top.weightKg < 0) return `${trimNum(-top.weightKg)} kg help × ${top.reps}`;
    return `${top.reps} reps`;
  }
  const top = [...working].sort((a, b) => b.weightKg - a.weightKg || b.reps - a.reps)[0];
  if (top.reps <= 0) return null;
  return `${trimNum(top.weightKg)} kg${weightIsEach(kind.loadMode) ? ' each' : ''} × ${top.reps}`;
}

/** "Tue, 6 Oct 2026". */
export function shareDate(dateISO: string): string {
  return `${shortDate(dateISO)} ${fromISO(dateISO).getFullYear()}`;
}

export function workoutShareInput(data: SessionSummaryData): WorkoutShareInput {
  const s = data.session;
  return {
    title: dayTypeLabel(s.dayType),
    dateText: shareDate(s.dateISO),
    durationText: data.durationSec > 0 ? formatDuration(data.durationSec) : null,
    volumeText: fmtInt(data.totalVolumeKg),
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
    records: (data.records ?? []).map((r) => ({ exerciseName: r.exerciseName, label: RECORD_LABEL[r.kind], value: recordValueText(r, r.info) })),
    muscles: data.muscles,
  };
}
