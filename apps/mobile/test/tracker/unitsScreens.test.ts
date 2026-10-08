import { describe, expect, it } from 'vitest';

import { trimNum } from '@/lib/format';
import { KG_PER_LB } from '@/lib/units';
import { emptyDraft, validateOnboarding } from '@/onboarding/form';
import {
  distWord,
  incrementChoices,
  kgToTyped,
  parseTyped,
  pickedIncrement,
  showW,
  showWU,
  typedToKg,
  typedWeightMatches,
  weightLabel,
} from '@/tracker/components/unitText';
import { barOptionsKg, computePlates, defaultBarKg, platesKg } from '@/tracker/services/plateMath';

describe('v0.27.0 screens: weights shown and typed', () => {
  it('metric shows exactly what trimNum showed before', () => {
    for (const kg of [0, 1.25, 20, 62.5, 82.25, 100, 137.75]) {
      expect(showW(kg, 'metric')).toBe(trimNum(kg));
    }
    expect(showWU(62.5, 'metric')).toBe('62.5 kg');
  });

  it('imperial shows pounds', () => {
    expect(showW(100, 'imperial')).toBe('220.5');
    expect(showWU(135 * KG_PER_LB, 'imperial')).toBe('135 lb');
  });

  it('parses typed numbers, commas included', () => {
    expect(parseTyped('82,5')).toBe(82.5);
    expect(parseTyped('  ')).toBeNull();
    expect(parseTyped('abc')).toBeNull();
    expect(parseTyped('8', true)).toBe(8);
  });

  it('metric typing round-trips as before (String / parseFloat)', () => {
    expect(typedToKg('82.5', 'metric')).toBe(82.5);
    expect(typedToKg('', 'metric')).toBeNull();
    expect(kgToTyped(82.5, 'metric')).toBe('82.5');
    expect(kgToTyped(null, 'metric')).toBe('');
    expect(typedWeightMatches('82.', 82, 'metric')).toBe(true);
  });

  it('typed pounds are stored as kg and never rewritten mid-typing', () => {
    const kg = typedToKg('135', 'imperial');
    expect(kg).toBeCloseTo(61.235, 3);
    expect(typedWeightMatches('135', kg, 'imperial')).toBe(true);
    expect(typedWeightMatches('135.', kg, 'imperial')).toBe(true);
    expect(kgToTyped(kg, 'imperial')).toBe('135');
    // A value stored in kg (auto-fill from last time) shows as tidy pounds.
    expect(kgToTyped(100, 'imperial')).toBe('220.5');
    expect(typedWeightMatches('100', 100, 'imperial')).toBe(false);
  });

  it('a typed 135 lb loads exactly on the pound bar', () => {
    const kg = typedToKg('135', 'imperial') as number;
    const r = computePlates(kg, defaultBarKg('imperial'), platesKg('imperial'));
    expect(r.exact).toBe(true);
    expect(r.perSide.map((p) => showW(p, 'imperial'))).toEqual(['45']);
    expect(barOptionsKg('imperial').map((b) => showW(b, 'imperial'))).toEqual(['45', '35', '15']);
  });

  it('spoken labels: kilograms under metric (device flows), pounds under imperial', () => {
    expect(weightLabel('weight', 'metric')).toBe('Weight in kilograms');
    expect(weightLabel('assisted', 'metric')).toBe('Assistance in kilograms');
    expect(weightLabel('weighted', 'metric')).toBe('Added weight in kilograms');
    expect(weightLabel('weight', 'imperial')).toBe('Weight in pounds');
    expect(distWord('km')).toBe('kilometres');
    expect(distWord('mi')).toBe('miles');
    expect(distWord('m')).toBe('metres');
  });
});

describe('v0.27.0 custom exercise increment chips', () => {
  it('kg chips are unchanged', () => {
    expect(incrementChoices('metric').map((c) => c.label)).toEqual(['0.5 kg', '1 kg', '2.5 kg', '5 kg']);
    expect(pickedIncrement(2.5, 'metric')).toBe(2);
    expect(pickedIncrement(2, 'metric')).toBe(-1);
  });

  it('lb chips store kg and light the nearest pound step', () => {
    const c = incrementChoices('imperial');
    expect(c.map((x) => x.label)).toEqual(['1 lb', '2.5 lb', '5 lb', '10 lb']);
    expect(c[2].kg).toBeCloseTo(5 * KG_PER_LB, 9);
    expect(pickedIncrement(c[3].kg, 'imperial')).toBe(3);
    expect(pickedIncrement(2.5, 'imperial')).toBe(2); // a 2.5 kg exercise shows "5 lb"
  });
});

describe('v0.27.0 onboarding in pounds and inches', () => {
  const draft = { ...emptyDraft(), name: 'Sam', dialCode: '+91', phone: '9876543210' };

  it('metric is unchanged', () => {
    const r = validateOnboarding({ ...draft, heightCm: '178', bodyWeightKg: '82.4' });
    expect(r.ok && r.value.heightCm).toBe(178);
    expect(r.ok && r.value.bodyWeightKg).toBe(82.4);
  });

  it('imperial reads inches and pounds, stores cm and kg', () => {
    const r = validateOnboarding({ ...draft, heightCm: '70', bodyWeightKg: '180' }, 'imperial');
    expect(r.ok && r.value.heightCm).toBe(177.8);
    // v0.27.0 review: stored unrounded, so 180 lb comes back as 180 lb.
    expect(r.ok && r.value.bodyWeightKg).toBeCloseTo(81.6466, 4);
  });

  it('imperial ranges and words', () => {
    const r = validateOnboarding({ ...draft, bodyWeightKg: '20' }, 'imperial');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('lb');
    const h = validateOnboarding({ ...draft, heightCm: '178' }, 'imperial');
    expect(!h.ok && h.message).toContain('inches');
  });
});
