/**
 * R-141 (owner, 27 Oct 2026: "he needs to see the volume there too ... same view as the profile
 * section"): the stats row of one workout on an exercise's History tab — THIS exercise's numbers
 * in that workout, in the profile feed's look (label over value, `StatsRow`). PURE.
 *
 *  - Weight × reps: "Kg lifted" (weight × reps over the working sets — warm-ups out, the rule the
 *    kg to beat and the "Kg lifted per workout" chart use; two dumbbells count both), "Sets",
 *    "Best set" ("60 kg × 8").
 *  - Body-weight moves (reps only, body weight + added weight, assisted): "Reps", "Sets", "Best set".
 *  - Holds: "Time", "Sets", "Best". Distance work: "Distance", "Sets", "Best".
 * Member words: "Kg lifted", never "volume"; "workout", never "session".
 */
import { fmtInt, kgToDisplay, trimNum, weightUnit } from '@/lib/format';
import type { UnitSystem } from '@/types/models';

import type { TrackedSetEntry } from '../db/exerciseHistory';
import { fmtDuration, fmtTotalDistance, isLoadMode, loadMultiplier, type DistUnit, type LoadMode, type LogType } from '../engine/logTypes';
import { setLabel } from './exerciseHeadline';

export interface WorkoutStat {
  label: string;
  value: string;
}

/** Index of the top working set: heaviest then most reps; longest / farthest for time and distance. -1 = none. PURE. */
export function topSetIndex(sets: readonly TrackedSetEntry[], lt: LogType): number {
  const score = (s: TrackedSetEntry): [number, number] => {
    if (lt === 'time') return [s.durationSec ?? 0, 0];
    if (lt === 'distance' || lt === 'time_distance') return [s.distanceM ?? 0, -(s.durationSec ?? 0)];
    if (lt === 'reps') return [s.reps, s.weightKg];
    return [s.weightKg, s.reps];
  };
  let top = -1;
  for (let i = 0; i < sets.length; i++) {
    if (sets[i].isWarmup) continue;
    if (top === -1) {
      top = i;
      continue;
    }
    const [a1, a2] = score(sets[i]);
    const [b1, b2] = score(sets[top]);
    if (a1 > b1 || (a1 === b1 && a2 > b2)) top = i;
  }
  return top;
}

/** "60 kg × 8" for weight × reps and assisted (with the unit), else the type's own words. PURE. */
export function historySetText(s: TrackedSetEntry, lt: LogType, units: UnitSystem, distUnit: DistUnit): string {
  if (lt === 'weight_reps' || lt === 'assisted') return `${trimNum(kgToDisplay(Math.abs(s.weightKg), units))} ${weightUnit(units)} × ${s.reps}`;
  return setLabel(s, lt, units, distUnit);
}

/** Kg lifted by these sets: weight × reps over the working sets, each set in its own counting. PURE. */
export function liftedKg(sets: readonly TrackedSetEntry[], mode: LoadMode = 'one'): number {
  let kg = 0;
  for (const s of sets) {
    if (s.isWarmup) continue;
    const reps = Number.isFinite(s.reps) ? Math.max(0, s.reps) : 0;
    const w = Number.isFinite(s.weightKg) ? Math.max(0, s.weightKg) : 0;
    kg += w * reps * loadMultiplier(isLoadMode(s.loadMode) ? s.loadMode : mode);
  }
  return kg;
}

/** This exercise's stats row for one workout. Empty when no working set was done. PURE. */
export function exerciseWorkoutStats(
  sets: readonly TrackedSetEntry[],
  lt: LogType,
  units: UnitSystem,
  distUnit: DistUnit = 'km',
  mode: LoadMode = 'one',
): WorkoutStat[] {
  const work = sets.filter((s) => !s.isWarmup);
  if (work.length === 0) return [];
  const out: WorkoutStat[] = [];
  if (lt === 'weight_reps') {
    const kg = liftedKg(work, mode);
    out.push({ label: `${units === 'imperial' ? 'Lb' : 'Kg'} lifted`, value: fmtInt(Math.round(kgToDisplay(kg, units))) });
  } else if (lt === 'reps' || lt === 'weighted' || lt === 'assisted') {
    out.push({ label: 'Reps', value: fmtInt(work.reduce((n, s) => n + Math.max(0, s.reps), 0)) });
  } else if (lt === 'time') {
    out.push({ label: 'Time', value: fmtDuration(work.reduce((n, s) => n + Math.max(0, s.durationSec ?? 0), 0)) });
  } else {
    const m = work.reduce((n, s) => n + Math.max(0, s.distanceM ?? 0), 0);
    if (m > 0) out.push({ label: 'Distance', value: fmtTotalDistance(m) });
    else out.push({ label: 'Time', value: fmtDuration(work.reduce((n, s) => n + Math.max(0, s.durationSec ?? 0), 0)) });
  }
  out.push({ label: 'Sets', value: fmtInt(work.length) });
  const top = topSetIndex(work, lt);
  if (top >= 0) out.push({ label: lt === 'weight_reps' || lt === 'reps' || lt === 'weighted' || lt === 'assisted' ? 'Best set' : 'Best', value: historySetText(work[top], lt, units, distUnit) });
  return out;
}
