/**
 * F57 (inbox #58): a strength level for each main lift. PURE (no DB, no React).
 *
 * The exercise page shows one line under the chart: "Strength level: Intermediate". It comes from
 * the member's best estimated 1-rep max on that lift (the ONE estimate the page shows,
 * `lib/e1rm.estimatedOneRepMax`, read from the records engine's `e1rm` best) divided by their
 * body weight on the day of that best set (`engine/volume.bodyweightOn`).
 *
 * Four levels, the words Hevy members know (Beginner · Intermediate · Advanced · Elite). Not
 * five: "Novice" next to "Beginner" means the same thing to most of our members, who often read
 * English as a second language, and the owner's backlog row named Beginner / Intermediate /
 * Advanced. Elite is the ceiling for the few who get there.
 *
 * PRIVACY (memory: "public numbers leak by division"): the page shows the LEVEL only — never the
 * body weight, the ratio ("1.25× body weight"), the kilos needed for the next level or a "close
 * to the next level" hint. The thresholds below are public (this repo is public), so any of those
 * next to the 1-rep max on the same page would divide back to the member's body weight. A level
 * alone only says the body weight sits in a wide band.
 *
 * THRESHOLDS — our own round numbers, not anyone's table. Each value is the body-weight multiple
 * (estimated 1-rep max ÷ body weight) at which a level STARTS for men; below Intermediate is
 * Beginner. They were set from published body-weight-ratio guidance, read side by side and
 * rounded to simple steps:
 *  - Rippetoe M. & Kilgore L., "Practical Programming for Strength Training" (Aasgaard, 3rd ed.
 *    2014), strength standards appendix (the classic Untrained → Elite bands by body weight);
 *  - ExRx.net "Strength Standards" (Kilgore's tables, same lineage);
 *  - Nuckols G., "How Strong Is Strong?" / strength-standards articles, Stronger By Science
 *    (ratios between lifts and how drug-free lifters progress over years of training);
 *  - Rasmussen J., Symmetric Strength (the expected ratio of each lift to the back squat, used for
 *    the variations below: front squat ≈ 0.8-0.85 of the back squat, incline ≈ 0.8-0.85 of the
 *    flat bench, Romanian deadlift ≈ 0.7-0.75 of the deadlift, push press ≈ 1.3 of the press);
 *  - common coaching rules of thumb summarised by StrengthLog and similar sites (an intermediate
 *    man near 1× body weight on the bench, 1.25-1.5× on the squat, 1.5-2× on the deadlift).
 * Women's levels scale the men's: × 0.6 for upper-body pressing and pulling, × 0.75 for squats
 * and deadlifts, × 0.85 for the hip thrust — the gaps those sources show between the sexes
 * relative to body weight. "Everyone" (no sex known) sits halfway between the two.
 *
 * Dumbbell lifts count BOTH dumbbells: a member who types one dumbbell's weight ("Two
 * dumbbells") has it doubled, as the total lifted does (`logTypes.weightIsEach`).
 */
import { weightIsEach, type LoadMode } from './logTypes';
import { bodyweightOn, type BodyweightPoint } from './volume';

export type StrengthLevel = 'beginner' | 'intermediate' | 'advanced' | 'elite';

export const STRENGTH_LEVELS: readonly StrengthLevel[] = ['beginner', 'intermediate', 'advanced', 'elite'];

export const STRENGTH_LEVEL_LABEL: Record<StrengthLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  elite: 'Elite',
};

/** Who the member is compared with. 'everyone' when the app does not know. */
export type StrengthStandard = 'everyone' | 'men' | 'women';

export const STRENGTH_STANDARDS: readonly StrengthStandard[] = ['everyone', 'men', 'women'];

export function isStrengthStandard(v: unknown): v is StrengthStandard {
  return typeof v === 'string' && (STRENGTH_STANDARDS as readonly string[]).includes(v);
}

/** How a lift's men's thresholds scale for women. */
type Region = 'upper' | 'lower' | 'hips';
const WOMEN_FACTOR: Record<Region, number> = { upper: 0.6, lower: 0.75, hips: 0.85 };

interface LiftStandard {
  region: Region;
  /** Men's body-weight multiples where Intermediate, Advanced and Elite start. */
  men: readonly [number, number, number];
}

const SQUAT: LiftStandard = { region: 'lower', men: [1.25, 1.75, 2.5] };
const DEADLIFT: LiftStandard = { region: 'lower', men: [1.5, 2.1, 2.8] };
const BENCH: LiftStandard = { region: 'upper', men: [1.0, 1.4, 1.9] };
const PRESS: LiftStandard = { region: 'upper', men: [0.6, 0.85, 1.15] };
const ROW: LiftStandard = { region: 'upper', men: [0.8, 1.15, 1.55] };

/**
 * The main lifts that get a level, by library key. Only lifts with a fair body-weight standard:
 * free-weight barbell and dumbbell moves. Machines (leg press, chest press, Smith) vary too much
 * from gym to gym; body-weight moves and the member's own exercises have no level.
 */
const LIFTS: Readonly<Record<string, LiftStandard>> = {
  barbell_back_squat: SQUAT,
  box_squat: SQUAT,
  pause_squat: SQUAT,
  front_squat: { region: 'lower', men: [1.0, 1.45, 2.05] },
  deadlift: DEADLIFT,
  sumo_deadlift: DEADLIFT,
  trap_bar_deadlift: { region: 'lower', men: [1.6, 2.25, 3.0] },
  romanian_deadlift: { region: 'lower', men: [1.1, 1.55, 2.1] },
  barbell_hip_thrust: { region: 'hips', men: [1.5, 2.25, 3.0] },
  barbell_bench_press: BENCH,
  close_grip_bench_press: { region: 'upper', men: [0.9, 1.25, 1.7] },
  incline_barbell_press: { region: 'upper', men: [0.85, 1.2, 1.6] },
  overhead_press: PRESS,
  seated_barbell_shoulder_press: PRESS,
  push_press: { region: 'upper', men: [0.8, 1.1, 1.5] },
  barbell_row: ROW,
  pendlay_row: ROW,
  // Both dumbbells together.
  dumbbell_bench_press: { region: 'upper', men: [0.8, 1.15, 1.55] },
  incline_dumbbell_press: { region: 'upper', men: [0.7, 1.0, 1.35] },
  dumbbell_shoulder_press: { region: 'upper', men: [0.5, 0.75, 1.0] },
};

