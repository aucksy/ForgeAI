/**
 * Phase O2 (W1) — onboarding form logic. Pure: no DB, no native, no React.
 *
 * These rules are what stands between a real member and a profile full of
 * guesses, so every branch is pinned here rather than discovered on a device.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DIAL_CODE,
  REFERENCE_BODY_WEIGHT_KG,
  computeTargets,
  emptyDraft,
  normalizeName,
  normalizePhone,
  validateE164,
  validateOnboarding,
} from '@/onboarding/form';
import type { OnboardingDraft } from '@/onboarding/form';

function draft(patch: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return { ...emptyDraft(), name: 'Rahul Sharma', phone: '9876543210', ...patch };
}

describe('normalizeName', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizeName('  Rahul   Sharma  ')).toBe('Rahul Sharma');
  });

  it('leaves a clean name untouched', () => {
    expect(normalizeName('Aisha')).toBe('Aisha');
  });
});

describe('normalizePhone', () => {
  it('builds E.164 from the default +91 dial code', () => {
    expect(normalizePhone(DEFAULT_DIAL_CODE, '9876543210')?.e164).toBe('+919876543210');
  });

  it('accepts spaces, dashes and brackets the member typed', () => {
    expect(normalizePhone('+91', '(98765) 43-210')?.e164).toBe('+919876543210');
  });

  it('strips a trunk 0 typed before an Indian mobile', () => {
    expect(normalizePhone('+91', '09876543210')?.national).toBe('9876543210');
  });

  it('strips a country code re-typed inside the number field', () => {
    expect(normalizePhone('+91', '919876543210')?.e164).toBe('+919876543210');
  });

  it('does NOT strip "91" from a real 10-digit mobile in the 91xx series', () => {
    // The number AS TYPED is already valid, so the duplicate-country-code strip
    // must not fire — stripping would leave 8 digits and lock this member out.
    const parts = normalizePhone('+91', '9198765432');
    expect(parts?.national).toBe('9198765432');
    expect(parts?.e164).toBe('+919198765432');
  });

  it('rejects an Indian number that is not 10 digits', () => {
    expect(normalizePhone('+91', '98765432')).toBeNull();
    expect(normalizePhone('+91', '98765432100')).toBeNull();
  });

  it('rejects an Indian number that does not start 6-9 (landline / bogus)', () => {
    expect(normalizePhone('+91', '5876543210')).toBeNull();
    expect(normalizePhone('+91', '1234567890')).toBeNull();
  });

  it('stays permissive for other countries — export-clean, no guessed local rules', () => {
    // A 9-digit UK mobile and a 10-digit US number both pass; only E.164 length is checked.
    expect(normalizePhone('+44', '7700900123')?.e164).toBe('+447700900123');
    expect(normalizePhone('+1', '4155550123')?.e164).toBe('+14155550123');
    expect(normalizePhone('+971', '501234567')?.e164).toBe('+971501234567');
  });

  it('rejects a non-India number that is too short or too long for E.164', () => {
    expect(normalizePhone('+44', '12345')).toBeNull();
    expect(normalizePhone('+44', '123456789012345')).toBeNull();
  });

  it('rejects an empty number and an impossible dial code', () => {
    expect(normalizePhone('+91', '')).toBeNull();
    expect(normalizePhone('', '9876543210')).toBeNull();
    expect(normalizePhone('+123456', '9876543210')).toBeNull();
  });
});

describe('validateE164 (Settings editor, full number typed)', () => {
  it('accepts a clean international number and strips formatting', () => {
    expect(validateE164(' +91 98765-43210 ')).toBe('+919876543210');
  });

  it('requires the leading +', () => {
    expect(validateE164('919876543210')).toBeNull();
  });

  it('applies the India rule when the number starts +91', () => {
    expect(validateE164('+915876543210')).toBeNull();
    expect(validateE164('+9198765432')).toBeNull();
  });
});

describe('computeTargets', () => {
  it('scales with body weight and goal (muscle @75 kg)', () => {
    // 75 * 33 = 2475 maintenance, +10% = 2722.5 -> 2700 (rounded to 50)
    // protein 1.8 * 75 = 135; fat 25% of 2700 / 9 = 75; carbs = remainder / 4
    expect(computeTargets('muscle', 75)).toEqual({
      calorieTarget: 2700,
      proteinTargetG: 135,
      fatTargetG: 75,
      carbsTargetG: 370,
    });
  });

  it('cuts calories and raises protein for fat loss', () => {
    const cut = computeTargets('fat_loss', 75);
    const gain = computeTargets('muscle', 75);
    expect(cut.calorieTarget).toBeLessThan(gain.calorieTarget);
    expect(cut.proteinTargetG).toBeGreaterThan(gain.proteinTargetG);
  });

  it('falls back to the reference body weight when the member skipped it', () => {
    // Pinned, not just self-compared: the no-weight default IS the 75 kg case.
    expect(computeTargets('muscle', null)).toEqual({
      calorieTarget: 2700,
      proteinTargetG: 135,
      fatTargetG: 75,
      carbsTargetG: 370,
    });
    expect(computeTargets('muscle', null)).toEqual(computeTargets('muscle', REFERENCE_BODY_WEIGHT_KG));
  });

  it('treats a zero/negative weight as "not provided" rather than computing nonsense', () => {
    // 0 kg would otherwise produce a 0-calorie target clamped to the 800 floor.
    // Reference instead: 75*33 = 2475 at factor 1.0 -> round50 rounds .5 UP = 2500.
    expect(computeTargets('general', 0).calorieTarget).toBe(2500);
    expect(computeTargets('general', 0)).toEqual(computeTargets('general', null));
    expect(computeTargets('general', -5)).toEqual(computeTargets('general', null));
  });

  it('clamps to the range Settings can re-save (heavy member)', () => {
    // 350*33*1.1 = 12705 -> 12700, clamped to the 8000 ceiling; protein 630 -> 500.
    const t = computeTargets('muscle', 350);
    expect(t.calorieTarget).toBe(8000);
    expect(t.proteinTargetG).toBe(500);
    expect(t.fatTargetG).toBe(220); // 8000 * 0.25 / 9 = 222.2 -> round5
    expect(t.carbsTargetG).toBe(1005); // (8000 - 2000 - 1980) / 4 = 1005
  });

  it('lifts a very light member up to the calorie floor and re-derives macros from it', () => {
    // 20*33*0.85 = 561 -> 550, clamped UP to the 800 floor; fat/carbs follow the
    // clamped value, not the raw one.
    const t = computeTargets('fat_loss', 20);
    expect(t).toEqual({
      calorieTarget: 800,
      proteinTargetG: 40,
      fatTargetG: 20, // 800 * 0.25 / 9 = 22.2 -> round5
      carbsTargetG: 115, // (800 - 160 - 180) / 4 = 115
    });
  });

  it('keeps macros roughly consistent with the calorie target', () => {
    const t = computeTargets('strength', 82);
    const fromMacros = t.proteinTargetG * 4 + t.carbsTargetG * 4 + t.fatTargetG * 9;
    expect(Math.abs(fromMacros - t.calorieTarget)).toBeLessThanOrEqual(30); // rounding slack
  });
});

describe('validateOnboarding', () => {
  it('accepts the minimum: a name and a mobile number', () => {
    const r = validateOnboarding(draft());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe('Rahul Sharma');
    expect(r.value.phoneE164).toBe('+919876543210');
    // Nothing invented for the fields the member skipped.
    expect(r.value.age).toBe(0);
    expect(r.value.heightCm).toBe(0);
    expect(r.value.gymName).toBe('');
    expect(r.value.bodyWeightKg).toBeNull();
  });

  it('rejects a blank or whitespace-only name', () => {
    const r = validateOnboarding(draft({ name: '   ' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe('name');
  });

  it('rejects a bad number and names the phone field', () => {
    const r = validateOnboarding(draft({ phone: '12345' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe('phone');
    expect(r.message).toContain('10-digit');
  });

  it('gives a country-neutral message when the dial code is not India', () => {
    const r = validateOnboarding(draft({ dialCode: '+44', phone: '1' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).not.toContain('10-digit');
  });

  it('carries the optional numbers through when they are sane', () => {
    const r = validateOnboarding(draft({ age: '31', heightCm: '178', bodyWeightKg: '82.4', gymName: '  Iron  Temple ' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.age).toBe(31);
    expect(r.value.heightCm).toBe(178);
    expect(r.value.bodyWeightKg).toBe(82.4);
    expect(r.value.gymName).toBe('Iron Temple');
  });

  it('rejects an out-of-range or non-integer age', () => {
    expect(validateOnboarding(draft({ age: '4' })).ok).toBe(false);
    expect(validateOnboarding(draft({ age: '140' })).ok).toBe(false);
    expect(validateOnboarding(draft({ age: '31.5' })).ok).toBe(false);
    expect(validateOnboarding(draft({ age: 'thirty' })).ok).toBe(false);
  });

  it('rejects numeric literals Number() would silently accept', () => {
    expect(validateOnboarding(draft({ age: '0x20' })).ok).toBe(false);
    expect(validateOnboarding(draft({ age: '1e2' })).ok).toBe(false);
    expect(validateOnboarding(draft({ heightCm: ' 178 ' })).ok).toBe(true); // padding is fine
  });

  it('accepts a decimal comma for weight and height', () => {
    const r = validateOnboarding(draft({ bodyWeightKg: '82,4' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.bodyWeightKg).toBe(82.4);
  });

  it('rejects an impossible height or body weight', () => {
    expect(validateOnboarding(draft({ heightCm: '20' })).ok).toBe(false);
    expect(validateOnboarding(draft({ heightCm: '400' })).ok).toBe(false);
    expect(validateOnboarding(draft({ bodyWeightKg: '5' })).ok).toBe(false);
    expect(validateOnboarding(draft({ bodyWeightKg: '900' })).ok).toBe(false);
  });

  it('allows a decimal height but not a decimal age', () => {
    expect(validateOnboarding(draft({ heightCm: '178.5' })).ok).toBe(true);
    expect(validateOnboarding(draft({ age: '30.5' })).ok).toBe(false);
  });

  it('derives targets from the goal and the body weight when given', () => {
    const r = validateOnboarding(draft({ goal: 'fat_loss', bodyWeightKg: '90' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Hand-derived: 90*33 = 2970, *0.85 = 2524.5 -> 2500; protein 2.0*90 = 180;
    // fat 2500*0.25/9 = 69.4 -> 70; carbs (2500 - 720 - 630)/4 = 287.5 -> 290.
    expect(r.value.targets).toEqual({
      calorieTarget: 2500,
      proteinTargetG: 180,
      fatTargetG: 70,
      carbsTargetG: 290,
    });
  });
});
