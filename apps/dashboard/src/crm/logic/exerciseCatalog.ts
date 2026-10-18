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
 * also copied from the library, with a few common spellings added (the lifts listed first; the
 * body-weight and timed ones added on 18 Oct 2026 carry the library's aliases exactly).
 *
 * `logType` is the library's `type`: how the phone logs the exercise (weight and reps; reps only;
 * body weight plus added kg; a machine that takes kg off; a timed hold). The phone uses the plan's
 * type as given, so it must be the library's (the parity test checks it). Cardio machines (time and
 * distance) are not in the list: a plan's sets and reps do not fit them.
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
  logType: CatalogLogType;
}

/**
 * How the member app logs an exercise (apps/mobile/src/tracker/engine/logTypes.ts), for the types
 * this list holds: weight x reps; reps only (body weight); body weight + added kg (belt, vest);
 * a machine that helps (kg taken off); a hold for time.
 */
export type CatalogLogType = 'weight_reps' | 'reps' | 'weighted' | 'assisted' | 'time';

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
  // Chest: body weight, and with weight added or taken off
  { key: 'push_up', name: 'Push-Up', aliases: ['pushup', 'push ups', 'pushups', 'press up'], primary: ['chest'], logType: 'reps' },
  { key: 'incline_push_up', name: 'Incline Push-Up', aliases: ['incline pushup', 'bench push up', 'hands elevated push up', 'wall push up'], primary: ['chest'], logType: 'reps' },
  { key: 'knee_push_up', name: 'Knee Push-Up', aliases: ['knee pushup', 'knee push ups', 'kneeling push up', 'half push up'], primary: ['chest'], logType: 'reps' },
  { key: 'wide_push_up', name: 'Wide Push-Up', aliases: ['wide pushup', 'wide grip push up', 'wide arm push up'], primary: ['chest'], logType: 'reps' },
  { key: 'chest_dip', name: 'Chest Dip', aliases: ['dip', 'parallel bar dips', 'chest dips', 'dips'], primary: ['chest'], logType: 'reps' },
  { key: 'weighted_push_up', name: 'Weighted Push-Up', aliases: ['weighted pushup', 'plate push up', 'push up with plate', 'vest push up'], primary: ['chest'], logType: 'weighted' },
  { key: 'weighted_dip', name: 'Weighted Dip', aliases: ['weighted dips', 'belt dip', 'dip with belt', 'dip belt'], primary: ['chest'], logType: 'weighted' },
  { key: 'assisted_dip', name: 'Assisted Dip', aliases: ['assisted dip machine', 'machine assisted dip', 'dip assist'], primary: ['chest'], logType: 'assisted' },
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
  // Back: pull-ups and other body-weight pulls
  { key: 'chest_supported_t_bar_row', name: 'Chest-Supported T-Bar Row', aliases: ['chest supported t bar row', 'lying t bar row', 'incline t bar row', 't bar row machine', 'chest supported row machine'], primary: ['upper_back'], logType: 'weight_reps' },
  { key: 'pull_up', name: 'Pull-Up', aliases: ['pull up', 'pullup', 'pullups', 'pull-ups', 'pull ups', 'overhand pull up'], primary: ['lats'], logType: 'reps' },
  { key: 'chin_up', name: 'Chin-Up', aliases: ['chin up', 'chinup', 'chinups', 'chin-ups', 'chin ups', 'underhand pull up', 'reverse grip pull up'], primary: ['lats'], logType: 'reps' },
  { key: 'wide_grip_pull_up', name: 'Wide-Grip Pull-Up', aliases: ['wide grip pull up', 'wide pull up', 'wide grip pullup', 'wide grip chin up', 'wide pullups'], primary: ['lats'], logType: 'reps' },
  { key: 'neutral_grip_pull_up', name: 'Neutral-Grip Pull-Up', aliases: ['neutral grip pull up', 'neutral grip chin up', 'parallel grip pull up', 'hammer grip pull up', 'narrow parallel grip chin up'], primary: ['lats'], logType: 'reps' },
  { key: 'weighted_pull_up', name: 'Weighted Pull-Up', aliases: ['weighted pull up', 'weighted pullup', 'weighted pull ups', 'belt pull up', 'pull up with weight'], primary: ['lats'], logType: 'weighted' },
  { key: 'weighted_chin_up', name: 'Weighted Chin-Up', aliases: ['weighted chin up', 'weighted chinup', 'weighted chin ups', 'chin up with weight'], primary: ['lats'], logType: 'weighted' },
  { key: 'assisted_pull_up', name: 'Assisted Pull-Up', aliases: ['assisted pull up', 'assisted pullup', 'assisted pull ups', 'pull up machine', 'gravitron', 'assisted chin dip machine'], primary: ['lats'], logType: 'assisted' },
  { key: 'assisted_chin_up', name: 'Assisted Chin-Up', aliases: ['assisted chin up', 'assisted chinup', 'assisted chin ups', 'chin up machine'], primary: ['lats'], logType: 'assisted' },
  { key: 'inverted_row', name: 'Inverted Row', aliases: ['body row', 'bodyweight row', 'australian pull up', 'australian pullup', 'inverted rows', 'horizontal pull up'], primary: ['upper_back'], logType: 'reps' },
  { key: 'back_extension', name: 'Back Extension', aliases: ['hyperextension', 'hyper extension', 'hyperextensions', 'back extensions', 'roman chair', 'lower back extension', 'kamar'], primary: ['lower_back'], logType: 'reps' },
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
  // Arms: dips and more
  { key: 'cable_overhead_triceps_extension', name: 'Cable Overhead Triceps Extension', aliases: ['overhead rope extension', 'rope overhead extension', 'cable overhead extension', 'overhead cable extension'], primary: ['triceps'], logType: 'weight_reps' },
  { key: 'triceps_dip', name: 'Triceps Dip', aliases: ['tricep dip', 'triceps dips', 'upright dip', 'bar dip'], primary: ['triceps'], logType: 'reps' },
  { key: 'bench_dip', name: 'Bench Dip', aliases: ['bench dips', 'chair dip', 'bench tricep dip', 'tricep bench dip'], primary: ['triceps'], logType: 'reps' },
  { key: 'diamond_push_up', name: 'Diamond Push-Up', aliases: ['diamond pushup', 'diamond push ups', 'triangle push up'], primary: ['triceps'], logType: 'reps' },
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
  // Legs: body weight and timed
  { key: 'dumbbell_romanian_deadlift', name: 'Dumbbell Romanian Deadlift', aliases: ['db rdl', 'dumbbell rdl', 'dumbbell stiff leg deadlift'], primary: ['hamstrings'], logType: 'weight_reps' },
  { key: 'air_squat', name: 'Air Squat', aliases: ['bodyweight squat', 'free squat', 'uthak baithak', 'no weight squat', 'उठक बैठक'], primary: ['quads'], logType: 'reps' },
  { key: 'bodyweight_lunge', name: 'Bodyweight Lunge', aliases: ['bodyweight lunges', 'free lunge', 'lunge without weight'], primary: ['quads'], logType: 'reps' },
  { key: 'glute_bridge', name: 'Glute Bridge', aliases: ['glute bridge', 'glute bridges', 'hip bridge', 'bridge'], primary: ['glutes'], logType: 'reps' },
  { key: 'box_jump', name: 'Box Jump', aliases: ['box jumps', 'plyo box jump', 'jump on box'], primary: ['quads'], logType: 'reps' },
  { key: 'wall_sit', name: 'Wall Sit', aliases: ['wall squat', 'wall chair', 'invisible chair'], primary: ['quads'], logType: 'time' },
  // Core and forearms
  { key: 'cable_crunch', name: 'Cable Crunch', aliases: ['rope crunch', 'kneeling crunch', 'pet crunch', 'kneeling cable crunch', 'cable ab crunch'], primary: ['abs'], logType: 'weight_reps' },
  { key: 'ab_crunch_machine', name: 'Ab Crunch Machine', aliases: ['machine crunch', 'ab machine', 'abdominal crunch machine', 'seated crunch machine'], primary: ['abs'], logType: 'weight_reps' },
  { key: 'weighted_russian_twist', name: 'Weighted Russian Twist', aliases: ['russian twist with plate', 'plate twist', 'medicine ball twist', 'weighted twist'], primary: ['obliques'], logType: 'weight_reps' },
  { key: 'barbell_wrist_curl', name: 'Barbell Wrist Curl', aliases: ['wrist curl', 'palms up wrist curl', 'seated wrist curl', 'bb wrist curl', 'kalai curl'], primary: ['forearms'], logType: 'weight_reps' },
  // Core: body weight and timed holds
  { key: 'plank', name: 'Plank', aliases: ['front plank', 'forearm plank', 'elbow plank', 'plank hold'], primary: ['abs'], logType: 'time' },
  { key: 'side_plank', name: 'Side Plank', aliases: ['side planks', 'side bridge', 'oblique plank'], primary: ['obliques'], logType: 'time' },
  { key: 'hanging_leg_raise', name: 'Hanging Leg Raise', aliases: ['leg raise', 'hanging raises', 'pet ki exercise', 'hanging leg raises', 'bar leg raise'], primary: ['abs'], logType: 'reps' },
  { key: 'hanging_knee_raise', name: 'Hanging Knee Raise', aliases: ['knee raise', 'hanging knee up', 'hanging knee tuck', 'bar knee raise'], primary: ['abs'], logType: 'reps' },
  { key: 'captains_chair_knee_raise', name: 'Captain\'s Chair Knee Raise', aliases: ['vertical knee raise', 'dip station knee raise', 'captain chair knee raise', 'knee raise station'], primary: ['abs'], logType: 'reps' },
  { key: 'crunch', name: 'Crunch', aliases: ['crunches', 'ab crunch', 'floor crunch', 'basic crunch'], primary: ['abs'], logType: 'reps' },
  { key: 'sit_up', name: 'Sit-Up', aliases: ['situp', 'sit ups', 'full sit up'], primary: ['abs'], logType: 'reps' },
  { key: 'decline_sit_up', name: 'Decline Sit-Up', aliases: ['decline situp', 'decline bench sit up', 'decline sit ups'], primary: ['abs'], logType: 'reps' },
  { key: 'lying_leg_raise', name: 'Lying Leg Raise', aliases: ['leg raises', 'floor leg raise', 'bench leg raise', 'lying leg lift', 'flat bench leg raise'], primary: ['abs'], logType: 'reps' },
  { key: 'bicycle_crunch', name: 'Bicycle Crunch', aliases: ['bicycle crunches', 'cycle crunch', 'bicycle abs', 'cycling crunch'], primary: ['abs', 'obliques'], logType: 'reps' },
  { key: 'russian_twist', name: 'Russian Twist', aliases: ['russian twists', 'seated twist', 'side to side twist'], primary: ['obliques'], logType: 'reps' },
  { key: 'ab_wheel_rollout', name: 'Ab Wheel Rollout', aliases: ['ab wheel', 'ab roller', 'ab rollout', 'wheel rollout'], primary: ['abs'], logType: 'reps' },
  { key: 'dead_bug', name: 'Dead Bug', aliases: ['deadbug', 'dead bugs'], primary: ['abs'], logType: 'reps' },
  { key: 'mountain_climber', name: 'Mountain Climber', aliases: ['mountain climbers', 'climbers', 'running plank'], primary: ['abs'], logType: 'time' },
  { key: 'dead_hang', name: 'Dead Hang', aliases: ['bar hang', 'passive hang', 'hang from bar', 'latakna'], primary: ['forearms'], logType: 'time' },
  { key: 'burpee', name: 'Burpee', aliases: ['burpees', 'full burpee', 'burpee push-up'], primary: ['cardio'], logType: 'reps' },
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

const LOG_TYPE_WORD: Record<CatalogLogType, string> = {
  weight_reps: '',
  reps: 'Body weight',
  weighted: 'Body weight + added weight',
  assisted: 'Machine takes weight off',
  time: 'Held for time',
};

/** How the member logs it, in words for a list row ("Held for time"); weight and reps say nothing. */
export function logTypeWords(t: string): string {
  return LOG_TYPE_WORD[t as CatalogLogType] ?? '';
}
