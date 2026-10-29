/**
 * F63 — the 1-rep max and % calculator. PURE: no DB, no store.
 *
 * A weight and reps give the estimated 1-rep max through the app's ONE estimate
 * (`lib/e1rm.estimatedOneRepMax`, the same one the "Estimated 1-rep max" chart draws; reps above
 * `E1RM_MAX_REPS` count as that many). Then 95 % down to 50 % of it, each rounded to a weight the
 * member can load with the gym's bar and plates (`plateMath`: the member's Plates and bars setup,
 * in kg or the pound set).
 */
import { E1RM_MAX_REPS, estimatedOneRepMax } from '@/lib/e1rm';
import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';

import { computePlates, gymCeilKg, gymFloorKg, type GymPlates } from './plateMath';

/** The rows of the table, heaviest first. */
export const ONE_REP_PERCENTS = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50] as const;

/** Above this many reps the estimate is rougher (the shared formula counts them as this many). */
export const ROUGH_REPS_ABOVE = E1RM_MAX_REPS;

/** The most reps the box takes (and the most a check lets through). */
export const MAX_REPS = 100;

const EPS = 1e-6;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

export type OneRepCheck =
  | { ok: true; e1rmKg: number; rough: boolean }
  | { ok: false; why: 'empty' | 'weight' | 'reps' };

/**
 * Check what was typed (weight in kg, reps; null = an empty box) and estimate the 1-rep max.
 *  - either box empty: 'empty' (nothing to work out yet);
 *  - weight 0 or less: 'weight';
 *  - reps under 1, not whole, or above `MAX_REPS`: 'reps';
 *  - reps above `ROUGH_REPS_ABOVE`: worked out, flagged `rough`.
 */
export function checkOneRep(weightKg: number | null, reps: number | null): OneRepCheck {
  if (weightKg == null || reps == null || !Number.isFinite(weightKg) || !Number.isFinite(reps)) return { ok: false, why: 'empty' };
  if (!(weightKg > 0)) return { ok: false, why: 'weight' };
  if (!(reps >= 1) || !Number.isInteger(reps) || reps > MAX_REPS) return { ok: false, why: 'reps' };
  return { ok: true, e1rmKg: estimatedOneRepMax(weightKg, reps), rough: reps > ROUGH_REPS_ABOVE };
}

/**
 * The nearest weight the gym can load to `kg` (a tie goes to the lighter one). At or under the
 * empty bar: whole steps of the gym's smallest jump (2 × its smallest plate), so a light
 * percentage of a dumbbell lift still reads as a weight that exists. No plate on: the bar, or
 * `kg` to 0.1 under it. PURE.
 */
export function loadableKg(kg: number, gym: GymPlates): number {
  if (!(kg > 0)) return 0;
  if (gym.platesKg.length === 0) return kg >= gym.barKg - EPS ? gym.barKg : Math.round(kg * 10) / 10;
  const step = round6(Math.min(...gym.platesKg) * 2);
  if (kg <= gym.barKg + EPS) {
    const n = Math.round(kg / step - EPS);
    const below = round6(Math.max(step, n * step));
    // The bar itself is a loadable weight too, when it is the closer one.
    return Math.abs(gym.barKg - kg) < Math.abs(below - kg) ? gym.barKg : below;
  }
  const lo = gymFloorKg(kg, gym);
  const hi = gymCeilKg(kg, gym);
  return hi - kg < kg - lo - EPS ? hi : lo;
}

export interface PercentRow {
  pct: number;
  /** The exact percentage of the 1-rep max, kg. */
  exactKg: number;
  /** The weight to load, kg (`loadableKg`). */
  loadKg: number;
  /** Plates on each side of the bar for `loadKg`, heaviest first; [] = the bar alone or below it. */
  perSide: number[];
}

/** 95 % … 50 % of a 1-rep max, each rounded to a weight this gym can load. PURE. */
export function percentRows(e1rmKg: number, gym: GymPlates): PercentRow[] {
  if (!(e1rmKg > 0)) return [];
  return ONE_REP_PERCENTS.map((pct) => {
    const exactKg = (e1rmKg * pct) / 100;
    const loadKg = loadableKg(exactKg, gym);
    const perSide = loadKg > gym.barKg + EPS ? computePlates(loadKg, gym.barKg, gym.platesKg).perSide : [];
    return { pct, exactKg, loadKg, perSide };
  });
}

/** How many of the newest workouts the prefill looks at. */
export const RECENT_WORKOUTS = 5;

/**
 * The member's best recent set for the prefill: among the newest `RECENT_WORKOUTS` workouts
 * (history arrives newest first; easy weeks left out, as on the charts), the set with the
 * highest estimated 1-rep max; a tie keeps the newer one. null = no set with weight and reps. PURE.
 */
export function bestRecentSet(
  history: readonly { sets: readonly { weightKg: number; reps: number }[]; easyWeek?: ExerciseHistoryEntry['easyWeek'] }[],
  workouts = RECENT_WORKOUTS,
): { weightKg: number; reps: number } | null {
  let best: { weightKg: number; reps: number; e1rm: number } | null = null;
  let seen = 0;
  for (const h of history) {
    if (seen >= workouts) break;
    if (h.easyWeek || h.sets.length === 0) continue;
    seen++;
    for (const s of h.sets) {
      if (!(s.weightKg > 0) || !(s.reps >= 1) || !Number.isFinite(s.weightKg) || !Number.isFinite(s.reps)) continue;
      const e1rm = estimatedOneRepMax(s.weightKg, s.reps);
      if (!best || e1rm > best.e1rm + EPS) best = { weightKg: s.weightKg, reps: s.reps, e1rm };
    }
  }
  return best ? { weightKg: best.weightKg, reps: best.reps } : null;
}
