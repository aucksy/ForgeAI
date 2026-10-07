/**
 * Plan builder — Phase 4. PURE. Rules, no AI call, works offline.
 *
 * Hevy Trainer asks goal, level, equipment, days and time and builds a plan; its one
 * independent review found level and goal barely change it, and it has no easy (deload)
 * weeks. Here every input changes the plan in a way the member can see:
 *  - days and split pick the routines (full body, upper / lower, push-pull-legs, or the
 *    five-day mix); "best for my days" picks the split the days suit;
 *  - equipment, sore areas and the member's "never give me" list decide which library
 *    exercise fills each movement slot (`fit.ts`);
 *  - level picks the rung: a beginner gets machines and the easier bodyweight versions
 *    (incline push-ups, negatives), an advanced lifter barbells, decline and archer push-ups
 *    and weighted pull-ups; the Phase 2 rules then move them up the ladder at the rep cap;
 *  - goal and level set the rep ranges (research v3 §3, `engine/repRanges`) and the sets,
 *    topped up so the main muscles get a weekly dose (about 10 hard sets for muscle, §5);
 *  - time per workout sets how many exercises fit.
 * Easy weeks are planned around the routines (`easyWeek.ts`); swapping one exercise for
 * another that fits is `alternativesFor`.
 */
import { CATALOG, catalogEntry } from '../catalog/exerciseCatalog';
import { MUSCLE_LABEL, setShares, type Muscle } from '../catalog/muscles';
import type { CatalogEntry } from '../catalog/types';
import { defaultRepRange } from '../engine/repRanges';
import type { DayType, Goal, UserProfile } from '@/types/models';

import { fits, type FitContext, type PlanEquipment } from './fit';

export type Level = UserProfile['experience'];
export type SplitChoice = 'auto' | 'full' | 'upper_lower' | 'ppl';
export type Split = 'full' | 'upper_lower' | 'ppl' | 'mix5';

export const SPLIT_LABEL: Record<Split, string> = {
  full: 'Full body',
  upper_lower: 'Upper / Lower',
  ppl: 'Push Pull Legs',
  mix5: 'Upper Lower Push Pull Legs',
};

export const MINUTES: readonly number[] = [30, 45, 60, 75];

/**
 * Behind the i on the plan's routines when a body-weight move has harder versions waiting.
 * Research v3 §4.4: reps first, then the harder version, then added weight.
 */
export const LADDER_INFO =
  'Body-weight moves get harder in steps. First you add a rep or two each workout. At the top of the climb (for example 15 pull-ups or 25 push-ups), the app moves you to the next version under "Then". Added weight comes last.';

export interface BuilderInput extends FitContext {
  goal: Goal;
  level: Level;
  /** Training days a week, 2–6. */
  days: number;
  split: SplitChoice;
  /** Minutes per workout (30, 45, 60, 75). */
  minutes: number;
}

// ---------------------------------------------------------------- movement slots

export type SlotId =
  | 'squat' | 'hinge' | 'lunge' | 'glute' | 'leg_curl' | 'quad_iso' | 'calves'
  | 'h_push' | 'incline_push' | 'v_push' | 'chest_iso' | 'side_delt' | 'rear_delt'
  | 'v_pull' | 'h_pull' | 'back_ext' | 'biceps' | 'triceps' | 'core';

/**
 * Library keys for each slot in order of preference, per level. Equipment and sore areas
 * filter the list; the first that fits wins (the second on a "B" day, for variety). The
 * bodyweight entries sit at the end, so they are picked where nothing else fits — at home.
 */
