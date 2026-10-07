/**
 * What fits a member — Phase 4 plan builder. PURE.
 *
 * Three filters decide whether a library exercise can go into a member's plan:
 *  1. Equipment: what they train with (a full gym, dumbbells with or without a bench, a
 *     pull-up bar, or nothing). The library's own equipment field says most of it; the lists
 *     below add what it cannot — a bodyweight move that still needs a bar, a dip station or a
 *     decline bench, and the dumbbell moves that need a bench.
 *  2. Sore areas ("go easy on"): moves that commonly load that joint are left out. Plain
 *     coaching practice, not a diagnosis — the screen says so and tells the member to stop
 *     anything that hurts.
 *  3. The member's own "don't give me this" list.
 */
import type { CatalogEntry } from '../catalog/types';

export type PlanEquipment = 'gym' | 'dumbbells_bench' | 'dumbbells' | 'bar' | 'none';

export const PLAN_EQUIPMENT: readonly PlanEquipment[] = ['gym', 'dumbbells_bench', 'dumbbells', 'bar', 'none'];

export const PLAN_EQUIPMENT_LABEL: Record<PlanEquipment, string> = {
  gym: 'Full gym',
  dumbbells_bench: 'Dumbbells and a bench',
  dumbbells: 'Dumbbells only',
  bar: 'Pull-up bar',
  none: 'No equipment',
};

export type SoreArea = 'shoulder' | 'elbow' | 'wrist' | 'lower_back' | 'hip' | 'knee' | 'ankle';

export const SORE_AREAS: readonly SoreArea[] = ['shoulder', 'elbow', 'wrist', 'lower_back', 'hip', 'knee', 'ankle'];

export const SORE_AREA_LABEL: Record<SoreArea, string> = {
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  wrist: 'Wrist',
  lower_back: 'Lower back',
  hip: 'Hip',
  knee: 'Knee',
  ankle: 'Ankle',
};

/** Shown behind the i beside "Go easy on". */
export const SORE_AREA_INFO =
  'We leave out moves that often bother that area. Stop any exercise that hurts. If the pain stays, see a doctor or a physio.';

/** Bodyweight moves that need a bar to hang from (a pull-up bar, or a low bar for rows). */
const NEEDS_BAR = new Set([
  'pull_up',
  'chin_up',
  'wide_grip_pull_up',
  'neutral_grip_pull_up',
  'negative_pull_up',
  'muscle_up',
  'hanging_knee_raise',
  'hanging_leg_raise',
  'toes_to_bar',
  'dead_hang',
  'inverted_row',
]);

/** Bodyweight moves that need gym kit: dip bars, a captain's chair, a decline or roman bench, plates. */
const NEEDS_GYM_KIT = new Set([
  'captains_chair_knee_raise',
  'captains_chair_leg_raise',
  'chest_dip',
  'triceps_dip',
  'weighted_dip',
  'weighted_push_up',
  'weighted_sissy_squat',
  'decline_crunch',
  'decline_sit_up',
  'decline_oblique_crunch',
  'decline_leg_raise',
  'back_extension',
  'reverse_hyperextension',
  'box_jump',
]);

/** Dumbbell moves that need a bench (flat, incline or for support). */
const NEEDS_BENCH = new Set([
  'dumbbell_bench_press',
  'incline_dumbbell_press',
  'decline_dumbbell_press',
  'neutral_grip_dumbbell_press',
  'incline_neutral_grip_dumbbell_press',
  'single_arm_dumbbell_bench_press',
  'dumbbell_squeeze_press',
  'dumbbell_fly',
  'incline_dumbbell_fly',
  'decline_dumbbell_fly',
  'dumbbell_pullover',
  'chest_supported_dumbbell_row',
  'chest_supported_reverse_fly',
  'incline_y_raise',
  'incline_dumbbell_curl',
  'incline_hammer_curl',
  'incline_bench_preacher_curl',
  'dumbbell_preacher_curl',
  'preacher_hammer_curl',
  'single_arm_dumbbell_preacher_curl',
  'dumbbell_skull_crusher',
  'incline_dumbbell_skull_crusher',
  'decline_dumbbell_skull_crusher',
  'single_dumbbell_skull_crusher',
  'single_arm_lying_dumbbell_extension',
  'tate_press',
  'dumbbell_hip_thrust',
  'dumbbell_leg_curl',
  'bulgarian_split_squat',
  'weighted_decline_crunch',
]);

