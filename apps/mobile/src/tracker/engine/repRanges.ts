/**
 * Default rep range for an exercise added to a routine — PURE.
 *
 * Picked from the member's goal (already in the profile) and the kind of exercise
 * (already in the catalogue), so the member answers no new question. Only used for NEW
 * routine rows: a range the member or a trainer set is never overwritten.
 * Evidence: `Resources/Progressive-Overload-Research-v3.docx` §3.
 */
import type { Exercise, Goal, UserProfile } from '@/types/models';

export type ExerciseKind = 'big' | 'mid' | 'small';

/** Big = compound barbell lifts and the leg press; Mid = other compounds; Small = single-joint. */
export function exerciseKind(ex: Pick<Exercise, 'name' | 'equipment' | 'isCompound'>): ExerciseKind {
  if (!ex.isCompound) return 'small';
  if (ex.equipment === 'barbell' || /leg press/i.test(ex.name)) return 'big';
  return 'mid';
}

type Range = { repRangeMin: number; repRangeMax: number };
const r = (repRangeMin: number, repRangeMax: number): Range => ({ repRangeMin, repRangeMax });

const MUSCLE: Record<ExerciseKind, Range> = { big: r(6, 10), mid: r(8, 12), small: r(10, 15) };
const STRENGTH: Record<ExerciseKind, Range> = { big: r(3, 6), mid: r(6, 10), small: r(8, 12) };
const STRENGTH_BEGINNER: Record<ExerciseKind, Range> = { big: r(5, 8), mid: r(6, 10), small: r(8, 12) };
const GENERAL: Record<ExerciseKind, Range> = { big: r(8, 12), mid: r(8, 12), small: r(10, 15) };

export function defaultRepRange(
  ex: Pick<Exercise, 'name' | 'equipment' | 'isCompound'>,
  goal: Goal | null | undefined,
  experience: UserProfile['experience'] | null | undefined,
): Range {
  const kind = exerciseKind(ex);
  switch (goal) {
    case 'strength':
      return (experience === 'beginner' ? STRENGTH_BEGINNER : STRENGTH)[kind];
    case 'general':
      return GENERAL[kind];
    case 'muscle':
    case 'fat_loss': // train like "build muscle" to keep muscle while dieting
      return MUSCLE[kind];
    default:
      return r(8, 12); // no profile: today's old default
  }
}

// ---------------------------------------------------------------- the member's "Rep range" setting

/**
 * Settings → Workouts → Rep range (Oct 2026, owner). "goal" (Recommended, the default) keeps the
 * per-goal tables above; the others set every routine row that still has its default range.
 */
export type RepRangeChoice = 'goal' | 'strength' | 'muscle' | 'higher';

/** A choice this version knows. PURE. */
export function isRepRangeChoice(v: unknown): v is RepRangeChoice {
  return v === 'goal' || v === 'strength' || v === 'muscle' || v === 'higher';
}

/** Strength: 3–6 on the big compound lifts, 6–10 on everything else. */
const CHOICE_STRENGTH: Record<ExerciseKind, Range> = { big: r(3, 6), mid: r(6, 10), small: r(6, 10) };
/** Muscle: 6–10 big lifts, 8–12 other compounds, 10–15 small isolation moves. */
const CHOICE_MUSCLE: Record<ExerciseKind, Range> = MUSCLE;
/** Higher reps: 12–20 on everything. */
const CHOICE_HIGHER: Record<ExerciseKind, Range> = { big: r(12, 20), mid: r(12, 20), small: r(12, 20) };

/** The range a choice gives this exercise; null for "goal" (the routine row's own). PURE. */
export function choiceRepRange(ex: Pick<Exercise, 'name' | 'equipment' | 'isCompound'>, choice: RepRangeChoice): Range | null {
  const kind = exerciseKind(ex);
  switch (choice) {
    case 'strength':
      return CHOICE_STRENGTH[kind];
    case 'muscle':
      return CHOICE_MUSCLE[kind];
    case 'higher':
      return CHOICE_HIGHER[kind];
    default:
      return null;
  }
}

/**
 * The range a Target uses for a routine row. A row whose range is still the default for the
 * member's goal (what the app gave it) follows the choice; a row the member or a trainer edited
 * keeps its own range, whatever the choice. PURE.
 */
export function rangeForRow(
  row: Range,
  ex: Pick<Exercise, 'name' | 'equipment' | 'isCompound'>,
  choice: RepRangeChoice,
  goal: Goal | null | undefined,
  experience: UserProfile['experience'] | null | undefined,
): Range {
  const chosen = choiceRepRange(ex, choice);
  if (!chosen) return row;
  const def = defaultRepRange(ex, goal, experience);
  return def.repRangeMin === row.repRangeMin && def.repRangeMax === row.repRangeMax ? chosen : row;
}