const SLOTS: Record<SlotId, Record<Level, readonly string[]>> = {
  squat: {
    beginner: ['leg_press', 'goblet_squat', 'smith_machine_squat', 'hack_squat', 'dumbbell_squat', 'box_squat', 'air_squat'],
    intermediate: ['barbell_back_squat', 'hack_squat', 'leg_press', 'goblet_squat', 'dumbbell_squat', 'belt_squat', 'jump_squat', 'air_squat'],
    advanced: ['barbell_back_squat', 'front_squat', 'hack_squat', 'pause_squat', 'leg_press', 'goblet_squat', 'dumbbell_squat', 'pistol_squat', 'jump_squat'],
  },
  hinge: {
    beginner: ['dumbbell_romanian_deadlift', 'cable_pull_through', 'romanian_deadlift', 'dumbbell_deadlift', 'hip_thrust_machine', 'glute_bridge'],
    intermediate: ['romanian_deadlift', 'deadlift', 'dumbbell_romanian_deadlift', 'dumbbell_deadlift', 'single_leg_romanian_deadlift', 'cable_pull_through', 'single_leg_glute_bridge'],
    advanced: ['deadlift', 'romanian_deadlift', 'trap_bar_deadlift', 'dumbbell_romanian_deadlift', 'single_leg_romanian_deadlift', 'cable_pull_through', 'single_leg_hip_thrust'],
  },
  lunge: {
    beginner: ['dumbbell_reverse_lunge', 'dumbbell_split_squat', 'smith_machine_split_squat', 'dumbbell_step_up', 'bodyweight_lunge'],
    intermediate: ['bulgarian_split_squat', 'walking_lunge', 'dumbbell_reverse_lunge', 'barbell_lunge', 'dumbbell_split_squat', 'bodyweight_lunge', 'lateral_lunge'],
    advanced: ['bulgarian_split_squat', 'walking_lunge', 'barbell_lunge', 'dumbbell_reverse_lunge', 'dumbbell_split_squat', 'jumping_lunge', 'bodyweight_lunge'],
  },
  glute: {
    beginner: ['hip_thrust_machine', 'barbell_hip_thrust', 'dumbbell_hip_thrust', 'cable_glute_kickback', 'donkey_kick', 'glute_bridge'],
    intermediate: ['barbell_hip_thrust', 'hip_thrust_machine', 'dumbbell_hip_thrust', 'cable_glute_kickback', 'single_leg_glute_bridge', 'donkey_kick'],
    advanced: ['barbell_hip_thrust', 'smith_machine_hip_thrust', 'dumbbell_hip_thrust', 'cable_glute_kickback', 'single_leg_hip_thrust'],
  },
  // Nordic curls are left out: even trained lifters manage a handful of reps, far below
  // any rep range here. A member can still add them by hand.
  leg_curl: {
    beginner: ['lying_leg_curl', 'seated_leg_curl', 'dumbbell_leg_curl'],
    intermediate: ['lying_leg_curl', 'seated_leg_curl', 'standing_leg_curl', 'dumbbell_leg_curl'],
    advanced: ['seated_leg_curl', 'lying_leg_curl', 'standing_leg_curl', 'dumbbell_leg_curl'],
  },
  quad_iso: {
    beginner: ['leg_extension', 'wall_sit'],
    intermediate: ['leg_extension', 'single_leg_extension', 'wall_sit'],
    advanced: ['leg_extension', 'single_leg_extension', 'sissy_squat'],
  },
  calves: {
    beginner: ['standing_calf_raise', 'seated_calf_raise', 'leg_press_calf_raise', 'dumbbell_calf_raise', 'bodyweight_calf_raise'],
    intermediate: ['standing_calf_raise', 'seated_calf_raise', 'leg_press_calf_raise', 'dumbbell_calf_raise', 'single_leg_calf_raise', 'bodyweight_calf_raise'],
    advanced: ['standing_calf_raise', 'seated_calf_raise', 'smith_machine_calf_raise', 'single_leg_calf_raise', 'dumbbell_calf_raise', 'bodyweight_calf_raise'],
  },
  h_push: {
    beginner: ['machine_chest_press', 'dumbbell_bench_press', 'smith_machine_bench_press', 'dumbbell_floor_press', 'incline_push_up', 'knee_push_up'],
    intermediate: ['barbell_bench_press', 'dumbbell_bench_press', 'machine_chest_press', 'dumbbell_floor_press', 'push_up'],
    advanced: ['barbell_bench_press', 'dumbbell_bench_press', 'machine_chest_press', 'dumbbell_floor_press', 'decline_push_up', 'archer_push_up'],
  },
  incline_push: {
    beginner: ['incline_machine_chest_press', 'incline_dumbbell_press', 'smith_machine_incline_press'],
    intermediate: ['incline_dumbbell_press', 'incline_barbell_press', 'incline_machine_chest_press', 'decline_push_up'],
    advanced: ['incline_barbell_press', 'incline_dumbbell_press', 'smith_machine_incline_press', 'deficit_push_up', 'decline_push_up'],
  },
  v_push: {
    beginner: ['machine_shoulder_press', 'dumbbell_shoulder_press', 'standing_dumbbell_shoulder_press', 'landmine_press'],
    intermediate: ['overhead_press', 'dumbbell_shoulder_press', 'machine_shoulder_press', 'standing_dumbbell_shoulder_press', 'arnold_press', 'landmine_press', 'pike_push_up'],
    advanced: ['overhead_press', 'dumbbell_shoulder_press', 'arnold_press', 'standing_dumbbell_shoulder_press', 'landmine_press', 'handstand_push_up', 'pike_push_up'],
  },
  chest_iso: {
    beginner: ['pec_deck_fly', 'cable_fly', 'dumbbell_fly'],
    intermediate: ['cable_fly', 'pec_deck_fly', 'dumbbell_fly', 'incline_cable_fly'],
    advanced: ['cable_fly', 'incline_cable_fly', 'pec_deck_fly', 'incline_dumbbell_fly', 'dumbbell_fly'],
  },
  side_delt: {
    beginner: ['lateral_raise', 'machine_lateral_raise', 'cable_lateral_raise', 'seated_lateral_raise'],
    intermediate: ['lateral_raise', 'cable_lateral_raise', 'machine_lateral_raise', 'seated_lateral_raise'],
    advanced: ['cable_lateral_raise', 'lateral_raise', 'machine_lateral_raise', 'single_arm_dumbbell_lateral_raise'],
  },
  rear_delt: {
    beginner: ['reverse_pec_deck', 'face_pull', 'rear_delt_fly'],
    intermediate: ['face_pull', 'reverse_pec_deck', 'rear_delt_fly', 'cable_rear_delt_fly'],
    advanced: ['face_pull', 'cable_rear_delt_fly', 'reverse_pec_deck', 'rear_delt_fly'],
  },
  v_pull: {
    beginner: ['lat_pulldown', 'assisted_pull_up', 'machine_lat_pulldown', 'negative_pull_up'],
    intermediate: ['lat_pulldown', 'pull_up', 'neutral_grip_pull_up', 'chin_up'],
    advanced: ['weighted_pull_up', 'pull_up', 'lat_pulldown', 'wide_grip_pull_up', 'chin_up'],
  },
  h_pull: {
    beginner: ['seated_cable_row', 'seated_machine_row', 'chest_supported_dumbbell_row', 'one_arm_dumbbell_row', 'dumbbell_bent_over_row', 'inverted_row'],
    intermediate: ['barbell_row', 'seated_cable_row', 'chest_supported_t_bar_row', 'one_arm_dumbbell_row', 'dumbbell_bent_over_row', 'inverted_row'],
    advanced: ['barbell_row', 'chest_supported_t_bar_row', 'seated_cable_row', 'one_arm_dumbbell_row', 'dumbbell_bent_over_row', 'inverted_row'],
  },
  // Only where no row fits (no equipment at all): the back still gets some work.
  back_ext: {
    beginner: ['superman', 'bird_dog'],
    intermediate: ['superman', 'bird_dog'],
    advanced: ['superman', 'bird_dog'],
  },
  biceps: {
    beginner: ['dumbbell_curl', 'cable_curl', 'machine_bicep_curl', 'hammer_curl'],
    intermediate: ['dumbbell_curl', 'ez_bar_curl', 'hammer_curl', 'cable_curl', 'incline_dumbbell_curl'],
    advanced: ['incline_dumbbell_curl', 'ez_bar_curl', 'hammer_curl', 'cable_curl', 'preacher_curl', 'dumbbell_curl'],
  },
  triceps: {
    beginner: ['triceps_pushdown', 'rope_triceps_pushdown', 'overhead_triceps_extension', 'dumbbell_triceps_kickback', 'bench_dip'],
    intermediate: ['triceps_pushdown', 'cable_overhead_triceps_extension', 'overhead_triceps_extension', 'dumbbell_triceps_kickback', 'bench_dip', 'diamond_push_up'],
    advanced: ['cable_overhead_triceps_extension', 'rope_triceps_pushdown', 'ez_bar_skull_crusher', 'overhead_triceps_extension', 'dumbbell_triceps_kickback', 'diamond_push_up', 'bench_dip'],
  },
  core: {
    beginner: ['plank', 'dead_bug', 'cable_crunch', 'crunch'],
    intermediate: ['cable_crunch', 'hanging_knee_raise', 'weighted_crunch', 'plank', 'lying_leg_raise', 'dead_bug'],
    advanced: ['hanging_leg_raise', 'cable_crunch', 'ab_wheel_rollout', 'weighted_crunch', 'hollow_hold', 'lying_leg_raise'],
  },
};

