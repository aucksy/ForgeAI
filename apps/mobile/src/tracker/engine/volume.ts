/**
 * Volume and muscle sets — Phase 2. PURE. The ONE rule every screen uses.
 *
 * Before Phase 2 volume was `weight × reps`, computed in a dozen places (frozen repos,
 * SQL sums, cards). That rule is wrong for three things Phase 2 makes explicit:
 *  1. Pull-ups and dips lift the whole body: their volume is (body weight + added weight
 *     − machine help) × reps. Only exercises whose catalogue entry says so (`bwShare` 1)
 *     count body weight — the pull-up and dip families. Push-ups and the rest don't.
 *  2. Dumbbells: "kg each" means two dumbbells moved, so volume counts both (load mode).
 *  3. Time and distance sets move no counted weight: volume 0 (they still count as sets).
 *
 * Every screen that shows a volume number goes through `setVolumeKg` (via the tracker
 * reads), so the Home card, History, the finish screen, Progress and the coach agree.
 */
import type { DayType } from '@/types/models';

import type { MuscleMap, Muscle } from '../catalog/muscles';
import { setShares } from '../catalog/muscles';
import { isBodyweightFamily, isLoadMode, loadMultiplier, type LoadMode, type LogType } from './logTypes';

export interface VolumeRule {
  logType: LogType;
  loadMode: LoadMode;
  /** Share of body weight lifted on each rep (1 for pull-ups and dips, else 0). */
  bwShare: number;
}

export interface VolumeSet {
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  /** How this set's weight was counted when logged, if not the exercise's current way. */
  loadMode?: LoadMode | null;
}

/** Working-set volume in kg. Warm-ups are never volume. Never negative. */
export function setVolumeKg(s: VolumeSet, rule: VolumeRule, bodyweightKg: number | null): number {
  if (s.isWarmup) return 0;
  const reps = Number.isFinite(s.reps) ? Math.max(0, s.reps) : 0;
  if (reps === 0) return 0;
  const mult = loadMultiplier(isLoadMode(s.loadMode) ? s.loadMode : rule.loadMode);
  if (isBodyweightFamily(rule.logType)) {
    const body = rule.bwShare > 0 && bodyweightKg != null && bodyweightKg > 0 ? rule.bwShare * bodyweightKg : 0;
    const load = body + (Number.isFinite(s.weightKg) ? s.weightKg : 0);
    return Math.max(0, load) * reps * mult;
  }
  if (rule.logType !== 'weight_reps') return 0;
  const w = Number.isFinite(s.weightKg) ? Math.max(0, s.weightKg) : 0;
  return w * reps * mult;
}

// ---------------------------------------------------------------- body weight over time

export interface BodyweightPoint {
  dateISO: string;
  weightKg: number;
}

/**
 * Body weight on a day: the latest entry on or before it, else the earliest entry after it
 * (a member who first weighed in after their first workout), else null.
 * `points` must be sorted by date ascending.
 */
export function bodyweightOn(points: readonly BodyweightPoint[], dateISO: string): number | null {
  if (points.length === 0) return null;
  let lo = 0;
  let hi = points.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].dateISO <= dateISO) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const w = best >= 0 ? points[best].weightKg : points[0].weightKg;
  return w > 0 ? w : null;
}

// ---------------------------------------------------------------- sessions

export interface VolumeExercise extends VolumeRule {
  id: string;
  muscles: MuscleMap;
}

export interface VolumeSession {
  dateISO: string;
  dayType?: DayType;
  exercises: { exercise: VolumeExercise; sets: VolumeSet[] }[];
}

/** Total working volume of one session. */
export function sessionVolumeKg(session: VolumeSession, bw: readonly BodyweightPoint[]): number {
  const body = bodyweightOn(bw, session.dateISO);
  let total = 0;
  for (const g of session.exercises) for (const s of g.sets) total += setVolumeKg(s, g.exercise, body);
  return total;
}

/** Per exercise group volume, in the session's order. */
export function groupVolumesKg(session: VolumeSession, bw: readonly BodyweightPoint[]): number[] {
  const body = bodyweightOn(bw, session.dateISO);
  return session.exercises.map((g) => g.sets.reduce((sum, s) => sum + setVolumeKg(s, g.exercise, body), 0));
}

/** True when this session has a set whose volume needs a body weight we don't have. */
export function missesBodyweight(session: VolumeSession, bw: readonly BodyweightPoint[]): boolean {
  if (bodyweightOn(bw, session.dateISO) != null) return false;
  return session.exercises.some(
    (g) => g.exercise.bwShare > 0 && isBodyweightFamily(g.exercise.logType) && g.sets.some((s) => !s.isWarmup && s.reps > 0),
  );
}

export interface MuscleSetsSlice {
  muscle: Muscle;
  /** Fractional working sets: 1 per primary muscle, 0.5 per secondary. */
  sets: number;
}

/**
 * Working sets per finer muscle across sessions. Every working set counts — a plank or a
 * run is a set too — so time and distance work shows up where volume (kg) cannot.
 */
export function muscleSets(sessions: readonly VolumeSession[]): MuscleSetsSlice[] {
  const acc = new Map<Muscle, number>();
  for (const session of sessions) {
    for (const g of session.exercises) {
      const working = g.sets.filter((s) => !s.isWarmup).length;
      if (working === 0) continue;
      for (const [m, share] of setShares(g.exercise.muscles)) acc.set(m, (acc.get(m) ?? 0) + share * working);
    }
  }
  return [...acc.entries()]
    .map(([muscle, sets]) => ({ muscle, sets: Math.round(sets * 2) / 2 }))
    .filter((x) => x.sets > 0)
    .sort((a, b) => b.sets - a.sets);
}

/** "12", "4.5" — fractional sets read naturally. */
export function fmtSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