/** Can this exercise be done with this equipment? */
export function fitsEquipment(e: Pick<CatalogEntry, 'key' | 'equipment'>, equipment: PlanEquipment): boolean {
  if (equipment === 'gym') return true;
  if (NEEDS_GYM_KIT.has(e.key)) return false;
  if (equipment === 'dumbbells_bench' || equipment === 'dumbbells') {
    if (e.equipment !== 'dumbbell' && e.equipment !== 'bodyweight') return false;
    if (NEEDS_BAR.has(e.key)) return false;
    return equipment === 'dumbbells_bench' || !NEEDS_BENCH.has(e.key);
  }
  if (e.equipment !== 'bodyweight') return false;
  return equipment === 'bar' || !NEEDS_BAR.has(e.key);
}

/**
 * Moves left out for each sore area. Each list is the usual trouble for that joint —
 * overhead pressing and dips for a shoulder, skull crushers and straight-bar curls for an
 * elbow, palms-flat push-ups for a wrist, heavy hinging and bent-over rows for a lower back,
 * wide and deep stances for a hip, lunges, jumps and leg extensions for a knee, jumps and
 * standing calf raises for an ankle.
 */
const SORE: Record<SoreArea, ReadonlySet<string>> = {
  shoulder: new Set([
    'overhead_press', 'push_press', 'seated_barbell_shoulder_press', 'smith_machine_shoulder_press', 'machine_shoulder_press',
    'dumbbell_shoulder_press', 'standing_dumbbell_shoulder_press', 'single_arm_dumbbell_shoulder_press', 'arnold_press',
    'handstand_push_up', 'pike_push_up', 'kettlebell_clean_and_press', 'overhead_squat', 'muscle_up',
    'barbell_upright_row', 'cable_upright_row', 'dumbbell_upright_row', 'smith_machine_upright_row', 'single_arm_dumbbell_upright_row',
    'chest_dip', 'triceps_dip', 'weighted_dip', 'assisted_dip', 'bench_dip', 'seated_dip_machine',
    'wide_grip_bench_press', 'barbell_pullover', 'dumbbell_pullover', 'clap_push_up', 'behind_the_head_skull_crusher',
    'overhead_triceps_extension', 'cable_overhead_triceps_extension', 'seated_overhead_dumbbell_extension',
    'single_arm_overhead_dumbbell_extension', 'single_arm_overhead_cable_extension', 'seated_barbell_overhead_extension',
    'standing_barbell_overhead_extension',
  ]),
  elbow: new Set([
    'barbell_skull_crusher', 'ez_bar_skull_crusher', 'dumbbell_skull_crusher', 'incline_barbell_skull_crusher', 'incline_dumbbell_skull_crusher',
    'decline_dumbbell_skull_crusher', 'decline_ez_bar_skull_crusher', 'single_dumbbell_skull_crusher', 'behind_the_head_skull_crusher',
    'cable_skull_crusher', 'jm_press', 'close_grip_bench_press', 'tate_press', 'triceps_dip', 'chest_dip', 'weighted_dip', 'bench_dip',
    'diamond_push_up', 'close_grip_push_up', 'bodyweight_triceps_extension', 'barbell_curl', 'close_grip_barbell_curl', 'barbell_21s',
    'barbell_drag_curl', 'reverse_barbell_curl', 'barbell_preacher_curl', 'preacher_curl', 'wrist_roller',
  ]),
  wrist: new Set([
    'push_up', 'knee_push_up', 'incline_push_up', 'decline_push_up', 'archer_push_up', 'clap_push_up', 'close_grip_push_up',
    'deficit_push_up', 'diamond_push_up', 'hindu_push_up', 'spiderman_push_up', 'wide_push_up', 'weighted_push_up',
    'pike_push_up', 'handstand_push_up', 'plank_shoulder_tap', 'mountain_climber', 'burpee', 'bench_dip', 'front_squat',
    'barbell_curl', 'close_grip_barbell_curl', 'wide_grip_barbell_curl', 'barbell_21s', 'barbell_drag_curl', 'reverse_barbell_curl',
    'barbell_wrist_curl', 'dumbbell_wrist_curl', 'reverse_barbell_wrist_curl', 'reverse_dumbbell_wrist_curl',
    'single_arm_dumbbell_wrist_curl', 'behind_the_back_wrist_curl', 'wrist_roller',
  ]),
  lower_back: new Set([
    'deadlift', 'sumo_deadlift', 'trap_bar_deadlift', 'romanian_deadlift', 'stiff_leg_deadlift', 'good_morning',
    'smith_machine_good_morning', 'smith_machine_deadlift', 'rack_pull', 'barbell_row', 'pendlay_row', 'reverse_grip_barbell_row',
    't_bar_row', 'meadows_row', 'dumbbell_bent_over_row', 'barbell_back_squat', 'pause_squat', 'overhead_squat',
    'dumbbell_deadlift', 'dumbbell_romanian_deadlift', 'single_leg_romanian_deadlift', 'kettlebell_swing',
    'back_extension', 'weighted_back_extension', 'machine_back_extension', 'reverse_hyperextension', 'superman',
  ]),
  hip: new Set([
    'sumo_squat', 'barbell_sumo_squat', 'sumo_deadlift', 'lateral_lunge', 'curtsy_lunge', 'pistol_squat', 'jumping_lunge',
    'jump_squat', 'box_jump', 'copenhagen_plank', 'hip_adduction_machine', 'cable_hip_adduction',
  ]),
  knee: new Set([
    'jump_squat', 'jumping_lunge', 'box_jump', 'burpee', 'high_knees', 'pistol_squat', 'sissy_squat', 'weighted_sissy_squat',
    'leg_extension', 'single_leg_extension', 'walking_lunge', 'dumbbell_lunge', 'barbell_lunge', 'bodyweight_lunge',
    'dumbbell_reverse_lunge', 'barbell_reverse_lunge', 'lateral_lunge', 'curtsy_lunge', 'bulgarian_split_squat',
    'barbell_bulgarian_split_squat', 'dumbbell_split_squat', 'smith_machine_split_squat', 'dumbbell_step_up', 'barbell_step_up',
  ]),
  ankle: new Set([
    'jump_squat', 'jumping_lunge', 'box_jump', 'burpee', 'high_knees', 'jump_rope', 'jumping_jack', 'pistol_squat',
    'standing_calf_raise', 'barbell_calf_raise', 'dumbbell_calf_raise', 'single_leg_calf_raise', 'bodyweight_calf_raise',
    'smith_machine_calf_raise', 'donkey_calf_raise', 'walking_lunge',
  ]),
};

/** The sore areas this exercise is left out for (empty = fine for all). */
export function soreAreasOf(key: string): SoreArea[] {
  return SORE_AREAS.filter((a) => SORE[a].has(key));
}

export interface FitContext {
  equipment: PlanEquipment;
  sore: readonly SoreArea[];
  /** Catalogue keys the member never wants. */
  avoid: readonly string[];
}

/** Every filter at once. */
export function fits(e: Pick<CatalogEntry, 'key' | 'equipment'>, ctx: FitContext): boolean {
  if (!fitsEquipment(e, ctx.equipment)) return false;
  if (ctx.avoid.includes(e.key)) return false;
  return !ctx.sore.some((a) => SORE[a].has(e.key));
}
