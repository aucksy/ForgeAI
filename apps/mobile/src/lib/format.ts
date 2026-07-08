import type { UnitSystem } from '@/types/models';

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

/** 12480 -> "12,480" */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

/** 12480 -> "12.5k" (volume badges, axis ticks) */
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

/** Clamp helper used across charts + progress rings. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
