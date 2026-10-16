/**
 * "Your own weight ladder" (audit TG-01 / TG-02). PURE.
 *
 * A Target used to add a step to last time's weight (+2.5 kg unless a jump repeated inside
 * the last 12 workouts), so it asked for weights the member had never lifted and often could
 * not load: 52.5 kg on a bench he only ever loads in 5 kg jumps, 40.5 kg on a 7 kg cable
 * stack, 148.8 lb on a pound bar. Measured on the owner's export: 54 of 82 lifts.
 *
 * Now every suggested weight is a RUNG of a ladder made of the weights the member has
 * actually logged on that exercise (all history), in the unit on screen:
 *  - Up → the next rung above last time's weight. Oct 2026 ("Weight jumps" setting,
 *    `jumpRungKg`): the heaviest rung within the chosen 2.5 / 5 / 10% of it, never less than
 *    the next rung. Nothing above → one step past the top: the jump the member repeats, else
 *    his own spacing, else the gym's usual step (bar: the gym's smallest plate pair — 2.5 kg
 *    with the usual plates, or twice that when every weight he used is a multiple of it;
 *    pounds 5 / 10 lb; dumbbells: the next dumbbell in the rack).
 *  - Lighter → the rung nearest to 10% lighter (within 25%), else whole steps down.
 *  - With fewer than 3 different weights logged, a bar and dumbbells also get the gym's
 *    usual steps as rungs; a machine or cable stack only ever its own (its stack is unknown).
 *
 * Weights logged in the OTHER unit (a Hevy history in pounds used in kg, or kg history after
 * switching to "lb, miles") are first put on this unit's plates: 165 lb → 75 kg, 60 kg →
 * 130 lb, so nothing on screen or in a weight box reads "74.843" or "148.8 lb".
 *
 * Every value here is in the SHOWN unit except where a name says Kg.
 */
import { displayUnits, KG_PER_LB, type UnitSystem } from '@/lib/units';
import { gymCanLoad, gymCeilKg, gymFloorKg, type GymPlates } from '@/tracker/services/plateMath';
import type { Exercise } from '@/types/models';

import type { LogType } from './logTypes';

/** How the weights of an exercise come: plates on a bar or belt, a dumbbell rack, a stack. */
export type LadderKind = 'plates' | 'dumbbell' | 'own';

export function ladderKind(equipment: Exercise['equipment'] | undefined, logType: LogType = 'weight_reps'): LadderKind {
  // Added weight on a pull-up or dip is plates on a belt.
  if (logType === 'weighted' || logType === 'reps') return 'plates';
  if (equipment === 'barbell' || equipment === 'bodyweight') return 'plates';
  if (equipment === 'dumbbell') return 'dumbbell';
  return 'own';
}

const imperial = (u: UnitSystem): boolean => u === 'imperial';
export const kgToUnit = (kg: number, u: UnitSystem = displayUnits()): number => (imperial(u) ? kg / KG_PER_LB : kg);
export const unitToKg = (v: number, u: UnitSystem = displayUnits()): number => (imperial(u) ? v * KG_PER_LB : v);
const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const EPS = 1e-6;

/** The smallest plate pair: 2.5 kg / 5 lb. */
function plateGrid(u: UnitSystem): number {
  return imperial(u) ? 5 : 2.5;
}

/** A common dumbbell rack: kg 2.5 … 45 in 2.5s, then 5s; lb in 5s. */
export function dumbbellSeries(u: UnitSystem = displayUnits()): number[] {
  const out: number[] = [];
  if (imperial(u)) {
    for (let v = 5; v <= 250; v += 5) out.push(v);
    return out;
  }
  for (let v = 2.5; v <= 45 + EPS; v += 2.5) out.push(r3(v));
  for (let v = 50; v <= 120; v += 5) out.push(v);
  return out;
}

function isMultiple(v: number, of: number): boolean {
  const q = v / of;
  return Math.abs(q - Math.round(q)) < 1e-6;
}

function nearestOf(list: readonly number[], v: number): number {
  let best = list[0];
  for (const x of list) if (Math.abs(x - v) < Math.abs(best - v) - EPS) best = x;
  return best;
}

