/**
 * Onboarding form logic — PURE (no DB, no native, no React). Phase O2 (W1); Audit Phase 7 (D12).
 *
 * Turns what the member typed on the welcome screen into either a validated
 * `OnboardingInput` (ready to persist) or a single, human-readable error naming
 * the field at fault. Every rule lives here so it is unit-testable without a
 * device: see test/onboarding/form.test.ts.
 *
 * Audit Phase 7 (SH-10, SH-26): the mobile number is OPTIONAL and any country's number is
 * accepted — no default dial code and no one country's rule. A number is "7 to 15 digits,
 * with an optional leading +" (spaces, dashes, dots and brackets allowed while typing).
 * Goal and experience are no longer pre-chosen for the member (SH-09): the welcome asks.
 */
import type { Goal, UserProfile } from '@/types/models';

export type Experience = UserProfile['experience'];

/** Raw text straight off the welcome screen — all strings, nothing coerced yet. */
export interface OnboardingDraft {
  name: string;
  /** Optional. Blank = no number. Any country: "+44 7700 900123", "98765 43210". */
  phone: string;
  /** Null until the member picks one (nothing is chosen for them). */
  goal: Goal | null;
  experience: Experience | null;
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
  /**
   * The mobile number as the member typed it, cleaned to digits with an optional leading +
   * (e.g. '+447700900123' or '9876543210'), or null when they left it blank. Stored locally
   * only; a gym link will verify it later. (The field kept its old name so saved fixtures
   * and callers did not have to change; it is not always E.164 any more.)
   */
  phoneE164: string | null;
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

/**
 * A blank draft with the old defaults (Build muscle, New to lifting) — kept for callers and
 * tests that build a draft in code. The welcome screen starts from `welcomeDraft()` instead.
 */
export function emptyDraft(): OnboardingDraft {
  return {
    name: '',
    phone: '',
    goal: 'muscle',
    experience: 'beginner',
    age: '',
    heightCm: '',
    bodyWeightKg: '',
    gymName: '',
  };
}

/** What the welcome starts from: nothing chosen for the member (SH-09). */
export function welcomeDraft(): OnboardingDraft {
  return {
    name: '',
    phone: '',
    goal: null,
    experience: null,
    age: '',
    heightCm: '',
    bodyWeightKg: '',
    gymName: '',
  };
}

// ---------------------------------------------------------------- name

export const NAME_MAX = 60;

/** Trim + collapse inner whitespace. Keeps display names tidy without mangling them. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** The member's name, or what to tell them. Shared by the welcome and Profile. */
export function checkName(raw: string): { ok: true; name: string } | { ok: false; message: string } {
  const name = normalizeName(raw);
  if (name.length === 0) return { ok: false, message: 'Your name, please.' };
  if (name.length > NAME_MAX) return { ok: false, message: `Keep your name under ${NAME_MAX} characters.` };
  return { ok: true, name };
}

// ---------------------------------------------------------------- phone

export const PHONE_MESSAGE = 'Enter 7 to 15 digits, or leave it blank.';

/**
 * Any country's mobile number, optional. Blank → `{ ok: true, phone: null }` (no number);
 * "+44 7700 900123" → '+447700900123'; "98765-43210" → '9876543210'. Refused: letters, a +
 * anywhere but the front, fewer than 7 or more than 15 digits. No country's own rule is
 * applied — a guessed local rule would refuse real numbers (SH-26).
 */
export function parsePhone(raw: string): { ok: true; phone: string | null } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, phone: null };
  const compact = trimmed.replace(/[\s\-.()]/g, '');
  if (!/^\+?\d+$/.test(compact)) return { ok: false, message: PHONE_MESSAGE };
  const plus = compact.startsWith('+');
  const digits = plus ? compact.slice(1) : compact;
  if (digits.length < 7 || digits.length > 15) return { ok: false, message: PHONE_MESSAGE };
  return { ok: true, phone: plus ? `+${digits}` : digits };
}

// ---------------------------------------------------------------- targets

