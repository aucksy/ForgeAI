import type { UnitSystem } from '@/types/models';

import { groupInt } from './numberFormat';
import { displayUnits, kgToShown, weightUnitOf } from './units';

export const KG_PER_LB = 0.45359237;

export function kgToDisplay(kg: number, units: UnitSystem): number {
  return units === 'imperial' ? kg / KG_PER_LB : kg;
}

export function displayToKg(value: number, units: UnitSystem): number {
  return units === 'imperial' ? value * KG_PER_LB : value;
}

export function weightUnit(units: UnitSystem): 'kg' | 'lb' {
  return units === 'imperial' ? 'lb' : 'kg';
}

/** "82.5 kg" (trims trailing .0) */
export function fmtWeight(kg: number, units: UnitSystem = 'metric'): string {
  const v = kgToDisplay(kg, units);
  return `${trimNum(v)} ${weightUnit(units)}`;
}

/**
 * A weight in a sentence, in the member's unit, trimmed like `trimNum` (1 decimal):
 * "62.5 kg" / "137.8 lb". Under "kg, km" it is exactly `${trimNum(kg)} kg`, so older
 * sentences read the same.
 */
export function kgText(kg: number, u: UnitSystem = displayUnits()): string {
  return `${kgNum(kg, u)} ${weightUnitOf(u)}`;
}

/** Just the number of `kgText`: "62.5" / "137.8". */
export function kgNum(kg: number, u: UnitSystem = displayUnits()): string {
  return trimNum(kgToShown(kg, u));
}

/**
 * 12480 -> "12,480": whole numbers grouped the PHONE's way (PG-22 — it used to force Indian
 * grouping on everyone, lb included). The ONE full-number format: screens with room show
 * this; only a small tile or a chart axis uses `fmtCompact`, and never both for the same
 * total on one screen.
 */
export function fmtInt(n: number): string {
  return groupInt(n);
}

/** 12480 -> "12.5k" — small tiles and chart axes only (see `fmtInt`). */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trimNum(n / 1_000_000)}M`;
  if (abs >= 10_000) return `${trimNum(n / 1000)}k`;
  if (abs >= 1000) return `${trimNum(n / 1000, 1)}k`;
  return `${Math.round(n)}`;
}

/** Trim to at most `dp` decimals, dropping trailing zeros: 62.50 -> "62.5", 60.0 -> "60". */
export function trimNum(n: number, dp = 1): string {
  const fixed = n.toFixed(dp);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function fmtKcal(n: number): string {
  return `${fmtInt(n)} kcal`;
}

export function fmtGrams(n: number): string {
  return `${Math.round(n)} g`;
}

export function fmtPct(n: number, signed = false): string {
  const r = Math.round(n);
  return `${signed && r > 0 ? '+' : ''}${r}%`;
}

/**
 * Audit Phase 7 (packet B): the one spelling of a length of time — a workout's duration, a
 * month's total. "45 min" under an hour; "1h 05m", "25h 39m" and "2h" from an hour on. Never
 * "0m 12s" or "11 h 20 min". (A running clock or a rest is m:ss — `fmtDuration`.)
 */
export function fmtTotalTime(totalSec: number): string {
  const min = Math.max(1, Math.round(totalSec / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Clamp helper used across charts + progress rings. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
