/**
 * R-439 (owner, 10 Nov 2026): the grey hint of a working set after sets were ticked today. PURE.
 *
 * His screen (Air Squat, reps only): last time 65 then 40 reps; today set 1 = 66 at RPE 8.5, and
 * set 2 hinted 66 ("way too much for squats"). The hint copied the number done in the row above
 * (fillForSet rule 1) because this move had no Target to give set 2 its own goal (over the rep cap
 * the Target only says "try a harder version").
 *
 * The rule now, when last time had this same set and at least one set is ticked today:
 *   - start from last time's same set, scaled by how today compares with last time on the sets
 *     already done (today 66 vs last 65 -> set 2 = 40 x 66/65 = 41);
 *   - never more than last time's same set + one step (1 rep, or 5 s on a timed hold), the same
 *     step the app's progression uses (R-350: +1 rep a set);
 *   - one step more only when today matched or beat last time and the set just done felt
 *     manageable (RPE 8 or easier, "about 2 left");
 *   - a hard set just done (RPE 9 or more) never pushes the next set above last time's same set;
 *   - never more than the set just done at that weight, and never under 1.
 * With no same set last time, or nothing ticked yet, the caller keeps its old rule.
 */

/** The effort at or above which the set just done never raises the next one (1 rep or less left). */
export const HARD_RPE = 9;
/** The effort at or under which, with today on or above last time, one step is added (app default plan). */
export const EASY_ENOUGH_RPE = 8;

export interface SameSetHintInput {
  /** Last time's same set (reps, or seconds for a hold). null / 0 = none. */
  own: number | null | undefined;
  /** The sets ticked today above this row, each with last time's same set (same weight only). */
  pairs: readonly { today: number; last: number }[];
  /** The nearest ticked working set above at the same weight: its value and effort. */
  justDone: { value: number; rpe: number | null | undefined } | null;
  /** One step: 1 rep, or HOLD_STEP_SEC on a timed hold. */
  step: number;
}

/** The hint, or null = no same-set rule here (the caller keeps its old hint). PURE. */
export function sameSetHint(input: SameSetHintInput): number | null {
  const own = input.own;
  if (own == null || !Number.isFinite(own) || own <= 0) return null;
  const pairs = input.pairs.filter((p) => p.today > 0 && p.last > 0 && Number.isFinite(p.today) && Number.isFinite(p.last));
  if (pairs.length === 0) return null;
  const today = pairs.reduce((a, p) => a + p.today, 0);
  const last = pairs.reduce((a, p) => a + p.last, 0);
  const ratio = today / last;
  const step = input.step > 0 ? input.step : 1;
  let v = Math.round(own * ratio);
  const rpe = input.justDone?.rpe;
  const rated = rpe != null && Number.isFinite(rpe) && rpe >= 6 && rpe <= 10;
  if (ratio >= 1 && rated && (rpe as number) <= EASY_ENOUGH_RPE) v = Math.max(v, own + step);
  v = Math.min(v, own + step);
  if (rated && (rpe as number) >= HARD_RPE) v = Math.min(v, own);
  const done = input.justDone?.value;
  if (done != null && done > 0) v = Math.min(v, done);
  return Math.max(1, v);
}
