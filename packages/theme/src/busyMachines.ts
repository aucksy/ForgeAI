/**
 * F137 "Busy times by exercise" (OWNER-INBOX #68): the ready list of gym machines the owner ticks in the admin
 * app (Settings -> Member app -> Busy machines), each with the exercises done on it, as keys of the member
 * app's exercise library (apps/mobile/src/tracker/catalog/catalogData.ts; a mobile test checks every key and
 * name against it). Shared so the admin app (the list), the gym server (supabase/migrations/0049, which gets the
 * keys with each machine) and the member app (which keys to send) agree.
 *
 * Only machines a gym has 1 or 2 of can get busy (owner, #68); the rest stay on the list so the owner's count
 * is complete, and are never guessed about. Dumbbells, plates and loose benches are not on the list.
 */

export interface ReadyMachine {
  /** Stable id, saved on the gym's server. Never reused or renamed. */
  id: string;
  name: string;
  /** Exercise library keys done on this machine. Each key is on one machine only. */
  ex: readonly string[];
}

/** Units the owner may type for one machine. */
export const MACHINE_UNITS_MAX = 50;
/** Only machines with this many or fewer can get busy (owner, #68). */
export const BUSY_UNITS_MAX = 2;

export const READY_MACHINES: readonly ReadyMachine[] = [
  { id: 'squat_rack', name: 'Squat rack', ex: ['barbell_back_squat', 'front_squat', 'pause_squat', 'box_squat', 'overhead_squat', 'rack_pull', 'good_morning'] },
  { id: 'flat_bench_press', name: 'Flat bench press', ex: ['barbell_bench_press', 'close_grip_bench_press', 'wide_grip_bench_press', 'reverse_grip_bench_press'] },
  { id: 'incline_bench_press', name: 'Incline bench press', ex: ['incline_barbell_press'] },
  { id: 'decline_bench_press', name: 'Decline bench press', ex: ['decline_barbell_bench_press'] },
  { id: 'deadlift_platform', name: 'Deadlift platform', ex: ['deadlift', 'sumo_deadlift', 'trap_bar_deadlift'] },
  { id: 'smith_machine', name: 'Smith machine', ex: [
    'smith_machine_squat', 'smith_machine_bench_press', 'smith_machine_incline_press', 'smith_machine_decline_press',
    'smith_machine_shoulder_press', 'smith_machine_row', 'smith_machine_deadlift', 'smith_machine_split_squat',
    'smith_machine_hip_thrust', 'smith_machine_calf_raise', 'smith_machine_shrug', 'smith_machine_upright_row',
    'smith_machine_good_morning',
  ] },
  { id: 'leg_press', name: 'Leg press', ex: ['leg_press', 'leg_press_calf_raise', 'single_leg_press'] },
  { id: 'seated_leg_press', name: 'Seated leg press', ex: ['seated_leg_press'] },
  { id: 'hack_squat', name: 'Hack squat', ex: ['hack_squat', 'reverse_hack_squat'] },
  { id: 'belt_squat', name: 'Belt squat', ex: ['belt_squat'] },
  { id: 'leg_extension', name: 'Leg extension', ex: ['leg_extension', 'single_leg_extension'] },
  { id: 'lying_leg_curl', name: 'Lying leg curl', ex: ['lying_leg_curl'] },
  { id: 'seated_leg_curl', name: 'Seated leg curl', ex: ['seated_leg_curl'] },
  { id: 'standing_leg_curl', name: 'Standing leg curl', ex: ['standing_leg_curl'] },
  { id: 'hip_abduction', name: 'Hip abduction / adduction', ex: ['hip_abduction_machine', 'hip_adduction_machine'] },
  { id: 'hip_thrust_machine', name: 'Hip thrust machine', ex: ['hip_thrust_machine'] },
  { id: 'glute_kickback_machine', name: 'Glute kickback machine', ex: ['glute_kickback_machine'] },
  { id: 'standing_calf_raise', name: 'Standing calf raise', ex: ['standing_calf_raise', 'donkey_calf_raise'] },
  { id: 'seated_calf_raise', name: 'Seated calf raise', ex: ['seated_calf_raise'] },
  { id: 'cable_station', name: 'Cable station (crossover)', ex: [
    'cable_fly', 'incline_cable_fly', 'low_to_high_cable_fly', 'single_arm_cable_fly', 'flat_bench_cable_fly', 'cable_chest_press',
    'face_pull', 'triceps_pushdown', 'rope_triceps_pushdown', 'v_bar_triceps_pushdown', 'reverse_grip_triceps_pushdown',
    'single_arm_cable_pushdown', 'cable_overhead_triceps_extension', 'cable_curl', 'rope_cable_curl', 'rope_hammer_curl',
    'cable_lateral_raise', 'single_arm_cable_lateral_raise', 'cable_rear_delt_fly', 'cable_crunch', 'cable_woodchop',
    'pallof_press', 'cable_glute_kickback', 'cable_pull_through', 'straight_arm_pulldown', 'cable_upright_row', 'cable_front_raise',
  ] },
  { id: 'lat_pulldown', name: 'Lat pulldown', ex: ['lat_pulldown', 'close_grip_lat_pulldown', 'reverse_grip_lat_pulldown', 'single_arm_lat_pulldown'] },
  { id: 'seated_cable_row', name: 'Seated cable row', ex: ['seated_cable_row', 'wide_grip_cable_row', 'straight_bar_cable_row', 'single_arm_cable_row'] },
  { id: 'machine_lat_pulldown', name: 'Lat pulldown machine (plates)', ex: ['machine_lat_pulldown'] },
  { id: 'chest_supported_row', name: 'Chest-supported T-bar row', ex: ['chest_supported_t_bar_row'] },
  { id: 't_bar_row', name: 'T-bar row / landmine', ex: ['t_bar_row', 'meadows_row', 'landmine_press', 'landmine_squat'] },
  { id: 'row_machine', name: 'Row machine', ex: ['seated_machine_row', 'iso_lateral_row', 'iso_lateral_high_row', 'iso_lateral_low_row'] },
  { id: 'assisted_pull_up', name: 'Assisted pull-up / dip', ex: ['assisted_pull_up', 'assisted_chin_up', 'assisted_dip'] },
  { id: 'chest_press_machine', name: 'Chest press machine', ex: ['machine_chest_press', 'iso_lateral_chest_press', 'incline_machine_chest_press', 'decline_machine_chest_press'] },
  { id: 'pec_deck', name: 'Pec deck / rear delt', ex: ['pec_deck_fly', 'reverse_pec_deck', 'incline_machine_fly'] },
  { id: 'shoulder_press_machine', name: 'Shoulder press machine', ex: ['machine_shoulder_press'] },
  { id: 'lateral_raise_machine', name: 'Lateral raise machine', ex: ['machine_lateral_raise'] },
  { id: 'preacher_curl', name: 'Preacher curl bench', ex: ['preacher_curl', 'barbell_preacher_curl', 'ez_bar_preacher_curl', 'reverse_preacher_curl'] },
  { id: 'biceps_curl_machine', name: 'Biceps curl machine', ex: ['machine_bicep_curl'] },
  { id: 'triceps_machine', name: 'Triceps / dip machine', ex: ['machine_triceps_extension', 'seated_dip_machine'] },
  { id: 'pullover_machine', name: 'Pullover machine', ex: ['machine_pullover'] },
  { id: 'back_extension', name: 'Back extension machine', ex: ['machine_back_extension'] },
  { id: 'ab_crunch_machine', name: 'Ab crunch machine', ex: ['ab_crunch_machine'] },
  { id: 'rotary_torso', name: 'Rotary torso machine', ex: ['rotary_torso_machine'] },
  { id: 'shrug_machine', name: 'Shrug machine', ex: ['machine_shrug'] },
  { id: 'treadmill', name: 'Treadmill', ex: ['treadmill_run', 'incline_treadmill_walk'] },
  { id: 'stationary_bike', name: 'Exercise bike', ex: ['stationary_bike'] },
  { id: 'air_bike', name: 'Air bike', ex: ['air_bike'] },
  { id: 'elliptical', name: 'Elliptical', ex: ['elliptical'] },
  { id: 'rowing_machine', name: 'Rowing machine', ex: ['rowing_machine'] },
  { id: 'stair_climber', name: 'Stair climber', ex: ['stair_climber'] },
];

