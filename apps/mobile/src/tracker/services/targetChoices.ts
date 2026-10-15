/**
 * Oct 2026 (owner: "the suggestions must be scientific and follow two simple settings") — the
 * words of Settings → Workouts → "Weight jumps" and "Rep range". PURE (the screen draws them:
 * `components/WorkoutPrefsCard.tsx`; the rules live in `engine/progression.ts` and
 * `engine/repRanges.ts`).
 *
 * Research behind the choices: progressive-overload guidance adds about 2–10% once every set
 * reaches the top of the rep range (ACSM), and muscle grows across a wide band of reps when sets
 * end close to failure, while heavier, lower-rep work builds the most strength (Schoenfeld et al.
 * 2017 / 2021). So: three jump sizes with the middle one recommended, and the member's own goal
 * as the recommended rep range.
 */
import type { WeightJump } from '../engine/progression';
import type { RepRangeChoice } from '../engine/repRanges';

export interface PrefChoice<T extends string> {
  value: T;
  label: string;
  /** One plain line under the label. */
  detail: string;
  /** The default, tagged "Recommended". */
  recommended?: boolean;
}

export const WEIGHT_JUMP_CHOICES: readonly PrefChoice<WeightJump>[] = [
  { value: 'small', label: 'Small', detail: 'About 2.5% more each time' },
  { value: 'standard', label: 'Standard', detail: 'About 5% more each time', recommended: true },
  { value: 'large', label: 'Large', detail: 'About 10% more each time' },
];

/** The line under "Weight jumps" (the row and the sheet). */
export const WEIGHT_JUMP_HELP = "How much to add when you reach the top of your reps. We always use your gym's smallest plates.";

export const REP_RANGE_CHOICES: readonly PrefChoice<RepRangeChoice>[] = [
  { value: 'goal', label: 'Match my goal', detail: 'Set for each exercise from the goal in your profile', recommended: true },
  { value: 'strength', label: 'Strength', detail: '3–6 reps on big compound lifts, 6–10 on the rest' },
  { value: 'muscle', label: 'Muscle', detail: '6–10 on big lifts, 8–12 on the rest, 10–15 on small isolation moves' },
  { value: 'higher', label: 'Higher reps', detail: '12–20 reps on every exercise' },
];

/** The line under "Rep range" (the row and the sheet). */
export const REP_RANGE_HELP = 'Muscle grows in any of these if you finish close to your limit. Strength likes fewer reps.';
/** Said once in the sheet: a range the member or a trainer set by hand is never changed. */
export const REP_RANGE_KEEP = 'Exercises with a range you set yourself keep it.';

/** The choice's label for a value (the first choice for one this version does not know). PURE. */
export function choiceLabel<T extends string>(choices: readonly PrefChoice<T>[], value: T): string {
  return (choices.find((c) => c.value === value) ?? choices[0]).label;
}

/** The chosen value's one plain line (shown under the row; the longer why lives in the sheet). PURE. */
export function choiceDetail<T extends string>(choices: readonly PrefChoice<T>[], value: T): string {
  return (choices.find((c) => c.value === value) ?? choices[0]).detail;
}
