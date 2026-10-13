/**
 * The ONE estimated 1-rep max the app shows — 13 Oct 2026 audit (B1). PURE.
 *
 * The frozen engine's Epley (`engine/overload.epleyE1rm`: weight × (1 + reps / 30), a single is
 * itself) is only honest at low reps. Uncapped, a LIGHTER set doing many reps out-scored a heavy
 * one: 100 kg × 5 estimates 116.7, and 70 kg × 25 then popped up as a new "Estimated 1-rep max ·
 * 128.3 kg". The owner's rule: a record means progressive overload, never a lighter set doing more
 * reps. So reps above 12 count as 12 — 70 × 25 estimates 98, while 95 × 8 after 100 × 5 is still a
 * record (120.3 > 116.7).
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

/**
 * The same estimate in SQL for a set row aliased `alias` (`weight_kg`, `reps`), written the same
 * way so the doubles match the JS one (SQLite's two-argument MIN is the scalar minimum).
 */
export function e1rmSql(alias: string): string {
  return `CASE WHEN ${alias}.reps = 1 THEN ${alias}.weight_kg ELSE ${alias}.weight_kg * (1 + MIN(${alias}.reps, ${E1RM_MAX_REPS}) / 30.0) END`;
}
