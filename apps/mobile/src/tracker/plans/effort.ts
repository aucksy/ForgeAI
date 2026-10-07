/**
 * Effort per plan week, and when to offer an easy week early — Phase 4. PURE.
 *
 * Research v3 §5, "Phase 4 (plan builder)":
 *  - "Effort targets per week for members with Track RPE on (e.g. 3 reps left in week 1 → 1
 *    left in week 4)." The normal weeks between two easy weeks climb from about 3 reps left
 *    in the tank to about 1; the easy week itself asks for 3 or more (`EASY_REASON`). Without
 *    easy weeks the climb repeats every 4 weeks. Members who log RPE see it as the RPE they log
 *    (10 − reps left); nobody else sees it.
 *  - "Stall on several lifts at once → offer the easy week early." Part of both options in
 *    the owner's open decision (§12, decision 2), so it is built whatever the default is.
 */
import { isEasyWeek, type EasySchedule } from './easyWeek';

/** Without easy weeks, the effort climb repeats every this many weeks (the research's example). */
export const EFFORT_CYCLE_WEEKS = 4;

/** Lifts stalled at once before an easy week is offered early ("several"). */
export const STALLED_FOR_EARLY_EASY = 3;

/** The Target's stall rules: R3 (reps fell under the range twice), R4 (flat for 4 workouts). */
export const STALL_RULES: ReadonlySet<string> = new Set(['R3', 'R4']);

/**
 * Reps to leave in the tank in this plan week: 3 at the start of a block, 1 at its end, or
 * null in an easy week (the easy week has its own rule).
 */
export function effortRir(s: EasySchedule | null | undefined, week: number, easy: boolean): number | null {
  if (easy) return null;
  let n: number;
  let p: number;
  if (s && s.every >= 2) {
    n = s.every - 1; // normal weeks in a block
    const since = week - s.base;
    // A skipped easy week (base moved to this week) trains hard: the block's last week.
    p = since <= 0 ? n : ((since - 1) % s.every) + 1;
    if (p > n) return null; // the easy week itself
  } else {
    n = EFFORT_CYCLE_WEEKS;
    p = ((((week - 1) % n) + n) % n) + 1;
  }
  if (n <= 1) return 2;
  return Math.max(1, Math.min(3, 3 - Math.round((2 * (p - 1)) / (n - 1))));
}

/** "RPE 8" — the RPE a member logs for this many reps left. */
export function rpeForRir(rir: number): number {
  return 10 - rir;
}

/** One sentence behind the Target's i. */
export function effortReason(rir: number): string {
  const left = rir === 1 ? 'about 1 rep' : `about ${rir} reps`;
  return `This week of your plan, stop each set with ${left} left in the tank (RPE ${rpeForRir(rir)}).`;
}

/** The last easy week at or before `week` (null when there was none). */
export function lastEasyWeek(s: EasySchedule | null | undefined, week: number, once?: number | null): number | null {
  let last: number | null = once != null && once <= week ? once : null;
  if (s && s.every >= 2) {
    for (let w = week; w > Math.max(0, week - s.every); w--) {
      if (isEasyWeek(s, w)) {
        last = last == null ? w : Math.max(last, w);
        break;
      }
    }
  }
  return last;
}

/**
 * Offer an easy week now? Several lifts stalled at once, no easy week this week, and at least
 * two normal weeks since the plan started or since the last easy week (a stall right after
 * one is not tiredness).
 */
export function offerEarlyEasy(input: { stalled: number; easyNow: boolean; week: number | null; lastEasy: number | null }): boolean {
  if (input.easyNow || input.week == null) return false;
  if (input.stalled < STALLED_FOR_EARLY_EASY) return false;
  const since = input.lastEasy == null ? input.week - 1 : input.week - input.lastEasy - 1;
  return since >= 2;
}
