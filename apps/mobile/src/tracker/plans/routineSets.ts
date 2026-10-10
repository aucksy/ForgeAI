/**
 * A routine exercise's sets, as Hevy keeps them (audit RP-19). PURE.
 *
 * A routine row used to keep only "3 sets of 8–12". It now also keeps each set's type
 * (warm-up, normal, drop, failure) and, when given, a target for that set (reps, weight),
 * plus the exercise's own rest, its superset and a note (tracker schema v12, on
 * `plan_exercises`). The list is stored only when it says more than "N normal sets" — a plain
 * routine keeps `sets_json` NULL, so every older row reads exactly as before.
 *
 * `target_sets` stays the count of the routine's WORKING sets (normal + failure): warm-ups are
 * not working sets, and a drop set hangs off the set before it (Phase 2: drop rows never count).
 */

export type PlanSetType = 'warmup' | 'normal' | 'drop' | 'failure';

export interface PlanSet {
  type: PlanSetType;
  /** Target reps for this set, when the routine gives one. */
  reps?: number | null;
  /** Target weight for this set (kg), when the routine gives one. */
  weightKg?: number | null;
  /**
   * Phase 4 (IM-12): target time for this set (seconds) — a timed exercise copied from Hevy
   * ("Plank 3 × 60 s") keeps its time instead of a made-up rep range.
   */
  durationSec?: number | null;
}

/** Sets per routine exercise, at most (RP-23: no 12-set cap; this is only a sanity bound). */
export const MAX_ROUTINE_SETS = 50;
/** Reps per set, at most (RP-23: no 50-rep cap). */
export const MAX_ROUTINE_REPS = 999;
/** Beyond these the editor asks once ("That's a lot of sets") — they are allowed, just unusual. */
export const USUAL_MAX_SETS = 12;
export const USUAL_MAX_REPS = 50;

const TYPES: readonly PlanSetType[] = ['warmup', 'normal', 'drop', 'failure'];
const isType = (v: unknown): v is PlanSetType => TYPES.includes(v as PlanSetType);
const posNum = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(max, Math.round(v * 100) / 100) : null;

/** Working sets (what `target_sets` counts): not warm-ups, not drop sets. */
export function workingCount(sets: readonly PlanSet[]): number {
  return sets.filter((s) => s.type === 'normal' || s.type === 'failure').length;
}

/**
 * The stored list, or null when absent or unreadable (the row is then "N normal sets"). Review
 * fix: at most `MAX_ROUTINE_SETS` sets in all (the same bound as `target_sets`), so the list and
 * its count never disagree.
 */
