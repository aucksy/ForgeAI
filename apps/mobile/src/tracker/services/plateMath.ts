/**
 * Barbell plate math (kg only). Pure — no DB, no deps. Greedy per-side fill from a
 * standard kg plate set; reports the closest achievable load when a target can't be
 * hit exactly.
 */
export const DEFAULT_BAR_KG = 20;
/** Standard kg plates, heaviest first. */
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
/** Bar options offered in the calculator. */
export const BAR_OPTIONS_KG = [20, 15, 10] as const;

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
  barKg: number = DEFAULT_BAR_KG,
  plates: readonly number[] = DEFAULT_PLATES_KG,
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