/**
 * A logged weight (shown unit) as a rung: the member's own number when it is a clean number
 * in this unit (kg to 0.25, lb to 0.5), else — it was logged in the other unit — the nearest
 * weight this unit's gym has (bar: 2.5 kg / 5 lb, dumbbell rack, stack: 0.5 kg / 2.5 lb).
 */
export function cleanRung(v: number, kind: LadderKind, u: UnitSystem = displayUnits()): number {
  const fine = imperial(u) ? 0.5 : 0.25;
  const near = Math.round(v / fine) * fine;
  if (Math.abs(v - near) < 0.005) return r3(near);
  if (kind === 'dumbbell') return nearestOf(dumbbellSeries(u), v);
  const g = kind === 'plates' ? plateGrid(u) : imperial(u) ? 2.5 : 0.5;
  return r3(Math.max(g, Math.round(v / g) * g));
}

/** A step (shown unit) put on this unit's plates: 2.5 kg learned in kg is 5 lb, not 5.51 lb. */
function cleanStep(step: number, kind: LadderKind, u: UnitSystem): number {
  const fine = imperial(u) ? 0.5 : 0.25;
  if (Math.abs(step - Math.round(step / fine) * fine) < 0.005) return r3(Math.round(step / fine) * fine);
  const g = kind === 'plates' ? plateGrid(u) : kind === 'dumbbell' ? (imperial(u) ? 5 : 1) : imperial(u) ? 2.5 : 0.5;
  return r3(Math.max(g, Math.round(step / g) * g));
}

export interface Ladder {
  kind: LadderKind;
  units: UnitSystem;
  /** The member's own weights as rungs, ascending. */
  own: number[];
  /** What Up and Lighter pick from: `own`, plus the gym's usual steps when `own` is thin. */
  rungs: number[];
  /** One step past the top (shown unit); null on dumbbells with no step of their own (the rack is used). */
  step: number | null;
  /**
   * 16 Oct 2026 audit (C3-7 / C3-1): the step Up walks with past the top of his ladder, or across a
   * gap to a far-away rung. On a bar the smaller of `step` and the smallest plate pair (so "Weight
   * jumps" can pick 62.5 kg after 60 on a 5 kg ladder); elsewhere `step`.
   */
  fine: number | null;
  /**
   * Review fix (Oct 2026): the gym's bar and plates (kg) on a barbell whose member set up Plates
   * and bars; every rung and step is then a weight those plates can load. null = no setup.
   */
  gym: GymPlates | null;
}

/** Fewer distinct weights than this and a bar / dumbbells also get the gym's usual steps. */
export const THIN_LADDER = 3;

/**
 * Build the ladder. `weightsKg`: every weight the member logged on the exercise (kg, in
 * today's counting); `learnedStepKg`: the jump he repeats between workouts (0 = none);
 * `catalogStepKg`: the library's step for the exercise.
 */
