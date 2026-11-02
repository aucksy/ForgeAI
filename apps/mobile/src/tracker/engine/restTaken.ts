/**
 * F73 (R-140): the real rest taken before each set, and the "long rest" mark. PURE.
 *
 * The owner's problem: resting much longer than planned gives extra reps, and next time's goal
 * is then built on reps he can't repeat at the normal rest. So the rest before each set is
 * saved with the workout (tracker schema v16), and a set done after a much longer rest than
 * planned is marked: the Target never raises its goal, and never moves the weight up, from it.
 *
 * Evidence (research, 2 Nov 2026):
 *  - de Salles et al. 2009 (Sports Med review, 35 studies): at 50-90% of 1RM, 3-5 min of rest
 *    gives more reps over several sets than 1 min.
 *  - Miranda et al. 2009 (8-rep-max loads): 3 min rest kept the reps steady over the sets; with
 *    1 min the reps dropped set after set.
 *  - Willardson & Burkett 2005 (squat, 8RM, 4 sets): about 22 reps in all on 1 min rest vs 29 on
 *    5 min. So doubling a short rest is worth a rep or two a set; past about 3 min the gain is
 *    small.
 * Hence the mark needs BOTH: more than twice the planned rest AND more than 90 s over it. A 1:00
 * rest is long past 2:30; a 1:30 rest past 3:00; a 3:00 rest only past 6:00 (by then more rest
 * changes little, so only a really long break counts).
 *
 * How the rest is measured: the app knows when each set was ticked, not when the next set
 * started. The gap between two ticks of the same exercise card is the rest PLUS the time the
 * second set took; that set's own time is taken off (its seconds on a timed set, else about 3 s
 * a rep, 15-60 s). Not measured: the first set of a card (nothing before it on that card),
 * supersets (the partner exercise sits in the gap), and a gap over 15 minutes (a set ticked
 * late, not a rest).
 */

/** More than this many times the planned rest... */
export const LONG_REST_RATIO = 2;
/** ...and more than this many seconds over it. */
export const LONG_REST_EXTRA_SEC = 90;
/** A gap longer than this between two ticks is not a rest (a set ticked late): not saved. */
export const MAX_MEASURED_GAP_SEC = 15 * 60;
/** About this long per rep, to take the set's own time off the gap between ticks. */
const SEC_PER_REP = 3;
const MIN_WORK_SEC = 15;
const MAX_WORK_SEC = 60;

/** The rest before one set: what was taken and what was planned (seconds). */
export interface RestTaken {
  sec: number;
  planSec: number;
}

/** A set done after a much longer rest than planned. No plan (rest timer off) = never. PURE. */
export function isLongRest(sec: number | null | undefined, planSec: number | null | undefined): boolean {
  if (sec == null || planSec == null || !Number.isFinite(sec) || !Number.isFinite(planSec) || planSec <= 0) return false;
  return sec > planSec * LONG_REST_RATIO && sec - planSec > LONG_REST_EXTRA_SEC;
}

/** How long a set itself took, about (seconds). PURE. */
export function workSecOf(s: { reps?: number | null; durationSec?: number | null }): number {
  if (s.durationSec != null && s.durationSec > 0) return s.durationSec;
  const reps = s.reps != null && s.reps > 0 ? s.reps : 0;
  return Math.min(MAX_WORK_SEC, Math.max(MIN_WORK_SEC, reps * SEC_PER_REP));
}

interface TickedSet {
  done: boolean;
  doneAt?: number;
  reps?: number | null;
  durationSec?: number | null;
}

/**
 * The rest before each set of one exercise card, in row order (null = not measured). `planSec`
 * is the card's rest (0 = timer off: then nothing is measured, there was no plan to compare
 * with). Rows are matched by tick time, not by place: a set ticked out of order still measures
 * from the tick before it. PURE.
 */
export function restsOfCard(
  sets: readonly TickedSet[],
  planSec: number,
  opts: { superset?: boolean } = {},
): (RestTaken | null)[] {
  const out: (RestTaken | null)[] = sets.map(() => null);
  if (opts.superset || !(planSec > 0)) return out;
  const ticked = sets
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.done && s.doneAt != null && Number.isFinite(s.doneAt) && s.doneAt > 0)
    .sort((a, b) => (a.s.doneAt as number) - (b.s.doneAt as number));
  for (let k = 1; k < ticked.length; k++) {
    const gapSec = ((ticked[k].s.doneAt as number) - (ticked[k - 1].s.doneAt as number)) / 1000;
    if (!(gapSec > 0) || gapSec > MAX_MEASURED_GAP_SEC) continue;
    const sec = Math.max(0, Math.round(gapSec - workSecOf(ticked[k].s)));
    out[ticked[k].i] = { sec, planSec: Math.round(planSec) };
  }
  return out;
}

/** "+1:20 over": how far past the planned rest the clock is. PURE. */
export function overText(overSec: number): string {
  const s = Math.max(0, Math.floor(overSec));
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} over`;
}

/** The red "over" line shows at most this long after the rest ran out (then it hides by itself). */
export const OVER_SHOW_MAX_SEC = 10 * 60;
