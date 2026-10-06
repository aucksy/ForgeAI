/**
 * Finer muscle groups — Phase 2 (Hevy's top muscle request, 90 upvotes: "front, side and
 * rear shoulder…"). PURE.
 *
 * The frozen `MuscleGroup` (11 coarse groups) stays the stored `muscle_group` column, so
 * every frozen reader keeps working. The finer list lives here and in the additive
 * `exercises.muscles` column (JSON `{ primary, secondary }`):
 *  - catalogue exercises carry their finer muscles from the bundled library;
 *  - custom exercises made on the new form store the muscles the member picked;
 *  - anything else (older custom rows, Hevy imports) is classified from its name and its
 *    coarse group, so no stored row ever has to be rewritten.
 *
 * Counting rule (fractional sets, the convention in the training-volume research): a
 * working set counts 1 for each PRIMARY muscle and 0.5 for each SECONDARY one — a bench
 * set is 1 chest set and half a triceps and front-shoulder set.
 */
import type { MuscleGroup } from '@/types/models';

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

/** Display order: top of the body to the bottom, cardio last. */
export const MUSCLES: readonly Muscle[] = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'lats',
  'upper_back',
  'traps',
  'lower_back',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'abductors',
  'calves',
  'cardio',
];

export const MUSCLE_LABEL: Record<Muscle, string> = {
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
  abductors: 'Outer hips',
  calves: 'Calves',
  cardio: 'Cardio',
};

/** The coarse group each finer muscle belongs to (what the frozen column stores). */
export const COARSE_OF: Record<Muscle, MuscleGroup> = {
  chest: 'chest',
  front_delts: 'shoulders',
  side_delts: 'shoulders',
  rear_delts: 'shoulders',
  lats: 'back',
  upper_back: 'back',
  traps: 'back',
  lower_back: 'back',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  abs: 'core',
  obliques: 'core',
  glutes: 'glutes',
  quads: 'quads',
  hamstrings: 'hamstrings',
  adductors: 'quads',
  abductors: 'glutes',
  calves: 'calves',
  cardio: 'quads',
};

export interface MuscleMap {
  primary: Muscle[];
  secondary: Muscle[];
}

export function isMuscle(v: unknown): v is Muscle {
  return typeof v === 'string' && (MUSCLES as readonly string[]).includes(v);
}

/**
 * The finer muscle a COARSE group most likely means for this exercise name. Used only for
 * rows that carry no finer muscles (older custom exercises, Hevy imports).
 */
export function finerFromCoarse(name: string, coarse: MuscleGroup): Muscle {
  const n = name.toLowerCase();
  switch (coarse) {
    case 'shoulders':
      if (/rear|reverse fly|reverse pec|face ?pull|reverse shoulder|cross back/.test(n)) return 'rear_delts';
      if (/lateral|side raise|\bside\b|upright/.test(n)) return 'side_delts';
      return 'front_delts';
    case 'back':
      if (/shrug|\btrap/.test(n)) return 'traps';
      if (/deadlift|good morning|hyperextension|back extension|superman|rack pull/.test(n)) return 'lower_back';
      if (/pulldown|pull ?down|pull ?up|chin ?up|pullover|\blats?\b|straight arm/.test(n)) return 'lats';
      return 'upper_back';
    case 'core':
      if (/oblique|twist|side plank|side bend|woodchop|wood chop|russian|windmill|lateral bent/.test(n)) return 'obliques';
      return 'abs';
    case 'glutes':
      if (/abduct|clamshell|hip abduction|side[- ]lying leg raise|fire hydrant|band walk/.test(n)) return 'abductors';
      return 'glutes';
    case 'quads':
      if (/adduct|copenhagen|inner thigh/.test(n)) return 'adductors';
      return 'quads';
    default:
      return coarse;
  }
}

/** Parse the stored JSON; null when absent or unusable. */
export function parseMuscleMap(raw: string | null | undefined): MuscleMap | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { primary?: unknown; secondary?: unknown } | null;
    if (!v || !Array.isArray(v.primary)) return null;
    const primary = v.primary.filter(isMuscle);
    if (primary.length === 0) return null;
    const secondary = (Array.isArray(v.secondary) ? v.secondary.filter(isMuscle) : []).filter(
      (m) => !primary.includes(m),
    );
    return { primary: [...new Set(primary)], secondary: [...new Set(secondary)] };
  } catch {
    return null;
  }
}

/**
 * Finer muscles of an exercise: the stored map when present, else classified from the
 * name and the coarse primary/secondary groups.
 */
export function musclesOf(ex: {
  name: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  muscles?: MuscleMap | null;
}): MuscleMap {
  if (ex.muscles && ex.muscles.primary.length > 0) return ex.muscles;
  const primary = finerFromCoarse(ex.name, ex.muscleGroup);
  const secondary: Muscle[] = [];
  for (const g of ex.secondaryMuscles) {
    // A secondary coarse group says little about which part: shoulders helping a press
    // are the front of the shoulder, a back group helping a curl is the upper back.
    const m = g === 'shoulders' ? (/rear|row|pull/.test(ex.name.toLowerCase()) ? 'rear_delts' : 'front_delts') : finerFromCoarse(ex.name, g);
    if (m !== primary && !secondary.includes(m)) secondary.push(m);
  }
  return { primary: [primary], secondary };
}

/** How much one working set counts for each muscle: 1 per primary, 0.5 per secondary. */
export function setShares(map: MuscleMap): Map<Muscle, number> {
  const out = new Map<Muscle, number>();
  for (const m of map.secondary) out.set(m, 0.5);
  for (const m of map.primary) out.set(m, 1);
  return out;
}

/** The coarse group to store for a finer map (its first primary muscle). */
export function coarseOf(map: MuscleMap): MuscleGroup {
  return COARSE_OF[map.primary[0]];
}

/** Coarse secondary groups for a finer map (deduplicated, never the primary group). */
export function coarseSecondaryOf(map: MuscleMap): MuscleGroup[] {
  const primary = coarseOf(map);
  const out: MuscleGroup[] = [];
  for (const m of [...map.primary.slice(1), ...map.secondary]) {
    const g = COARSE_OF[m];
    if (g !== primary && !out.includes(g)) out.push(g);
  }
  return out;
}