export function buildLadder(
  weightsKg: readonly number[],
  kind: LadderKind,
  opts: {
    learnedStepKg?: number;
    catalogStepKg?: number;
    units?: UnitSystem;
    /**
     * Oct 2026 (owner: "use the gym's real plates"), review fix: the gym's bar and plates (kg),
     * passed ONLY when the member set up Plates and bars (`gymPlatesFor`). On a `plates` ladder
     * the smallest jump is then its smallest plate × 2, the thin-ladder grid counts up from the
     * bar, and every rung (his own weights too) is a weight those plates can load. Absent = the
     * member's own steps and the fixed 2.5 kg / 5 lb grid, as before.
     */
    gym?: GymPlates | null;
  } = {},
): Ladder {
  const u = opts.units ?? displayUnits();
  const own = [...new Set(weightsKg.filter((w) => Number.isFinite(w) && w > EPS).map((kg) => cleanRung(kgToUnit(kg, u), kind, u)))].sort(
    (a, b) => a - b,
  );
  const thin = own.length < THIN_LADDER;
  const plates = kind === 'plates' && opts.gym && opts.gym.platesKg.some((p) => p > EPS) ? opts.gym : null;
  const gym = plates ? r3(kgToUnit(Math.min(...plates.platesKg.filter((p) => p > EPS)) * 2, u)) : null;
  /** The smallest jump on a bar: the gym's own plates, else 2.5 kg / 5 lb. */
  const smallest = gym ?? plateGrid(u);

  let step: number | null = null;
  let learned = opts.learnedStepKg && opts.learnedStepKg > 0 ? cleanStep(kgToUnit(opts.learnedStepKg, u), kind, u) : 0;
  // A learned jump the gym's plates cannot make (2.5 kg with no 1.25 kg plates) is rounded UP to
  // what they can (5 kg).
  if (gym != null && learned > 0 && !isMultiple(learned, gym)) learned = r3(Math.ceil(learned / gym - EPS) * gym);
  if (learned > 0) step = learned;
  else if (kind === 'plates') {
    const big = smallest * 2; // 5 kg / 10 lb with the usual plates
    step = !thin && own.every((r) => isMultiple(r, big)) ? big : smallest;
  } else {
    step = ownSpacing(own);
    if (step == null && kind === 'own') {
      const cat = opts.catalogStepKg && opts.catalogStepKg > 0 ? opts.catalogStepKg : 2.5;
      step = cleanStep(kgToUnit(cat, u), kind, u);
    }
  }

  // Review fix: with the gym's plates, each of his own weights is put on a weight they can load
  // (61 kg with no 0.5 kg plates → 62.5), and nothing under the bar is a rung.
  let rungs = plates
    ? [...new Set(own.map((v) => r3(kgToUnit(gymCeilKg(unitToKg(v, u), plates), u))))].sort((a, b) => a - b)
    : own;
  if (thin && kind !== 'own') {
    const grid =
      kind === 'dumbbell'
        ? dumbbellSeries(u)
        : (() => {
            const g = smallest;
            // Review fix: on the gym's bar the grid is bar + k × step (45, 55 … 135, 145 lb with a
            // 10 lb step), never k × step from 0 (140 lb would need 2.5 lb plates).
            const from = plates ? r3(kgToUnit(plates.barKg, u)) : g;
            const top = Math.max(own[own.length - 1] ?? 0, 0) * 2 + 20 * g;
            const out: number[] = [];
            for (let v = from; v <= top + EPS; v += g) out.push(r3(v));
            return out;
          })();
    rungs = [...new Set([...rungs, ...grid])].sort((a, b) => a - b);
  }
  const fine = kind === 'plates' && step != null ? Math.min(step, smallest) : step;
  return { kind, units: u, own, rungs, step, fine, gym: plates };
}

/** Can the gym load this weight (shown unit)? Always true with no gym. */
function loadable(v: number, l: Ladder): boolean {
  return l.gym == null || gymCanLoad(unitToKg(v, l.units), l.gym);
}

/** The member's own spacing between neighbouring weights, seen at least twice (ties → smaller). */
function ownSpacing(own: readonly number[]): number | null {
  const gaps = new Map<number, number>();
  for (let i = 1; i < own.length; i++) {
    const g = r3(own[i] - own[i - 1]);
    if (g > EPS) gaps.set(g, (gaps.get(g) ?? 0) + 1);
  }
  let best: number | null = null;
  let n = 1;
  for (const [g, c] of gaps) {
    if (c > n || (c === n && best != null && g < best)) {
      n = c;
      best = g;
    }
  }
  return best;
}

/** Last time's weight as it reads on this ladder (its own rung). */
export function rungOf(wKg: number, l: Ladder): number {
  return cleanRung(kgToUnit(wKg, l.units), l.kind, l.units);
}

/** One step past `v` when the ladder has nothing above it. */
function beyond(v: number, l: Ladder, step: number | null = l.step): number {
  // Review fix: from a weight the gym's plates cannot make, the lightest one above it they can;
  // from one they can, a whole step (a multiple of the smallest pair) keeps it loadable.
  if (l.gym != null && !loadable(v, l)) return r3(kgToUnit(gymCeilKg(unitToKg(v, l.units), l.gym), l.units));
  if (step == null) {
    const next = dumbbellSeries(l.units).find((x) => x > v + EPS);
    return next ?? r3(v + (imperial(l.units) ? 10 : 5));
  }
  return r3(v + step);
}

