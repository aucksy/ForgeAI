/**
 * Seed exercise catalog (~38 movements) with Hindi/Hinglish aliases for
 * natural-language matching. Increment convention: barbell upper-body 2.5,
 * dumbbells 2.5, machines/cables 5, barbell leg lifts 5, bodyweight 2.5.
 */
import type { Exercise } from '@/types/models';

export type ExerciseKey =
  | 'benchPress'
  | 'inclineBarbellPress'
  | 'inclineDbPress'
  | 'machineChestPress'
  | 'pecDeck'
  | 'cableFly'
  | 'overheadPress'
  | 'dbShoulderPress'
  | 'lateralRaise'
  | 'facePull'
  | 'rearDeltFly'
  | 'deadlift'
  | 'barbellRow'
  | 'latPulldown'
  | 'seatedCableRow'
  | 'pullUp'
  | 'shrug'
  | 'barbellCurl'
  | 'dumbbellCurl'
  | 'hammerCurl'
  | 'preacherCurl'
  | 'tricepsPushdown'
  | 'overheadTricepsExtension'
  | 'closeGripBench'
  | 'dip'
  | 'squat'
  | 'frontSquat'
  | 'legPress'
  | 'legExtension'
  | 'legCurl'
  | 'romanianDeadlift'
  | 'hipThrust'
  | 'bulgarianSplitSquat'
  | 'walkingLunge'
  | 'standingCalfRaise'
  | 'seatedCalfRaise'
  | 'cableCrunch'
  | 'hangingLegRaise';

export interface SeedExerciseSpec extends Omit<Exercise, 'id'> {
  key: ExerciseKey;
}

