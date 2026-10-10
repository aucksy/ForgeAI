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
 *  - Up → the next rung above last time's weight (never further than one rung). Nothing
 *    above → one step past the top: the jump the member repeats, else his own spacing,
 *    else the gym's usual step (bar: 2.5 kg, or 5 kg when every weight he used is a
 *    multiple of 5; pounds 5 / 10 lb; dumbbells: the next dumbbell in the rack).
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
  opts: { learnedStepKg?: number; catalogStepKg?: number; units?: UnitSystem } = {},
): Ladder {
  const u = opts.units ?? displayUnits();
  const own = [...new Set(weightsKg.filter((w) => Number.isFinite(w) && w > EPS).map((kg) => cleanRung(kgToUnit(kg, u), kind, u)))].sort(
    (a, b) => a - b,
  );
  const thin = own.length < THIN_LADDER;

  let step: number | null = null;
  const learned = opts.learnedStepKg && opts.learnedStepKg > 0 ? cleanStep(kgToUnit(opts.learnedStepKg, u), kind, u) : 0;
  if (learned > 0) step = learned;
  else if (kind === 'plates') {
    const big = plateGrid(u) * 2; // 5 kg / 10 lb
    step = !thin && own.every((r) => isMultiple(r, big)) ? big : plateGrid(u);
  } else {
    step = ownSpacing(own);
    if (step == null && kind === 'own') {
      const cat = opts.catalogStepKg && opts.catalogStepKg > 0 ? opts.catalogStepKg : 2.5;
      step = cleanStep(kgToUnit(cat, u), kind, u);
    }
  }

  let rungs = own;
  if (thin && kind !== 'own') {
    const grid =
      kind === 'dumbbell'
        ? dumbbellSeries(u)
        : (() => {
            const g = plateGrid(u);
            const top = Math.max(own[own.length - 1] ?? 0, 0) * 2 + 20 * g;
            const out: number[] = [];
            for (let v = g; v <= top + EPS; v += g) out.push(r3(v));
            return out;
          })();
    rungs = [...new Set([...own, ...grid])].sort((a, b) => a - b);
  }
  return { kind, units: u, own, rungs, step };
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
function beyond(v: number, l: Ladder): number {
  if (l.step == null) {
    const next = dumbbellSeries(l.units).find((x) => x > v + EPS);
    return next ?? r3(v + (imperial(l.units) ? 10 : 5));
  }
  return r3(v + l.step);
}

/**
 * The first `n` weights above `wKg` (kg), nearest first: the ladder's rungs, then steps past
 * its top. Never a rung below or at last time's weight as it reads on screen.
 */
export function upRungsKg(wKg: number, n: number, l: Ladder): number[] {
  const w = kgToUnit(wKg, l.units);
  const floor = Math.max(w, rungOf(wKg, l));
  const out = l.rungs.filter((r) => r > floor + EPS).slice(0, n);
  let cur = out.length > 0 ? out[out.length - 1] : floor;
  while (out.length < n) {
    let next = beyond(cur, l);
    while (next <= w + EPS) next = beyond(next, l);
    out.push(next);
    cur = next;
  }
  return out.map((v) => unitToKg(v, l.units));
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
  return v > EPS ? unitToKg(v, l.units) : null;
}

/** Last time's weight, as the Target shows and fills it: its rung (kg). */
export function sameRungKg(wKg: number, l: Ladder): number {
  const r = rungOf(wKg, l);
  // A clean number in this unit is kept exactly (no 61.2349 → 61.235 drift).
  return Math.abs(r - kgToUnit(wKg, l.units)) < 1e-6 ? wKg : unitToKg(r, l.units);
}
