/**
 * Ready programs — Phase 4. PURE data.
 *
 * Hevy's program library ("26 ready programs plus 7 groups: home, travel, dumbbells only…")
 * is one of the things members use most when they start. These are ForgeAI's: three groups —
 * a full gym, dumbbells only, and home — each from beginner to advanced. Every exercise is a
 * key in the bundled library (`catalog/catalogData.ts`; a test checks each one), so a program
 * always lands on real exercises with pictures, steps and the Phase 2 progress rules.
 *
 * Rep ranges are not written here. They come from the research table (Progressive overload
 * research v3, §3) when a program is added: the program's style plays the member's goal and
 * its level the experience, and each exercise's kind (big / mid / small) picks the row —
 * `engine/repRanges.defaultRepRange`. Timed and distance exercises have no rep range.
 *
 * Bodyweight moves sit on the rung of their ladder that fits the level (incline push-ups for
 * a beginner, push-ups, then decline and archer push-ups; negatives, pull-ups, then weighted
 * pull-ups); the Phase 2 rules move a member up the ladder when the reps reach the cap.
 */
import type { DayType, Goal, UserProfile } from '@/types/models';

import { catalogEntry } from '../catalog/exerciseCatalog';
import { defaultRepRange } from '../engine/repRanges';

export type ProgramEquipment = 'gym' | 'dumbbells' | 'home';
export type ProgramLevel = UserProfile['experience'];

export interface ProgramExercise {
  /** Catalogue key. */
  key: string;
  sets: number;
  /** Only where the research table's range would be wrong for the move (Nordic curls: a few reps). */
  reps?: readonly [number, number];
}

export interface ProgramRoutine {
  name: string;
  dayType: DayType;
  exercises: readonly ProgramExercise[];
}

export interface Program {
  key: string;
  name: string;
  equipment: ProgramEquipment;
  level: ProgramLevel;
  daysPerWeek: number;
  /** Plays the member's goal for the rep ranges. */
  style: Extract<Goal, 'muscle' | 'strength' | 'general'>;
  /** One or two plain sentences: who it is for and what it asks. */
  summary: string;
  /** The routines, in the order the rotation runs them. */
  routines: readonly ProgramRoutine[];
}

export const EQUIPMENT_LABEL: Record<ProgramEquipment, string> = {
  gym: 'Gym',
  dumbbells: 'Dumbbells only',
  home: 'Home',
};

export const LEVEL_LABEL: Record<ProgramLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const x = (key: string, sets: number, reps?: readonly [number, number]): ProgramExercise => (reps ? { key, sets, reps } : { key, sets });

