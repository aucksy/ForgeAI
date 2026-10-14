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
  /** Plates for ONE side of the bar, heaviest first — the load at or just below the target. */
  perSide: number[];
  /** Load actually achievable with these plates (bar + both sides): the nearest at or below the target. */
  achievableKg: number;
  exact: boolean;
  /**
   * Oct 2026 (plates and bars): when the target cannot be made, the nearest load ABOVE it and
   * its plates per side. null when the target is exact, below the bar, or no plate is on.
   */
  higherKg: number | null;
  higherPerSide: number[] | null;
}

const EPS = 1e-6;
/** Above this many loads the search stops and falls back to the old greedy fill (never slow). */
const SEARCH_CAP = 20000;

const keyOf = (n: number): number => Math.round(n * 1e6);
/** Many small plates add up float dust (2000.0000000000068); a nanogram is never a real load. */
const sum = (xs: readonly number[]): number => Math.round(xs.reduce((a, b) => a + b, 0) * 1e9) / 1e9;

type Seen = Map<number, { total: number; prev: number | null; plate: number }>;

function greedy(perSideTarget: number, plates: readonly number[]): number[] {
  let left = perSideTarget;
  const out: number[] = [];
  for (const p of plates) {
    while (left + EPS >= p) {
      out.push(p);
      left -= p;
    }
  }
  return out;
}

/**
 * Every per-side load up to `limit`, each with its fewest plates (breadth-first: one plate, then
 * two …; heavier plates tried first, so a tie reads like the old greedy fill: 40 = 25 + 15).
 * Unlike greedy, a gym missing some sizes still finds the real answer (only 15 and 10 plates,
 * 20 a side = 10 + 10, which greedy missed). null = too many loads (tiny plates, huge target).
 */
function searchLoads(limit: number, plates: readonly number[]): Seen | null {
  const seen: Seen = new Map();
  seen.set(0, { total: 0, prev: null, plate: 0 });
  const queue: number[] = [0];
  for (let head = 0; head < queue.length; head++) {
    const from = queue[head];
    const at = seen.get(from);
    if (!at) continue;
    for (const p of plates) {
      const total = at.total + p;
      if (total > limit + EPS) continue;
      const k = keyOf(total);
      if (seen.has(k)) continue;
      seen.set(k, { total, prev: from, plate: p });
      queue.push(k);
      if (seen.size > SEARCH_CAP) return null;
    }
  }
  return seen;
}

function platesOf(seen: Seen, k: number): number[] {
  const out: number[] = [];
  let at = seen.get(k);
  while (at && at.prev != null) {
    out.push(at.plate);
    at = seen.get(at.prev);
  }
  return out.sort((a, b) => b - a);
}

/**
 * Plates for one side of the bar, using ONLY `plates` (the gym's set, any order). When the target
 * cannot be made: the nearest load below (`achievableKg`, as before) and above (`higherKg`).
 * Hevy says "Closest possible weight is …" (hevyapp.com/features/weight-plate-calculator).
 */
export function computePlates(
  targetKg: number,
  barKg: number = defaultBarKg(),
  plates: readonly number[] = platesKg(),
): PlateResult {
  const usable = [...new Set(plates.filter((p) => Number.isFinite(p) && p > EPS))].sort((a, b) => b - a);
  if (!(targetKg > barKg)) {
    const exact = Math.abs(targetKg - barKg) < EPS;
    return { targetKg, barKg, perSide: [], achievableKg: barKg, exact, higherKg: null, higherPerSide: null };
  }
  const perSideTarget = (targetKg - barKg) / 2;
  const smallest = usable.length > 0 ? usable[usable.length - 1] : null;
  const seen = smallest == null ? null : searchLoads(perSideTarget + smallest, usable);
  if (!seen) {
    const perSide = greedy(perSideTarget, usable);
    const achievableKg = barKg + 2 * sum(perSide);
    return { targetKg, barKg, perSide, achievableKg, exact: Math.abs(achievableKg - targetKg) < EPS, higherKg: null, higherPerSide: null };
  }
  let below = 0;
  let belowTotal = 0;
  let above: number | null = null;
  let aboveTotal = Infinity;
  for (const [k, v] of seen) {
    if (v.total <= perSideTarget + EPS) {
      if (v.total > belowTotal) {
        below = k;
        belowTotal = v.total;
      }
    } else if (v.total < aboveTotal) {
      above = k;
      aboveTotal = v.total;
    }
  }
  const perSide = platesOf(seen, below);
  const achievableKg = barKg + 2 * sum(perSide);
  const exact = Math.abs(achievableKg - targetKg) < EPS;
  if (exact || above == null) return { targetKg, barKg, perSide, achievableKg, exact, higherKg: null, higherPerSide: null };
  const higherPerSide = platesOf(seen, above);
  return { targetKg, barKg, perSide, achievableKg, exact, higherKg: barKg + 2 * sum(higherPerSide), higherPerSide };
}