const ROUND_TO = { calories: 50, macro: 5 } as const;
/** Reference body weight when the member skips the optional field — keeps one code path. */
export const REFERENCE_BODY_WEIGHT_KG = 75;

// Ranges mirror TARGET_RULES in components/settings/profileAutosave.ts (the bounds Profile
// accepts when a target is edited) so a generated target is always re-savable there.
// (Not imported: profileAutosave imports this file.)
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
// v0.27.0: the same ranges typed in inches and pounds (stored in cm and kg as always).
const HEIGHT_RULE_IN: NumRule = { min: 36, max: 98, integer: false, label: 'height' };
const WEIGHT_RULE_LB: NumRule = { min: 44, max: 770, integer: false, label: 'body weight' };
const CM_PER_INCH = 2.54;
const KG_PER_POUND = 0.45359237;
const round1 = (n: number): number => Math.round(n * 10) / 10;

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

export const GYM_NAME_MAX = 60;
export const GOAL_MESSAGE = 'Choose a goal.';
export const EXPERIENCE_MESSAGE = 'Choose your experience.';

/**
 * `units` (v0.27.0): under 'imperial' the height is typed in inches and the body weight in
 * pounds; the result is still cm and kg. Default 'metric' = exactly as before.
 */
export function validateOnboarding(draft: OnboardingDraft, units: 'metric' | 'imperial' = 'metric'): ValidationResult {
  const imperial = units === 'imperial';
  const hRule = imperial ? HEIGHT_RULE_IN : HEIGHT_RULE;
  const wRule = imperial ? WEIGHT_RULE_LB : WEIGHT_RULE;
  const named = checkName(draft.name);
  if (!named.ok) return { ok: false, field: 'name', message: named.message };
  const name = named.name;

  const phone = parsePhone(draft.phone);
  if (!phone.ok) return { ok: false, field: 'phone', message: phone.message };

  if (draft.goal == null) return { ok: false, field: 'goal', message: GOAL_MESSAGE };
  if (draft.experience == null) return { ok: false, field: 'experience', message: EXPERIENCE_MESSAGE };
  const goal = draft.goal;
  const experience = draft.experience;

  const age = parseOptionalNumber(draft.age, AGE_RULE);
  if (age === 'invalid') {
    return { ok: false, field: 'age', message: `Enter an age between ${AGE_RULE.min} and ${AGE_RULE.max}, or leave it blank.` };
  }
  const heightTyped = parseOptionalNumber(draft.heightCm, hRule);
  if (heightTyped === 'invalid') {
    return { ok: false, field: 'heightCm', message: `Enter a height between ${hRule.min} and ${hRule.max} ${imperial ? 'inches' : 'cm'}, or leave it blank.` };
  }
  const weightTyped = parseOptionalNumber(draft.bodyWeightKg, wRule);
  if (weightTyped === 'invalid') {
    return { ok: false, field: 'bodyWeightKg', message: `Enter a body weight between ${wRule.min} and ${wRule.max} ${imperial ? 'lb' : 'kg'}, or leave it blank.` };
  }
  const heightCm = heightTyped != null && imperial ? round1(heightTyped * CM_PER_INCH) : heightTyped;
  // Unrounded: 165 lb must come back as 165 lb, not 164.9 (v0.27.0 review).
  const bodyWeightKg = weightTyped != null && imperial ? weightTyped * KG_PER_POUND : weightTyped;

  const gymName = draft.gymName.trim().replace(/\s+/g, ' ');
  if (gymName.length > GYM_NAME_MAX) {
    return { ok: false, field: 'gymName', message: `Keep the gym name under ${GYM_NAME_MAX} characters.` };
  }

  return {
    ok: true,
    value: {
      name,
      phoneE164: phone.phone,
      goal,
      experience,
      age: age ?? 0,
      heightCm: heightCm ?? 0,
      gymName,
      bodyWeightKg,
      targets: computeTargets(goal, bodyWeightKg),
    },
  };
}
