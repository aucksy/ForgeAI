/**
 * Onboarding form logic — PURE (no DB, no native, no React). Phase O2 (W1).
 *
 * Turns what the member typed on the welcome screen into either a validated
 * `OnboardingInput` (ready to persist) or a single, human-readable error naming
 * the field at fault. Every rule lives here so it is unit-testable without a
 * device: see test/onboarding/form.test.ts.
 *
 * Export-clean per VISION.md: the dial code is data, not a constant. India (+91)
 * gets the strict 10-digit/6-9-start rule we actually know; every other country
 * falls back to a permissive E.164 length check rather than a wrong local rule.
 */
import type { Goal, UserProfile } from '@/types/models';

export type Experience = UserProfile['experience'];

/** Raw text straight off the welcome screen — all strings, nothing coerced yet. */
export interface OnboardingDraft {
  name: string;
  dialCode: string;
  phone: string;
  goal: Goal;
  experience: Experience;
  /** Optional — blank means "not provided", never a made-up number. */
  age: string;
  heightCm: string;
  bodyWeightKg: string;
  gymName: string;
}

export interface NutritionTargets {
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
}

/** Validated, ready to write. `0` / `''` / `null` mean "member didn't say". */
export interface OnboardingInput {
  name: string;
  /** E.164, e.g. '+919876543210'. Stored locally; verification comes with the gym link. */
  phoneE164: string;
  goal: Goal;
  experience: Experience;
  age: number;
  heightCm: number;
  gymName: string;
  bodyWeightKg: number | null;
  targets: NutritionTargets;
}

export type ValidationResult =
  | { ok: true; value: OnboardingInput }
  | { ok: false; field: keyof OnboardingDraft; message: string };

export const DEFAULT_DIAL_CODE = '+91';

export function emptyDraft(): OnboardingDraft {
  return {
    name: '',
    dialCode: DEFAULT_DIAL_CODE,
    phone: '',
    goal: 'muscle',
    experience: 'beginner',
    age: '',
    heightCm: '',
    bodyWeightKg: '',
    gymName: '',
  };
}

// ---------------------------------------------------------------- name

const NAME_MAX = 60;

/** Trim + collapse inner whitespace. Keeps display names tidy without mangling them. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------- phone

/** Digits of the dial code, without the '+'. */
function dialDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

export interface PhoneParts {
  dialCode: string; // '+91'
  national: string; // '9876543210'
  e164: string; // '+919876543210'
}

/** Is `national` a plausible subscriber number for this dial code? */
function isValidNational(dial: string, national: string): boolean {
  if (dial === '91') {
    // The one country whose rule we actually know: 10 digits, starts 6-9.
    return /^[6-9]\d{9}$/.test(national);
  }
  // Everywhere else: permissive E.164 length only — a guessed local rule would
  // reject real numbers the day we sell outside India.
  return national.length >= 6 && national.length <= 14;
}

/**
 * Normalise a dial code + typed number into E.164, or null when it can't be one.
 * Accepts spaces, dashes, brackets and a leading 0 or +<dial> the member may have
 * typed inside the number field itself.
 *
 * The interesting case: a real Indian mobile can START with the digits of its own
 * dial code (the 91xxxxxxxx series), so blindly stripping a "duplicate" country
 * code would reject a valid number and lock that member out of onboarding. We
 * therefore build candidates and take the first that is actually valid. Where the
 * length rule is known (India) the number AS TYPED wins; where it isn't, the
 * dial-stripped reading wins, because a permissive length check can't tell the two
 * apart and a re-typed country code is by far the likelier intent.
 */
export function normalizePhone(dialCodeRaw: string, phoneRaw: string): PhoneParts | null {
  const dial = dialDigits(dialCodeRaw);
  if (dial.length < 1 || dial.length > 4) return null;

  const digits = phoneRaw.replace(/\D/g, '');
  if (digits.length === 0) return null;

  const asTyped = digits;
  const dialStripped =
    digits.length > dial.length && digits.startsWith(dial) ? digits.slice(dial.length) : null;
  // Indian/UK habit: a trunk '0' before the mobile number.
  const trunkStripped = digits.replace(/^0+/, '');

  const candidates =
    dial === '91'
      ? [asTyped, dialStripped, trunkStripped]
      : [dialStripped, asTyped, trunkStripped];

  for (const national of candidates) {
    if (national && isValidNational(dial, national)) {
      return { dialCode: `+${dial}`, national, e164: `+${dial}${national}` };
    }
  }
  return null;
}

/**
 * Validate a number the member typed IN FULL, including the '+' (the Settings
 * editor, where splitting a stored E.164 back into dial code + national digits
 * would be guesswork). Returns the cleaned E.164 or null.
 */
export function validateE164(raw: string): string | null {
  const trimmed = raw.trim().replace(/[\s()-]/g, '');
  if (!/^\+\d{7,15}$/.test(trimmed)) return null;
  // The one rule we actually know: Indian mobiles are 10 digits starting 6-9.
  if (trimmed.startsWith('+91') && !/^\+91[6-9]\d{9}$/.test(trimmed)) return null;
  return trimmed;
}

// ---------------------------------------------------------------- targets

const ROUND_TO = { calories: 50, macro: 5 } as const;
/** Reference body weight when the member skips the optional field — keeps one code path. */
export const REFERENCE_BODY_WEIGHT_KG = 75;