export function parsePlanSets(raw: string | null | undefined): PlanSet[] | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return null;
    const out: PlanSet[] = [];
    for (const x of v.slice(0, MAX_ROUTINE_SETS * 3)) {
      if (out.length >= MAX_ROUTINE_SETS) break;
      const o = x as { type?: unknown; reps?: unknown; weightKg?: unknown; durationSec?: unknown } | null;
      if (!o || !isType(o.type)) continue;
      const reps = posNum(o.reps, MAX_ROUTINE_REPS);
      const weightKg = posNum(o.weightKg, 2000);
      const durationSec = posNum(o.durationSec, 86_400);
      out.push({
        type: o.type,
        ...(reps != null ? { reps: Math.round(reps) } : {}),
        ...(weightKg != null ? { weightKg } : {}),
        ...(durationSec != null ? { durationSec: Math.round(durationSec) } : {}),
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** True when the list says nothing beyond "N normal sets" (then it is not stored). */
export function isPlainSets(sets: readonly PlanSet[]): boolean {
  return sets.every((s) => s.type === 'normal' && s.reps == null && s.weightKg == null && s.durationSec == null);
}

/** What to store in `sets_json`: null for a plain list. */
export function planSetsJson(sets: readonly PlanSet[] | null | undefined): string | null {
  if (!sets || sets.length === 0 || isPlainSets(sets)) return null;
  return JSON.stringify(
    sets.map((s) => ({
      type: s.type,
      ...(s.reps != null ? { reps: s.reps } : {}),
      ...(s.weightKg != null ? { weightKg: s.weightKg } : {}),
      ...(s.durationSec != null ? { durationSec: s.durationSec } : {}),
    })),
  );
}

/** A routine row's sets: its own list, else (an older row) `targetSets` normal sets. */
export function setsOf(pe: { targetSets: number; sets?: readonly PlanSet[] | null }): PlanSet[] {
  if (pe.sets && pe.sets.length > 0) return pe.sets.map((s) => ({ ...s }));
  return Array.from({ length: Math.max(1, Math.min(MAX_ROUTINE_SETS, Math.round(pe.targetSets) || 1)) }, () => ({ type: 'normal' as const }));
}

/**
 * The same list with `n` working sets: warm-ups stay; extra working sets are added as normal
 * ones at the end; fewer drop the LAST working sets (with the drop sets hanging off them).
 */
export function resizeWorking(sets: readonly PlanSet[], n: number): PlanSet[] {
  const want = Math.max(1, Math.min(MAX_ROUTINE_SETS, Math.round(n)));
  const out: PlanSet[] = [];
  let working = 0;
  for (const s of sets) {
    if (s.type === 'warmup') out.push({ ...s });
    else if (s.type === 'drop') {
      if (working > 0 && working <= want) out.push({ ...s });
    } else {
      working += 1;
      if (working <= want) out.push({ ...s });
    }
  }
  for (let i = working; i < want; i++) out.push({ type: 'normal' });
  return out;
}

/** The same list with `n` warm-up sets at the front (the working sets are kept as they are). */
export function withWarmups(sets: readonly PlanSet[], n: number): PlanSet[] {
  const rest = sets.filter((s) => s.type !== 'warmup');
  const old = sets.filter((s) => s.type === 'warmup');
  const want = Math.max(0, Math.min(10, Math.round(n)));
  const warm = Array.from({ length: want }, (_, i) => (old[i] ? { ...old[i] } : { type: 'warmup' as const }));
  return [...warm, ...rest.map((s) => ({ ...s }))];
}

/** Only the types, in order — what a workout's rows say about the plan. */
export function typesOf(sets: readonly PlanSet[]): PlanSetType[] {
  return sets.map((s) => s.type);
}

/**
 * Put new types over an old list, keeping each kept set's targets: the i-th set of a type
 * keeps the targets of the i-th set of that type before. PURE.
 */
export function withTypes(old: readonly PlanSet[], types: readonly PlanSetType[]): PlanSet[] {
  const byType = new Map<PlanSetType, PlanSet[]>();
  for (const s of old) byType.set(s.type, [...(byType.get(s.type) ?? []), s]);
  const used = new Map<PlanSetType, number>();
  return types.map((t) => {
    const i = used.get(t) ?? 0;
    used.set(t, i + 1);
    const was = byType.get(t)?.[i];
    return {
      type: t,
      ...(was?.reps != null ? { reps: was.reps } : {}),
      ...(was?.weightKg != null ? { weightKg: was.weightKg } : {}),
      ...(was?.durationSec != null ? { durationSec: was.durationSec } : {}),
    };
  });
}

/** "2 warm-up · 3 sets · 1 drop" — the preview's set line (empty parts left out). */
export function setsSummary(sets: readonly PlanSet[]): string {
  const n = (t: PlanSetType) => sets.filter((s) => s.type === t).length;
  const parts: string[] = [];
  if (n('warmup')) parts.push(`${n('warmup')} warm-up`);
  const w = workingCount(sets);
  parts.push(`${w} ${w === 1 ? 'set' : 'sets'}`);
  if (n('drop')) parts.push(`${n('drop')} drop`);
  if (n('failure')) parts.push(`${n('failure')} to failure`);
  return parts.join(' · ');
}
