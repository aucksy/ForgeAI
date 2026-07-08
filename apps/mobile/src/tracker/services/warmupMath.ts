/**
 * Warm-up set calculator (kg). Pure. Reuses the FROZEN engine `roundToIncrement`
 * so warm-up loads snap to the exercise's real weight increment.
 */
import { roundToIncrement } from '@/engine/overload';

export interface WarmupStep {
  pct: number;
  reps: number;
}

/** Hevy's default ramp: 40%×5, 60%×5, 80%×3. */
export const DEFAULT_WARMUP: WarmupStep[] = [
  { pct: 0.4, reps: 5 },
  { pct: 0.6, reps: 5 },
  { pct: 0.8, reps: 3 },
];

export function computeWarmups(
  workingKg: number,
  incrementKg: number,
  steps: WarmupStep[] = DEFAULT_WARMUP,
): { weightKg: number; reps: number }[] {
  if (!(workingKg > 0)) return [];
  const inc = incrementKg > 0 ? incrementKg : 2.5;
  const out: { weightKg: number; reps: number }[] = [];
  let lastW = 0;
  for (const s of steps) {
    const w = Math.max(inc, roundToIncrement(workingKg * s.pct, inc));
    // Never warm up at/above the work weight; drop duplicate consecutive loads
    // (both happen for very light lifts where every % rounds to one increment).
    if (w >= workingKg || w === lastW) continue;
    out.push({ weightKg: w, reps: s.reps });
    lastW = w;
  }
  return out;
}