// ---------------------------------------------------------------- the gym's plates and bars

/**
 * Oct 2026: "your gym's plates and bars", as Hevy has it. Hevy: Settings → Workouts → Plate
 * Calculator, and in the calculator "Available Equipment → Manage": pick the plates you have and
 * the bar, "+ Custom Plate", "+ Custom Bar"; a target the plates cannot make shows the closest
 * possible weight (hevyapp.com/features/weight-plate-calculator; help.hevyapp.com "Plate
 * Calculator", article 34518876511383). One setup per unit system, in that unit's own numbers
 * (kg, or lb) so a pound plate stays exactly 2.5 lb:
 *  - off: standard plates this gym does NOT have (empty = all on, the behaviour before);
 *  - extra: plate sizes the member added (0.5 kg, a 2 kg fractional, a 12.5 kg bumper …);
 *  - bar: the bar the calculator starts on; null = the standard bar (20 kg / 45 lb).
 */
export interface PlateSetup {
  off: number[];
  extra: number[];
  bar: number | null;
}

export const EMPTY_SETUP: PlateSetup = { off: [], extra: [], bar: null };

const same = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;
const has = (xs: readonly number[], n: number): boolean => xs.some((x) => same(x, n));
/** Unit numbers → kg. */
const toKg = (n: number, u: UnitSystem): number => (u === 'imperial' ? lbToKg(n) : n);
const unitWord = (u: UnitSystem): string => (u === 'imperial' ? 'lb' : 'kg');

/** The standard plates for a unit, in that unit's numbers (kg, or lb), heaviest first. */
export function standardPlates(u: UnitSystem): readonly number[] {
  return u === 'imperial' ? DEFAULT_PLATES_LB : DEFAULT_PLATES_KG;
}

/** The standard bars for a unit, in that unit's numbers. */
export function standardBars(u: UnitSystem): readonly number[] {
  return u === 'imperial' ? BAR_OPTIONS_LB : BAR_OPTIONS_KG;
}

/** The heaviest plate / bar a member may type, in the unit's numbers. */
export function maxPlate(u: UnitSystem): number {
  return u === 'imperial' ? 100 : 50;
}
export function maxBar(u: UnitSystem): number {
  return u === 'imperial' ? 150 : 70;
}

const goodNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** A saved setup this version can use (bad or missing parts fall back to the default). PURE. */
export function cleanPlateSetup(v: unknown): PlateSetup {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof PlateSetup, unknown>>;
  const list = (x: unknown): number[] => (Array.isArray(x) ? [...new Set(x.filter(goodNum))] : []);
  return { off: list(o.off), extra: list(o.extra), bar: goodNum(o.bar) ? o.bar : null };
}

/** Every plate size on the setup page, in unit numbers, heaviest first: standard + the member's own. PURE. */
export function allPlates(setup: PlateSetup, u: UnitSystem): number[] {
  const extra = setup.extra.filter((n) => !has(standardPlates(u), n));
  return [...standardPlates(u), ...extra].sort((a, b) => b - a);
}

/** Is this plate size on (the gym has it)? */
export function plateOn(setup: PlateSetup, n: number): boolean {
  return !has(setup.off, n);
}

