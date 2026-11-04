/**
 * F60 Quick workout: "I have 30 minutes" (OWNER-INBOX #58, item 8). PURE. Rules, no AI.
 *
 * The member picks the time (20, 30, 45 or 60 minutes) and the body parts (by default the ones
 * most ready, F59). The exercises come from the plan builder's own movement slots and filters
 * (`builder.slotChoices`: level, equipment, sore areas, the "never give me" list), with one
 * change: among the exercises that fit a slot, one the member has done before wins, the most
 * recent first, so the weights from last time are there to beat. Big lifts first.
 *
 * Time: about 2½ minutes for a set of a big lift and 1¾ for a small one (the set and its rest),
 * plus a minute to move to each exercise. Every exercise starts at 3 sets (a beginner's small
 * lifts 2); sets come off (small lifts first, never under 2) and then the last exercise goes until
 * it fits the time; then sets go on (up to 4, a beginner 3) while it still fits.
 */
import type { CatalogEntry } from '../catalog/types';
import { defaultRepRange } from '../engine/repRanges';
import { BODY_PART_LABEL, type BodyPart } from '../engine/readiness';
import type { Goal } from '@/types/models';

import { SLOT_FALLBACK, slotChoices, type Level, type SlotId } from './builder';
import type { FitContext } from './fit';

export const QUICK_MINUTES: readonly number[] = [20, 30, 45, 60];

/** How many exercises a quick workout of this length starts from. */
export function quickExerciseCount(minutes: number): number {
  if (minutes <= 20) return 3;
  if (minutes <= 30) return 4;
  if (minutes <= 45) return 5;
  return 6;
}

/** Each body part's movement slots, in the order they are taken. */
const PART_SLOTS: Record<BodyPart, readonly SlotId[]> = {
  chest: ['h_push', 'incline_push', 'chest_iso'],
  back: ['v_pull', 'h_pull', 'h_pull', 'v_pull'],
  shoulders: ['v_push', 'side_delt', 'rear_delt'],
  arms: ['biceps', 'triceps', 'biceps', 'triceps'],
  legs: ['squat', 'hinge', 'lunge', 'leg_curl', 'calves', 'quad_iso'],
  core: ['core', 'core'],
};

/** Big lifts first, small ones and abs last. */
const SLOT_ORDER: readonly SlotId[] = [
  'squat', 'hinge', 'h_push', 'v_pull', 'v_push', 'h_pull', 'incline_push', 'lunge', 'glute', 'back_ext',
  'leg_curl', 'quad_iso', 'chest_iso', 'side_delt', 'rear_delt', 'biceps', 'triceps', 'calves', 'core',
];

/** Minutes per set (with its rest) and per exercise. */
export const BIG_SET_MIN = 2.5;
export const SMALL_SET_MIN = 1.75;
export const MOVE_MIN = 1;

/** What the member did with an exercise (by library key): last time and how often. */
export interface QuickHistory {
  /** The newest day it was done. */
  lastISO: string;
  /** Workouts with it (in the window read). */
  times: number;
  /** Last time's best working set: the heaviest weight, then the most reps (0 kg for body weight). */
  lastKg: number;
  lastReps: number;
}

export interface QuickInput extends FitContext {
  minutes: number;
  parts: readonly BodyPart[];
  level: Level;
  goal: Goal;
  history: ReadonlyMap<string, QuickHistory>;
}

export interface QuickExercise {
  key: string;
  name: string;
  slot: SlotId;
  compound: boolean;
  sets: number;
  repMin: number;
  repMax: number;
  /** Last time's best set; null when the member has not done it. */
  last: QuickHistory | null;
}

export interface QuickWorkout {
  /** "Quick workout: Back and Legs". */
  name: string;
  exercises: QuickExercise[];
  /** The estimate in whole minutes (never over the time picked). */
  minutes: number;
}

export function estimateMinutes(list: readonly Pick<QuickExercise, 'compound' | 'sets'>[]): number {
  return list.reduce((n, x) => n + x.sets * (x.compound ? BIG_SET_MIN : SMALL_SET_MIN) + MOVE_MIN, 0);
}

