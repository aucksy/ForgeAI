/**
 * Profile → the welcome answers that used to be fixed forever (audit SH-09). PURE.
 *
 * Experience changes Targets (a beginner who found a weight easy may jump two steps), so a
 * 5-year lifter who left the pre-selected "New to lifting" at welcome must be able to fix it.
 * Age and height use the welcome screen's own ranges; blank = not given (stored as 0).
 */
import type { UnitSystem } from '@/lib/units';
import type { UserProfile } from '@/types/models';

export const EXPERIENCE_OPTIONS = [
  { id: 'beginner', label: 'New to lifting' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
] as const satisfies readonly { id: UserProfile['experience']; label: string }[];

const CM_PER_IN = 2.54;
const AGE = { min: 10, max: 100 };
const HEIGHT_CM = { min: 90, max: 250 };
const HEIGHT_IN = { min: 36, max: 98 };

/** Stored cm → the text in the height box ("" when not given). */
export function heightToText(cm: number, units: UnitSystem): string {
  if (!(cm > 0)) return '';
  const v = units === 'imperial' ? cm / CM_PER_IN : cm;
  return String(Math.round(v * 10) / 10);
}

/** Stored age → the text in the age box ("" when not given). */
export function ageToText(age: number): string {
  return age > 0 ? String(age) : '';
}

function parse(raw: string): number | null | 'invalid' {
  const t = raw.trim().replace(',', '.');
  if (t.length === 0) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return 'invalid';
  return Number(t);
}

export type ExtrasResult =
  | { ok: true; age: number; heightCm: number }
  | { ok: false; title: string; message: string };

/** The typed age and height → what to store (0 = not given), or what to tell the member. */
export function parseProfileExtras(ageText: string, heightText: string, units: UnitSystem): ExtrasResult {
  const age = parse(ageText);
  if (age === 'invalid' || (age != null && (!Number.isInteger(age) || age < AGE.min || age > AGE.max))) {
    return { ok: false, title: 'Check your age', message: `Enter an age between ${AGE.min} and ${AGE.max}, or leave it blank.` };
  }
  const imperial = units === 'imperial';
  const rule = imperial ? HEIGHT_IN : HEIGHT_CM;
  const h = parse(heightText);
  if (h === 'invalid' || (h != null && (h < rule.min || h > rule.max))) {
    return {
      ok: false,
      title: 'Check your height',
      message: `Enter a height between ${rule.min} and ${rule.max} ${imperial ? 'inches' : 'cm'}, or leave it blank.`,
    };
  }
  const heightCm = h == null ? 0 : imperial ? Math.round(h * CM_PER_IN * 10) / 10 : h;
  return { ok: true, age: age ?? 0, heightCm };
}

/**
 * Review fix (#12): Profile → Units changed while the card is open. The height box is re-written
 * in the new unit (175 cm → "68.9" in), and so is what counts as "unchanged" — an untouched
 * height is never re-read in the wrong unit (and refused: 175 "inches"). A typed height is
 * converted; blank stays blank; text that is not a number is left for the member to fix. PURE.
 */
export function heightForUnits(p: {
  text: string;
  seeded: string;
  storedCm: number;
  from: UnitSystem;
  to: UnitSystem;
}): { text: string; seeded: string } {
  const seeded = heightToText(p.storedCm, p.to);
  if (p.from === p.to) return { text: p.text, seeded: p.seeded };
  if (p.text === p.seeded) return { text: seeded, seeded };
  const h = parse(p.text);
  if (h === null) return { text: '', seeded };
  if (h === 'invalid') return { text: p.text, seeded };
  const cm = p.from === 'imperial' ? h * CM_PER_IN : h;
  return { text: heightToText(cm, p.to), seeded };
}
