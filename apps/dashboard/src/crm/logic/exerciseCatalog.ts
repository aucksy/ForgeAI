/**
 * The exercises a trainer picks from when making a workout plan (18 Oct 2026, OWNER-INBOX #6). PURE.
 *
 * A SMALL hand-picked list of the common gym lifts, until a shared catalogue package exists
 * (docs/overhaul/plans/gym-workout-plans.md). Every `key`, `name` and `primary` is copied exactly
 * from the member app's library (apps/mobile/src/tracker/catalog/catalogData.ts), so the phone lands
 * each exercise on its own library exercise; test/crm/exerciseCatalog.test.ts checks that. A key is
 * never renamed or reused there, so a plan saved today keeps working.
 *
 * `aliases` are the words people type at an Indian gym ("chhati press", "dole", "baithak", "pindli", "डोले"…),
 * also copied from the library, with a few common spellings added. Only weight-and-reps lifts for
 * now: the plan's sets and rep range fit them; timed and bodyweight moves come later.
 */

/** The member app's muscle names (apps/mobile/src/tracker/catalog/muscles.ts). */
export type Muscle =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'lats'
  | 'upper_back'
  | 'traps'
  | 'lower_back'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'adductors'
  | 'abductors'
  | 'calves'
  | 'cardio';

export interface CatalogExercise {
  /** The library key (the phone finds the exercise by it). */
  key: string;
  name: string;
  /** Other names people type, Hindi gym words included. */
  aliases: readonly string[];
  primary: readonly Muscle[];
  logType: 'weight_reps';
}

