/**
 * F186 (owner idea R-251, 31 Oct 2026): a new member with no routines is walked through making
 * the first one, in a folder, in four short steps: name the folder, name the routine, pick the
 * exercises, check and save. Each step has one short hint; Skip is always there.
 *
 * The rules here are PURE (who sees the card, which step can go on, the day type a name means,
 * the words). The screen is `app/routines/first.tsx`; the card on the Workout tab is
 * `components/FirstRoutineCard.tsx`; the one stored mark is `services/firstRoutineGuide.ts`.
 *
 * Research (Nov 2026): Hevy shows an empty Workout tab with "New Routine" and a folder icon and no
 * guide; Strong offers templates and asks to save a finished workout as one (templates past a few
 * are paid). Ours: one hint per step, ready routine names to tap (easier than typing on a phone,
 * in a second language), 3 sets per exercise to start, and nothing behind a paywall.
 */
import type { DayType } from '@/types/models';

/** The meta key of the guide's one mark. */
export const GUIDE_KEY = 'first_routine_guide';
/** The mark: Skip was tapped, the routine was saved, or the member already had routines. */
export const GUIDE_DONE = 'done';

/** The folder name the first step starts with (the owner's example). */
export const DEFAULT_FOLDER_NAME = 'My plan';
/** The longest name the fields take (as the New folder sheet). */
export const NAME_MAX = 60;
/** Sets each picked exercise starts with (the routine editor's default too). */
export const START_SETS = 3;
/** Steps in the guide. */
export const STEP_COUNT = 4;

export type GuideStep = 1 | 2 | 3 | 4;

export interface GuideCardInput {
  /** The stored mark; undefined = not read yet. */
  stored: string | null | undefined;
  /** Routines in every folder; null = not read yet. */
  routineCount: number | null;
  /** The welcome demo's sample data is loaded. */
  demo: boolean;
}

/**
 * "Make your first routine" shows only for a member with no routines at all, who has never
 * skipped or finished the guide, outside the demo. Anything not read yet counts as no, so the
 * card never flashes. PURE.
 */
export function guideCardShows(i: GuideCardInput): boolean {
  if (i.stored === undefined || i.stored === GUIDE_DONE) return false;
  if (i.routineCount == null || i.demo) return false;
  return i.routineCount === 0;
}

/**
 * A member seen WITH routines never gets the guide later (deleting them all does not bring it
 * back): the tab saves the mark the first time it sees one. PURE.
 */
export function shouldMarkDone(i: Pick<GuideCardInput, 'stored' | 'routineCount'>): boolean {
  if (i.stored === undefined || i.stored === GUIDE_DONE) return false;
  return i.routineCount != null && i.routineCount > 0;
}

/** Routines in a list of folders. PURE. */
export function countRoutines(folders: readonly { routines: readonly unknown[] }[]): number {
  return folders.reduce((n, f) => n + f.routines.length, 0);
}

/** Ready routine names to tap on step 2, with the day each one is. */
export const ROUTINE_NAME_CHOICES: readonly { label: string; dayType: DayType }[] = [
  { label: 'Push Day', dayType: 'push' },
  { label: 'Pull Day', dayType: 'pull' },
  { label: 'Leg Day', dayType: 'legs' },
  { label: 'Upper Body', dayType: 'upper' },
  { label: 'Lower Body', dayType: 'lower' },
  { label: 'Full Body', dayType: 'full' },
];

/**
 * The day type a typed name means ("Chest and triceps" → push), else full. Upper/lower are
 * read before push/pull/legs so "Upper Push" stays upper. PURE.
 */
export function dayTypeFor(name: string): DayType {
  const n = ` ${name.toLowerCase().replace(/[^a-z]+/g, ' ')} `;
  const has = (...words: string[]): boolean => words.some((w) => n.includes(` ${w}`));
  if (has('upper')) return 'upper';
  if (has('lower')) return 'lower';
  if (has('full', 'whole')) return 'full';
  if (has('push', 'chest', 'tricep', 'shoulder')) return 'push';
  if (has('pull', 'back', 'bicep', 'lats')) return 'pull';
  if (has('leg', 'squat', 'glute', 'quad', 'hamstring', 'calf', 'calves')) return 'legs';
  return 'full';
}

/** A name as saved: trimmed, inner spaces folded, at most NAME_MAX letters. PURE. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}

export interface GuideState {
  folderName: string;
  routineName: string;
  exerciseIds: readonly string[];
}

/** Whether the step's Next (or Save routine) can be tapped. PURE. */
export function canGoOn(step: GuideStep, s: GuideState): boolean {
  if (step === 1) return cleanName(s.folderName).length > 0;
  if (step === 2) return cleanName(s.routineName).length > 0;
  return s.exerciseIds.length > 0;
}

/** The step after this one (4 stays 4). PURE. */
export function nextStep(step: GuideStep): GuideStep {
  return (step < STEP_COUNT ? step + 1 : step) as GuideStep;
}

/** The step before this one, or null on step 1 (Back then leaves the guide). PURE. */
export function prevStep(step: GuideStep): GuideStep | null {
  return step > 1 ? ((step - 1) as GuideStep) : null;
}

/** Each step's heading and its one hint. */
export const STEP_WORDS: Record<GuideStep, { title: string; hint: string }> = {
  1: { title: 'Name your folder', hint: 'A folder keeps your routines together, like a plan for your week.' },
  2: { title: 'Name your routine', hint: 'A routine is the list of exercises for one day. Tap a name or type your own.' },
  3: { title: 'Pick your exercises', hint: 'Tap each exercise you want to do. You can change them later.' },
  4: { title: 'Check and save', hint: `Each exercise starts with ${START_SETS} sets. You can change sets and order any time.` },
};

/** "Step 2 of 4". PURE. */
export function stepLabel(step: GuideStep): string {
  return `Step ${step} of ${STEP_COUNT}`;
}

/** The main button of a step. PURE. */
export function nextLabel(step: GuideStep, picked: number): string {
  if (step === 4) return 'Save routine';
  if (step === 3) return picked === 0 ? 'Pick at least 1 exercise' : `Next (${picked} picked)`;
  return 'Next';
}

/** The card on the Workout tab. */
export const CARD_WORDS = {
  title: 'Make your first routine',
  line: 'A routine is the list of exercises you do on one day. We will help you make one in 4 short steps.',
  go: 'Make a routine',
  skip: 'Skip for now',
} as const;
