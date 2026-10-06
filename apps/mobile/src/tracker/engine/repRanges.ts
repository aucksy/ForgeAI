/**
 * Default rep range for an exercise added to a routine — PURE.
 *
 * Picked from the member's goal (already in the profile) and the kind of exercise
 * (already in the catalogue), so the member answers no new question. Only used for NEW
 * routine rows: a range the member or a trainer set is never overwritten.
 * Evidence: `Resources/Progressive-Overload-Research-v1.docx` §3.
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
