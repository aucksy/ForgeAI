/**
 * Barbell plate math. Pure — no DB, no store. Greedy per-side fill from a standard plate
 * set; reports the closest achievable load when a target can't be hit exactly.
 *
 * Every number in and out is kg, as stored. Under "lb, miles" the bar and plates are the
 * standard pound set (45 lb bar; 45/35/25/10/5/2.5 lb plates) expressed in kg, so the
 * screen shows clean pound plates through `wNum`/`fmtW`.
 */
import { displayUnits, KG_PER_LB, type UnitSystem } from '@/lib/units';

export const DEFAULT_BAR_KG = 20;
/** Standard kg plates, heaviest first. */
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
/** Bar options offered in the calculator. */
export const BAR_OPTIONS_KG = [20, 15, 10] as const;

/** The pound set, in lb. */
export const DEFAULT_BAR_LB = 45;
export const DEFAULT_PLATES_LB = [45, 35, 25, 10, 5, 2.5] as const;
export const BAR_OPTIONS_LB = [45, 35, 15] as const;

const lbToKg = (lb: number): number => lb * KG_PER_LB;

/** The default bar for the member's unit, in kg (20 kg, or 45 lb). */
export function defaultBarKg(u: UnitSystem = displayUnits()): number {
  return u === 'imperial' ? lbToKg(DEFAULT_BAR_LB) : DEFAULT_BAR_KG;
}

/** The plate set for the member's unit, heaviest first, in kg. */
export function platesKg(u: UnitSystem = displayUnits()): readonly number[] {
  return u === 'imperial' ? DEFAULT_PLATES_LB.map(lbToKg) : DEFAULT_PLATES_KG;
}

/** The bar choices for the member's unit, in kg. */
export function barOptionsKg(u: UnitSystem = displayUnits()): readonly number[] {
  return u === 'imperial' ? BAR_OPTIONS_LB.map(lbToKg) : BAR_OPTIONS_KG;
}

export interface PlateResult {
  targetKg: number;
  barKg: number;
  /** Plates for ONE side of the bar, heaviest first. */
  perSide: number[];
  /** Load actually achievable with these plates (bar + both sides). */
  achievableKg: number;
  exact: boolean;
}

const EPS = 1e-6;

export function computePlates(
  targetKg: number,
  barKg: number = defaultBarKg(),
  plates: readonly number[] = platesKg(),
): PlateResult {
  if (!(targetKg > barKg)) {
    return {
      targetKg,
      barKg,
      perSide: [],
      achievableKg: barKg,
      exact: Math.abs(targetKg - barKg) < EPS,
    };
  }
  let remainingPerSide = (targetKg - barKg) / 2;
  const perSide: number[] = [];
  for (const p of plates) {
    while (remainingPerSide + EPS >= p) {
      perSide.push(p);
      remainingPerSide -= p;
    }
  }
  const achievableKg = barKg + 2 * perSide.reduce((a, b) => a + b, 0);
  return { targetKg, barKg, perSide, achievableKg, exact: Math.abs(achievableKg - targetKg) < EPS };
}