/** The gym's plates in kg, heaviest first — what `computePlates` gets. PURE. */
export function gymPlatesKg(setup: PlateSetup, u: UnitSystem): number[] {
  return allPlates(setup, u)
    .filter((n) => plateOn(setup, n))
    .map((n) => toKg(n, u));
}

/** The bar the calculator starts on, in kg. PURE. */
export function gymBarKg(setup: PlateSetup, u: UnitSystem): number {
  return setup.bar != null ? toKg(setup.bar, u) : defaultBarKg(u);
}

/** The bar chips in the calculator, in kg, heaviest first: the standard bars plus the member's own. PURE. */
export function gymBarChoicesKg(setup: PlateSetup, u: UnitSystem): number[] {
  const bars = [...standardBars(u)];
  if (setup.bar != null && !has(bars, setup.bar)) bars.push(setup.bar);
  return bars.sort((a, b) => b - a).map((n) => toKg(n, u));
}

/** Turn one plate size on or off. PURE. */
export function togglePlate(setup: PlateSetup, n: number, on: boolean): PlateSetup {
  const off = setup.off.filter((x) => !same(x, n));
  return { ...setup, off: on ? off : [...off, n] };
}

/**
 * Add a plate size the member typed (unit numbers). Returns the new setup, or a short plain
 * reason it was not added. Adding a size that is switched off switches it back on. PURE.
 */
export function addPlate(setup: PlateSetup, n: number | null, u: UnitSystem): PlateSetup | string {
  const unit = unitWord(u);
  if (n == null || !Number.isFinite(n) || n <= 0) return 'Type a plate weight, like 1.25.';
  const r = Math.round(n * 100) / 100;
  if (r < 0.1) return `Too light for a plate. Use 0.1 ${unit} or more.`;
  if (r > maxPlate(u)) return `Too heavy for a plate. Use ${maxPlate(u)} ${unit} or less.`;
  if (has(allPlates(setup, u), r)) {
    if (!plateOn(setup, r)) return togglePlate(setup, r, true);
    return `${r} ${unit} plates are already on the list.`;
  }
  return { ...setup, extra: [...setup.extra, r] };
}

/** Remove a plate size the member added (standard sizes are switched off instead). PURE. */
export function removePlate(setup: PlateSetup, n: number): PlateSetup {
  return { ...setup, extra: setup.extra.filter((x) => !same(x, n)), off: setup.off.filter((x) => !same(x, n)) };
}

/** Is this one of the member's own plate sizes (so it can be removed)? PURE. */
export function isExtraPlate(setup: PlateSetup, n: number, u: UnitSystem): boolean {
  return has(setup.extra, n) && !has(standardPlates(u), n);
}

/** The standard bar for a unit, in its numbers (20 kg / 45 lb). */
export function standardBar(u: UnitSystem): number {
  return u === 'imperial' ? DEFAULT_BAR_LB : DEFAULT_BAR_KG;
}

/** The bar the setup starts on, in unit numbers. */
export function setupBar(setup: PlateSetup, u: UnitSystem): number {
  return setup.bar ?? standardBar(u);
}

/** Choose the bar (unit numbers); the standard bar is saved as null. Returns a reason when refused. PURE. */
export function chooseBar(setup: PlateSetup, n: number | null, u: UnitSystem): PlateSetup | string {
  const unit = unitWord(u);
  if (n == null || !Number.isFinite(n) || n <= 0) return 'Type the bar weight, like 15.';
  const r = Math.round(n * 100) / 100;
  if (r < 1) return `Too light for a bar. Use 1 ${unit} or more.`;
  if (r > maxBar(u)) return `Too heavy for a bar. Use ${maxBar(u)} ${unit} or less.`;
  return { ...setup, bar: same(r, standardBar(u)) ? null : r };
}

/** "20 kg bar · 7 plate sizes" — the line on the Workouts page. PURE. */
export function plateSetupLine(setup: PlateSetup, u: UnitSystem): string {
  const n = gymPlatesKg(setup, u).length;
  const plates = n === 0 ? 'no plates on' : n === 1 ? '1 plate size' : `${n} plate sizes`;
  return `${setupBar(setup, u)} ${unitWord(u)} bar · ${plates}`;
}