/** The library's name for each key on the ready list (for the "Which exercises use it?" picker). */
export const READY_EXERCISE_NAMES: Readonly<Record<string, string>> = {
  barbell_back_squat: 'Barbell Squat', front_squat: 'Front Squat', pause_squat: 'Pause Squat', box_squat: 'Box Squat',
  overhead_squat: 'Overhead Squat', rack_pull: 'Rack Pull', good_morning: 'Good Morning',
  barbell_bench_press: 'Barbell Bench Press', close_grip_bench_press: 'Close-Grip Bench Press', wide_grip_bench_press: 'Wide-Grip Bench Press',
  reverse_grip_bench_press: 'Reverse-Grip Bench Press', incline_barbell_press: 'Incline Barbell Press',
  decline_barbell_bench_press: 'Decline Barbell Bench Press', deadlift: 'Deadlift', sumo_deadlift: 'Sumo Deadlift',
  trap_bar_deadlift: 'Trap Bar Deadlift',
  smith_machine_squat: 'Smith Machine Squat', smith_machine_bench_press: 'Smith Machine Bench Press',
  smith_machine_incline_press: 'Smith Machine Incline Press', smith_machine_decline_press: 'Smith Machine Decline Press',
  smith_machine_shoulder_press: 'Smith Machine Shoulder Press', smith_machine_row: 'Smith Machine Row',
  smith_machine_deadlift: 'Smith Machine Deadlift', smith_machine_split_squat: 'Smith Machine Split Squat',
  smith_machine_hip_thrust: 'Smith Machine Hip Thrust', smith_machine_calf_raise: 'Smith Machine Calf Raise',
  smith_machine_shrug: 'Smith Machine Shrug', smith_machine_upright_row: 'Smith Machine Upright Row',
  smith_machine_good_morning: 'Smith Machine Good Morning',
  leg_press: 'Leg Press', leg_press_calf_raise: 'Leg Press Calf Raise', single_leg_press: 'Single-Leg Leg Press',
  seated_leg_press: 'Seated Leg Press', hack_squat: 'Hack Squat', reverse_hack_squat: 'Reverse Hack Squat', belt_squat: 'Belt Squat',
  leg_extension: 'Leg Extension', single_leg_extension: 'Single-Leg Leg Extension', lying_leg_curl: 'Lying Leg Curl',
  seated_leg_curl: 'Seated Leg Curl', standing_leg_curl: 'Standing Leg Curl', hip_abduction_machine: 'Hip Abduction Machine',
  hip_adduction_machine: 'Hip Adduction Machine', hip_thrust_machine: 'Hip Thrust Machine', glute_kickback_machine: 'Glute Kickback Machine',
  standing_calf_raise: 'Standing Calf Raise', donkey_calf_raise: 'Donkey Calf Raise', seated_calf_raise: 'Seated Calf Raise',
  cable_fly: 'Cable Fly', incline_cable_fly: 'Incline Cable Fly', low_to_high_cable_fly: 'Low-to-High Cable Fly',
  single_arm_cable_fly: 'Single-Arm Cable Fly', flat_bench_cable_fly: 'Flat Bench Cable Fly', cable_chest_press: 'Cable Chest Press',
  face_pull: 'Face Pull', triceps_pushdown: 'Triceps Pushdown', rope_triceps_pushdown: 'Rope Triceps Pushdown',
  v_bar_triceps_pushdown: 'V-Bar Triceps Pushdown', reverse_grip_triceps_pushdown: 'Reverse-Grip Triceps Pushdown',
  single_arm_cable_pushdown: 'Single-Arm Cable Pushdown', cable_overhead_triceps_extension: 'Cable Overhead Triceps Extension',
  cable_curl: 'Cable Curl', rope_cable_curl: 'Rope Cable Curl', rope_hammer_curl: 'Rope Hammer Curl',
  cable_lateral_raise: 'Cable Lateral Raise', single_arm_cable_lateral_raise: 'Single-Arm Cable Lateral Raise',
  cable_rear_delt_fly: 'Cable Rear Delt Fly', cable_crunch: 'Cable Crunch', cable_woodchop: 'Cable Woodchop', pallof_press: 'Pallof Press',
  cable_glute_kickback: 'Cable Glute Kickback', cable_pull_through: 'Cable Pull-Through', straight_arm_pulldown: 'Straight-Arm Pulldown',
  cable_upright_row: 'Cable Upright Row', cable_front_raise: 'Cable Front Raise',
  lat_pulldown: 'Lat Pulldown', close_grip_lat_pulldown: 'Close-Grip Lat Pulldown', reverse_grip_lat_pulldown: 'Reverse-Grip Lat Pulldown',
  single_arm_lat_pulldown: 'Single-Arm Lat Pulldown', seated_cable_row: 'Seated Cable Row', wide_grip_cable_row: 'Wide-Grip Cable Row',
  straight_bar_cable_row: 'Straight-Bar Cable Row', single_arm_cable_row: 'Single-Arm Cable Row', machine_lat_pulldown: 'Machine Lat Pulldown',
  chest_supported_t_bar_row: 'Chest-Supported T-Bar Row', t_bar_row: 'T-Bar Row', meadows_row: 'Meadows Row',
  landmine_press: 'Landmine Press', landmine_squat: 'Landmine Squat', seated_machine_row: 'Seated Machine Row',
  iso_lateral_row: 'Iso-Lateral Row', iso_lateral_high_row: 'Iso-Lateral High Row', iso_lateral_low_row: 'Iso-Lateral Low Row',
  assisted_pull_up: 'Assisted Pull-Up', assisted_chin_up: 'Assisted Chin-Up', assisted_dip: 'Assisted Dip',
  machine_chest_press: 'Machine Chest Press', iso_lateral_chest_press: 'Iso-Lateral Chest Press',
  incline_machine_chest_press: 'Incline Machine Chest Press', decline_machine_chest_press: 'Decline Machine Chest Press',
  pec_deck_fly: 'Pec Deck Fly', reverse_pec_deck: 'Reverse Pec Deck', incline_machine_fly: 'Incline Machine Fly',
  machine_shoulder_press: 'Machine Shoulder Press', machine_lateral_raise: 'Machine Lateral Raise', preacher_curl: 'Preacher Curl',
  barbell_preacher_curl: 'Barbell Preacher Curl', ez_bar_preacher_curl: 'EZ Bar Preacher Curl', reverse_preacher_curl: 'Reverse Preacher Curl',
  machine_bicep_curl: 'Machine Bicep Curl', machine_triceps_extension: 'Machine Triceps Extension', seated_dip_machine: 'Seated Dip Machine',
  machine_pullover: 'Machine Pullover', machine_back_extension: 'Machine Back Extension', ab_crunch_machine: 'Ab Crunch Machine',
  rotary_torso_machine: 'Rotary Torso Machine', machine_shrug: 'Machine Shrug', treadmill_run: 'Treadmill Run',
  incline_treadmill_walk: 'Incline Treadmill Walk', stationary_bike: 'Stationary Bike', air_bike: 'Air Bike', elliptical: 'Elliptical',
  rowing_machine: 'Rowing Machine', stair_climber: 'Stair Climber',
};

/** A ready-list machine by id, or null. */
export function readyMachine(id: string): ReadyMachine | null {
  return READY_MACHINES.find((m) => m.id === id) ?? null;
}

/** Can this machine get busy (and so be guessed about)? 1 or 2 units, and at least one exercise. */
export function machineCounts(m: { units: number; ex: readonly string[] }): boolean {
  return m.units >= 1 && m.units <= BUSY_UNITS_MAX && m.ex.length > 0;
}
