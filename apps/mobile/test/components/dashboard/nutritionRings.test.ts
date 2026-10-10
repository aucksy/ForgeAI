import { describe, expect, it } from 'vitest';

import { nutritionRings, nutritionRingsLabel, NUTRITION_RINGS_HINT } from '@/components/dashboard/nutritionRings';
import { ringLabel } from '@/components/ui/a11y';

const d = { caloriesToday: 1420, calorieTarget: 2200, proteinTodayG: 88.4, proteinTargetG: 160 };

describe('Home nutrition rings (packet B)', () => {
  it('puts a space before the gram unit, never "88g"', () => {
    const r = nutritionRings(d);
    expect(r.protein.label).toBe('88 g');
    expect(r.protein.sublabel).toBe('of 160 g');
    expect(r.calories.sublabel).toMatch(/^of 2,?200$/);
  });

  it('speaks both rings in one line, built from ringLabel', () => {
    const r = nutritionRings(d);
    const line = nutritionRingsLabel(r);
    expect(line).toBe(`${ringLabel(r.calories)}. ${ringLabel(r.protein)}`);
    expect(line).toMatch(/^Calories, 1,?420 of 2,?200\. Protein, 88 g of 160 g$/);
  });

  it('says what a tap does', () => {
    expect(NUTRITION_RINGS_HINT).toBe("Opens today's meals");
  });
});
