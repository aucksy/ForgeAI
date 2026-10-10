/**
 * Audit Phase 7 (packet B): the words for Home's calorie and protein rings — one source for
 * what the rings show and what a screen reader says when the pair is one button. PURE.
 */
import { ringLabel } from '@/components/ui/a11y';
import { fmtGrams, fmtInt } from '@/lib/format';

export interface RingWords {
  title: string;
  value: number;
  max: number;
  label: string;
  sublabel: string;
}

/** The two rings' words: "1,420" / "of 2,200" and "88 g" / "of 160 g" (a space before the unit). */
export function nutritionRings(d: {
  caloriesToday: number;
  calorieTarget: number;
  proteinTodayG: number;
  proteinTargetG: number;
}): { calories: RingWords; protein: RingWords } {
  return {
    calories: {
      title: 'Calories',
      value: d.caloriesToday,
      max: d.calorieTarget,
      label: fmtInt(d.caloriesToday),
      sublabel: `of ${fmtInt(d.calorieTarget)}`,
    },
    protein: {
      title: 'Protein',
      value: d.proteinTodayG,
      max: d.proteinTargetG,
      label: fmtGrams(d.proteinTodayG),
      sublabel: `of ${fmtGrams(d.proteinTargetG)}`,
    },
  };
}

/** One spoken line for the pair, built from each ring's own label: "Calories, 1,420 of 2,200. Protein, 88 g of 160 g". */
export function nutritionRingsLabel(r: { calories: RingWords; protein: RingWords }): string {
  return `${ringLabel(r.calories)}. ${ringLabel(r.protein)}`;
}

/** What tapping the pair does. */
export const NUTRITION_RINGS_HINT = "Opens today's meals";
