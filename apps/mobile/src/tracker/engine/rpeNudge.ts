/**
 * F74 (R-144): the next sets adjust to how hard this set felt. PURE.
 *
 * After a member ticks a working set with its effort (RPE, 6-10), the sets after it on the same
 * card get a SUGGESTION — the grey hint the row shows and a tick fills, never a number the member
 * typed — with one short reason line under the row:
 *  - Clearly easier than planned (2 or more below the planned effort, every planned rep done):
 *    one more rep; at the top of the rep range, one weight step instead (a rung of the member's
 *    own ladder: his plates, his dumbbell rack). Never more than one step a set.
 *  - Very hard (10, "could not do another rep") or short of the planned reps: keep the weight;
 *    2 or more reps short at 9.5-10: one small step lighter, when his rack has one.
 *
 * Safety cap: the suggested set, done at the planned effort, may not need more strength than the
 * set just done showed (its 1-rep max worked out with the reps it had left, at most 4, Epley), nor
 * more than 10% over the member's best 1-rep max before today. So a mistaken "6" on a heavy set
 * can never ask for a big jump.
 *
 * Not after a long rest (F73): extra rest makes a set feel easier than the next one will.
 *
 * Research (2 Nov 2026): Juggernaut AI changes the back-off sets live from the top set's RPE;
 * RP Hypertrophy adjusts week to week, not within a workout; Fitbod adjusts between workouts.
 * Lifters report effort climbs set to set at the same weight (8 reps @ RPE 8, then the next set
 * is 9-9.5), and that beginners rate effort unreliably. Hence small steps only (one rep or one
 * rung), a margin of 2 before anything moves, and a cap.
 */

/** The app's planned effort when the plan gives none: "stop with about 2 reps left" (RPE 8). */
export const DEFAULT_TARGET_RPE = 8;
/** This much under the planned effort is "clearly easier". */
export const EASY_MARGIN = 2;
/** At most this many reps-in-reserve count from a logged effort (RPE 6 = "4 or more left"). */
const MAX_RIR = 4;
/** Never more than this over the member's best 1-rep max before today. */
const BEST_HEADROOM = 1.1;

export type NudgeKind = 'more-reps' | 'more-weight' | 'hold' | 'lighter';

export interface RpeNudge {
  kind: NudgeKind;
  /** The suggested numbers for the row (typed form). */
  weightKg: number;
  reps: number;
  /** The working-set number of the set that triggered it ("Set 1 felt easy"). */
  fromSet: number;
}

export interface NudgeInput {
  logType: 'weight_reps' | 'reps';
  /** The nearest ticked working set above (typed numbers), and its working-set number. */
  done: { weightKg: number; reps: number; rpe: number | null | undefined; setNo: number; longRest?: boolean };
  /** The reps planned for that done set (null = no plan known: every rep counts as done). */
  doneGoal: number | null;
  /** What this row would suggest without the nudge (fillForSet). */
  base: { weightKg: number; reps: number };
  /** The planned effort (this plan week's), else DEFAULT_TARGET_RPE. */
  targetRpe?: number | null;
  /** Top of the rep range (null = none known). */
  repMax?: number | null;
  /** One rung up / a small step down from the done weight (null = none). */
  stepUpKg?: number | null;
  stepDownKg?: number | null;
  /** The member's best 1-rep max before today (stored kg; null = none / not comparable). */
  bestE1rm?: number | null;
}

const epley = (kg: number, reps: number): number => kg * (1 + reps / 30);

const validRpe = (r: number | null | undefined): r is number => r != null && Number.isFinite(r) && r >= 6 && r <= 10;

