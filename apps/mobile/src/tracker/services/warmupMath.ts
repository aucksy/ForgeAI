/**
 * Warm-up set calculator (kg in, kg out). Pure. Reuses the FROZEN engine `roundToIncrement`
 * so warm-up loads snap to the exercise's real weight increment — under "lb, miles" its
 * nearest pound step (2.5 kg → 5 lb), so warm-ups read as clean pound numbers.
 */
import { roundToIncrement } from '@/engine/overload';
import { stepFor, type UnitSystem } from '@/lib/units';
import type { Exercise } from '@/types/models';

import { usePlateSetup } from '../store/plateSetupStore';
import { defaultBarKg, gymFloorKg, gymPlatesFor, type GymPlates } from './plateMath';

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
  /**
   * 16 Oct 2026 audit (C3-15), a barbell: `barKg` — never a warm-up under the empty bar (15 kg on
   * a 20 kg bar); `gym` — the gym's bar and plates when set up, every warm-up one they can load
   * (rounded down: never 47.5 kg with no 1.25 kg plates).
   */
  bar: { barKg?: number | null; gym?: GymPlates | null } = {},
): { weightKg: number; reps: number }[] {
  if (!(workingKg > 0)) return [];
  const inc = stepFor(incrementKg > 0 ? incrementKg : 2.5);
  const floorKg = bar.gym?.barKg ?? bar.barKg ?? null;
  const out: { weightKg: number; reps: number }[] = [];
  let lastW = 0;
  for (const s of steps) {
    let w = Math.max(inc, roundToIncrement(workingKg * s.pct, inc));
    if (bar.gym) w = gymFloorKg(workingKg * s.pct, bar.gym);
    if (floorKg != null) w = Math.max(w, floorKg);
    // Never warm up at/above the work weight; drop duplicate consecutive loads
    // (both happen for very light lifts where every % rounds to one increment).
    if (w >= workingKg || w === lastW) continue;
    out.push({ weightKg: w, reps: s.reps });
    lastW = w;
  }
  return out;
}

/**
 * C3-15: what "Add warm-up sets" needs on a barbell — the empty bar (the gym's, else 20 kg / 45 lb)
 * and the gym's plates when set up. Nothing for other equipment.
 */
export function warmupBarFor(equipment: Exercise['equipment'] | undefined, units: UnitSystem): { barKg?: number | null; gym?: GymPlates | null } {
  if (equipment !== 'barbell') return {};
  let gym: GymPlates | null = null;
  try {
    const st = usePlateSetup.getState();
    gym = gymPlatesFor(units === 'imperial' ? st.imperial : st.metric, units);
  } catch (e) {
    console.warn('[ForgeErr] warm-ups: the plates and bars setup could not be read', e);
  }
  return { barKg: gym?.barKg ?? defaultBarKg(units), gym };
}