export const EXERCISES: readonly SeedExerciseSpec[] = [
  // ------------------------------------------------------------- chest
  {
    key: 'benchPress',
    name: 'Barbell Bench Press',
    aliases: ['bench', 'bench press', 'chest press', 'flat bench', 'chhati', 'chhati press'],
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 2.5,
  },
  {
    key: 'inclineBarbellPress',
    name: 'Incline Barbell Press',
    aliases: ['incline bench', 'incline press', 'incline barbell', 'upper chest press'],
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders', 'triceps'],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 2.5,
  },
  {
    key: 'inclineDbPress',
    name: 'Incline Dumbbell Press',
    aliases: ['incline db press', 'incline dumbbell', 'db incline press'],
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders', 'triceps'],
    equipment: 'dumbbell',
    isCompound: true,
    incrementKg: 2.5,
  },
  {
    key: 'machineChestPress',
    name: 'Machine Chest Press',
    aliases: ['chest press machine', 'seated chest press', 'machine press'],
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps'],
    equipment: 'machine',
    isCompound: true,
    incrementKg: 5,
  },
  {
    key: 'pecDeck',
    name: 'Pec Deck Fly',
    aliases: ['pec deck', 'butterfly', 'machine fly', 'pec fly'],
    muscleGroup: 'chest',
    secondaryMuscles: [],
    equipment: 'machine',
    isCompound: false,
    incrementKg: 5,
  },
  {
    key: 'cableFly',
    name: 'Cable Fly',
    aliases: ['cable crossover', 'fly', 'flys', 'chest fly'],
    muscleGroup: 'chest',
    secondaryMuscles: [],
    equipment: 'cable',
    isCompound: false,
    incrementKg: 5,
  },
  // ---------------------------------------------------------- shoulders
  {
    key: 'overheadPress',
    name: 'Overhead Press',
    aliases: ['ohp', 'military press', 'shoulder press', 'barbell shoulder press', 'kandha press', 'kandhe'],
    muscleGroup: 'shoulders',
    secondaryMuscles: ['triceps'],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 2.5,
  },
  {
    key: 'dbShoulderPress',
    name: 'Dumbbell Shoulder Press',
    aliases: ['db shoulder press', 'seated dumbbell press', 'dumbbell press'],
    muscleGroup: 'shoulders',
    secondaryMuscles: ['triceps'],
    equipment: 'dumbbell',
    isCompound: true,
    incrementKg: 2.5,
  },
  {
    key: 'lateralRaise',
    name: 'Lateral Raise',
    aliases: ['side raise', 'laterals', 'side laterals', 'db lateral raise'],
    muscleGroup: 'shoulders',
    secondaryMuscles: [],
    equipment: 'dumbbell',
    isCompound: false,
    incrementKg: 2.5,
  },
  {
    key: 'facePull',
    name: 'Face Pull',
    aliases: ['rope face pull', 'facepull', 'rear delt pull'],
    muscleGroup: 'shoulders',
    secondaryMuscles: ['back'],
    equipment: 'cable',
    isCompound: false,
    incrementKg: 5,
  },
  {
    key: 'rearDeltFly',
    name: 'Rear Delt Fly',
    aliases: ['reverse fly', 'rear delts', 'reverse pec deck'],
    muscleGroup: 'shoulders',
    secondaryMuscles: ['back'],
    equipment: 'dumbbell',
    isCompound: false,
    incrementKg: 2.5,
  },
  // --------------------------------------------------------------- back
  {
    key: 'deadlift',
    name: 'Deadlift',
    aliases: ['dl', 'deads', 'conventional deadlift'],
    muscleGroup: 'back',
    secondaryMuscles: ['hamstrings', 'glutes', 'forearms'],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 5,
  },
  {
    key: 'barbellRow',
    name: 'Barbell Row',
    aliases: ['row', 'bent over row', 'bb row', 'barbell rowing', 'peeth row'],
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'forearms'],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 2.5,
  },
  {
    key: 'latPulldown',
    name: 'Lat Pulldown',
    aliases: ['pulldown', 'lat pull down', 'lats', 'peeth pulldown'],
    muscleGroup: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'machine',
    isCompound: true,
    incrementKg: 5,
  },
  {
    key: 'seatedCableRow',
    name: 'Seated Cable Row',
    aliases: ['cable row', 'seated row', 'low row'],
    muscleGroup: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'cable',
    isCompound: true,
    incrementKg: 5,
  },
  {
    key: 'pullUp',
    name: 'Pull Up',
    aliases: ['pullups', 'pull-ups', 'chin up', 'chinups'],
    muscleGroup: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'bodyweight',
    isCompound: true,
    incrementKg: 2.5,
  },
  {
    key: 'shrug',
    name: 'Dumbbell Shrug',
    aliases: ['shrugs', 'trap shrug', 'traps'],
    muscleGroup: 'back',
    secondaryMuscles: ['forearms'],
    equipment: 'dumbbell',
    isCompound: false,
    incrementKg: 2.5,
  },
  // ------------------------------------------------------------- biceps
  {
    key: 'barbellCurl',
    name: 'Barbell Curl',
    aliases: ['bb curl', 'curl', 'biceps curl', 'dole', 'dole curl'],
    muscleGroup: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'barbell',
    isCompound: false,
    incrementKg: 2.5,
  },
  {
    key: 'dumbbellCurl',
    name: 'Dumbbell Curl',
    aliases: ['db curl', 'alternate curl', 'bicep curl'],
    muscleGroup: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'dumbbell',
    isCompound: false,
    incrementKg: 2.5,
  },
  {
    key: 'hammerCurl',
    name: 'Hammer Curl',
    aliases: ['hammers', 'neutral grip curl'],
    muscleGroup: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'dumbbell',
    isCompound: false,
    incrementKg: 2.5,
  },
  {
    key: 'preacherCurl',
    name: 'Preacher Curl',
    aliases: ['machine preacher curl', 'scott curl'],
    muscleGroup: 'biceps',
    secondaryMuscles: [],
    equipment: 'machine',
    isCompound: false,
    incrementKg: 5,
  },
  // ------------------------------------------------------------ triceps
  {
    key: 'tricepsPushdown',
    name: 'Triceps Pushdown',
    aliases: ['pushdown', 'rope pushdown', 'cable pushdown', 'tricep pushdown'],
    muscleGroup: 'triceps',
    secondaryMuscles: [],
    equipment: 'cable',
    isCompound: false,
    incrementKg: 5,
  },
  {
    key: 'overheadTricepsExtension',
    name: 'Overhead Triceps Extension',
    aliases: ['overhead extension', 'french press', 'tricep extension'],
    muscleGroup: 'triceps',
    secondaryMuscles: [],
    equipment: 'dumbbell',
    isCompound: false,
    incrementKg: 2.5,
  },
  {
    key: 'closeGripBench',
    name: 'Close Grip Bench Press',
    aliases: ['cgbp', 'close grip bench', 'close grip press'],
    muscleGroup: 'triceps',
    secondaryMuscles: ['chest', 'shoulders'],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 2.5,
  },
  {
    key: 'dip',
    name: 'Dips',
    aliases: ['dip', 'parallel bar dips', 'chest dips'],
    muscleGroup: 'triceps',
    secondaryMuscles: ['chest', 'shoulders'],
    equipment: 'bodyweight',
    isCompound: true,
    incrementKg: 2.5,
  },
  // --------------------------------------------------------------- legs
  {
    key: 'squat',
    name: 'Barbell Squat',
    aliases: ['squat', 'squats', 'back squat', 'baithak'],
    muscleGroup: 'quads',
    secondaryMuscles: ['glutes', 'hamstrings', 'core'],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 5,
  },
  {
    key: 'frontSquat',
    name: 'Front Squat',
    aliases: ['front squats'],
    muscleGroup: 'quads',
    secondaryMuscles: ['glutes', 'core'],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 5,
  },
  {
    key: 'legPress',
    name: 'Leg Press',
    aliases: ['leg press machine', '45 degree leg press'],
    muscleGroup: 'quads',
    secondaryMuscles: ['glutes'],
    equipment: 'machine',
    isCompound: true,
    incrementKg: 5,
  },
  {
    key: 'legExtension',
    name: 'Leg Extension',
    aliases: ['quad extension', 'extensions'],
    muscleGroup: 'quads',
    secondaryMuscles: [],
    equipment: 'machine',
    isCompound: false,
    incrementKg: 5,
  },
  {
    key: 'legCurl',
    name: 'Lying Leg Curl',
    aliases: ['leg curl', 'hamstring curl', 'ham curl'],
    muscleGroup: 'hamstrings',
    secondaryMuscles: [],
    equipment: 'machine',
    isCompound: false,
    incrementKg: 5,
  },
  {
    key: 'romanianDeadlift',
    name: 'Romanian Deadlift',
    aliases: ['rdl', 'stiff leg deadlift', 'romanian dl'],
    muscleGroup: 'hamstrings',
    secondaryMuscles: ['glutes', 'back'],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 5,
  },
  {
    key: 'hipThrust',
    name: 'Barbell Hip Thrust',
    aliases: ['hip thrust', 'glute bridge', 'thrusts'],
    muscleGroup: 'glutes',
    secondaryMuscles: ['hamstrings'],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 5,
  },
  {
    key: 'bulgarianSplitSquat',
    name: 'Bulgarian Split Squat',
    aliases: ['bss', 'split squat', 'bulgarian'],
    muscleGroup: 'quads',
    secondaryMuscles: ['glutes'],
    equipment: 'dumbbell',
    isCompound: true,
    incrementKg: 2.5,
  },
  {
    key: 'walkingLunge',
    name: 'Walking Lunge',
    aliases: ['lunges', 'db lunges', 'lunge'],
    muscleGroup: 'quads',
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: 'dumbbell',
    isCompound: true,
    incrementKg: 2.5,
  },
  {
    key: 'standingCalfRaise',
    name: 'Standing Calf Raise',
    aliases: ['calf raise', 'calves', 'standing calves', 'pindli'],
    muscleGroup: 'calves',
    secondaryMuscles: [],
    equipment: 'machine',
    isCompound: false,
    incrementKg: 5,
  },
  {
    key: 'seatedCalfRaise',
    name: 'Seated Calf Raise',
    aliases: ['seated calves', 'seated calf'],
    muscleGroup: 'calves',
    secondaryMuscles: [],
    equipment: 'machine',
    isCompound: false,
    incrementKg: 5,
  },
  // --------------------------------------------------------------- core
  {
    key: 'cableCrunch',
    name: 'Cable Crunch',
    aliases: ['rope crunch', 'kneeling crunch', 'pet crunch'],
    muscleGroup: 'core',
    secondaryMuscles: [],
    equipment: 'cable',
    isCompound: false,
    incrementKg: 5,
  },
  {
    key: 'hangingLegRaise',
    name: 'Hanging Leg Raise',
    aliases: ['leg raise', 'hanging raises', 'pet ki exercise'],
    muscleGroup: 'core',
    secondaryMuscles: ['forearms'],
    equipment: 'bodyweight',
    isCompound: false,
    incrementKg: 2.5,
  },
];

const BY_KEY = new Map<ExerciseKey, SeedExerciseSpec>(EXERCISES.map((e) => [e.key, e]));

export function specOf(key: ExerciseKey): SeedExerciseSpec {
  const spec = BY_KEY.get(key);
  if (!spec) throw new Error(`seed: unknown exercise key '${key}'`);
  return spec;
}