/** The suggestion for one row, or null (no change, nothing to say). PURE. */
export function rpeNudge(input: NudgeInput): RpeNudge | null {
  const { done, base } = input;
  if (!validRpe(done.rpe)) return null;
  if (!(done.reps > 0) || !(base.reps > 0)) return null;
  // Only a row that continues at the done set's weight (a planned back-off has its own aim).
  if (input.logType === 'weight_reps' && Math.abs(base.weightKg - done.weightKg) > 1e-6) return null;
  const target = validRpe(input.targetRpe) ? input.targetRpe : DEFAULT_TARGET_RPE;
  const fromSet = done.setNo;
  const missed = input.doneGoal != null && done.reps < input.doneGoal;

  if (done.rpe >= 10 || missed) {
    const short = input.doneGoal != null ? input.doneGoal - done.reps : 0;
    const down = input.stepDownKg;
    if (input.logType === 'weight_reps' && short >= 2 && done.rpe >= 9.5 && down != null && down > 0 && down < done.weightKg) {
      return { kind: 'lighter', weightKg: down, reps: Math.max(base.reps, input.doneGoal ?? base.reps), fromSet };
    }
    return { kind: 'hold', weightKg: base.weightKg, reps: base.reps, fromSet };
  }

  if (done.longRest) return null;
  if (done.rpe > target - EASY_MARGIN) return null;

  if (input.logType === 'reps') {
    return { kind: 'more-reps', weightKg: 0, reps: base.reps + 1, fromSet };
  }
  // The cap: what the done set showed (reps + reps left), and the best before today.
  const rir = Math.min(MAX_RIR, 10 - done.rpe);
  const shown = epley(done.weightKg, done.reps + rir);
  const best = input.bestE1rm != null && input.bestE1rm > 0 ? input.bestE1rm * BEST_HEADROOM : Infinity;
  const plainDone = epley(done.weightKg, done.reps);
  const fits = (kg: number, reps: number): boolean =>
    epley(kg, reps + (10 - target)) <= shown + 1e-6 && epley(kg, reps) <= Math.max(best, plainDone) + 1e-6;

  const repMax = input.repMax != null && input.repMax > 0 ? input.repMax : null;
  const moreReps = base.reps + 1;
  if ((repMax == null || moreReps <= repMax) && fits(base.weightKg, moreReps)) {
    return { kind: 'more-reps', weightKg: base.weightKg, reps: moreReps, fromSet };
  }
  const up = input.stepUpKg;
  if (repMax != null && base.reps >= repMax && up != null && up > base.weightKg) {
    // One rung heavier at the same reps, else one rep fewer (a heavier weight costs a rep).
    for (const reps of [base.reps, base.reps - 1]) {
      if (reps > 0 && fits(up, reps)) return { kind: 'more-weight', weightKg: up, reps, fromSet };
    }
  }
  return null;
}

/**
 * The reason line under the row. `kg` formats a weight as the screen does ("42.5 kg"); `toSet` is the
 * working-set number of the row the line sits under. PURE.
 *
 * Owner, 12 Nov 2026 (his screen: "Set 3 was very hard, so keep the same weight" over a set 4 that did
 * not change; "I feel like this may be obsolete now. I don't think this is accurate."): a hold keeps
 * the row's numbers, so its line now says what it really does, "no extra reps on set 4", and the card
 * shows it only when the hold changed something (`nudgeLineShows`: it stopped catch-up reps, or the
 * row would hint more reps without that effort).
 */
export function nudgeLine(n: RpeNudge, kg: (kg: number) => string, toSet?: number): string {
  const set = `Set ${n.fromSet}`;
  switch (n.kind) {
    case 'more-reps':
      return `${set} felt easy, so try 1 more rep.`;
    case 'more-weight':
      return `${set} felt easy, so try ${kg(n.weightKg)}.`;
    case 'lighter':
      return `${set} was very hard, so try ${kg(n.weightKg)}.`;
    case 'hold':
      // 0.77.0 fresh-eyes review: never "keep the same weight" (a reps-only row has none, and a held
      // row's weight was never going to change). Owner, 12 Nov 2026: name the extra reps it stops.
      return `${set} was very hard, so no extra reps on ${toSet != null ? `set ${toSet}` : 'the next set'}.`;
  }
}
