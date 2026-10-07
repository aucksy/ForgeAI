/**
 * The body map — Phase 3. PURE. Which muscles were trained, and how much, shaded on a body
 * drawing (Hevy's "last 7 days" map, praised for showing the muscles you skipped).
 *
 * Shading follows WORKING SETS per muscle (the same count as "Sets per muscle": 1 for the
 * main muscle, ½ for each helper). Four steps, from the weekly-volume guidance the
 * progression research uses (about 10 hard sets a week per muscle is a full dose):
 *   1  under 3 sets     2  3–5 sets     3  6–9 sets     4  10 sets or more
 * A month uses the same steps scaled to four weeks.
 */
import type { MuscleSetsSlice } from './volume';
import { MUSCLES, type Muscle } from '../catalog/muscles';
import type { BodyRegion } from '../catalog/bodyMapPaths';

export type MapLevel = 0 | 1 | 2 | 3 | 4;

/** Lower bounds of levels 2, 3 and 4 (level 1 is anything above zero). */
export const WEEK_STEPS = [3, 6, 10] as const;
export const MONTH_STEPS = [12, 24, 40] as const;

/** Legend for the weekly map. */
export const WEEK_LEGEND = ['1–2 sets', '3–5', '6–9', '10+'] as const;

export function levelFor(sets: number, steps: readonly [number, number, number] | readonly number[] = WEEK_STEPS): MapLevel {
  if (!(sets > 0)) return 0;
  if (sets >= steps[2]) return 4;
  if (sets >= steps[1]) return 3;
  if (sets >= steps[0]) return 2;
  return 1;
}

/** Each muscle's level from its working sets. */
export function muscleLevels(slices: readonly MuscleSetsSlice[], steps: readonly number[] = WEEK_STEPS): Map<Muscle, MapLevel> {
  const out = new Map<Muscle, MapLevel>();
  for (const s of slices) out.set(s.muscle, levelFor(s.sets, steps));
  return out;
}

/**
 * The level a drawn region shows. The drawing has one shoulder cap per view: the front view's
 * is the front shoulders, the back view's the rear shoulders, and side-shoulder work (lateral
 * raises) lights both, since the side of the shoulder shows from the front and the back.
 */
export function regionLevel(region: BodyRegion, levels: ReadonlyMap<Muscle, MapLevel>): MapLevel {
  if (region === 'body') return 0;
  const own = levels.get(region) ?? 0;
  if (region === 'front_delts' || region === 'rear_delts') return Math.max(own, levels.get('side_delts') ?? 0) as MapLevel;
  return own;
}

/** Muscles the drawing can show (cardio is not a muscle on the body). */
export const MAPPED_MUSCLES: readonly Muscle[] = MUSCLES.filter((m) => m !== 'cardio');

/** Muscles with no working set, top of the body to the bottom. */
export function untrainedMuscles(levels: ReadonlyMap<Muscle, MapLevel>): Muscle[] {
  return MAPPED_MUSCLES.filter((m) => (levels.get(m) ?? 0) === 0);
}

/** "Hamstrings, Calves and Lower back" / "Chest, Lats, Quads and 4 more". */
export function untrainedLine(names: readonly string[], max = 3): string {
  if (names.length <= max) {
    return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}