/** Where a slot finds nothing that fits, these stand in (no bar: a row for the pull-up…). */
const FALLBACK: Partial<Record<SlotId, SlotId>> = {
  v_pull: 'h_pull',
  h_pull: 'back_ext',
  incline_push: 'h_push',
  // No press fits (no equipment, or a sore shoulder rules them all out): a push-up instead.
  v_push: 'h_push',
};

/** A slot in a routine template; `alt` takes the 2nd choice for variety on a "B" day. */
type Step = [SlotId] | [SlotId, 'alt'];

interface Template {
  name: string;
  dayType: DayType;
  steps: readonly Step[];
}

const FULL_A: Template = { name: 'Full Body A', dayType: 'full', steps: [['squat'], ['h_push'], ['v_pull'], ['hinge'], ['side_delt'], ['core'], ['biceps']] };
const FULL_B: Template = { name: 'Full Body B', dayType: 'full', steps: [['hinge', 'alt'], ['v_push'], ['h_pull'], ['lunge'], ['triceps'], ['calves'], ['core', 'alt']] };
const FULL_C: Template = { name: 'Full Body C', dayType: 'full', steps: [['lunge', 'alt'], ['incline_push'], ['v_pull', 'alt'], ['glute'], ['rear_delt'], ['biceps', 'alt'], ['core']] };
const UPPER_A: Template = { name: 'Upper A', dayType: 'upper', steps: [['h_push'], ['h_pull'], ['v_push'], ['v_pull'], ['side_delt'], ['triceps'], ['biceps']] };
const UPPER_B: Template = { name: 'Upper B', dayType: 'upper', steps: [['incline_push'], ['v_pull', 'alt'], ['h_pull', 'alt'], ['chest_iso'], ['rear_delt'], ['biceps', 'alt'], ['triceps', 'alt']] };
const LOWER_A: Template = { name: 'Lower A', dayType: 'lower', steps: [['squat'], ['hinge'], ['lunge'], ['leg_curl'], ['calves'], ['core']] };
const LOWER_B: Template = { name: 'Lower B', dayType: 'lower', steps: [['hinge', 'alt'], ['squat', 'alt'], ['glute'], ['leg_curl', 'alt'], ['calves', 'alt'], ['core', 'alt']] };
// One arm exercise a day: the presses and pulls already work triceps and biceps hard.
const PUSH_A: Template = { name: 'Push A', dayType: 'push', steps: [['h_push'], ['v_push'], ['incline_push'], ['side_delt'], ['triceps'], ['chest_iso']] };
const PUSH_B: Template = { name: 'Push B', dayType: 'push', steps: [['incline_push', 'alt'], ['v_push', 'alt'], ['h_push', 'alt'], ['side_delt', 'alt'], ['triceps', 'alt'], ['chest_iso', 'alt']] };
// Big lifts first: the hinge and both pulls come before the rear shoulders and the curls.
const PULL_A: Template = { name: 'Pull A', dayType: 'pull', steps: [['v_pull'], ['h_pull'], ['h_pull', 'alt'], ['rear_delt'], ['biceps']] };
const PULL_B: Template = { name: 'Pull B', dayType: 'pull', steps: [['hinge', 'alt'], ['h_pull', 'alt'], ['v_pull', 'alt'], ['rear_delt', 'alt'], ['biceps', 'alt']] };
const LEGS_A: Template = { name: 'Legs A', dayType: 'legs', steps: [['squat'], ['hinge'], ['lunge'], ['leg_curl'], ['calves'], ['core'], ['quad_iso']] };
const LEGS_B: Template = { name: 'Legs B', dayType: 'legs', steps: [['squat', 'alt'], ['glute'], ['lunge', 'alt'], ['leg_curl', 'alt'], ['calves', 'alt'], ['core', 'alt'], ['quad_iso']] };