export const PROGRAMS: readonly Program[] = [
  // ------------------------------------------------------------------ gym
  {
    key: 'gym_full_body_beginner',
    name: 'Full Body Basics',
    equipment: 'gym',
    level: 'beginner',
    daysPerWeek: 3,
    style: 'muscle',
    summary: 'Your first months in the gym. Machines and dumbbells you can learn safely, the whole body each time.',
    routines: [
      {
        name: 'Full Body A',
        dayType: 'full',
        exercises: [x('leg_press', 3), x('machine_chest_press', 3), x('lat_pulldown', 3), x('dumbbell_romanian_deadlift', 2), x('lateral_raise', 2), x('plank', 2)],
      },
      {
        name: 'Full Body B',
        dayType: 'full',
        exercises: [x('goblet_squat', 3), x('incline_dumbbell_press', 3), x('seated_cable_row', 3), x('lying_leg_curl', 2), x('dumbbell_shoulder_press', 2), x('cable_crunch', 2)],
      },
    ],
  },
  {
    key: 'gym_strength_beginner',
    name: 'Strength Starter',
    equipment: 'gym',
    level: 'beginner',
    daysPerWeek: 3,
    style: 'strength',
    summary: 'Learn the big barbell lifts — squat, bench, deadlift, press, row — and add a little weight most weeks.',
    routines: [
      {
        name: 'Strength A',
        dayType: 'full',
        exercises: [x('barbell_back_squat', 3), x('barbell_bench_press', 3), x('barbell_row', 3), x('plank', 2)],
      },
      {
        name: 'Strength B',
        dayType: 'full',
        exercises: [x('barbell_back_squat', 3), x('overhead_press', 3), x('deadlift', 2), x('lat_pulldown', 3)],
      },
    ],
  },
  {
    key: 'gym_ppl_intermediate',
    name: 'Push Pull Legs',
    equipment: 'gym',
    level: 'intermediate',
    daysPerWeek: 3,
    style: 'muscle',
    summary: 'Pushing muscles, pulling muscles and legs, each on its own day. Train three days, or keep the rotation going for more.',
    routines: [
      {
        name: 'Push',
        dayType: 'push',
        exercises: [x('barbell_bench_press', 3), x('dumbbell_shoulder_press', 3), x('incline_dumbbell_press', 3), x('cable_lateral_raise', 3), x('triceps_pushdown', 3), x('cable_overhead_triceps_extension', 2)],
      },
      {
        name: 'Pull',
        dayType: 'pull',
        exercises: [x('lat_pulldown', 3), x('barbell_row', 3), x('seated_cable_row', 3), x('face_pull', 3), x('dumbbell_curl', 3), x('hammer_curl', 2)],
      },
      {
        name: 'Legs',
        dayType: 'legs',
        exercises: [x('barbell_back_squat', 3), x('romanian_deadlift', 3), x('leg_press', 3), x('lying_leg_curl', 3), x('standing_calf_raise', 3), x('cable_crunch', 2)],
      },
    ],
  },
  {
    key: 'gym_upper_lower_intermediate',
    name: 'Upper / Lower',
    equipment: 'gym',
    level: 'intermediate',
    daysPerWeek: 4,
    style: 'muscle',
    summary: 'Four days: upper body, lower body, twice a week each. Every muscle gets two good sessions.',
    routines: [
      {
        name: 'Upper A',
        dayType: 'upper',
        exercises: [x('barbell_bench_press', 3), x('barbell_row', 3), x('dumbbell_shoulder_press', 3), x('lat_pulldown', 3), x('lateral_raise', 3), x('triceps_pushdown', 2), x('dumbbell_curl', 2)],
      },
      {
        name: 'Lower A',
        dayType: 'lower',
        exercises: [x('barbell_back_squat', 3), x('romanian_deadlift', 3), x('leg_press', 3), x('lying_leg_curl', 3), x('standing_calf_raise', 3), x('cable_crunch', 2)],
      },
      {
        name: 'Upper B',
        dayType: 'upper',
        exercises: [x('incline_dumbbell_press', 3), x('pull_up', 3), x('seated_cable_row', 3), x('machine_shoulder_press', 3), x('cable_fly', 2), x('face_pull', 3), x('hammer_curl', 2)],
      },
      {
        name: 'Lower B',
        dayType: 'lower',
        exercises: [x('hack_squat', 3), x('barbell_hip_thrust', 3), x('bulgarian_split_squat', 2), x('seated_leg_curl', 3), x('seated_calf_raise', 3), x('hanging_knee_raise', 2)],
      },
    ],
  },
  {
    key: 'gym_ppl_advanced',
    name: 'Push Pull Legs × 2',
    equipment: 'gym',
    level: 'advanced',
    daysPerWeek: 6,
    style: 'muscle',
    summary: 'Six days for experienced lifters: every muscle twice a week with heavy and lighter days. Plan easy weeks.',
    routines: [
      {
        name: 'Push A',
        dayType: 'push',
        exercises: [x('barbell_bench_press', 4), x('overhead_press', 3), x('incline_dumbbell_press', 3), x('cable_lateral_raise', 3), x('triceps_pushdown', 3), x('cable_overhead_triceps_extension', 3)],
      },
      {
        name: 'Pull A',
        dayType: 'pull',
        exercises: [x('weighted_pull_up', 4), x('barbell_row', 3), x('seated_cable_row', 3), x('face_pull', 3), x('ez_bar_curl', 3), x('hammer_curl', 3)],
      },
      {
        name: 'Legs A',
        dayType: 'legs',
        exercises: [x('barbell_back_squat', 4), x('romanian_deadlift', 3), x('leg_press', 3), x('leg_extension', 3), x('lying_leg_curl', 3), x('standing_calf_raise', 4)],
      },
      {
        name: 'Push B',
        dayType: 'push',
        exercises: [x('incline_barbell_press', 4), x('dumbbell_shoulder_press', 3), x('weighted_dip', 3), x('lateral_raise', 4), x('pec_deck_fly', 3), x('rope_triceps_pushdown', 3)],
      },
      {
        name: 'Pull B',
        dayType: 'pull',
        exercises: [x('deadlift', 3), x('lat_pulldown', 3), x('chest_supported_t_bar_row', 3), x('reverse_pec_deck', 3), x('incline_dumbbell_curl', 3), x('barbell_shrug', 3)],
      },
      {
        name: 'Legs B',
        dayType: 'legs',
        exercises: [x('hack_squat', 4), x('barbell_hip_thrust', 3), x('walking_lunge', 3), x('seated_leg_curl', 3), x('seated_calf_raise', 4), x('hanging_leg_raise', 3)],
      },
    ],
  },

  // ------------------------------------------------------------------ dumbbells only
  {
    key: 'db_full_body_beginner',
    name: 'Dumbbell Full Body',
    equipment: 'dumbbells',
    level: 'beginner',
    daysPerWeek: 3,
    style: 'muscle',
    summary: 'A pair of dumbbells and a bit of floor. No bench needed — the whole body, three days a week.',
    routines: [
      {
        name: 'Full Body A',
        dayType: 'full',
        exercises: [x('goblet_squat', 3), x('dumbbell_floor_press', 3), x('dumbbell_bent_over_row', 3), x('dumbbell_romanian_deadlift', 2), x('lateral_raise', 2), x('plank', 2)],
      },
      {
        name: 'Full Body B',
        dayType: 'full',
        exercises: [x('dumbbell_reverse_lunge', 3), x('standing_dumbbell_shoulder_press', 3), x('one_arm_dumbbell_row', 3), x('dumbbell_deadlift', 2), x('dumbbell_curl', 2), x('overhead_triceps_extension', 2), x('dead_bug', 2)],
      },
    ],
  },
  {
    key: 'db_upper_lower_intermediate',
    name: 'Dumbbell Upper / Lower',
    equipment: 'dumbbells',
    level: 'intermediate',
    daysPerWeek: 4,
    style: 'muscle',
    summary: 'Four dumbbell days, upper and lower body twice each. Push-ups fill in where a bench would go.',
    routines: [
      {
        name: 'Upper A',
        dayType: 'upper',
        exercises: [x('dumbbell_floor_press', 4), x('dumbbell_bent_over_row', 4), x('standing_dumbbell_shoulder_press', 3), x('lateral_raise', 3), x('dumbbell_curl', 3), x('overhead_triceps_extension', 3)],
      },
      {
        name: 'Lower A',
        dayType: 'lower',
        exercises: [x('goblet_squat', 4), x('dumbbell_romanian_deadlift', 3), x('dumbbell_reverse_lunge', 3), x('dumbbell_calf_raise', 3), x('weighted_crunch', 3)],
      },
      {
        name: 'Upper B',
        dayType: 'upper',
        exercises: [x('push_up', 3), x('one_arm_dumbbell_row', 3), x('arnold_press', 3), x('rear_delt_fly', 3), x('hammer_curl', 3), x('dumbbell_triceps_kickback', 3)],
      },
      {
        name: 'Lower B',
        dayType: 'lower',
        exercises: [x('dumbbell_split_squat', 3), x('single_leg_romanian_deadlift', 3), x('sumo_squat', 3), x('single_leg_calf_raise', 3), x('dumbbell_side_bend', 2)],
      },
    ],
  },
  {
    key: 'db_ppl_advanced',
    name: 'Dumbbell Push Pull Legs',
    equipment: 'dumbbells',
    level: 'advanced',
    daysPerWeek: 6,
    style: 'muscle',
    summary: 'Six days of hard dumbbell work for lifters with a home setup. High volume — take the easy weeks.',
    routines: [
      {
        name: 'Push A',
        dayType: 'push',
        exercises: [x('dumbbell_floor_press', 4), x('standing_dumbbell_shoulder_press', 4), x('decline_push_up', 3), x('lateral_raise', 4), x('overhead_triceps_extension', 3), x('dumbbell_triceps_kickback', 3)],
      },
      {
        name: 'Pull A',
        dayType: 'pull',
        exercises: [x('dumbbell_bent_over_row', 4), x('one_arm_dumbbell_row', 3), x('rear_delt_fly', 3), x('dumbbell_shrug', 3), x('dumbbell_curl', 3), x('hammer_curl', 3)],
      },
      {
        name: 'Legs A',
        dayType: 'legs',
        exercises: [x('goblet_squat', 4), x('dumbbell_romanian_deadlift', 4), x('walking_lunge', 3), x('single_leg_calf_raise', 4), x('weighted_crunch', 3)],
      },
      {
        name: 'Push B',
        dayType: 'push',
        exercises: [x('arnold_press', 4), x('dumbbell_floor_press', 3), x('push_up', 3), x('single_arm_dumbbell_lateral_raise', 3), x('single_arm_overhead_dumbbell_extension', 3)],
      },
      {
        name: 'Pull B',
        dayType: 'pull',
        exercises: [x('dumbbell_deadlift', 3), x('one_arm_dumbbell_row', 4), x('rear_delt_fly', 3), x('concentration_curl', 3), x('zottman_curl', 3), x('farmers_walk', 3)],
      },
      {
        name: 'Legs B',
        dayType: 'legs',
        exercises: [x('dumbbell_split_squat', 4), x('single_leg_romanian_deadlift', 3), x('sumo_squat', 3), x('dumbbell_calf_raise', 4), x('weighted_russian_twist', 3)],
      },
    ],
  },

  // ------------------------------------------------------------------ home
  {
    key: 'home_full_body_beginner',
    name: 'Home Start',
    equipment: 'home',
    level: 'beginner',
    daysPerWeek: 3,
    style: 'general',
    summary: 'No equipment at all. Easier push-ups and squats to begin, the whole body three days a week.',
    routines: [
      {
        name: 'Home A',
        dayType: 'full',
        exercises: [x('air_squat', 3), x('incline_push_up', 3), x('glute_bridge', 3), x('superman', 3), x('plank', 3)],
      },
      {
        name: 'Home B',
        dayType: 'full',
        exercises: [x('bodyweight_lunge', 3), x('knee_push_up', 3), x('bird_dog', 2), x('side_plank', 2), x('dead_bug', 2), x('bodyweight_calf_raise', 2)],
      },
    ],
  },
  {
    key: 'home_bar_upper_lower_intermediate',
    name: 'Home Upper / Lower',
    equipment: 'home',
    level: 'intermediate',
    daysPerWeek: 4,
    style: 'muscle',
    summary: 'Body weight and a pull-up bar. Pull-ups, push-ups and single-leg work, four days a week.',
    routines: [
      {
        name: 'Upper A',
        dayType: 'upper',
        exercises: [x('pull_up', 4), x('push_up', 4), x('inverted_row', 3), x('pike_push_up', 3), x('bench_dip', 3)],
      },
      {
        name: 'Lower A',
        dayType: 'lower',
        exercises: [x('jump_squat', 3), x('bodyweight_lunge', 3), x('single_leg_glute_bridge', 3), x('lateral_lunge', 3), x('bodyweight_calf_raise', 3), x('hanging_knee_raise', 3)],
      },
      {
        name: 'Upper B',
        dayType: 'upper',
        exercises: [x('chin_up', 4), x('decline_push_up', 3), x('inverted_row', 3), x('diamond_push_up', 3), x('pike_push_up', 3), x('hollow_hold', 2)],
      },
      {
        name: 'Lower B',
        dayType: 'lower',
        exercises: [x('bodyweight_lunge', 3), x('wall_sit', 3), x('single_leg_hip_thrust', 3), x('side_lying_leg_raise', 2), x('bodyweight_calf_raise', 3), x('lying_leg_raise', 3)],
      },
    ],
  },
  {
    key: 'home_calisthenics_advanced',
    name: 'Calisthenics',
    equipment: 'home',
    level: 'advanced',
    daysPerWeek: 4,
    style: 'muscle',
    summary: 'Hard body-weight skills with a pull-up bar and two sturdy chairs for dips. The three days rotate.',
    routines: [
      {
        name: 'Pull',
        dayType: 'pull',
        exercises: [x('pull_up', 4), x('chin_up', 3), x('inverted_row', 3), x('hanging_leg_raise', 3), x('dead_hang', 2)],
      },
      {
        name: 'Push',
        dayType: 'push',
        exercises: [x('archer_push_up', 4), x('handstand_push_up', 3), x('chest_dip', 3), x('decline_push_up', 3), x('l_sit', 3)],
      },
      {
        name: 'Legs',
        dayType: 'legs',
        exercises: [x('pistol_squat', 4), x('nordic_curl', 3, [3, 8]), x('single_leg_hip_thrust', 3), x('jumping_lunge', 3), x('copenhagen_plank', 2), x('bodyweight_calf_raise', 3)],
      },
    ],
  },
];