function listWords(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The fitting exercise for a slot: one done before (most recent, then most often), else the builder's first. */
function pickFor(slot: SlotId, input: QuickInput, used: ReadonlySet<string>): { entry: CatalogEntry; slot: SlotId } | null {
  let s: SlotId | undefined = slot;
  const seen = new Set<SlotId>();
  while (s && !seen.has(s)) {
    seen.add(s);
    const choices = slotChoices(s, input.level, input).filter((e) => !used.has(e.key));
    if (choices.length > 0) {
      const done = choices
        .filter((e) => input.history.has(e.key))
        .sort((a, b) => {
          const ha = input.history.get(a.key)!;
          const hb = input.history.get(b.key)!;
          return ha.lastISO !== hb.lastISO ? (ha.lastISO < hb.lastISO ? 1 : -1) : hb.times - ha.times;
        });
      return { entry: done[0] ?? choices[0], slot: s };
    }
    s = SLOT_FALLBACK[s];
  }
  return null;
}

export function buildQuickWorkout(input: QuickInput): QuickWorkout {
  const parts = input.parts.length > 0 ? [...input.parts] : (['chest', 'back', 'legs'] as BodyPart[]);
  const want = quickExerciseCount(input.minutes);
  // Two spare picks: added only when every exercise is at its most sets and time is left.
  const pool = want + 2;
  const used = new Set<string>();
  const picked: { entry: CatalogEntry; slot: SlotId }[] = [];
  const next = new Map<BodyPart, number>(parts.map((p) => [p, 0]));
  // Round the parts, each giving its next slot, until the count is reached or nothing is left.
  for (let guard = 0; picked.length < pool && guard < 40; guard++) {
    let any = false;
    for (const p of parts) {
      if (picked.length >= pool) break;
      const slots = PART_SLOTS[p];
      let i = next.get(p) ?? 0;
      while (i < slots.length) {
        const got = pickFor(slots[i], input, used);
        i++;
        if (got) {
          used.add(got.entry.key);
          picked.push(got);
          any = true;
          break;
        }
      }
      next.set(p, i);
    }
    if (!any) break;
  }
  const bySlot = (a: { slot: SlotId }, b: { slot: SlotId }): number => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot);
  const spare = picked.slice(want);
  picked.length = Math.min(picked.length, want);
  picked.sort(bySlot);

  const cap = input.level === 'beginner' ? 3 : 4;
  const toQuick = ({ entry, slot }: { entry: CatalogEntry; slot: SlotId }): QuickExercise => {
    const r = defaultRepRange({ name: entry.name, equipment: entry.equipment, isCompound: entry.compound }, input.goal, input.level);
    return {
      key: entry.key,
      name: entry.name,
      slot,
      compound: entry.compound,
      sets: entry.compound || input.level !== 'beginner' ? 3 : 2,
      repMin: r.repRangeMin,
      repMax: r.repRangeMax,
      last: input.history.get(entry.key) ?? null,
    };
  };
  let exercises: QuickExercise[] = picked.map(toQuick);

  // Too long: sets off (small lifts first, the last in the list first), then the last exercise.
  while (exercises.length > 0 && estimateMinutes(exercises) > input.minutes) {
    const order = [...exercises.keys()].reverse();
    const cut = order.find((i) => !exercises[i].compound && exercises[i].sets > 2) ?? order.find((i) => exercises[i].sets > 2);
    if (cut != null) exercises[cut] = { ...exercises[cut], sets: exercises[cut].sets - 1 };
    else if (exercises.length > 1) exercises = exercises.slice(0, -1);
    else break;
  }
  // Room left: sets on, fewest first, big lifts first, while it still fits.
  for (;;) {
    const room = input.minutes - estimateMinutes(exercises);
    const can = exercises
      .map((x, i) => ({ x, i }))
      .filter(({ x }) => x.sets < cap && (x.compound ? BIG_SET_MIN : SMALL_SET_MIN) <= room + 1e-9)
      .sort((a, b) => a.x.sets - b.x.sets || a.i - b.i);
    if (can.length === 0) {
      // Every exercise at its most sets: one more exercise, if it fits.
      const extra = spare.length > 0 ? toQuick(spare[0]) : null;
      if (extra && estimateMinutes([extra]) <= room + 1e-9) {
        spare.shift();
        exercises = [...exercises, extra].sort(bySlot);
        continue;
      }
      break;
    }
    const { i } = can[0];
    exercises[i] = { ...exercises[i], sets: exercises[i].sets + 1 };
  }

  const shownParts = parts.map((p) => BODY_PART_LABEL[p]);
  return {
    name: `Quick workout: ${listWords(shownParts)}`,
    exercises,
    minutes: Math.round(estimateMinutes(exercises)),
  };
}
