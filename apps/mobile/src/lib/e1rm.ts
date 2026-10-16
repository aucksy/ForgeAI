/**
 * The ONE estimated 1-rep max the app shows — 13 Oct 2026 audit (B1). PURE.
 *
 * The frozen engine's Epley (`engine/overload.epleyE1rm`: weight × (1 + reps / 30), a single is
 * itself) is only honest at low reps. Uncapped, a LIGHTER set doing many reps out-scored a heavy
 * one: 100 kg × 5 estimates 116.7, and 70 kg × 25 then popped up as a new "Estimated 1-rep max ·
 * 128.3 kg". So reps above 12 count as 12 — 70 × 25 estimates 98.
 *
 * The owner's rule (decided 16 Oct 2026): a record means progressive overload, never a lighter set
 * doing more reps. So a set lighter than the last real 1-rep-max record's weight is never a
 * record — 95 × 8 after 100 × 5 is NOT one, even though it estimates 120.3 > 116.7 — and it never
 * raises what later sets must beat (`e1rmRecordOf`).
 *
 * Every 1-rep max the app shows goes through here: the records engine (the live pop-up, the set's
 * medal, the finish screen, the exercise page), the exercise chart, the stats overview, "vs last
 * time", the stored record log (prRepo, the import, the rebuild) and its SQL twin. Places that
 * LEAVE such sets out instead (the year's "biggest gain") use the same `E1RM_MAX_REPS`.
 */
import { epleyE1rm } from '@/engine/overload';

/** Reps above this say little about a 1-rep max: they count as this many. */
export const E1RM_MAX_REPS = 12;

/** Estimated 1-rep max, reps above `E1RM_MAX_REPS` counted as `E1RM_MAX_REPS`. */
export function estimatedOneRepMax(weightKg: number, reps: number): number {
  return epleyE1rm(weightKg, Math.min(reps, E1RM_MAX_REPS));
}

/** What a 1-rep-max record must beat: the last REAL record's estimate and its holder's weight. */
export interface E1rmRecordBar {
  /** The best recorded estimate so far (null = no record yet: the first workout's best is one). */
  best: number | null;
  /** The heaviest weight that held a record; a lighter set is never a record. null = no gate. */
  barKg: number | null;
}

/**
 * 16 Oct 2026 review (wave 1, items 1-2): the set of one workout that is a new 1-rep-max record,
 * or null — the best estimate among its sets at no less than `bar.barKg`, when it beats
 * `bar.best`. The record engine, the live pop-up and the stored record log (save, import,
 * rebuild) all follow it. PURE.
 */
export function e1rmRecordOf(
  sets: readonly { weightKg: number; reps: number }[],
  bar: E1rmRecordBar,
): { weightKg: number; reps: number; e1rm: number } | null {
  let top: { weightKg: number; reps: number; e1rm: number } | null = null;
  for (const s of sets) {
    if (!Number.isFinite(s.weightKg) || !Number.isFinite(s.reps)) continue;
    if (bar.best != null && bar.barKg != null && s.weightKg < bar.barKg - 1e-9) continue;
    const e1rm = estimatedOneRepMax(s.weightKg, s.reps);
    if (!top || e1rm > top.e1rm) top = { weightKg: s.weightKg, reps: s.reps, e1rm };
  }
  if (!top || (bar.best != null && !(top.e1rm > bar.best))) return null;
  return top;
}

/** The bar after a record. PURE. */
export function raiseE1rmBar(bar: E1rmRecordBar, rec: { weightKg: number; e1rm: number }): E1rmRecordBar {
  return { best: Math.max(bar.best ?? -Infinity, rec.e1rm), barKg: Math.max(bar.barKg ?? -Infinity, rec.weightKg) };
}

/**
 * The same estimate in SQL for a set row aliased `alias` (`weight_kg`, `reps`), written the same
 * way so the doubles match the JS one (SQLite's two-argument MIN is the scalar minimum).
 */
export function e1rmSql(alias: string): string {
  return `CASE WHEN ${alias}.reps = 1 THEN ${alias}.weight_kg ELSE ${alias}.weight_kg * (1 + MIN(${alias}.reps, ${E1RM_MAX_REPS}) / 30.0) END`;
}