/**
 * The first `n` weights above `wKg` (kg), nearest first: the ladder's rungs, then steps past
 * its top. Never a rung below or at last time's weight as it reads on screen.
 *
 * 16 Oct 2026 audit:
 *  - C3-1: his next rung is used only when it is within one of his steps. A rung far above (a
 *    typo of 1400 kg, a 225 kg "dumbbell", an old best from before an injury) is skipped: the
 *    walk goes on from where he is, one small step at a time.
 *  - C3-6: the walk starts from last time's CLEAN rung (135 lb read in kg is 60 → 62.5), never
 *    from the raw converted number (61.23 → 66.2).
 *  - C3-7: past the top a bar steps by the smallest plate pair (`fine`), so "Weight jumps" can
 *    choose; the share in `jumpRungKg` is the ceiling.
 */
/** C3-1: on a rack or stack (unknown weights) a rung more than this times his weight is a typo or an old far-away best. */
const FAR_STACK = 1.5;

export function upRungsKg(wKg: number, n: number, l: Ladder): number[] {
  const w = kgToUnit(wKg, l.units);
  const out: number[] = [];
  let cur = rungOf(wKg, l);
  while (out.length < n) {
    const from = Math.max(cur, w);
    const rung = l.rungs.find((r) => r > from + EPS);
    let next: number;
    // His gym's dumbbell rack or machine stack is unknown (20 → 25 kg may be the next dumbbell),
    // so there only a rung half again above is "far".
    const reach = l.kind === 'plates' ? beyond(cur, l) : Math.max(beyond(cur, l), cur * FAR_STACK);
    if (rung != null && rung <= reach + EPS) next = rung;
    else {
      next = beyond(cur, l, l.fine);
      while (next <= w + EPS) next = beyond(next, l, l.fine);
    }
    out.push(next);
    cur = next;
  }
  return out.map((v) => unitToKg(v, l.units));
}

/**
 * Oct 2026 (owner's "Weight jumps" setting): the weight to move up to (kg) — the HEAVIEST rung
 * at or below last time's weight × (1 + `share`), and always at least the next rung. So a light
 * lift gets the smallest step whatever the setting (20 kg + 10% = 22, under the first rung 22.5),
 * and a heavy one can skip rungs (60 kg + 10% = 66 → 65).
 */
export function jumpRungKg(wKg: number, share: number, l: Ladder): number {
  const limit = kgToUnit(wKg, l.units) * (1 + Math.max(0, share)) + EPS;
  const ups = upRungsKg(wKg, 40, l);
  let best = ups[0];
  for (const kg of ups) {
    if (kgToUnit(kg, l.units) > limit) break;
    best = kg;
  }
  return best;
}

/**
 * About 10% lighter (kg): the rung nearest to 90% of last time's weight among those within
 * 25% below it (ties → the heavier); else whole steps down. null when that reaches zero.
 */
export function downRungKg(wKg: number, l: Ladder): number | null {
  const w = kgToUnit(wKg, l.units);
  const ideal = w * 0.9;
  const cands = l.rungs.filter((r) => r < w - EPS && r < rungOf(wKg, l) - EPS && r >= w * 0.75 - EPS);
  if (cands.length > 0) {
    let best = cands[0];
    for (const r of cands) if (Math.abs(r - ideal) < Math.abs(best - ideal) + EPS) best = r;
    return unitToKg(best, l.units);
  }
  let v: number;
  if (l.step == null) {
    const below = dumbbellSeries(l.units).filter((x) => x < w - EPS);
    if (below.length === 0) return null;
    v = nearestOf(below, ideal);
  } else {
    const steps = Math.max(1, Math.round((w * 0.1) / l.step));
    v = r3(rungOf(wKg, l) - steps * l.step);
  }
  if (l.gym != null && v > EPS) {
    // Review fix: a weight the gym's plates can load — the nearest at or above, else below.
    const kg = unitToKg(v, l.units);
    let snapped = gymCeilKg(kg, l.gym);
    if (kgToUnit(snapped, l.units) >= w - EPS) snapped = gymFloorKg(kg, l.gym);
    v = r3(kgToUnit(snapped, l.units));
    if (v >= w - EPS) return null;
  }
  return v > EPS ? unitToKg(v, l.units) : null;
}

/** Last time's weight, as the Target shows and fills it: its rung (kg). */
export function sameRungKg(wKg: number, l: Ladder): number {
  const r = rungOf(wKg, l);
  // A clean number in this unit is kept exactly (no 61.2349 → 61.235 drift).
  return Math.abs(r - kgToUnit(wKg, l.units)) < 1e-6 ? wKg : unitToKg(r, l.units);
}
