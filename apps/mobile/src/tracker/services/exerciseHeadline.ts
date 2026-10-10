/**
 * Audit Phase 4 (EX-07, EX-14): what the exercise page leads with — "Last time · Best" — and
 * how one logged set reads. PURE.
 *
 *  - Last time: the newest workout's working sets ("60 kg × 8, 8 kg × 6"), warm-ups left out.
 *  - Best: the record that answers "how strong am I at this?" for the way it is logged —
 *    heaviest for weights, most reps for reps-only moves, longest / farthest for time and
 *    distance. A record of 0 (a pull-up logged at +0 kg) is never the answer.
 */
import { kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import type { UnitSystem } from '@/types/models';

import type { ExerciseHistoryEntry, TrackedSetEntry } from '../db/exerciseHistory';
import { fmtSetCompact, typedWeight, type DistUnit, type LogType } from '../engine/logTypes';
import type { RecordHit, RecordKind } from '../engine/records';

/** One set as the history chips show it: "60 × 8", "12 reps", "1:30", "5 km". */
export function setLabel(set: TrackedSetEntry, lt: LogType, units: UnitSystem, distUnit: DistUnit): string {
  if (lt === 'weight_reps') return `${trimNum(kgToDisplay(set.weightKg, units))} × ${set.reps}`;
  if (lt === 'assisted') return `${trimNum(kgToDisplay(typedWeight(lt, set.weightKg), units))} × ${set.reps}`;
  return fmtSetCompact(set, lt, distUnit).replace('×', ' × ');
}

/** The newest workout's working sets in words, or null with no history. */
export function lastTimeLine(
  history: readonly ExerciseHistoryEntry[],
  lt: LogType,
  units: UnitSystem,
  distUnit: DistUnit,
): { dateISO: string; text: string } | null {
  const last = history[0];
  if (!last) return null;
  const work = last.sets.filter((s) => !s.isWarmup);
  const sets = work.length > 0 ? work : last.sets;
  if (sets.length === 0) return null;
  const max = 5;
  const shown = sets.slice(0, max).map((s) => setLabel(s, lt, units, distUnit));
  const unit = lt === 'weight_reps' || lt === 'assisted' ? ` ${weightUnit(units)}` : '';
  const more = sets.length > max ? ` +${sets.length - max} more` : '';
  return { dateISO: last.dateISO, text: `${shown.join(', ')}${unit}${more}` };
}

const PREFERRED: Record<LogType, readonly RecordKind[]> = {
  weight_reps: ['weight', 'best_set', 'e1rm', 'reps'],
  weighted: ['weight', 'best_set', 'reps'],
  reps: ['reps', 'best_session'],
  assisted: ['weight', 'reps'],
  time: ['duration'],
  distance: ['distance', 'pace'],
  time_distance: ['distance', 'pace', 'duration'],
};

/** The record the page leads with, or null (nothing logged, or every record is 0). */
export function headlineBest(bests: readonly RecordHit[], lt: LogType): RecordHit | null {
  const real = bests.filter((b) => b.value > 0 || (lt === 'assisted' && b.kind === 'weight'));
  for (const k of PREFERRED[lt]) {
    const hit = real.find((b) => b.kind === k);
    if (hit) return hit;
  }
  return real[0] ?? null;
}

/**
 * EX-07: a weight type that never carried added weight (a pull-up always at +0, a Hevy
 * bodyweight move imported as "weight and reps" at 0 kg) is read as reps — never "0 kg" tiles
 * or a flat 0 chart. PURE.
 */
export function shownLogType(logType: LogType, history: readonly ExerciseHistoryEntry[]): LogType {
  if (logType !== 'weight_reps' && logType !== 'weighted') return logType;
  if (history.length === 0) return logType;
  const anyWeight = history.some((h) => h.sets.some((s) => !s.isWarmup && s.weightKg !== 0));
  return anyWeight ? logType : 'reps';
}