export const EXERCISE_CATALOG: readonly CatalogExercise[] = [
  // Chest
  { key: 'barbell_bench_press', name: 'Barbell Bench Press', aliases: ['bench', 'bench press', 'chest press', 'flat bench', 'chhati', 'chhati press', 'flat bench press', 'bb bench press'], primary: ['chest'], logType: 'weight_reps' },
  { key: 'incline_barbell_press', name: 'Incline Barbell Press', aliases: ['incline bench', 'incline press', 'incline barbell', 'upper chest press', 'incline bench press', 'incline bb press'], primary: ['chest'], logType: 'weight_reps' },
  { key: 'decline_barbell_bench_press', name: 'Decline Barbell Bench Press', aliases: ['decline bench', 'decline press', 'decline bench press', 'lower chest press'], primary: ['chest'], logType: 'weight_reps' },
  { key: 'dumbbell_bench_press', name: 'Dumbbell Bench Press', aliases: ['db bench press', 'db bench', 'flat dumbbell press', 'dumbbell chest press', 'flat db press'], primary: ['chest'], logType: 'weight_reps' },
  { key: 'incline_dumbbell_press', name: 'Incline Dumbbell Press', aliases: ['incline db press', 'incline dumbbell', 'db incline press', 'incline dumbbell bench press'], primary: ['chest'], logType: 'weight_reps' },
  { key: 'dumbbell_fly', name: 'Dumbbell Fly', aliases: ['db fly', 'dumbbell flye', 'dumbbell flys', 'flat dumbbell fly', 'flat fly'], primary: ['chest'], logType: 'weight_reps' },
  { key: 'pec_deck_fly', name: 'Pec Deck Fly', aliases: ['pec deck', 'butterfly', 'machine fly', 'pec fly', 'chest fly machine', 'butterfly machine'], primary: ['chest'], logType: 'weight_reps' },
  { key: 'cable_fly', name: 'Cable Fly', aliases: ['cable crossover', 'fly', 'flys', 'chest fly', 'cable crossovers', 'high cable fly'], primary: ['chest'], logType: 'weight_reps' },
  { key: 'machine_chest_press', name: 'Machine Chest Press', aliases: ['chest press machine', 'seated chest press', 'machine press', 'machine bench press'], primary: ['chest'], logType: 'weight_reps' },
  { key: 'smith_machine_bench_press', name: 'Smith Machine Bench Press', aliases: ['smith bench press', 'smith bench', 'smith flat bench'], primary: ['chest'], logType: 'weight_reps' },
  { key: 'dumbbell_pullover', name: 'Dumbbell Pullover', aliases: ['db pullover', 'pullover', 'cross bench pullover', 'straight arm pullover', 'lying pullover', 'dumbbell pull over', 'bench pullover'], primary: ['chest'], logType: 'weight_reps' },
  // Back
  { key: 'deadlift', name: 'Deadlift', aliases: ['dl', 'deads', 'conventional deadlift', 'barbell deadlift', 'dead lift', 'deadlifts', 'dedlift'], primary: ['lower_back', 'glutes'], logType: 'weight_reps' },
  { key: 'lat_pulldown', name: 'Lat Pulldown', aliases: ['pulldown', 'lat pull down', 'lats', 'peeth pulldown', 'lat machine', 'wide grip lat pulldown', 'wide grip pulldown', 'front lat pulldown', 'cable pulldown', 'lat pull'], primary: ['lats'], logType: 'weight_reps' },
  { key: 'close_grip_lat_pulldown', name: 'Close-Grip Lat Pulldown', aliases: ['close grip pulldown', 'v bar pulldown', 'v grip pulldown', 'v handle pulldown', 'narrow grip pulldown', 'neutral grip pulldown'], primary: ['lats'], logType: 'weight_reps' },
  { key: 'seated_cable_row', name: 'Seated Cable Row', aliases: ['cable row', 'seated row', 'low row', 'v grip cable row', 'v bar row', 'close grip cable row', 'seated rowing', 'cable rowing'], primary: ['upper_back'], logType: 'weight_reps' },
  { key: 'barbell_row', name: 'Barbell Row', aliases: ['row', 'bent over row', 'bb row', 'barbell rowing', 'peeth row', 'bent over barbell row', 'bent-over row', 'overhand barbell row'], primary: ['upper_back'], logType: 'weight_reps' },
  { key: 'one_arm_dumbbell_row', name: 'One-Arm Dumbbell Row', aliases: ['dumbbell row', 'db row', 'one arm row', 'single arm dumbbell row', 'one arm dumbbell rowing', 'dumbbell rowing', 'bench dumbbell row'], primary: ['lats'], logType: 'weight_reps' },
  { key: 't_bar_row', name: 'T-Bar Row', aliases: ['t bar row', 'tbar row', 't bar rowing', 't-bar rows', 'landmine row', 'v handle t bar row'], primary: ['upper_back'], logType: 'weight_reps' },
  { key: 'straight_arm_pulldown', name: 'Straight-Arm Pulldown', aliases: ['straight arm pulldown', 'straight arm lat pulldown', 'straight arm pushdown', 'lat pushdown', 'standing lat pulldown'], primary: ['lats'], logType: 'weight_reps' },
  { key: 'weighted_back_extension', name: 'Weighted Back Extension', aliases: ['weighted hyperextension', 'weighted hyper extension', 'plate back extension', 'loaded back extension'], primary: ['lower_back'], logType: 'weight_reps' },
  { key: 'rack_pull', name: 'Rack Pull', aliases: ['rack pulls', 'rack deadlift', 'block pull', 'partial deadlift', 'pin pull'], primary: ['lower_back'], logType: 'weight_reps' },
  { key: 'seated_machine_row', name: 'Seated Machine Row', aliases: ['machine row', 'seated row machine', 'chest supported machine row', 'machine rowing', 'seated machine rowing'], primary: ['upper_back'], logType: 'weight_reps' },
  // Shoulders and traps
  { key: 'overhead_press', name: 'Overhead Press', aliases: ['ohp', 'military press', 'shoulder press', 'barbell shoulder press', 'kandha press', 'kandhe', 'standing barbell press', 'standing ohp'], primary: ['front_delts'], logType: 'weight_reps' },
  { key: 'dumbbell_shoulder_press', name: 'Dumbbell Shoulder Press', aliases: ['db shoulder press', 'seated dumbbell press', 'dumbbell press', 'seated db shoulder press'], primary: ['front_delts'], logType: 'weight_reps' },
  { key: 'arnold_press', name: 'Arnold Press', aliases: ['arnold dumbbell press', 'arnold shoulder press', 'arnolds'], primary: ['front_delts'], logType: 'weight_reps' },
  { key: 'lateral_raise', name: 'Lateral Raise', aliases: ['side raise', 'laterals', 'side laterals', 'db lateral raise', 'dumbbell lateral raise', 'side lateral raise'], primary: ['side_delts'], logType: 'weight_reps' },
  { key: 'cable_lateral_raise', name: 'Cable Lateral Raise', aliases: ['two arm cable lateral raise', 'cable side raise', 'cable laterals', 'double cable lateral raise'], primary: ['side_delts'], logType: 'weight_reps' },
  { key: 'dumbbell_front_raise', name: 'Dumbbell Front Raise', aliases: ['front raise', 'db front raise', 'front raises', 'front delt raise'], primary: ['front_delts'], logType: 'weight_reps' },
  { key: 'rear_delt_fly', name: 'Rear Delt Fly', aliases: ['reverse fly', 'rear delts', 'bent over rear delt fly', 'bent over lateral raise', 'rear delt raise', 'dumbbell reverse fly'], primary: ['rear_delts'], logType: 'weight_reps' },
  { key: 'face_pull', name: 'Face Pull', aliases: ['rope face pull', 'facepull', 'rear delt pull', 'face pulls', 'cable face pull'], primary: ['rear_delts'], logType: 'weight_reps' },
  { key: 'barbell_upright_row', name: 'Barbell Upright Row', aliases: ['upright row', 'bb upright row', 'barbell upright rows'], primary: ['side_delts'], logType: 'weight_reps' },
  { key: 'machine_shoulder_press', name: 'Machine Shoulder Press', aliases: ['shoulder press machine', 'seated shoulder press machine', 'machine ohp', 'machine overhead press'], primary: ['front_delts'], logType: 'weight_reps' },
  { key: 'reverse_pec_deck', name: 'Reverse Pec Deck', aliases: ['rear delt machine', 'reverse fly machine', 'rear delt fly machine', 'machine reverse fly'], primary: ['rear_delts'], logType: 'weight_reps' },
  { key: 'barbell_shrug', name: 'Barbell Shrug', aliases: ['barbell shrugs', 'bb shrug', 'bar shrug'], primary: ['traps'], logType: 'weight_reps' },
  { key: 'dumbbell_shrug', name: 'Dumbbell Shrug', aliases: ['shrugs', 'trap shrug', 'traps', 'db shrug', 'dumbbell shrugs', 'shoulder shrug', 'kandhe uchkana'], primary: ['traps'], logType: 'weight_reps' },
  // Arms
  { key: 'barbell_curl', name: 'Barbell Curl', aliases: ['bb curl', 'curl', 'biceps curl', 'dole', 'dole curl', 'barbell bicep curl', 'rod curl', 'standing barbell curl', 'डोले'], primary: ['biceps'], logType: 'weight_reps' },
  { key: 'dumbbell_curl', name: 'Dumbbell Curl', aliases: ['db curl', 'alternate curl', 'bicep curl', 'dumbbell bicep curl', 'dumble curl', 'standing dumbbell curl'], primary: ['biceps'], logType: 'weight_reps' },
  { key: 'hammer_curl', name: 'Hammer Curl', aliases: ['hammers', 'neutral grip curl', 'db hammer curl', 'dumbbell hammer curl', 'dumble hammer curl'], primary: ['biceps'], logType: 'weight_reps' },
  { key: 'preacher_curl', name: 'Preacher Curl', aliases: ['machine preacher curl', 'scott curl', 'preacher curl machine', 'preacher machine'], primary: ['biceps'], logType: 'weight_reps' },
  { key: 'ez_bar_curl', name: 'EZ Bar Curl', aliases: ['ez curl', 'ez bar bicep curl', 'z bar curl', 'zigzag rod curl', 'curl bar curl'], primary: ['biceps'], logType: 'weight_reps' },
  { key: 'concentration_curl', name: 'Concentration Curl', aliases: ['concentration', 'db concentration curl', 'seated concentration curl'], primary: ['biceps'], logType: 'weight_reps' },
  { key: 'cable_curl', name: 'Cable Curl', aliases: ['cable bicep curl', 'cable bar curl', 'standing cable curl', 'cable ez bar curl'], primary: ['biceps'], logType: 'weight_reps' },
  { key: 'incline_dumbbell_curl', name: 'Incline Dumbbell Curl', aliases: ['incline curl', 'seated incline curl', 'incline db curl'], primary: ['biceps'], logType: 'weight_reps' },
  { key: 'triceps_pushdown', name: 'Triceps Pushdown', aliases: ['pushdown', 'rope pushdown', 'cable pushdown', 'tricep pushdown', 'bar pushdown', 'tricep pressdown', 'straight bar pushdown', 'tricep', 'triceps'], primary: ['triceps'], logType: 'weight_reps' },
  { key: 'rope_triceps_pushdown', name: 'Rope Triceps Pushdown', aliases: ['tricep rope', 'triceps rope', 'rope pressdown', 'rope tricep pushdown'], primary: ['triceps'], logType: 'weight_reps' },
  { key: 'overhead_triceps_extension', name: 'Overhead Triceps Extension', aliases: ['overhead extension', 'french press', 'tricep extension', 'db overhead extension', 'dumbbell overhead extension', 'two hand overhead extension'], primary: ['triceps'], logType: 'weight_reps' },
  { key: 'ez_bar_skull_crusher', name: 'EZ Bar Skull Crusher', aliases: ['ez skull crusher', 'ez bar skullcrusher', 'z bar skull crusher', 'lying ez bar extension', 'zigzag rod skull crusher'], primary: ['triceps'], logType: 'weight_reps' },
  { key: 'close_grip_bench_press', name: 'Close-Grip Bench Press', aliases: ['cgbp', 'close grip bench', 'close grip press', 'narrow grip bench press'], primary: ['triceps'], logType: 'weight_reps' },
  { key: 'dumbbell_triceps_kickback', name: 'Dumbbell Triceps Kickback', aliases: ['kickback', 'tricep kickback', 'db kickback', 'one arm kickback', 'dumbbell kickback'], primary: ['triceps'], logType: 'weight_reps' },
  // Legs
  { key: 'barbell_back_squat', name: 'Barbell Squat', aliases: ['squat', 'squats', 'back squat', 'baithak', 'bb squat', 'barbell back squat', 'बैठक'], primary: ['quads'], logType: 'weight_reps' },
  { key: 'front_squat', name: 'Front Squat', aliases: ['front squats', 'barbell front squat'], primary: ['quads'], logType: 'weight_reps' },
  { key: 'leg_press', name: 'Leg Press', aliases: ['leg press machine', '45 degree leg press', 'leg press 45'], primary: ['quads'], logType: 'weight_reps' },
  { key: 'hack_squat', name: 'Hack Squat', aliases: ['hack squat machine', 'hack machine', 'machine hack squat'], primary: ['quads'], logType: 'weight_reps' },
  { key: 'leg_extension', name: 'Leg Extension', aliases: ['quad extension', 'extensions', 'leg extensions', 'leg extension machine'], primary: ['quads'], logType: 'weight_reps' },
  { key: 'lying_leg_curl', name: 'Lying Leg Curl', aliases: ['leg curl', 'hamstring curl', 'ham curl', 'lying leg curls', 'prone leg curl'], primary: ['hamstrings'], logType: 'weight_reps' },
  { key: 'seated_leg_curl', name: 'Seated Leg Curl', aliases: ['seated leg curls', 'seated hamstring curl', 'sitting leg curl'], primary: ['hamstrings'], logType: 'weight_reps' },
  { key: 'romanian_deadlift', name: 'Romanian Deadlift', aliases: ['rdl', 'stiff leg deadlift', 'romanian dl', 'barbell rdl'], primary: ['hamstrings'], logType: 'weight_reps' },
  { key: 'dumbbell_lunge', name: 'Dumbbell Lunge', aliases: ['forward lunge', 'front lunge', 'dumbbell forward lunge', 'dumbbell lunges'], primary: ['quads'], logType: 'weight_reps' },
  { key: 'walking_lunge', name: 'Walking Lunge', aliases: ['lunges', 'db lunges', 'lunge', 'walking lunges', 'dumbbell walking lunge'], primary: ['quads'], logType: 'weight_reps' },
  { key: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', aliases: ['bss', 'split squat', 'bulgarian', 'rear foot elevated split squat', 'db bulgarian split squat'], primary: ['quads'], logType: 'weight_reps' },
  { key: 'goblet_squat', name: 'Goblet Squat', aliases: ['kettlebell goblet squat', 'kb goblet squat', 'dumbbell goblet squat', 'db goblet squat'], primary: ['quads'], logType: 'weight_reps' },
  { key: 'barbell_hip_thrust', name: 'Barbell Hip Thrust', aliases: ['hip thrust', 'thrusts', 'hip thrusts', 'glute thrust'], primary: ['glutes'], logType: 'weight_reps' },
  { key: 'standing_calf_raise', name: 'Standing Calf Raise', aliases: ['calf raise', 'calves', 'standing calves', 'pindli', 'standing calf machine', 'calf raise machine'], primary: ['calves'], logType: 'weight_reps' },
  { key: 'seated_calf_raise', name: 'Seated Calf Raise', aliases: ['seated calves', 'seated calf', 'seated calf machine'], primary: ['calves'], logType: 'weight_reps' },
  { key: 'smith_machine_squat', name: 'Smith Machine Squat', aliases: ['smith squat', 'smith machine squats'], primary: ['quads'], logType: 'weight_reps' },
  { key: 'hip_abduction_machine', name: 'Hip Abduction Machine', aliases: ['abductor machine', 'outer thigh machine', 'hip abductor', 'outer thigh', 'abduction machine'], primary: ['abductors'], logType: 'weight_reps' },
  { key: 'hip_adduction_machine', name: 'Hip Adduction Machine', aliases: ['adductor machine', 'inner thigh machine', 'hip adductor', 'inner thigh', 'adduction machine'], primary: ['adductors'], logType: 'weight_reps' },
  // Core and forearms
  { key: 'cable_crunch', name: 'Cable Crunch', aliases: ['rope crunch', 'kneeling crunch', 'pet crunch', 'kneeling cable crunch', 'cable ab crunch'], primary: ['abs'], logType: 'weight_reps' },
  { key: 'ab_crunch_machine', name: 'Ab Crunch Machine', aliases: ['machine crunch', 'ab machine', 'abdominal crunch machine', 'seated crunch machine'], primary: ['abs'], logType: 'weight_reps' },
  { key: 'weighted_russian_twist', name: 'Weighted Russian Twist', aliases: ['russian twist with plate', 'plate twist', 'medicine ball twist', 'weighted twist'], primary: ['obliques'], logType: 'weight_reps' },
  { key: 'barbell_wrist_curl', name: 'Barbell Wrist Curl', aliases: ['wrist curl', 'palms up wrist curl', 'seated wrist curl', 'bb wrist curl', 'kalai curl'], primary: ['forearms'], logType: 'weight_reps' },
];

const MUSCLE_WORD: Record<Muscle, string> = {
  chest: 'Chest',
  front_delts: 'Front shoulders',
  side_delts: 'Side shoulders',
  rear_delts: 'Rear shoulders',
  lats: 'Lats',
  upper_back: 'Upper back',
  traps: 'Traps',
  lower_back: 'Lower back',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  adductors: 'Inner thighs',
  abductors: 'Outer thighs',
  calves: 'Calves',
  cardio: 'Cardio',
};

/** "Chest" / "Lower back, Glutes" — the muscles in words for a list row. */
export function musclesWords(primary: readonly string[]): string {
  return primary.map((m) => MUSCLE_WORD[m as Muscle] ?? m).join(', ');
}

/** The catalogue entry for a key, or null (an exercise typed by hand has none). */
export function catalogExercise(key: string | null | undefined): CatalogExercise | null {
  return key ? (EXERCISE_CATALOG.find((e) => e.key === key) ?? null) : null;
}
