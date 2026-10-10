/**
 * Pounds and miles on the screens (v0.27.0). PURE — the small conversions the screens share for
 * what a member TYPES and what a cell SHOWS. Everything stays stored metric (kg, metres, cm).
 *
 * Metric output is byte-identical to before: `showW(kg)` is exactly `trimNum(kg)` under "kg, km",
 * and the typed-weight round trip under "kg, km" is the old `String(kg)` / `parseFloat(text)`.
 */
import { trimNum } from '@/lib/format';
import { displayUnits, kgToShown, shownToKg, weightUnitOf } from '@/lib/units';
import type { UnitSystem } from '@/lib/units';

/** Stored kg → "62.5" / "137.8" (at most `dp` decimals). Metric = trimNum(kg, dp). */
export function showW(kg: number, u: UnitSystem = displayUnits(), dp = 1): string {
  return trimNum(kgToShown(kg, u), dp);
}

/** Stored kg → "62.5 kg" / "137.8 lb". */
export function showWU(kg: number, u: UnitSystem = displayUnits(), dp = 1): string {
  return `${showW(kg, u, dp)} ${weightUnitOf(u)}`;
}

/**
 * Phase 2 (LW-06): what a number box keeps of a keystroke. Digits and ONE decimal mark (comma
 * or point, kept as typed), nothing else — no minus, no spaces, no second mark — and no more
 * digits than a real set needs. `integer` boxes (reps) keep digits only. PURE.
 */
export function cleanTyped(
  text: string,
  opts: { integer?: boolean; maxInt?: number; maxDec?: number } = {},
): string {
  const maxInt = opts.maxInt ?? 4;
  const maxDec = opts.maxDec ?? 2;
  if (opts.integer) return text.replace(/\D/g, '').slice(0, maxInt);
  let intPart = '';
  let decPart = '';
  let mark = '';
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') {
      if (mark) decPart += ch;
      else intPart += ch;
    } else if ((ch === '.' || ch === ',') && !mark) {
      mark = ch;
    }
  }
  intPart = intPart.slice(0, maxInt);
  if (!mark || maxDec <= 0) return intPart;
  return `${intPart}${mark}${decPart.slice(0, maxDec)}`;
}

/**
 * A typed number ("135", "82,5", "") → its value, or null when blank or not a number. Never
 * negative (LW-06): a stray minus or space is ignored, the same way the box drops it as typed.
 */
export function parseTyped(text: string, integer = false): number | null {
  const t = cleanTyped(text.trim(), { integer, maxInt: 12, maxDec: 12 }).replace(',', '.');
  if (t === '' || t === '.') return null;
  const n = integer ? parseInt(t, 10) : parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

/**
 * A typed weight → stored kg. Under "kg, km" exactly what was typed; under "lb, miles" the
 * exact kg of those pounds (not rounded, so a 135 lb bar still loads as exactly 45 + 2×45 lb
 * in the plate maths, the same way `roundToShownStep` stores pounds).
 */
export function typedToKg(text: string, u: UnitSystem = displayUnits()): number | null {
  const v = parseTyped(text);
  if (v == null) return null;
  return u === 'imperial' ? shownToKg(v, u) : v;
}

/** Stored kg → the text put in a weight box. Metric: String(kg) as before; lb: to 0.1 lb. */
export function kgToTyped(kg: number | null, u: UnitSystem = displayUnits()): string {
  if (kg == null) return '';
  if (u !== 'imperial') return String(kg);
  return String(Math.round(kgToShown(kg, u) * 10) / 10);
}

/**
 * Does the text in a weight box already say the stored kg? Then the box is left alone, so
 * typing "135" lb (or "82." kg) is never rewritten mid-typing.
 */
export function typedWeightMatches(text: string, storedKg: number | null, u: UnitSystem = displayUnits()): boolean {
  return typedToKg(text, u) === storedKg;
}

/** "Weight in kilograms" / "Weight in pounds" (and the assisted / weighted versions). */
export function weightLabel(kind: 'weight' | 'assisted' | 'weighted', u: UnitSystem = displayUnits()): string {
  const word = u === 'imperial' ? 'pounds' : 'kilograms';
  return kind === 'assisted' ? `Assistance in ${word}` : kind === 'weighted' ? `Added weight in ${word}` : `Weight in ${word}`;
}

/**
 * LW-27: what a screen reader says for one box of one set — unique on the screen, e.g.
 * "Bench Press set 2 weight, kilograms" / "Pull-up warm-up 1 assistance, pounds". PURE.
 */
export function boxLabel(
  exName: string,
  which: string,
  box: 'weight' | 'assisted' | 'weighted' | 'reps' | 'time' | { distance: string },
  u: UnitSystem = displayUnits(),
): string {
  const word = u === 'imperial' ? 'pounds' : 'kilograms';
  const head = `${exName} ${which}`;
  if (box === 'weight') return `${head} weight, ${word}`;
  if (box === 'assisted') return `${head} assistance, ${word}`;
  if (box === 'weighted') return `${head} added weight, ${word}`;
  if (box === 'reps') return `${head} reps`;
  if (box === 'time') return `${head} time, minutes and seconds`;
  return `${head} distance, ${box.distance}`;
}

/** The spoken name of a shown distance unit. */
export function distWord(shown: 'km' | 'm' | 'mi'): string {
  return shown === 'mi' ? 'miles' : shown === 'km' ? 'kilometres' : 'metres';
}

/**
 * The weight steps offered for a custom exercise: kg 0.5 / 1 / 2.5 / 5, or lb 1 / 2.5 / 5 / 10.
 * `kg` is what gets stored; `label` is what the chip says.
 */
export function incrementChoices(u: UnitSystem = displayUnits()): { kg: number; label: string }[] {
  if (u !== 'imperial') return [0.5, 1, 2.5, 5].map((n) => ({ kg: n, label: `${n} kg` }));
  return [1, 2.5, 5, 10].map((n) => ({ kg: shownToKg(n, u), label: `${n} lb` }));
}

/**
 * Which chip a stored step lights up: the exact one, or under lb the nearest pound step (an
 * exercise saved at 2.5 kg shows "5 lb", the step its warm-ups and Targets use). -1 = none.
 */
export function pickedIncrement(stepKg: number, u: UnitSystem = displayUnits()): number {
  const choices = incrementChoices(u);
  const exact = choices.findIndex((c) => Math.abs(c.kg - stepKg) < 1e-9);
  if (exact >= 0 || u !== 'imperial') return exact;
  let best = 0;
  for (let i = 1; i < choices.length; i++) if (Math.abs(choices[i].kg - stepKg) < Math.abs(choices[best].kg - stepKg)) best = i;
  return best;
}