const named = (t: Template, name: string): Template => ({ ...t, name });

/** "Best for my days": 2–3 days full body, 4 upper / lower, 5 the mix, 6 push-pull-legs twice. */
export function splitFor(choice: SplitChoice, days: number): Split {
  if (choice !== 'auto') return choice;
  if (days <= 3) return 'full';
  if (days === 4) return 'upper_lower';
  if (days === 5) return 'mix5';
  return 'ppl';
}

/** The routines a split runs, in rotation order. */
export function templatesFor(split: Split, days: number): Template[] {
  switch (split) {
    case 'full':
      return days <= 2 ? [FULL_A, FULL_B] : [FULL_A, FULL_B, FULL_C];
    case 'upper_lower':
      return days <= 2 ? [named(UPPER_A, 'Upper'), named(LOWER_A, 'Lower')] : [UPPER_A, LOWER_A, UPPER_B, LOWER_B];
    case 'ppl':
      return days >= 6 ? [PUSH_A, PULL_A, LEGS_A, PUSH_B, PULL_B, LEGS_B] : [named(PUSH_A, 'Push'), named(PULL_A, 'Pull'), named(LEGS_A, 'Legs')];
    case 'mix5':
      return [named(UPPER_A, 'Upper'), named(LOWER_A, 'Lower'), named(PUSH_B, 'Push'), named(PULL_B, 'Pull'), named(LEGS_B, 'Legs')];
  }
}