// Ranges mirror the editable bounds in components/settings/ProfileCard so a
// generated target is always re-savable there.
const LIMITS = {
  calorieTarget: { min: 800, max: 8000 },
  proteinTargetG: { min: 20, max: 500 },
  carbsTargetG: { min: 0, max: 1200 },
  fatTargetG: { min: 0, max: 400 },
} as const;

const PROTEIN_PER_KG: Record<Goal, number> = {
  muscle: 1.8,
  strength: 1.8,
  fat_loss: 2.0,
  general: 1.5,
};

const CALORIE_FACTOR: Record<Goal, number> = {
  muscle: 1.1,
  strength: 1.05,
  fat_loss: 0.85,
  general: 1.0,
};

/** Moderately-active maintenance estimate, kcal per kg of body weight. */
const MAINTENANCE_KCAL_PER_KG = 33;

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, { min, max }: { min: number; max: number }): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Starting daily targets from goal + (optional) body weight. Deliberately a rough,
 * honest estimate the member can edit in Settings — not a claim of precision.
 * Order matters: calories are clamped first, then protein, then fat as 25% of the
 * final calories, and carbs take whatever is left (never negative).
 */
export function computeTargets(goal: Goal, bodyWeightKg: number | null): NutritionTargets {
  const kg = bodyWeightKg && bodyWeightKg > 0 ? bodyWeightKg : REFERENCE_BODY_WEIGHT_KG;

  const calorieTarget = clamp(
    roundTo(kg * MAINTENANCE_KCAL_PER_KG * CALORIE_FACTOR[goal], ROUND_TO.calories),
    LIMITS.calorieTarget,
  );
  const proteinTargetG = clamp(
    roundTo(kg * PROTEIN_PER_KG[goal], ROUND_TO.macro),
    LIMITS.proteinTargetG,
  );
  const fatTargetG = clamp(
    roundTo((calorieTarget * 0.25) / 9, ROUND_TO.macro),
    LIMITS.fatTargetG,
  );
  const carbsKcal = calorieTarget - proteinTargetG * 4 - fatTargetG * 9;
  const carbsTargetG = clamp(roundTo(Math.max(0, carbsKcal) / 4, ROUND_TO.macro), LIMITS.carbsTargetG);

  return { calorieTarget, proteinTargetG, carbsTargetG, fatTargetG };
}

// ---------------------------------------------------------------- optional numbers

interface NumRule {
  min: number;
  max: number;
  integer: boolean;
  label: string;
}

const AGE_RULE: NumRule = { min: 10, max: 100, integer: true, label: 'age' };
const HEIGHT_RULE: NumRule = { min: 90, max: 250, integer: false, label: 'height' };
const WEIGHT_RULE: NumRule = { min: 20, max: 350, integer: false, label: 'body weight' };

/** Blank → null (not provided). Anything present must be a sane number. */
function parseOptionalNumber(raw: string, rule: NumRule): number | null | 'invalid' {
  // Accept a decimal comma (common outside the US/UK) but nothing exotic: bare
  // `Number()` would happily take '0x10' and '1e2' as an age.
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed.length === 0) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 'invalid';
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return 'invalid';
  if (rule.integer && !Number.isInteger(n)) return 'invalid';
  if (n < rule.min || n > rule.max) return 'invalid';
  return n;
}

// ---------------------------------------------------------------- validation

const GYM_NAME_MAX = 60;

export function validateOnboarding(draft: OnboardingDraft): ValidationResult {
  const name = normalizeName(draft.name);
  if (name.length === 0) {
    return { ok: false, field: 'name', message: 'Enter your name so your coach knows who you are.' };
  }
  if (name.length > NAME_MAX) {
    return { ok: false, field: 'name', message: `Keep your name under ${NAME_MAX} characters.` };
  }

  const phone = normalizePhone(draft.dialCode, draft.phone);
  if (!phone) {
    return {
      ok: false,
      field: 'phone',
      message:
        dialDigits(draft.dialCode) === '91'
          ? 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9.'
          : 'Enter a valid mobile number for that country code.',
    };
  }

  const age = parseOptionalNumber(draft.age, AGE_RULE);
  if (age === 'invalid') {
    return { ok: false, field: 'age', message: `Enter an age between ${AGE_RULE.min} and ${AGE_RULE.max}, or leave it blank.` };
  }
  const heightCm = parseOptionalNumber(draft.heightCm, HEIGHT_RULE);
  if (heightCm === 'invalid') {
    return { ok: false, field: 'heightCm', message: `Enter a height between ${HEIGHT_RULE.min} and ${HEIGHT_RULE.max} cm, or leave it blank.` };
  }
  const bodyWeightKg = parseOptionalNumber(draft.bodyWeightKg, WEIGHT_RULE);
  if (bodyWeightKg === 'invalid') {
    return { ok: false, field: 'bodyWeightKg', message: `Enter a body weight between ${WEIGHT_RULE.min} and ${WEIGHT_RULE.max} kg, or leave it blank.` };
  }

  const gymName = draft.gymName.trim().replace(/\s+/g, ' ');
  if (gymName.length > GYM_NAME_MAX) {
    return { ok: false, field: 'gymName', message: `Keep the gym name under ${GYM_NAME_MAX} characters.` };
  }

  return {
    ok: true,
    value: {
      name,
      phoneE164: phone.e164,
      goal: draft.goal,
      experience: draft.experience,
      age: age ?? 0,
      heightCm: heightCm ?? 0,
      gymName,
      bodyWeightKg,
      targets: computeTargets(draft.goal, bodyWeightKg),
    },
  };
}
