/**
 * The body map — Phase 3. PURE. Which muscles were trained, and how much, shaded on a body
 * drawing (Hevy's "last 7 days" map, praised for showing the muscles you skipped).
 *
 * Shading follows WORKING SETS per muscle (the same count as "Sets per muscle": 1 for the
 * main muscle, ½ for each helper). Four steps, from the weekly-volume guidance the
 * progression research uses (about 10 hard sets a week per muscle is a full dose):
 *   1  under 3 sets     2  3–5 sets     3  6–9 sets     4  10 sets or more
 * Longer ranges use the same steps times the weeks in them (stepsFor).
 */
import type { MuscleSetsSlice } from './volume';
import { MUSCLES, setShares, type Muscle, type MuscleMap } from '../catalog/muscles';
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

// ---------------------------------------------------------------- tap a muscle (audit Phase 5)

/** One exercise's working sets in the window, with the muscles it trains. */
export interface MuscleGroupSets {
  exerciseId: string;
  name: string;
  muscles: MuscleMap;
  /** Working sets (warm-ups never count). */
  working: number;
}

/** About 10 hard sets a week is a full dose for a muscle (the map's top step). */
export const FULL_WEEK_SETS = WEEK_STEPS[2];

/**
 * One muscle's sets and the exercises that trained it, most first — by the same count as the
 * map and "Sets per muscle" (1 for the main muscle, ½ for each helper, to the nearest ½).
 */
export function muscleBreakdown(groups: readonly MuscleGroupSets[], muscle: Muscle): { sets: number; exercises: { exerciseId: string; name: string; sets: number }[] } {
  const by = new Map<string, { exerciseId: string; name: string; sets: number }>();
  for (const g of groups) {
    const share = setShares(g.muscles).get(muscle) ?? 0;
    if (!(share > 0) || !(g.working > 0)) continue;
    const cur = by.get(g.exerciseId) ?? { exerciseId: g.exerciseId, name: g.name, sets: 0 };
    cur.sets += share * g.working;
    by.set(g.exerciseId, cur);
  }
  const exercises = [...by.values()]
    .map((e) => ({ ...e, sets: Math.round(e.sets * 2) / 2 }))
    .sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
  // The total is the sum of the rows as shown (each to the half set), so they always add up.
  const total = exercises.reduce((n, e) => n + e.sets, 0);
  return { sets: total, exercises };
}

/** A gentle "what to train next" hint for a muscle under a full dose for the range; null otherwise. */
export function lowSetsHint(sets: number, days: MapRange = 7): string | null {
  const full = stepsFor(days)[2];
  if (sets >= full) return null;
  if (!(sets > 0)) return `No sets in the last ${days} days — a good one to train next.`;
  return `Under ${full} sets in the last ${days} days — a good one to train next.`;
}

// ---------------------------------------------------------------- ranges and ages (R-286)
// Ideas from the openGym tracker (2 Nov 2026 study; no code taken): a longer window shows a muscle
// skipped for a whole month, and "how long ago" turns "not trained" into something to act on.

/** The map's windows, in days. */
export type MapRange = 7 | 30 | 90;
export const MAP_RANGES: readonly MapRange[] = [7, 30, 90];

/** The week's steps times the weeks in the range (30 days = 4 weeks, 90 days = 13). */
export function stepsFor(days: MapRange): readonly [number, number, number] {
  const weeks = days === 7 ? 1 : days === 30 ? 4 : 13;
  return [WEEK_STEPS[0] * weeks, WEEK_STEPS[1] * weeks, WEEK_STEPS[2] * weeks];
}

/** The legend for a range: ['1–2 sets', '3–5', '6–9', '10+'] for a week. */
export function legendFor(days: MapRange): string[] {
  const [a, b, c] = stepsFor(days);
  return [`1–${a - 1} sets`, `${a}–${b - 1}`, `${b}–${c - 1}`, `${c}+`];
}

/** One exercise's newest day with a working set, and the muscles it trains. */
export interface ExerciseLastDay {
  muscles: MuscleMap;
  lastISO: string;
}

/** Each muscle's newest day with a working set (main muscle or helper, as the map counts). */
export function lastTrainedByMuscle(rows: readonly ExerciseLastDay[]): Map<Muscle, string> {
  const out = new Map<Muscle, string>();
  for (const r of rows) {
    for (const [m, share] of setShares(r.muscles)) {
      if (!(share > 0)) continue;
      const cur = out.get(m);
      if (!cur || r.lastISO > cur) out.set(m, r.lastISO);
    }
  }
  return out;
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000);
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", "never". */
export function agoText(lastISO: string | undefined, todayISO: string): string {
  if (!lastISO) return 'never';
  const d = Math.max(0, daysBetween(lastISO, todayISO));
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  return `${Math.floor(d / 7)} weeks ago`;
}

/**
 * The untrained muscles, longest untouched first (never-trained last: often a muscle the member
 * does not train on purpose), each with its age: "Calves (5 weeks ago)".
 */
export function untrainedWithAge(muscles: readonly Muscle[], last: ReadonlyMap<Muscle, string>, todayISO: string, label: (m: Muscle) => string): string[] {
  const order = [...muscles].sort((x, y) => {
    const a = last.get(x);
    const b = last.get(y);
    if (!a !== !b) return a ? -1 : 1;
    return a && b && a !== b ? (a < b ? -1 : 1) : 0;
  });
  return order.map((m) => `${label(m)} (${agoText(last.get(m), todayISO)})`);
}