/** Exercises that fit in a workout of this length (about 8–9 minutes each, with rest). */
export function exercisesFor(minutes: number): number {
  if (minutes <= 30) return 4;
  if (minutes <= 45) return 5;
  if (minutes <= 60) return 6;
  return 7;
}

// ---------------------------------------------------------------- picking

/** The library entries that fit for a slot, in preference order. */
export function slotChoices(slot: SlotId, level: Level, ctx: FitContext): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const key of SLOTS[slot][level]) {
    const e = catalogEntry(key);
    if (e && fits(e, ctx) && !out.some((o) => o.key === e.key)) out.push(e);
  }
  return out;
}

function pick(slot: SlotId, alt: boolean, level: Level, ctx: FitContext, used: Set<string>): { entry: CatalogEntry; slot: SlotId } | null {
  let s: SlotId | undefined = slot;
  const seen = new Set<SlotId>();
  while (s && !seen.has(s)) {
    seen.add(s);
    const choices = slotChoices(s, level, ctx).filter((e) => !used.has(e.key));
    if (choices.length > 0) return { entry: (alt ? choices[1] : undefined) ?? choices[0], slot: s };
    s = FALLBACK[s];
  }
  return null;
}

/** Big compound lifts start the list of a workout; a heavy one gets a 4th set for trained lifters. */
function baseSets(e: CatalogEntry, level: Level, index: number): number {
  if (!e.compound) return level === 'beginner' ? 2 : 3;
  if (level === 'advanced' && index < 2) return 4;
  return 3;
}

export interface BuiltExercise {
  key: string;
  name: string;
  slot: SlotId;
  sets: number;
  repMin: number;
  repMax: number;
  /** Bodyweight moves: the harder versions waiting up the ladder (names), else empty. */
  ladder: string[];
}

export interface BuiltRoutine {
  name: string;
  dayType: DayType;
  exercises: BuiltExercise[];
}

export interface BuiltPlan {
  name: string;
  split: Split;
  routines: BuiltRoutine[];
  /** Working sets each muscle gets in a normal week, biggest first. */
  weekly: { muscle: Muscle; sets: number }[];
  /** Short plain notes about what the equipment or sore areas left out. */
  notes: string[];
}

/**
 * The harder versions above this exercise in the library's links, nearest first (max 3),
 * stopping at the first one the member's equipment or sore areas rule out.
 */
export function ladderAbove(key: string, ctx?: FitContext): string[] {
  const out: string[] = [];
  let e = catalogEntry(key);
  const seen = new Set<string>([key]);
  while (e?.harder && !seen.has(e.harder) && out.length < 3) {
    const next = catalogEntry(e.harder);
    if (!next || (ctx && !fits(next, ctx))) break;
    seen.add(next.key);
    out.push(next.name);
    e = next;
  }
  return out;
}

/** The main muscles that should get a weekly dose, by goal and level (`weeklyTarget`). */
const MAIN_MUSCLES: readonly Muscle[] = ['chest', 'lats', 'upper_back', 'quads', 'hamstrings', 'glutes'];

export function weeklyTarget(goal: Goal, level: Level): number {
  const muscle = goal === 'muscle' || goal === 'fat_loss';
  if (level === 'beginner') return muscle ? 6 : 5;
  if (level === 'intermediate') return muscle ? 10 : 8;
  return muscle ? 12 : 9;
}

