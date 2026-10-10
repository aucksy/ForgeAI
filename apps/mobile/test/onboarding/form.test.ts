/**
 * Phase O2 (W1) — onboarding form logic. Pure: no DB, no native, no React.
 *
 * These rules are what stands between a real member and a profile full of
 * guesses, so every branch is pinned here rather than discovered on a device.
 */
import { describe, expect, it } from 'vitest';

import {
  REFERENCE_BODY_WEIGHT_KG,
  checkName,
  computeTargets,
  emptyDraft,
  normalizeName,
  parsePhone,
  validateOnboarding,
  welcomeDraft,
} from '@/onboarding/form';
import type { OnboardingDraft } from '@/onboarding/form';

function draft(patch: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return { ...emptyDraft(), name: 'Rahul Sharma', phone: '9876543210', goal: 'muscle', experience: 'beginner', ...patch };
}

describe('normalizeName', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizeName('  Rahul   Sharma  ')).toBe('Rahul Sharma');
  });

  it('leaves a clean name untouched', () => {
    expect(normalizeName('Aisha')).toBe('Aisha');
  });
});

describe('checkName', () => {
  it('asks for a name when it is blank or only spaces', () => {
    expect(checkName('')).toEqual({ ok: false, message: 'Your name, please.' });
    expect(checkName('   '+'\t'+' ')).toEqual({ ok: false, message: 'Your name, please.' });
  });
  it('keeps names from every script, tidied', () => {
    expect(checkName('  José   María ')).toEqual({ ok: true, name: 'José María' });
    expect(checkName('राहुल शर्मा')).toEqual({ ok: true, name: 'राहुल शर्मा' });
    expect(checkName('李')).toEqual({ ok: true, name: '李' });
  });
  it('refuses a name over 60 characters', () => {
    expect(checkName('a'.repeat(60)).ok).toBe(true);
    expect(checkName('a'.repeat(61)).ok).toBe(false);
  });
});

/**
 * Audit Phase 7 (SH-10, SH-26): the number is optional and any country's number is accepted —
 * no +91 default, no Indian 10-digit rule. A number is 7 to 15 digits with an optional leading
 * "+"; spaces, dashes, dots and brackets are formatting and are dropped.
 */
describe('parsePhone — optional, any country', () => {
  it('blank means "no number", never an error', () => {
    expect(parsePhone('')).toEqual({ ok: true, phone: null });
    expect(parsePhone('    ')).toEqual({ ok: true, phone: null });
  });

  it.each([
    ['India', '+91 98765 43210', '+919876543210'],
    ['India, typed bare', '98765 43210', '9876543210'],
    ['India, a 91xx mobile', '+91 91987 65432', '+919198765432'],
    ['UK', '+44 7700 900123', '+447700900123'],
    ['UK, trunk 0 and brackets', '(07700) 900-123', '07700900123'],
    ['USA', '+1 (415) 555-0123', '+14155550123'],
    ['USA, dots', '415.555.0123', '4155550123'],
    ['UAE', '+971 50 123 4567', '+971501234567'],
    ['Germany', '+49 1512 3456789', '+4915123456789'],
    ['Brazil', '+55 11 91234-5678', '+5511912345678'],
    ['Nigeria', '+234 803 123 4567', '+2348031234567'],
    ['Japan', '+81 90-1234-5678', '+819012345678'],
    ['Australia', '+61 412 345 678', '+61412345678'],
    ['Singapore (8 digits)', '+65 8123 4567', '+6581234567'],
    ['Niue (shortest real: 7 digits incl. code)', '+683 4002', '+6834002'],
    ['15 digits, the longest allowed', '+123456789012345', '+123456789012345'],
  ])('accepts %s', (_country, typed, stored) => {
    expect(parsePhone(typed)).toEqual({ ok: true, phone: stored });
  });

  it("no longer applies India's rule to anyone", () => {
    // Before: "Enter a 10-digit mobile number starting with 6, 7, 8 or 9."
    expect(parsePhone('+91 5876543210').ok).toBe(true);
    expect(parsePhone('1234567890').ok).toBe(true);
  });

  it.each([
    ['too short (6 digits)', '123456'],
    ['too long (16 digits)', '+1234567890123456'],
    ['letters', '98765 ABCDE'],
    ['words', 'call me'],
    ['a + in the middle', '98765+43210'],
    ['two pluses', '++919876543210'],
    ['only a plus', '+'],
    ['only formatting', '--- ()'],
    ['an extension', '+44 20 7946 0958 ext 12'],
    ['emoji', '📞 98765 43210'],
    ['a hash', '#9876543210'],
  ])('refuses %s with one plain line', (_why, typed) => {
    const r = parsePhone(typed);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe('Enter 7 to 15 digits, or leave it blank.');
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
  it('accepts the minimum: a name, a goal and an experience — no number needed', () => {
    const r = validateOnboarding(draft({ phone: '' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe('Rahul Sharma');
    expect(r.value.phoneE164).toBeNull();
    // Nothing invented for the fields the member skipped.
    expect(r.value.age).toBe(0);
    expect(r.value.heightCm).toBe(0);
    expect(r.value.gymName).toBe('');
    expect(r.value.bodyWeightKg).toBeNull();
  });

  it('keeps a number when one is given, from any country', () => {
    const r = validateOnboarding(draft({ phone: '+44 7700 900123' }));
    expect(r.ok && r.value.phoneE164).toBe('+447700900123');
  });

  it('rejects a blank or whitespace-only name', () => {
    const r = validateOnboarding(draft({ name: '   ' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe('name');
    expect(r.message).toBe('Your name, please.');
  });

  it('rejects a bad number and names the phone field', () => {
    const r = validateOnboarding(draft({ phone: '12345' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe('phone');
    expect(r.message).not.toContain('10-digit');
  });

  it('nothing is chosen for the member: goal and experience must be picked (SH-09)', () => {
    expect(welcomeDraft().goal).toBeNull();
    expect(welcomeDraft().experience).toBeNull();
    const noGoal = validateOnboarding(draft({ goal: null }));
    expect(!noGoal.ok && noGoal.field).toBe('goal');
    const noExp = validateOnboarding(draft({ experience: null }));
    expect(!noExp.ok && noExp.field).toBe('experience');
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
