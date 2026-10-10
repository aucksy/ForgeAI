/**
 * Pounds and miles (v0.27.0, tracker plan Phase 5). PURE — no store import, so every pure text
 * builder (records, Targets, reports, share pictures, the coach) can read it under the tests.
 *
 * Everything is STORED metric, as always: weights in kg, distances in metres, body sizes in cm.
 * The member's choice (Profile → Units: "kg, km" or "lb, miles", the frozen settings store's
 * `unitSystem`) only changes what is SHOWN and how a typed number is read. The app root copies
 * the choice in here (`setDisplayUnits`) and screens re-render through `useUnits()`.
 *
 * Under "lb, miles": weights in lb, kilometre exercises in miles (pace per mile), body sizes in
 * inches. Metre exercises (rowing 500 m, sled push, farmer's walk, swimming) stay in metres —
 * those are measured in metres in every gym.
 */
import type { UnitSystem } from '@/types/models';

import { groupInt } from './numberFormat';

export type { UnitSystem };
export type WeightUnit = 'kg' | 'lb';

export const KG_PER_LB = 0.45359237;
export const M_PER_MILE = 1609.344;
export const CM_PER_IN = 2.54;

let current: UnitSystem = 'metric';

/** Called by the app root whenever the member's choice changes. */
export function setDisplayUnits(u: UnitSystem): void {
  current = u === 'imperial' ? 'imperial' : 'metric';
}

export function displayUnits(): UnitSystem {
  return current;
}

export function isImperial(u: UnitSystem = current): boolean {
  return u === 'imperial';
}

// ---------------------------------------------------------------- weight

export function weightUnitOf(u: UnitSystem = current): WeightUnit {
  return u === 'imperial' ? 'lb' : 'kg';
}

/** Stored kg → the number shown. */
export function kgToShown(kg: number, u: UnitSystem = current): number {
  return u === 'imperial' ? kg / KG_PER_LB : kg;
}

/** A typed number → stored kg. */
export function shownToKg(v: number, u: UnitSystem = current): number {
  return u === 'imperial' ? v * KG_PER_LB : v;
}

/** "62.5", "137.8" — at most `dp` decimals, no trailing zeros. */
export function wNum(kg: number, u: UnitSystem = current, dp = u === 'imperial' ? 1 : 2): string {
  const v = kgToShown(kg, u);
  const f = 10 ** dp;
  return String(Math.round(v * f) / f);
}

/** "62.5 kg", "137.8 lb". */
export function fmtW(kg: number, u: UnitSystem = current): string {
  return `${wNum(kg, u)} ${weightUnitOf(u)}`;
}

/** Volume: whole units with thousands separators, "12,480 kg" / "27,514 lb". */
export function fmtVol(kg: number, u: UnitSystem = current): string {
  return `${groupInt(kgToShown(kg, u))} ${weightUnitOf(u)}`;
}

/**
 * Audit Phase 7 (packet B): the one name for the total weight moved — "kg lifted" / "lb lifted"
 * (never "volume", "kg moved" or "vol"). `capital` starts a heading or tile label: "Kg lifted".
 */
export function liftedWords(u: UnitSystem = current, capital = false): string {
  const w = `${weightUnitOf(u)} lifted`;
  return capital ? w[0].toUpperCase() + w.slice(1) : w;
}

/**
 * A weight step for the member's unit when nothing learned says otherwise: the kg step as
 * given, or its nearest common pound step (2.5 kg → 5 lb, 1.25 kg → 2.5 lb, 5 kg → 10 lb), in kg.
 */
export function stepFor(kgStep: number, u: UnitSystem = current): number {
  if (u !== 'imperial') return kgStep;
  const lb = kgStep / KG_PER_LB;
  const choices = [1, 2.5, 5, 10, 20];
  let best = choices[0];
  for (const c of choices) if (Math.abs(c - lb) < Math.abs(best - lb)) best = c;
  return best * KG_PER_LB;
}

/** Round stored kg to the nearest `stepKg` in the member's unit (a clean "135 lb"). */
export function roundToShownStep(kg: number, stepKg: number, u: UnitSystem = current): number {
  if (stepKg <= 0) return kg;
  if (u !== 'imperial') return Math.round(kg / stepKg) * stepKg;
  const lbStep = Math.round((stepKg / KG_PER_LB) * 100) / 100;
  const lb = Math.round(kgToShown(kg, u) / lbStep) * lbStep;
  return lb * KG_PER_LB;
}

// ---------------------------------------------------------------- body sizes

export function lengthUnitOf(u: UnitSystem = current): 'cm' | 'in' {
  return u === 'imperial' ? 'in' : 'cm';
}
export function cmToShown(cm: number, u: UnitSystem = current): number {
  return u === 'imperial' ? cm / CM_PER_IN : cm;
}
export function shownToCm(v: number, u: UnitSystem = current): number {
  return u === 'imperial' ? v * CM_PER_IN : v;
}