/** Working sets per muscle in a normal week: each routine is done days ÷ routines times. */
export function weeklySets(routines: readonly BuiltRoutine[], days: number): Map<Muscle, number> {
  const out = new Map<Muscle, number>();
  if (routines.length === 0) return out;
  const perWeek = days / routines.length;
  for (const r of routines) {
    for (const x of r.exercises) {
      const e = catalogEntry(x.key);
      if (!e) continue;
      for (const [m, share] of setShares({ primary: [...e.primary], secondary: [...e.secondary] })) {
        out.set(m, (out.get(m) ?? 0) + share * x.sets * perWeek);
      }
    }
  }
  return out;
}

const round1 = (n: number): number => Math.round(n * 2) / 2;

/** "lats", "lats and upper back", "lats, upper back and side shoulders". */
function listWords(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function buildPlan(input: BuilderInput): BuiltPlan {
  const days = Math.max(2, Math.min(6, Math.round(input.days)));
  const split = splitFor(input.split, days);
  const ctx: FitContext = { equipment: input.equipment, sore: input.sore, avoid: input.avoid };
  const perWorkout = exercisesFor(input.minutes);
  const notes: string[] = [];

  const routines: BuiltRoutine[] = templatesFor(split, days).map((t) => {
    const used = new Set<string>();
    const exercises: BuiltExercise[] = [];
    for (const [slot, alt] of t.steps) {
      if (exercises.length >= perWorkout) break;
      const got = pick(slot, alt === 'alt', input.level, ctx, used);
      if (!got) continue;
      used.add(got.entry.key);
      const ranges = defaultRepRange(
        { name: got.entry.name, equipment: got.entry.equipment, isCompound: got.entry.compound },
        input.goal,
        input.level,
      );
      exercises.push({
        key: got.entry.key,
        name: got.entry.name,
        slot: got.slot,
        sets: baseSets(got.entry, input.level, exercises.length),
        repMin: ranges.repRangeMin,
        repMax: ranges.repRangeMax,
        ladder: got.entry.type === 'reps' || got.entry.type === 'assisted' ? ladderAbove(got.entry.key, ctx) : [],
      });
    }
    return { name: t.name, dayType: t.dayType, exercises };
  });

  // Top up: a main muscle under its weekly dose gets one more set on the exercises that
  // work it most — up to 4 sets each (3 for a beginner) — while the workout stays inside its time.
  const target = weeklyTarget(input.goal, input.level);
  const setCap = input.level === 'beginner' ? 3 : 4;
  const maxSets = perWorkout * 4;
  for (let round = 0; round < 3; round++) {
    const weekly = weeklySets(routines, days);
    let changed = false;
    for (const m of MAIN_MUSCLES) {
      if ((weekly.get(m) ?? 0) >= target) continue;
      for (const r of routines) {
        const total = r.exercises.reduce((n, x) => n + x.sets, 0);
        const x = r.exercises.find((ex) => catalogEntry(ex.key)?.primary.includes(m) && ex.sets < setCap);
        if (x && total < maxSets) {
          x.sets += 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const weekly = [...weeklySets(routines, days).entries()]
    .map(([muscle, sets]) => ({ muscle, sets: round1(sets) }))
    .filter((w) => w.sets > 0)
    .sort((a, b) => b.sets - a.sets);

  // Say plainly what the setup could not cover.
  const all = routines.flatMap((r) => r.exercises.map((x) => x.slot));
  if (input.equipment === 'none' && !all.includes('v_pull') && !all.includes('h_pull')) {
    notes.push('With no equipment your back gets supermans and bird dogs. A pull-up bar adds real pulling.');
  } else if ((input.equipment === 'dumbbells' || input.equipment === 'dumbbells_bench') && all.includes('h_pull')) {
    notes.push('Without a pull-up bar, rows stand in for pull-ups.');
  }
  const done = weeklySets(routines, days);
  const missing = MAIN_MUSCLES.filter((m) => (done.get(m) ?? 0) === 0).map((m) => MUSCLE_LABEL[m].toLowerCase());
  if (missing.length > 0) notes.push(`Nothing here trains your ${listWords(missing)} with this setup.`);

  const dayWord = `${days} ${days === 1 ? 'day' : 'days'}`;
  return { name: `${SPLIT_LABEL[split]} · ${dayWord}`, split, routines, weekly, notes };
}

/**
 * The plan with one exercise swapped for another (the preview's "Swap"): same sets, the rep
 * range the research table gives the new one, its own ladder; the weekly sets follow. PURE.
 */
export function swapInPlan(plan: BuiltPlan, input: BuilderInput, routineIndex: number, exerciseIndex: number, key: string): BuiltPlan {
  const e = catalogEntry(key);
  const old = plan.routines[routineIndex]?.exercises[exerciseIndex];
  if (!e || !old) return plan;
  const ranges = defaultRepRange({ name: e.name, equipment: e.equipment, isCompound: e.compound }, input.goal, input.level);
  const ctx: FitContext = { equipment: input.equipment, sore: input.sore, avoid: input.avoid };
  const swapped: BuiltExercise = {
    key: e.key,
    name: e.name,
    slot: old.slot,
    sets: old.sets,
    repMin: ranges.repRangeMin,
    repMax: ranges.repRangeMax,
    ladder: e.type === 'reps' || e.type === 'assisted' ? ladderAbove(e.key, ctx) : [],
  };
  const routines = plan.routines.map((r, ri) =>
    ri !== routineIndex ? r : { ...r, exercises: r.exercises.map((x, xi) => (xi === exerciseIndex ? swapped : x)) },
  );
  const days = Math.max(2, Math.min(6, Math.round(input.days)));
  const weekly = [...weeklySets(routines, days).entries()]
    .map(([muscle, sets]) => ({ muscle, sets: round1(sets) }))
    .filter((w) => w.sets > 0)
    .sort((a, b) => b.sets - a.sets);
  return { ...plan, routines, weekly };
}

// ---------------------------------------------------------------- swap

const EQUIPMENT_WORD: Record<CatalogEntry['equipment'], string> = {
  barbell: 'barbell',
  dumbbell: 'dumbbells',
  machine: 'machine',
  cable: 'cable',
  bodyweight: 'body weight',
  other: 'other kit',
};

export interface Alternative {
  key: string;
  name: string;
  /** "Chest · dumbbells", "Lats · body weight · harder version". */
  reason: string;
}

/**
 * Up to four exercises to swap in for `key`: first the same movement slot's other choices,
 * then anything else with the same main muscle and kind (compound / single-joint) — all
 * filtered by equipment, sore areas and the "never" list, and never one already in the
 * routine. PURE.
 */
export function alternativesFor(key: string, input: { level: Level; exclude: readonly string[] } & FitContext, max = 4): Alternative[] {
  const from = catalogEntry(key);
  if (!from) return [];
  const ctx: FitContext = { equipment: input.equipment, sore: input.sore, avoid: input.avoid };
  const out: CatalogEntry[] = [];
  const take = (e: CatalogEntry | null) => {
    if (!e || e.key === key || input.exclude.includes(e.key) || out.some((o) => o.key === e.key) || !fits(e, ctx)) return;
    if (e.type !== from.type && !(isLoadable(e.type) && isLoadable(from.type))) return;
    out.push(e);
  };
  const slots = (Object.keys(SLOTS) as SlotId[]).filter((s) => (['beginner', 'intermediate', 'advanced'] as const).some((l) => SLOTS[s][l].includes(key)));
  for (const s of slots) for (const l of [input.level, 'beginner', 'intermediate', 'advanced'] as const) for (const k of SLOTS[s][l]) take(catalogEntry(k));
  take(catalogEntry(from.easier));
  take(catalogEntry(from.harder));
  const main = from.primary[0];
  const byMuscle = SWAP_POOL.filter((e) => e.primary[0] === main && e.compound === from.compound);
  byMuscle.sort((a, b) => Number(b.equipment === from.equipment) - Number(a.equipment === from.equipment));
  for (const e of byMuscle) take(e);
  return out.slice(0, max).map((e) => {
    const parts = [MUSCLE_LABEL[e.primary[0]], EQUIPMENT_WORD[e.equipment]];
    if (from.harder === e.key) parts.push('harder version');
    else if (from.easier === e.key) parts.push('easier version');
    return { key: e.key, name: e.name, reason: parts.join(' · ') };
  });
}

/** Weight × reps, weighted and assisted moves can stand in for each other; reps for reps. */
function isLoadable(t: CatalogEntry['type']): boolean {
  return t === 'weight_reps' || t === 'weighted' || t === 'assisted' || t === 'reps';
}

/** Strength work only: cardio and distance work never stand in for a lift. */
const SWAP_POOL: readonly CatalogEntry[] = CATALOG.filter(
  (e) => e.type !== 'time_distance' && e.type !== 'distance' && !e.primary.includes('cardio'),
);
