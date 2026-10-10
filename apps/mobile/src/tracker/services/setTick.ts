/**
 * Phase 2, packet B — "every tick saves exactly what's on screen". PURE.
 *
 *  - `tickValues`: what a tick on a row saves — the typed numbers, and for an empty box the
 *    grey hint the box shows (never anything the row does not show). A row with nothing to
 *    save says what is missing instead (LW-13), and a blank weight on a weight × reps lift is
 *    missing, never "0 kg" (TG-07 root cause). Reps-only moves never carry a weight (LW-19).
 *  - `typoCheck` (decision D7): a ticked number far above the member's best gets a gentle
 *    inline question ("300 kg — that's 4× your best. Keep it?"). It never refuses (R6).
 */
import { trimNum } from '@/lib/format';
import { displayUnits, type UnitSystem } from '@/lib/units';

import { isLoggable, type LogType } from '../engine/logTypes';
import type { DraftSet, SetFill } from '../store/activeWorkoutStore';
import { showWU } from '../components/unitText';
import type { PriorBests } from './liveRecords';

/** What a row is missing before it can be ticked. */
export type TickMissing = 'reps' | 'weight' | 'time' | 'distance';

export type TickOutcome =
  | {
      ok: true;
      weightKg: number | null;
      reps: number | null;
      durationSec: number | null;
      distanceM: number | null;
      /** Which boxes the tick filled from the hint (unticking empties them again). */
      autoFilled: { weight?: boolean; reps?: boolean; duration?: boolean; distance?: boolean };
    }
  | { ok: false; missing: TickMissing };

/** The one line a tick on an incomplete row says (calm, plain). */
export function missingText(m: TickMissing): string {
  switch (m) {
    case 'reps':
      return 'Add reps first';
    case 'weight':
      return 'Add the weight first';
    case 'time':
      return 'Add a time first';
    default:
      return 'Add a distance first';
  }
}

/**
 * What ticking this row saves. `fill` is the hint the row shows (`fillForSet`); a typed box
 * always wins over it.
 */
export function tickValues(lt: LogType, s: DraftSet, fill: SetFill | null): TickOutcome {
  if (lt === 'time' || lt === 'distance' || lt === 'time_distance') {
    const durationSec = lt === 'distance' ? s.durationSec ?? null : s.durationSec ?? fill?.durationSec ?? null;
    const distanceM = lt === 'time' ? s.distanceM ?? null : s.distanceM ?? fill?.distanceM ?? null;
    if (!isLoggable(lt, { weightKg: s.weightKg, reps: s.reps, durationSec, distanceM })) {
      return { ok: false, missing: lt === 'time' ? 'time' : 'distance' };
    }
    return {
      ok: true,
      weightKg: s.weightKg,
      reps: s.reps,
      durationSec,
      distanceM,
      autoFilled: { duration: s.durationSec == null && durationSec != null, distance: s.distanceM == null && distanceM != null },
    };
  }
  const reps = s.reps ?? fill?.reps ?? null;
  if (reps == null || reps <= 0) return { ok: false, missing: 'reps' };
  // LW-19: a reps-only move has no weight box, so it never saves a weight.
  // TG-07: a blank weight on weight × reps is missing; on weighted / assisted it is "none".
  const weightKg = lt === 'reps' ? 0 : s.weightKg ?? fill?.weightKg ?? (lt === 'weight_reps' ? null : 0);
  if (weightKg == null) return { ok: false, missing: 'weight' };
  return {
    ok: true,
    weightKg,
    reps,
    durationSec: s.durationSec ?? null,
    distanceM: s.distanceM ?? null,
    autoFilled: { weight: lt === 'reps' || s.weightKg == null, reps: s.reps == null },
  };
}

// ---------------------------------------------------------------- D7: the gentle typo check

/** A weight this many times the best (or more) is worth one question. */
export const TYPO_WEIGHT_TIMES = 2.5;
/** Reps this many times the best at that weight (or more), and above TYPO_REPS_FLOOR. */
export const TYPO_REPS_TIMES = 3;
export const TYPO_REPS_FLOOR = 30;

export interface TypoHit {
  kind: 'weight' | 'reps';
  /** How many times the best (rounded DOWN to a half, so it never exaggerates). */
  times: number;
}

/** Best reps the member could do at `weightKg`, from their best 1-rep max (Epley, inverted). */
function bestRepsAt(weightKg: number, bests: PriorBests): number | null {
  const e1rm = bests.by?.e1rm ?? bests.e1rm;
  if (weightKg > 0 && e1rm > 0) {
    if (weightKg >= e1rm) return 1;
    return Math.max(1, Math.round(30 * (e1rm / weightKg - 1)));
  }
  const reps = bests.by?.reps;
  return reps != null && reps > 0 ? reps : null;
}

/**
 * A ticked set worth one gentle question (D7), or null. Weight: at least 2.5× the member's
 * heaviest so far. Reps: more than 30 AND at least 3× their best at that weight. No history =
 * no question (a first time is never "a typo").
 */
export function typoCheck(
  lt: LogType,
  set: { weightKg: number | null; reps: number | null },
  bests: PriorBests | null | undefined,
): TypoHit | null {
  if (!bests) return null;
  const w = set.weightKg ?? 0;
  if ((lt === 'weight_reps' || lt === 'weighted') && w > 0) {
    const best = bests.by?.weight ?? bests.weightKg;
    if (best > 0 && w >= TYPO_WEIGHT_TIMES * best) return { kind: 'weight', times: Math.floor((w / best) * 2) / 2 };
  }
  const reps = set.reps ?? 0;
  if ((lt === 'weight_reps' || lt === 'weighted' || lt === 'reps' || lt === 'assisted') && reps > TYPO_REPS_FLOOR) {
    const best = bestRepsAt(lt === 'weight_reps' || lt === 'weighted' ? w : 0, bests);
    if (best != null && reps >= TYPO_REPS_TIMES * best) return { kind: 'reps', times: Math.floor((reps / best) * 2) / 2 };
  }
  return null;
}

/** "300 kg — that's 4× your best. Keep it?" / "90 reps — that's 3× your best. Keep it?" */
export function typoText(
  hit: TypoHit,
  set: { weightKg: number | null; reps: number | null },
  u: UnitSystem = displayUnits(),
): string {
  const what = hit.kind === 'weight' ? showWU(set.weightKg ?? 0, u) : `${set.reps ?? 0} reps`;
  return `${what} — that's ${trimNum(hit.times)}× your best. Keep it?`;
}
