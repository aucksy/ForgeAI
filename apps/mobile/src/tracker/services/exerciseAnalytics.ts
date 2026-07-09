/**
 * Read-time derivations for the exercise-detail screen — pure, no DB.
 * Consumes the working-sets history already loaded by services/analytics
 * (ExerciseStats.history) to derive a best-single-set series (for the metric
 * switcher) and an xRM "Set Records" ladder (heaviest weight at each rep count).
 * No frozen file/schema touched.
 */
import type { ExerciseStats } from '@/types/models';

type History = ExerciseStats['history'];

export interface BestSetPoint {
  dateISO: string;
  bestSetVolumeKg: number;
}

export interface XrmRecord {
  reps: number;
  weightKg: number;
  dateISO: string;
  sessionId: string;
}

/** Best single-set volume (weight × reps) per session, oldest → newest (chart order). */
export function bestSetVolumeSeries(history: History): BestSetPoint[] {
  const points: BestSetPoint[] = [];
  for (const h of history) {
    let best = 0;
    for (const s of h.sets) {
      if (s.isWarmup) continue;
      const v = s.weightKg * s.reps;
      if (v > best) best = v;
    }
    points.push({ dateISO: h.dateISO, bestSetVolumeKg: best });
  }
  // history is newest-first; charts plot chronologically.
  return points.reverse();
}

/**
 * Heaviest weight recorded at each rep count (Hevy-style "Set Records"),
 * reps ascending. Skips warm-ups and zero-weight (bodyweight) sets, and caps
 * the ladder at `maxReps` so it stays a tidy strength table.
 */
export function xrmLadder(history: History, maxReps = 12): XrmRecord[] {
  const best = new Map<number, XrmRecord>();
  for (const h of history) {
    for (const s of h.sets) {
      if (s.isWarmup) continue;
      if (s.weightKg <= 0 || s.reps <= 0 || s.reps > maxReps) continue;
      const cur = best.get(s.reps);
      if (!cur || s.weightKg > cur.weightKg) {
        best.set(s.reps, { reps: s.reps, weightKg: s.weightKg, dateISO: h.dateISO, sessionId: h.sessionId });
      }
    }
  }
  return [...best.values()].sort((a, b) => a.reps - b.reps);
}
