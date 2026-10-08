/**
 * Weight words for the coach's replies and cards (v0.27.0). PURE.
 *
 * Stored numbers stay kg. Under "kg, km" every string is byte-for-byte what the coach always
 * said (trimNum to one decimal, "80kg" tight or "80 kg" spaced); under "lb, miles" the same
 * string reads in pounds through the shared helpers in `@/lib/units`.
 */
import { fmtInt, trimNum } from '@/lib/format';
import {
  KG_PER_LB,
  displayUnits,
  fmtVol,
  fmtW,
  kgToShown,
  shownToKg,
  weightUnitOf,
  type UnitSystem,
} from '@/lib/units';

/** "80 kg" / "176.4 lb". */
export function cw(kg: number, u: UnitSystem = displayUnits()): string {
  return u === 'imperial' ? fmtW(kg, u) : `${trimNum(kg)} kg`;
}

/** "80kg" / "176.4 lb" — the tight form the coach used in running text. */
export function cwTight(kg: number, u: UnitSystem = displayUnits()): string {
  return u === 'imperial' ? fmtW(kg, u) : `${trimNum(kg)}kg`;
}

/** Volume: "12,480 kg" / "27,514 lb". */
export function cvol(kg: number, u: UnitSystem = displayUnits()): string {
  return u === 'imperial' ? fmtVol(kg, u) : `${fmtInt(kg)} kg`;
}

/** A change in weight, one decimal, in the member's unit, as a number (sign kept). */
export function cdeltaNum(kg: number, u: UnitSystem = displayUnits()): number {
  return Math.round(kgToShown(kg, u) * 10) / 10;
}

/** The unit word: "kg" / "lb". */
export function cunit(u: UnitSystem = displayUnits()): 'kg' | 'lb' {
  return weightUnitOf(u);
}

const KG_WORD = /^(?:kgs?|kilos?|kilograms?|kilogrammes?)$/i;
const LB_WORD = /^(?:lbs?|pounds?)$/i;

/**
 * A number the member typed or said → stored kg. An explicit "kg"/"kilo" or "lb"/"pound"
 * word wins whatever the setting; a bare number is read in the member's unit.
 */
export function typedToKg(value: number, unitWord?: string | null, u: UnitSystem = displayUnits()): number {
  const w = (unitWord ?? '').trim();
  if (w && LB_WORD.test(w)) return value * KG_PER_LB;
  if (w && KG_WORD.test(w)) return value;
  return shownToKg(value, u);
}

/** The regex fragment for a weight unit word (longest first so "kilograms" is not cut at "kilo"). */
export const UNIT_WORD = '(?:kilogrammes?|kilograms?|kilos?|kgs?|pounds?|lbs?)';