export function programByKey(key: string | null | undefined): Program | null {
  return PROGRAMS.find((p) => p.key === key) ?? null;
}

/** Programs grouped for the list: Gym, Dumbbells only, Home — each beginner → advanced. */
export function programGroups(): { equipment: ProgramEquipment; label: string; programs: Program[] }[] {
  const order: ProgramLevel[] = ['beginner', 'intermediate', 'advanced'];
  return (['gym', 'dumbbells', 'home'] as const).map((equipment) => ({
    equipment,
    label: EQUIPMENT_LABEL[equipment],
    programs: PROGRAMS.filter((p) => p.equipment === equipment).sort(
      (a, b) => order.indexOf(a.level) - order.indexOf(b.level) || a.daysPerWeek - b.daysPerWeek,
    ),
  }));
}

/** "Beginner · 3 days a week". */
export function programMeta(p: Pick<Program, 'level' | 'daysPerWeek'>): string {
  return `${LEVEL_LABEL[p.level]} · ${p.daysPerWeek} ${p.daysPerWeek === 1 ? 'day' : 'days'} a week`;
}

/** "3 × 8–12", or "2 sets" for timed and distance work. PURE. */
export function setsAndReps(x: { sets: number; repMin: number; repMax: number; hasReps: boolean }): string {
  if (!x.hasReps) return `${x.sets} ${x.sets === 1 ? 'set' : 'sets'}`;
  return `${x.sets} × ${x.repMin === x.repMax ? x.repMin : `${x.repMin}–${x.repMax}`}`;
}

export interface ResolvedExercise {
  key: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  /** Timed or distance work: the rep range is not shown. */
  hasReps: boolean;
}

/**
 * A program's routines with their rep ranges: the research table with the program's style as
 * the goal and its level as the experience (or the exercise's own range where one is set).
 * Keys the library does not know are left out. PURE.
 */
export function programRoutines(p: Program): { name: string; dayType: DayType; exercises: ResolvedExercise[] }[] {
  return p.routines.map((r) => ({
    name: r.name,
    dayType: r.dayType,
    exercises: r.exercises.flatMap((x) => {
      const e = catalogEntry(x.key);
      if (!e) return [];
      const range = x.reps
        ? { repRangeMin: x.reps[0], repRangeMax: x.reps[1] }
        : defaultRepRange({ name: e.name, equipment: e.equipment, isCompound: e.compound }, p.style, p.level);
      const hasReps = e.type === 'weight_reps' || e.type === 'reps' || e.type === 'weighted' || e.type === 'assisted';
      return [{ key: e.key, name: e.name, sets: x.sets, repMin: range.repRangeMin, repMax: range.repRangeMax, hasReps }];
    }),
  }));
}