/** True when this library exercise gets a strength level. */
export function hasStrengthLevel(catalogKey: string | null | undefined): boolean {
  return catalogKey != null && Object.prototype.hasOwnProperty.call(LIFTS, catalogKey);
}

/** Where each level starts (body-weight multiples) for this lift and standard; null = no level. */
export function levelStarts(catalogKey: string | null | undefined, standard: StrengthStandard): [number, number, number] | null {
  if (!hasStrengthLevel(catalogKey)) return null;
  const lift = LIFTS[catalogKey as string];
  const f = WOMEN_FACTOR[lift.region];
  const scale = standard === 'men' ? 1 : standard === 'women' ? f : (1 + f) / 2;
  return [lift.men[0] * scale, lift.men[1] * scale, lift.men[2] * scale];
}

export interface StrengthLevelInput {
  catalogKey: string | null | undefined;
  /** The best estimated 1-rep max, in kg AS TYPED (one dumbbell for "Two dumbbells"). */
  e1rmKg: number | null | undefined;
  /** How that weight was typed (the best set's own counting, else the exercise's). */
  loadMode: LoadMode;
  /** Body weight in kg on the day of the best set. */
  bodyWeightKg: number | null | undefined;
  standard: StrengthStandard;
}

/** The level for a best lift, or null when there is none to give. */
export function strengthLevelOf(input: StrengthLevelInput): StrengthLevel | null {
  const starts = levelStarts(input.catalogKey, input.standard);
  const e = input.e1rmKg;
  const bw = input.bodyWeightKg;
  if (!starts || e == null || bw == null || !Number.isFinite(e) || !Number.isFinite(bw) || e <= 0 || bw <= 0) return null;
  // A body weight outside what a person weighs is a typo: no level rather than a silly one.
  if (bw < 25 || bw > 300) return null;
  const total = e * (weightIsEach(input.loadMode) ? 2 : 1);
  const ratio = total / bw;
  // A hair under a threshold (floating point) still counts as reaching it.
  const at = (x: number) => ratio >= x - 1e-9;
  if (at(starts[2])) return 'elite';
  if (at(starts[1])) return 'advanced';
  if (at(starts[0])) return 'intermediate';
  return 'beginner';
}

/** What the exercise page shows for the strength level. */
export type StrengthLevelView =
  | { kind: 'none' }
  | { kind: 'needWeight' }
  | { kind: 'level'; level: StrengthLevel; standard: StrengthStandard };

/**
 * The exercise page's strength line: nothing for a lift without a level or without a best yet;
 * "log your body weight" when no weigh-in exists; else the level. The body weight is the one on
 * the day of the best set (`bodyweightOn`; points sorted by date ascending). PURE.
 */
export function strengthLevelView(input: {
  catalogKey: string | null | undefined;
  best: { value: number; dateISO: string; loadMode?: LoadMode | null } | null;
  exerciseLoadMode: LoadMode;
  weighIns: readonly BodyweightPoint[];
  standard: StrengthStandard;
}): StrengthLevelView {
  if (!hasStrengthLevel(input.catalogKey) || !input.best || !(input.best.value > 0)) return { kind: 'none' };
  const bw = bodyweightOn(input.weighIns, input.best.dateISO);
  if (bw == null) return { kind: 'needWeight' };
  const level = strengthLevelOf({
    catalogKey: input.catalogKey,
    e1rmKg: input.best.value,
    loadMode: input.best.loadMode ?? input.exerciseLoadMode,
    bodyWeightKg: bw,
    standard: input.standard,
  });
  return level ? { kind: 'level', level, standard: input.standard } : { kind: 'none' };
}

/**
 * Who to compare with: the member's own choice when made; otherwise women's levels when Profile's
 * body figure is Female (a deliberate pick — the figure starts on Male), else everyone. PURE.
 */
export function strengthStandardFor(saved: string | null | undefined, bodyFigure: 'male' | 'female'): StrengthStandard {
  if (isStrengthStandard(saved)) return saved;
  return bodyFigure === 'female' ? 'women' : 'everyone';
}

/** The one line on the exercise page. */
export function strengthLevelLine(view: StrengthLevelView): string | null {
  if (view.kind === 'level') return `Strength level: ${STRENGTH_LEVEL_LABEL[view.level]}`;
  if (view.kind === 'needWeight') return 'Log your body weight to see your strength level';
  return null;
}

/** The "What this means" sheet's chips. */
export const STRENGTH_STANDARD_LABEL: Record<StrengthStandard, string> = {
  everyone: 'Everyone',
  men: 'Men',
  women: 'Women',
};

/** What each level means, in the sheet (plain words, no numbers that divide back). */
export const STRENGTH_LEVEL_MEANING: Record<StrengthLevel, string> = {
  beginner: 'You are still building strength on this lift. Most people start here.',
  intermediate: 'You are stronger than most people who are new to the gym. This usually takes some months of regular training.',
  advanced: 'You are much stronger than most gym members. This usually takes years of hard training.',
  elite: 'Very few gym members ever get this strong.',
};
