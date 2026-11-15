/**
 * R-572 (owner, 15 Nov 2026: "Yes go with A"): the words and groups of the "New exercise" / "Edit exercise"
 * form's Details rows and the sheets they open. PURE (test/tracker/exerciseFormChoices.test.ts).
 *
 * The form shows one row per fact (label left, current value right); a tap opens a sheet to change that
 * one thing. The muscle sheets group the chips under small headings, top of the body to the bottom.
 */
import { MUSCLE_LABEL, type Muscle } from '@/tracker/catalog/muscles';

export interface MuscleGroupChoice {
  title: string;
  muscles: readonly Muscle[];
}

/** The muscle sheets' headings, in this order; every muscle sits under exactly one. */
export const MUSCLE_GROUPS: readonly MuscleGroupChoice[] = [
  { title: 'Chest and shoulders', muscles: ['chest', 'front_delts', 'side_delts', 'rear_delts'] },
  { title: 'Back', muscles: ['lats', 'upper_back', 'traps', 'lower_back'] },
  { title: 'Arms and core', muscles: ['biceps', 'triceps', 'forearms', 'abs', 'obliques'] },
  { title: 'Legs', muscles: ['glutes', 'quads', 'hamstrings', 'adductors', 'abductors', 'calves'] },
  { title: 'Other', muscles: ['cardio'] },
];

/** The groups without one muscle (the main one, in "Also works"); a group left empty is dropped. */
export function groupsWithout(exclude: Muscle | null): MuscleGroupChoice[] {
  return MUSCLE_GROUPS.map((g) => ({ title: g.title, muscles: g.muscles.filter((m) => m !== exclude) })).filter((g) => g.muscles.length > 0);
}

/** "Also works" row value: "None", "Front shoulders, Traps", or "Front shoulders, Traps and 2 more". */
export function alsoWorksText(secondary: readonly Muscle[], main: Muscle | null): string {
  const names = secondary.filter((m) => m !== main).map((m) => MUSCLE_LABEL[m]);
  if (names.length === 0) return 'None';
  if (names.length <= 2) return names.join(', ');
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** "Joints it moves": the row's short value and the sheet's choice. */
export const JOINT_WORDS = {
  one: { row: 'One (isolation)', choice: 'One joint (isolation)', detail: 'Like a curl or a lateral raise.' },
  several: { row: 'Several (compound)', choice: 'Several joints (compound)', detail: 'Like a squat, a bench press or a row.' },
} as const;

/** The value a row shows when nothing is picked yet (Save then says what is missing). */
export const NOT_PICKED = 'Pick one';

/** Each sheet's line under its title: one plain sentence or two. */
export const SHEET_WORDS = {
  type: 'Pick what you write down for each set.',
  dist: 'Pick how you measure the distance.',
  muscle: 'Pick the muscle this exercise works most.',
  equipment: 'Pick what you use for this exercise.',
  also: 'Pick the other muscles it works, if any. Tap a muscle again to take it off.',
  bodyweight: 'Pick "Counts" when you lift your own body, like in a pull-up or a dip.',
  joints: 'Pick how many joints bend when you do this exercise.',
  step: 'Pick the smallest weight you can add on this exercise.',
} as const;

/** The photo or video card and its sheet. `sec` is the longest video (MAX_VIDEO_SEC). */
export function mediaWords(sec: number, isLibrary: boolean) {
  return {
    add: 'Add photo or video',
    addLine: isLibrary
      ? "A photo of your gym's machine helps you find it. It shows instead of our picture."
      : "A photo of your gym's machine helps you find it. It shows as this exercise's picture.",
    busy: 'Adding your photo or video…',
    sheetTitle: 'Add your photo or video',
    changeTitle: 'Change your photo or video',
    sheetLine: `It stays on this phone. A video can be up to ${sec} seconds, and it plays without sound when you tap the exercise's picture.`,
    gallery: 'Choose from your gallery',
    galleryLine: 'Pick a photo or a video you already have.',
    photo: 'Take a photo',
    photoLine: 'Your camera opens so you can take one now.',
    video: 'Record a video',
    videoLine: `You can record up to ${sec} seconds.`,
    cancel: 'Cancel',
    change: 'Change',
    remove: 'Remove',
    setLine: isLibrary ? 'It shows instead of our picture.' : "It shows as this exercise's picture.",
  };
}
