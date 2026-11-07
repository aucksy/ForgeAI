/**
 * Progression engine v2 — the "Target" line on each planned exercise. PURE (no DB).
 *
 * Replaces the frozen `engine/overload.ts` for every Target the member sees (the frozen
 * file stays as-is: the demo-history seed and its tests still use it). Spec and evidence:
 * `Resources/Progressive-Overload-Research-v3.docx` §4 (outside the repo).
 *
 * Core (R-350, owner, 5 Nov 2026, option A): only the rep range and the member's "Weight jumps"
 * choice decide. Each working set vs the same set last time: under the top of the range -> same
 * weight, one rep more; every set at the top -> the next weight by his jump % (about 2.5 / 5 / 10%,
 * always at least the gym's smallest step — `jumpRungKg`), each set aiming for the reps that lift
 * about the kg it lifted, inside the range. Around it:
 *  - drop sets and lighter back-off sets never block progress (main-weight rule);
 *  - the weight step is LEARNED from the weights the member actually logs;
 *  - logged RPE is the member's own record: it never changes a Target's numbers;
 *  - bodyweight moves progress by reps, never by kilos the member has never added;
 *  - a long break holds or lightens the weight; under the range twice running = one step lighter;
 *  - R-300: after a short day each set aims again for the goal it missed.
 *
 * First time on an exercise (rule R0): no kilos at all — "find a weight for 8–12, stop
 * with about 2 left" (owner decision, 6 Oct 2026: a start weight by equipment was a guess
 * that was often wrong, e.g. 20 kg on every machine).
 *
 * Phase 2 (exercise types, research §4.4 and §4.5):
 *  - Bodyweight reps: reps up to a cap (the catalogue's, else pull-ups and dips 15,
 *    push-ups 25, others 20), then "try a harder version" naming the linked harder
 *    exercise; four workouts stuck under the range → "try an easier version".
 *  - Weighted bodyweight: the added weight progresses like any lift ("+10 kg").
 *  - Assisted: the same double progression on the HELP, in reverse — every set at the top
 *    of the range takes one step of help away; when no help is left, "try it without help"
 *    (the linked unassisted version). Stored weights are negative (−20 = 20 kg of help).
 *  - Timed holds: every set reached its target time → add 5 s; missed → keep the time; at
 *    the cap (plank 60 s, side plank 45 s, dead hang 60 s…) → "try a harder version".
 *
 * All weights kg. History is newest first, sessions BEFORE today, warm-ups excluded.
 */
import { trimNum } from '@/lib/format';
import { displayUnits, isImperial, kgToShown, roundToShownStep, stepFor, weightUnitOf } from '@/lib/units';
import type { GymPlates } from '@/tracker/services/plateMath';
import type { Exercise, OverloadTarget, UserProfile } from '@/types/models';

import { fmtDurationWords, isBodyweightFamily, type LoadMode, type LogType } from './logTypes';
import { buildLadder, downRungKg, jumpRungKg, ladderKind, machineStepKg, pairsUp, rackStep, sameRungKg, upRungsKg, type MachineStep } from './weightLadder';

/**
 * Settings → Workouts → Weight jumps (Oct 2026, owner): how much a Target adds when every main
 * set reached the top of the range. Always at least one step of the member's ladder (the gym's
 * smallest plates), so on a light lift all three give the smallest step.
 */
export type WeightJump = 'small' | 'standard' | 'large';
export const JUMP_SHARE: Readonly<Record<WeightJump, number>> = { small: 0.025, standard: 0.05, large: 0.1 };
export const DEFAULT_JUMP: WeightJump = 'standard';

/** A choice this version knows. PURE. */
export function isWeightJump(v: unknown): v is WeightJump {
  return v === 'small' || v === 'standard' || v === 'large';
}

export type ProgSetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface ProgSet {
  weightKg: number;
  reps: number;
  rpe: number | null;
  setType: ProgSetType;
  /** Time sets (Phase 2); absent on weight × reps rows. */
  durationSec?: number | null;
  /** TG-03: the counting this set was logged with (absent = the exercise's current one). */
  loadMode?: LoadMode | null;
  /**
   * F73 (R-140): done after a much longer rest than planned (engine/restTaken). Its reps never
   * raise a goal and never move the weight up. Ignored on a workout's first main set (fresh
   * anyway, so a long rest before it adds nothing).
   */
  longRest?: boolean;
}

export interface ProgSession {
  dateISO: string;
  sets: ProgSet[];
}

export type ProgRule =
  | 'R0' | 'R1' | 'R1b' | 'R2' | 'R2b' | 'R2c' | 'R3' | 'R4' | 'R5' | 'R6'
  | 'B1' | 'B1easy' | 'B2' | 'B2cap'
  | 'A2zero'
  | 'T0' | 'T1' | 'T2' | 'T3' | 'Tcap'
  | 'F';

/** A linked easier / harder exercise (catalogue). `id` is the member's library row, if any. */
export interface VersionLink {
  id: string | null;
  name: string;
}

export interface ProgressionTarget extends OverloadTarget {
  /**
   * The rep goal; null on the first time (show the range). With per-set goals, the highest of
   * them (`setGoals` is the one source of each set's number).
   */
  repGoal: number | null;
  /**
   * Oct 2026 (owner): the rep goal of each working set, in working-set order — the Target line
   * prints them when they differ ("40 kg · 11, 9, 8") and each set row hints its own
   * (`targetFill` → `fillForSet`). Same weight: set 1 aims one more than last time's set 1, the
   * rest last time's same set. Empty when there is no rep goal (first time, a hold, an easy week).
   */
  setGoals: number[];
  /** The weight moved from last time's main weight. null = same weight / first time. */
  change: 'up' | 'down' | null;
  /** Bodyweight move the member has never loaded: show no kilos at all. */
  bodyweightOnly: boolean;
  /** Which rule fired (tests + debugging; never shown). */
  rule: ProgRule;
  /** Last time was a pyramid (every set a different weight): the Target is for the top set only. */
  topSetOnly: boolean;
  /** Phase 2: how the exercise is logged. */
  logType: LogType;
  /** Phase 2: the time to hold on every set (time exercises), else null. */
  holdSec: number | null;
  /** Phase 2: switch to a linked version of the exercise, when the rules say so. */
  version: ({ kind: 'harder' | 'easier' } & VersionLink) | null;
  /** Display hints from the exercise's counting (set by the caller): "12.5 kg each", "per side". */
  each?: boolean;
  perSide?: boolean;
  /**
   * No Target for this exercise (distance work, timed cardio — the research gives no rule):
   * today's workout still lists it, the workout card shows no Target line.
   */
  free?: boolean;
  /** Phase 4: an easy week of the followed plan (`toEasyTarget`). */
  easy?: boolean;
  /**
   * R-358 (owner, 5 Nov 2026): last time was logged in another Counting (set by the caller,
   * coachTargets): no kg or reps to beat this time (kgTarget `beatPlan`).
   */
  countingChanged?: boolean;
  /** Phase 4: this plan week's effort for members who log RPE (`withEffort`): the RPE to stop at. */
  effortRpe?: number;
  /**
   * TG-02: last time's weight as it reads on the member's ladder (a clean number in the unit on
   * screen: 165 lb logged, shown in kg -> 75). The easy week keeps this weight.
   */
  sameWeightKg?: number;
  /**
   * F74: one rung of the member's ladder above / a small step below `targetWeightKg` (weight ×
   * reps lifts only; absent elsewhere; down null = nothing lighter on his rack).
   */
  stepUpKg?: number;
  stepDownKg?: number | null;
  /**
   * R-306 (owner, 3 Nov 2026): one short line saying why the weight went DOWN ("Stuck at 45 kg, so a
   * small step back to 40 kg."), shown on the card under the Target. Only when `change` is 'down'.
   */
  dropNote?: string;
  /**
   * R-350 (5 Nov 2026): never set any more (the stall rule R4 is gone); kept so saved choices still load.
   * R-308 (owner, 3 Nov 2026): a stall (rule R4) never drops the weight by itself under "Ask me": the
   * Target keeps the weight and carries this offer; the card asks "Try 40 kg today?" (`applyStepBack`).
   */
  stepBack?: StepBackOffer;
}

/** R-308: the lighter weight a stall offers, with each set's goal there (`stepBackGoals`). */
export interface StepBackOffer {
  weightKg: number;
  setGoals: number[];
  /** The weight he is stuck at and for how many workouts ("Stuck at 45 kg for 4 workouts"). */
  fromKg: number;
  workouts: number;
  reason: string;
  dropNote: string;
  stepUpKg?: number;
  stepDownKg?: number | null;
}

/**
 * R-308 (owner, 3 Nov 2026): Settings → More workout choices → "When I'm stuck at a weight".
 * ask = offer a step back on the card (default); auto = step back by itself; never = no offer.
 */
export type StuckChoice = 'ask' | 'auto' | 'never';
export const DEFAULT_STUCK: StuckChoice = 'ask';

/** A choice this version knows. PURE. */
export function isStuckChoice(v: unknown): v is StuckChoice {
  return v === 'ask' || v === 'auto' || v === 'never';
}

/** R-308: the Target once the member taps "Try 40 kg" (the offer's weight and goals). PURE. */
export function applyStepBack(t: ProgressionTarget): ProgressionTarget {
  const o = t.stepBack;
  if (!o) return t;
  const { stepBack: _offer, ...rest } = t;
  void _offer;
  return {
    ...rest,
    targetWeightKg: o.weightKg,
    setGoals: o.setGoals,
    repGoal: Math.max(...o.setGoals),
    targetRepsMax: Math.max(t.targetRepsMax, ...o.setGoals),
    change: 'down',
    action: 'deload',
    reason: o.reason,
    dropNote: o.dropNote,
    ...(o.stepUpKg != null ? { stepUpKg: o.stepUpKg } : {}),
    ...(o.stepDownKg !== undefined ? { stepDownKg: o.stepDownKg } : {}),
  };
}

/** R-308: the Target without its offer (the member tapped "Stay"). PURE. */
export function withoutStepBack(t: ProgressionTarget): ProgressionTarget {
  if (!t.stepBack) return t;
  const { stepBack: _offer, ...rest } = t;
  void _offer;
  return rest;
}

/**
 * The Target for an easy week (Phase 4, research v3 §6.4): half the sets, the same weight —
 * never "Up", and never a rep number to chase; stop with 3 or more reps left. A hold keeps
 * last time's time (not the +5 s). A first time stays a first time. PURE.
 */
export function toEasyTarget(t: ProgressionTarget, reason: string, sets: (n: number) => number): ProgressionTarget {
  if (t.free || t.action === 'start') return t;
  const same = t.change === 'up' && t.last ? t.sameWeightKg ?? t.last.weightKg : t.targetWeightKg;
  const hold = t.logType === 'time' && t.change === 'up' && t.holdSec != null ? Math.max(1, t.holdSec - HOLD_STEP_SEC) : t.holdSec;
  return {
    ...t,
    easy: true,
    holdSec: hold,
    targetSets: sets(t.targetSets),
    targetWeightKg: same,
    change: null,
    repGoal: null,
    setGoals: [],
    version: null,
    reason,
    // R-306 / R-308: the easy week keeps the weight, so no drop line and no step-back offer.
    dropNote: undefined,
    stepBack: undefined,
  };
}

/**
 * This plan week's effort on the Target (Phase 4, research v3 §5: "3 reps left in week 1 → 1
 * left in week 4"), for members who log RPE. Never on a first time, an easy week, a hold or an
 * exercise with no Target rule. The reason gains one sentence. PURE.
 */
export function withEffort(t: ProgressionTarget, rir: number | null, reason: string): ProgressionTarget {
  if (rir == null || t.free || t.easy || t.action === 'start' || t.logType === 'time') return t;
  return { ...t, effortRpe: 10 - rir, reason: `${t.reason} ${reason}` };
}

/** Rules look at this many recent workouts; the step is learned from the whole input. */
export const RULE_WINDOW = 4;
/** Wave-2 review: a workout of only sets this short (after one that reached the range) is a 1-rep-max test day. */
const TEST_DAY_REPS = 2;
/** R-143: a lighter set this many reps (or more) past the top is a planned high-rep back-off. */
const RANGE_MOVED_REPS = 2;
/** Timed holds: seconds added when every set reached its target (research §4.5). */
export const HOLD_STEP_SEC = 5;

interface Summary {
  dateISO: string;
  mainWeight: number;
  mainSets: ProgSet[];
  /** Every counted set at a different weight (pyramid / ramp): judged on its top set alone. */
  ramp: boolean;
  /**
   * 16 Oct 2026 audit (C3-4 / C3-5): counted sets at least 10% away from the main weight — a
   * heavy top set or lighter back-offs. They are part of the routine's sets but not of the main
   * sets the Target judges, so they lower how many main sets are needed.
   */
  offMain: number;
}

export interface ProgressionInput {
  exercise: Exercise;
  target: { targetSets: number; repRangeMin: number; repRangeMax: number };
  /** Newest first, sessions before today. Pass more than 4 so the step can be learned. */
  history: ProgSession[];
  todayISO: string;
  experience?: UserProfile['experience'];
  /** Phase 2: how this exercise is logged (default weight × reps). */
  logType?: LogType;
  /** Rep cap before "harder version" on an unloaded bodyweight move (catalogue). */
  repCap?: number | null;
  /** Hold cap in seconds before "harder version" (catalogue). */
  holdCapSec?: number | null;
  harder?: VersionLink | null;
  easier?: VersionLink | null;
  /**
   * TG-01: every weight the member has logged on this exercise (kg, ALL history, working sets,
   * already in today's counting). Suggested weights are rungs of this ladder. Absent: the
   * weights in `history`.
   */
  ladder?: readonly number[];
  /** Settings → Workouts → Weight jumps (absent = Standard, about 5%). */
  jump?: WeightJump;
  /**
   * The gym's bar and plates (kg), ONLY when the member set up Plates and bars (`gymPlatesFor`).
   * Used for a barbell's ladder only: every suggested weight is one they can load. Absent = his
   * own steps from his history, as before (review fix, Oct 2026).
   */
  gym?: GymPlates | null;
  /**
   * F194 (owner R-352): Settings -> Plates and bars -> "Machine and cable steps". Read for machine
   * and cable lifts logged as weight x reps only; free weights keep their own rules. Absent = learn
   * from his weights (today's behaviour).
   */
  machineStep?: MachineStep;
  /**
   * R-61 (owner, 22 Oct 2026): a two-dumbbell move whose weight is typed as the total of both
   * (Counting "Weight as typed", as a Hevy history is): every suggested total must be two equal
   * dumbbells from the rack. 10 kg typed is 5 + 5, so warm-up-style halves like 7.5 (3.75 each)
   * or a step to 22.5 (11.25 each) can never be picked up. Absent = one weight as typed.
   */
  pair?: boolean;
  /**
   * R-61 review: the newest day this lift was done in ANY workout, when `history` is narrower (the
   * "Same routine" setting). Only the break clock reads it ("10 weeks since your last…"); the
   * weights still come from `history`, so the Target, PREVIOUS and the grey hints agree.
   */
  breakFromISO?: string | null;
  /** R-308: "When I'm stuck at a weight". R-350 (5 Nov 2026): no longer read (the stall rule is gone). */
  stuck?: StuckChoice;
  /**
   * R-308: the day the member tapped "Stay" on a step-back offer for this exercise. No new offer
   * until 4 workouts from that day on (that day's included) are stuck again.
   */
  stepBackDeclinedISO?: string | null;
}

/** Loaded equipment: a blank weight here is "no weight logged", never "bodyweight" (TG-07). */
const LOADED: ReadonlySet<Exercise['equipment']> = new Set(['barbell', 'dumbbell', 'machine', 'cable']);

export function computeProgressionTarget(input: ProgressionInput): ProgressionTarget {
  return computeAt(input, 0);
}

/** `depth`: R-300 looks back at the previous workout's own Target, at most a few workouts deep. */
function computeAt(input: ProgressionInput, depth: number): ProgressionTarget {
  const logType = input.logType ?? 'weight_reps';
  if (logType === 'time') return holdTarget(input);

  const { exercise, target, todayISO } = input;
  const min = Math.max(1, Math.min(target.repRangeMin, target.repRangeMax));
  const max = Math.max(target.repRangeMin, target.repRangeMax);
  const name = exercise.name;
  const assisted = logType === 'assisted';

  let all = input.history.map(summarise).filter((s): s is Summary => s !== null);
  // TG-07: a bar, dumbbell, machine or cable lift saved once with a blank weight (0 kg) is
  // never a bodyweight move: such workouts are "no weight logged" and left out. Equipment
  // 'other' follows the majority of its workouts.
  if (logType === 'weight_reps') {
    const zero = all.filter((s) => s.mainWeight <= 0).length;
    const loaded = LOADED.has(exercise.equipment) || (exercise.equipment === 'other' && zero * 2 <= all.length);
    if (zero > 0 && loaded) all = all.filter((s) => s.mainWeight > 0);
  }
  const isBodyweight = exercise.equipment === 'bodyweight' || isBodyweightFamily(logType);
  // Reps-only when the latest workout carried no weight (an unloaded pull-up, or a lift
  // logged at 0 kg); a first-time bodyweight move too (but not the WEIGHTED version, whose
  // first time is about finding the added weight). Never prints "0 kg". An assisted move
  // always shows its help.
  const bodyweightOnly = assisted
    ? false
    : all.length === 0
      ? logType === 'reps' || (logType === 'weight_reps' && exercise.equipment === 'bodyweight')
      : all[0].mainWeight <= 0;

  const base = {
    exerciseId: exercise.id,
    exerciseName: name,
    muscleGroup: exercise.muscleGroup,
    targetSets: target.targetSets,
    targetRepsMin: min,
    targetRepsMax: max,
    bodyweightOnly,
    logType,
    holdSec: null,
  };

  // R0 — first time: no kilos. The member finds their own weight; next time we take it from there.
  if (all.length === 0) {
    return {
      ...base,
      last: null,
      targetWeightKg: 0,
      repGoal: null,
      setGoals: [],
      change: null,
      action: 'start',
      reason: assisted
        ? `First time on ${name}. Use enough help to do ${min}–${max} clean reps, stopping with about 2 left. Next time we take it from there.`
        : bodyweightOnly
          ? `First time on ${name}. Do clean reps, stopping with about 2 left. Next time we take it from there.`
          : `First time on ${name}. Pick a weight you could lift about 2 more times at ${min}–${max} reps. Next time we take it from there.`,
      rule: 'R0',
      topSetOnly: false,
      version: null,
    };
  }

  // Wave-2 review: the newest workout of a lift done when it was last done — kept for the break
  // clock even when a 1-rep-max test day is left out below.
  const lastDoneISO = all[0].dateISO;
  // Wave-2 review: a 1-rep-max test day (only singles and doubles, heavier than an earlier workout
  // that reached the range) is no working workout: the Target follows the working sets (100 x 5
  // then 140 x 1 never gives "140 kg, aim for 5").
  if (logType === 'weight_reps' && all.length >= 2 && min > TEST_DAY_REPS) {
    const t = all[0];
    const counted = t.mainSets;
    const test =
      counted.every((x) => x.reps <= TEST_DAY_REPS) &&
      all.slice(1, RULE_WINDOW).some((x) => x.mainWeight < t.mainWeight - 1e-6 && Math.max(...x.mainSets.map((y) => y.reps)) >= min);
    if (test) all = all.slice(1);
  }
  const sessions = all.slice(0, RULE_WINDOW);
  const L = sessions[0];
  const w = L.mainWeight;
  const repsList = L.mainSets.map((s) => s.reps).join(', ');
  const lowestReps = Math.min(...L.mainSets.map((s) => s.reps));
  const topReps = Math.max(...L.mainSets.map((s) => s.reps));
  const last = { weightKg: w, topReps, sets: L.mainSets.length, dateISO: L.dateISO };
  const step = learnStep(all, exercise, assisted);
  const learned = learnedGap(all, assisted) > 0;
  /**
   * Assisted moves only (their help keeps the step rule): "lb, miles" with no step learned
   * yet lands on the member's own pound steps. Never rounds to zero or past it.
   */
  const clean = (kg: number): number => {
    if (!isImperial() || learned || sameWeight(kg, w)) return kg;
    const r = roundToShownStep(kg, step);
    return Math.sign(r) === Math.sign(kg) && Math.abs(r) > 1e-6 ? round3(r) : kg;
  };
  // TG-01 / TG-02: every other suggested weight is a rung of the member's own ladder, in the
  // unit on screen.
  const gym = exercise.equipment === 'barbell' && logType === 'weight_reps' && input.gym ? input.gym : null;
  const ladderWeights =
    input.ladder ?? input.history.flatMap((s) => s.sets.filter((x) => x.setType !== 'warmup' && x.reps > 0).map((x) => x.weightKg));
  const kind = ladderKind(exercise.equipment, logType);
  // R-61: a pair typed as one total gets its ladder per dumbbell (halves of the weights he typed,
  // the rack's usual dumbbells), and each weight picked is doubled back. Halving and doubling are
  // exact in floating point, so nothing else moves. Review: only for a member who really types both
  // dumbbells — a recent total that is no pair (7.5, 12.5, 17.5: one dumbbell typed) leaves it off —
  // and an old total that is no pair (22.5 = 11.25 a hand) is never a rung.
  const recentPairs = all.slice(0, 6).every((s) => !(s.mainWeight > 0) || pairsUp(s.mainWeight));
  const per = input.pair && kind === 'dumbbell' && !assisted && logType === 'weight_reps' && recentPairs ? 2 : 1;
  const learnedKg = learnedGap(all, false);
  const ladder = buildLadder(
    per === 2 ? ladderWeights.filter((x) => pairsUp(x)).map((x) => x / 2) : ladderWeights,
    kind,
    {
      learnedStepKg: per === 2 ? (rackStep(learnedKg / 2) ? learnedKg / 2 : 0) : learnedKg,
      catalogStepKg: exercise.incrementKg,
      // The gym's plates make a bar's weights (a belt on a pull-up keeps the usual step).
      ...(gym ? { gym } : {}),
      // F194: a machine's or cable's stack moves in the member's chosen steps.
      ...((exercise.equipment === 'machine' || exercise.equipment === 'cable') && logType === 'weight_reps' && !assisted && per === 1
        ? { stackStepKg: machineStepKg(input.machineStep) }
        : {}),
    },
  );
  const both = (kg: number | null): number | null => (kg == null ? null : kg * per);
  /** Last time's weight as the Target shows and fills it (a clean number in this unit). */
  const sameRung = assisted || bodyweightOnly ? w : sameRungKg(w / per, ladder) * per;
  // Review: a pair whose nearest rack pair is more than 3% off last time's own total (a history in
  // the other unit) keeps that total as "the same weight": never 10% heavier under "Same weight".
  const same = per === 2 && Math.abs(sameRung - w) > w * 0.03 + 1e-9 ? w : sameRung;
  const upTo = (n: number): number => upRungsKg(w / per, n, ladder)[n - 1] * per;
  const lighter = (): number | null => both(downRungKg(w / per, ladder));
  /** F74: the next rung above / a small step (about 5%) below any weight on this ladder. */
  const upTo1 = (kg: number): number => upRungsKg(kg / per, 1, ladder)[0] * per;
  const lighterOf = (kg: number): number | null => {
    const d = both(downRungKg(kg / per, ladder, 0.05));
    return d == null ? null : round3(d);
  };
  /** " at 40 kg", " at +10 kg", " with 20 kg of help" — how the weight reads in a sentence. */
  const at = (kg: number) =>
    assisted ? (kg < 0 ? ` with ${targetKgText(-kg)} of help` : ' with no help') : kg > 0 ? ` at ${targetKgText(kg)}` : '';
  /**
   * 16 Oct 2026 audit (C3-14): last time's weight in a sentence is the weight the line shows (its
   * rung: 135 lb read in kg says "60 kg", never "61.23 kg" next to "Same weight").
   */
  const atLast = at(same);
  /** "40 kg", "20 kg of help", "no help". */
  const load = (kg: number) => (assisted ? (kg < 0 ? `${targetKgText(-kg)} of help` : 'no help') : `${targetKgText(kg)}`);

  const out = (
    rule: ProgRule,
    weightKg: number,
    repGoal: number,
    reason: string,
    version: ProgressionTarget['version'] = null,
    /** Each working set's goal; absent = `repGoal` on every set. */
    perSet?: number[],
  ): ProgressionTarget => {
    // Last time's weight on the ladder is "the same weight", even when it reads cleaner.
    const change = sameWeight(weightKg, same) ? null : weightKg > w + 1e-6 ? 'up' : weightKg < w - 1e-6 ? 'down' : null;
    const setGoals = perSet && perSet.length > 0 ? perSet : Array.from({ length: Math.max(1, target.targetSets) }, () => repGoal);
    // F74: one step of the member's own ladder above and below the Target weight, for the live
    // "this set felt easy / very hard" suggestion on the sets after it (engine/rpeNudge).
    const steps =
      logType === 'weight_reps' && !assisted && !bodyweightOnly && weightKg > 0
        ? { stepUpKg: round3(upTo1(weightKg)), stepDownKg: lighterOf(weightKg) }
        : {};
    return {
      ...base,
      ...steps,
      last,
      sameWeightKg: round3(same),
      targetWeightKg: round3(weightKg),
      targetRepsMax: Math.max(max, repGoal, ...setGoals),
      repGoal,
      setGoals,
      change,
      action: change === 'up' ? 'increase' : change === 'down' ? 'deload' : 'hold',
      reason,
      rule,
      topSetOnly: L.ramp,
      version,
    };
  };

  /** R-306 (owner, 3 Nov 2026): a lighter weight says why on the card (never on help, never same weight). */
  const withDrop = (note: string, t: ProgressionTarget): ProgressionTarget =>
    t.change === 'down' && !assisted ? { ...t, dropNote: note } : t;

  // R-350 (owner, 5 Nov 2026, option A): the simple rule. Only two things decide a Target: the
  // member's rep range and his "Weight jumps" choice. Each working set is compared with the same set
  // last time (warm-ups never count):
  //  1. under the top of the range -> same weight, that set aims one rep more (never past the top);
  //  2. every working set at the top -> the next weight by his jump %, every set at that one weight,
  //     each set's goal the reps that lift about the kg it lifted last time, inside the range;
  //  3. safety: under the bottom of the range two workouts running at this weight -> one step lighter;
  //  4. R-300: after a short day each set aims again for the goal it missed.
  // Logged RPE no longer changes the numbers (no effort credit, no big-jump, fast-lane, stall or
  // range-moved rules).
  const jumpKey: WeightJump = isWeightJump(input.jump) ? input.jump : DEFAULT_JUMP;
  const jumpShare = JUMP_SHARE[jumpKey];
  const nSets = Math.max(1, target.targetSets);
  /** F73 (R-140): S's sets done after a long rest, held at the same set's reps after a normal rest. */
  const heldRest = (S: Summary): { held: boolean[]; base: (number | null)[] } => {
    const held = S.mainSets.map((_, i) => heldAt(S.mainSets, i));
    return { held, base: held.map((h, i) => (h ? normalRestReps(sessions, S, w, i) : null)) };
  };
  /**
   * Rule 1: each set one rep more than the same set did in S, never past `top`. A set planned past
   * S's sets aims for S's last set as it was; a set after a long rest (F73) gets no extra rep.
   */
  const plusOne = (S: Summary, top: number): number[] => {
    const sets = S.mainSets;
    const rest = heldRest(S);
    return Array.from({ length: nSets }, (_, i) => {
      const k = Math.min(i, sets.length - 1);
      const did = sets[k].reps;
      if (rest.held[k]) {
        const b = rest.base[k];
        return Math.max(1, Math.min(top, b != null && b > 0 ? Math.min(did, b) : did));
      }
      return Math.max(1, Math.min(top, i < sets.length ? did + 1 : did));
    });
  };
  /**
   * R-300 (owner, 3 Nov 2026): the newest workout at this weight fell short of its own goals (the
   * Target it had, worked out again from the workouts before it; goals are not saved) -> each set
   * aims for the better of its usual +1 and the goal it missed, never past `top`. null = not short,
   * or nothing to compare.
   */
  const missedGoals = (goals: readonly number[], top: number): number[] | null => {
    if (depth >= RULE_WINDOW - 1 || L.ramp || w <= 0) return null;
    const before = input.history.filter((h) => h.dateISO < L.dateISO);
    if (before.length === 0) return null;
    const prev = computeAt({ ...input, history: before, todayISO: L.dateISO, breakFromISO: null }, depth + 1);
    if (prev.action === 'start' || prev.version || prev.setGoals.length === 0 || !sameWeight(prev.targetWeightKg, w)) return null;
    const did = L.mainSets.map((s) => s.reps);
    // Only a set that missed its goal takes it again; one rep short already aims for it (+1), so the
    // note shows only when a goal really changes.
    const again = goals.map((g, i) => (i < did.length && i < prev.setGoals.length && did[i] < prev.setGoals[i] ? Math.min(top, Math.max(g, prev.setGoals[i])) : g));
    return again.some((g, i) => g !== goals[i]) ? again : null;
  };
  /** "Add 1 rep to each set: 30 kg × 9, 9, 8." (or "... under 10: ..." when a set is held at the top). */
  const plusOneWords = (S: Summary, goals: readonly number[], top: number, loadText: string | null): string => {
    const all = goals.every((g, i) => i >= S.mainSets.length || g > S.mainSets[i].reps);
    const head = all ? 'Add 1 rep to each set' : `Add 1 rep to each set under ${top}`;
    return `${head}: ${loadText ? `${loadText} × ` : ''}${goals.join(', ')}.`;
  };

  // R1 / R1b — coming back after a break. Review (R-61): from the newest day anywhere, when known.
  const gap = daysBetween(input.breakFromISO && input.breakFromISO > lastDoneISO ? input.breakFromISO : lastDoneISO, todayISO);
  if (gap >= 21) {
    const weeks = Math.floor(gap / 7);
    if (gap >= 42 && !bodyweightOnly) {
      // 16 Oct 2026 audit (C3-8): the longer the break, the bigger the cut — about 10% up to 13
      // weeks, 20% up to 26 weeks, 30% after that (a year off was the same 10% as six weeks).
      const cut = gap < 91 ? 0.1 : gap < 183 ? 0.2 : 0.3;
      const down = assisted ? clean(round3(w - step)) : both(downRungKg(w / per, ladder, cut));
      if (down !== null) {
        return withDrop(`${weeks} weeks off, so a lighter start at ${targetKgText(down)}.`, out(
          'R1b',
          down,
          min,
          assisted
            ? `${weeks} weeks since your last ${name}. Start with a little more help, ${load(down)}, and build back.`
            : cut > 0.1
              ? `${weeks} weeks since your last ${name}. Start lighter at ${targetKgText(down)} and build back.`
              : `${weeks} weeks since your last ${name}. Start a little lighter at ${targetKgText(down)} and build back.`,
        ));
      }
    }
    return out(
      'R1',
      same,
      min,
      `Your last ${name} was ${weeks} weeks ago. ${bodyweightOnly ? 'Aim' : assisted ? 'Same help, aim' : 'Same weight, aim'} for ${min} and see how it feels.`,
    );
  }

  // C3-4: a top set or back-offs are part of the routine's sets, not of the main sets needed.
  const needOf = (s: Summary) => Math.max(1, target.targetSets - s.offMain - 1);
  const enoughSets = L.ramp || L.mainSets.length >= needOf(L);
  /**
   * Every working set of the newest workout reached `top`. C3-13: only the routine's own number of
   * sets is judged (an extra set at the end never blocks). F73: a set after a long rest never counts
   * as reaching it.
   */
  const allAt = (top: number): boolean =>
    enoughSets &&
    Math.min(
      ...L.mainSets
        .map((s, i) => (heldAt(L.mainSets, i) ? Math.min(s.reps, top - 1) : s.reps))
        .sort((a, b) => b - a)
        .slice(0, nSets),
    ) >= top;
  const best = (s: Summary) => Math.max(...s.mainSets.map((x) => x.reps));

  // B1 / B2cap — bodyweight the member has never loaded: reps only, never kilos. The same +1 rep a
  // set, up to the move's rep cap; then a harder version (its "one step").
  if (bodyweightOnly) {
    const cap = Math.max(input.repCap && input.repCap > 0 ? input.repCap : bodyweightCap(name), max + 2);
    if (allAt(cap)) {
      // Never fill fewer reps than were just done (20, 20, 20 against a cap of 15 keeps 20).
      const keep = Math.max(cap, lowestReps);
      if (input.harder) {
        return out(
          'B2cap',
          0,
          keep,
          `You did ${repsList}. That's plenty: try ${input.harder.name} next, or add a little weight.`,
          { kind: 'harder', ...input.harder },
        );
      }
      const floor = L.mainSets.length === nSets ? L.mainSets.map((s) => Math.max(keep, s.reps)) : undefined;
      return out('B2cap', 0, keep, `You did ${repsList}. That's plenty — ready for a harder version, or a little added weight.`, null, floor);
    }
    const goals = plusOne(L, cap);
    // Four workouts running under the range at body weight → an easier version builds up to it.
    if (input.easier && sessions.length >= RULE_WINDOW && sessions.every((s) => s.mainWeight <= 0 && best(s) < min)) {
      return out(
        'B1easy',
        0,
        Math.max(...goals),
        `Under ${min} reps for ${RULE_WINDOW} workouts. ${input.easier.name} builds you up to it — then come back.`,
        { kind: 'easier', ...input.easier },
        goals,
      );
    }
    return out('B1', 0, Math.max(...goals), plusOneWords(L, goals, cap, null) + longRestNote(heldRest(L).held), null, goals);
  }

  // Rule 2 — every working set reached the top: the next weight (assisted: one step less help).
  if (allAt(max)) {
    const did = `All sets reached ${max}.`;
    if (assisted) {
      const next = clean(round3(w + step));
      if (next >= -1e-6) {
        // No help left to take away: the unassisted version is next.
        const harder = input.harder ? { kind: 'harder' as const, ...input.harder } : null;
        return out(
          'A2zero',
          harder ? w : 0,
          min,
          harder ? `${did} Ready for ${harder.name} without help.` : `${did} Time to try it with no help.`,
          harder,
        );
      }
      // Less help is a harder set: every set starts again from the bottom of the range.
      return out('R2', next, min, `${did} Move to ${load(next)}: ${min} on every set.`);
    }
    // Oct 2026 (owner, "Weight jumps"): the heaviest rung within the chosen 2.5 / 5 / 10% —
    // never less than one step of his own ladder (pairs of dumbbells, the gym's plates).
    const next = w > 0 ? jumpRungKg(w / per, jumpShare, ladder) * per : upTo(1);
    // Each set aims for the reps that lift about the kg it lifted last time, inside the range
    // (30 x 13, 12, 10 -> 32.5 kg: 12, 11, 9 -> 10, 10, 9 in 6-10). Added weight on a bodyweight
    // move is small next to the body itself, so there every set starts from the bottom.
    const goals =
      isBodyweight || !(next > 0)
        ? Array.from({ length: nSets }, () => min)
        : Array.from({ length: nSets }, (_, i) => {
            const s = L.mainSets[Math.min(i, L.mainSets.length - 1)];
            return Math.min(max, Math.max(min, Math.floor((w * s.reps) / next + 1e-9)));
          });
    return out('R2', next, Math.max(...goals), `${did} Move up to ${targetKgText(next)}: ${goals.join(', ')}.`, null, goals);
  }

  // Rule 3 — the one safety rule: under the bottom of the range (every set) two workouts running at
  // this weight -> one step lighter (assisted: one step more help), every set at the bottom.
  const run: Summary[] = [];
  for (const s of sessions) {
    if (!sameWeight(s.mainWeight, w)) break;
    run.push(s);
  }
  if (!L.ramp && run.length >= 2 && best(run[0]) < min && best(run[1]) < min) {
    if (assisted) {
      const more = clean(round3(w - step));
      return out('R3', more, min, `You did under ${min} reps twice${atLast}. Use ${load(more)}: ${min} on every set.`);
    }
    const down = lighter();
    if (down !== null) {
      return withDrop(
        `Reps fell under ${min} twice, so a step back to ${targetKgText(down)}.`,
        out('R3', down, min, `You did under ${min} reps twice at ${targetKgText(same)}. Go one step lighter: ${targetKgText(down)} × ${min}.`),
      );
    }
    // Nothing lighter on his rack: keep the weight, rule 1 below.
  }

  // Rule 1 — same weight, one more rep on each set below the top.
  // Pyramids keep one goal at their heaviest weight (their own rule).
  if (L.ramp) {
    const goal = Math.min(max, Math.max(min, lowestReps + 1));
    return out('R5', same, goal, `Last time ${repsList}${atLast}. Same weight, aim for ${goal} at your heaviest weight.`);
  }
  // C3-12: the goals come from the newest FULL workout at this weight (a single cut-short set of 4
  // set every goal to 4).
  const G = sessions.find((s) => sameWeight(s.mainWeight, w) && s.mainSets.length >= needOf(s)) ?? L;
  const plus = plusOne(G, max);
  // R-300: after a short day, each set aims again for its missed goal (nothing piled on top).
  const again = missedGoals(plus, max);
  const goals = again ?? plus;
  const loadText = assisted ? load(same) : targetKgText(same);
  // Phase 4 (plan easy week): 4 workouts at this weight, none better than the oldest, and not one rep
  // from the top, still read as rule R4, so a plan can offer its easy week early (`stalledLiftsInPlan`).
  // R-350: it changes nothing the member sees here (no step back, no offer).
  const top4 = (S: Summary, n: number) => S.mainSets.map((x) => x.reps).sort((a, b) => b - a).slice(0, n).reduce((a, b) => a + b, 0);
  const n4 = run.length >= RULE_WINDOW ? Math.min(...run.slice(0, RULE_WINDOW).map((S) => S.mainSets.length)) : 0;
  const stalled =
    n4 > 0 &&
    Math.min(...L.mainSets.map((x) => x.reps)) < max - 1 &&
    run.slice(0, RULE_WINDOW - 1).every((S) => top4(S, n4) <= top4(run[RULE_WINDOW - 1], n4));
  return out(
    stalled ? 'R4' : 'R5',
    same,
    Math.max(...goals),
    (again ? `${SHORT_NOTE} ${loadText} × ${goals.join(', ')}.` : plusOneWords(G, goals, max, loadText)) + longRestNote(heldRest(G).held),
    null,
    goals,
  );
}

/** R-300 (owner, 3 Nov 2026): the one line after a short day. Member words: never "last time" in new words. */
const SHORT_NOTE = 'The previous workout fell a little short, so aim for the same goals again:';

/** F73: main set `i` was done after a long rest (never the first main set: fresh anyway). PURE. */
export function heldAt(sets: readonly ProgSet[], i: number): boolean {
  return i > 0 && sets[i]?.longRest === true;
}

/**
 * F73: set `i`'s reps in the newest OTHER workout at weight `w` (within the rule window) where that
 * set was done after a normal rest — what the member does at the planned rest. null = none.
 */
function normalRestReps(sessions: readonly Summary[], G: Summary, w: number, i: number): number | null {
  for (const s of sessions) {
    if (s === G || !sameWeight(s.mainWeight, w)) continue;
    const x = s.mainSets[i];
    if (x && !heldAt(s.mainSets, i) && x.reps > 0) return x.reps;
  }
  return null;
}

/** F73: " Set 2 came after a long rest, so its goal is not raised." (empty when no set did). PURE. */
export function longRestNote(held: readonly boolean[]): string {
  const nums = held.flatMap((h, i) => (h ? [i + 1] : []));
  if (nums.length === 0) return '';
  if (nums.length === 1) return ` Set ${nums[0]} came after a long rest, so its goal is not raised.`;
  const list = `${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`;
  return ` Sets ${list} came after a long rest, so their goals are not raised.`;
}

/** The entry for an exercise with no Target rule (distance work, timed cardio). */
export function freeTarget(input: Pick<ProgressionInput, 'exercise' | 'target'> & { logType: LogType }): ProgressionTarget {
  const { exercise, target } = input;
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    muscleGroup: exercise.muscleGroup,
    targetSets: target.targetSets,
    targetRepsMin: Math.max(1, Math.min(target.repRangeMin, target.repRangeMax)),
    targetRepsMax: Math.max(target.repRangeMin, target.repRangeMax),
    targetWeightKg: 0,
    last: null,
    repGoal: null,
    setGoals: [],
    change: null,
    action: 'hold',
    reason: '',
    rule: 'F',
    bodyweightOnly: false,
    topSetOnly: false,
    logType: input.logType,
    holdSec: null,
    version: null,
    free: true,
  };
}

// ---------------------------------------------------------------- timed holds (§4.5)

/**
 * Timed holds: replay the window oldest → newest. A workout "hits" when it has the planned
 * sets (at least targetSets − 1, like the rep rules) and its SHORTEST hold reached the target;
 * a hit sets the next target 5 s past the better of the target and that shortest hold, a miss
 * keeps it. The first workout in the window has no target, so with enough sets it "hits"
 * (next target = its shortest hold + 5 s). The catalogue's cap stops the climb and brings
 * "try a harder version"; a custom exercise has no cap. A Target is never below last time's
 * shortest hold.
 */
function holdTarget(input: ProgressionInput): ProgressionTarget {
  const { exercise, target, todayISO } = input;
  const min = Math.max(1, Math.min(target.repRangeMin, target.repRangeMax));
  const max = Math.max(target.repRangeMin, target.repRangeMax);
  const name = exercise.name;
  const cap = input.holdCapSec && input.holdCapSec > 0 ? input.holdCapSec : Infinity;
  const need = Math.max(1, target.targetSets - 1);

  const holds = input.history
    .map((s) => ({
      dateISO: s.dateISO,
      times: s.sets
        .filter((x) => (x.setType === 'normal' || x.setType === 'failure') && (x.durationSec ?? 0) > 0)
        .map((x) => Math.round(x.durationSec as number)),
    }))
    .filter((h) => h.times.length > 0);

  const base = {
    exerciseId: exercise.id,
    exerciseName: name,
    muscleGroup: exercise.muscleGroup,
    targetSets: target.targetSets,
    targetRepsMin: min,
    targetRepsMax: max,
    bodyweightOnly: false,
    logType: 'time' as const,
    targetWeightKg: 0,
    repGoal: null,
    setGoals: [],
    topSetOnly: false,
  };

  if (holds.length === 0) {
    return {
      ...base,
      last: null,
      holdSec: null,
      change: null,
      action: 'start',
      reason: `First time on ${name}. Hold with good form and stop before it breaks. Next time we take it from there.`,
      rule: 'T0',
      version: null,
    };
  }

  const L = holds[0];
  const lowest = Math.min(...L.times);
  const list = `${L.times.join(', ')} s`;
  const last = { weightKg: 0, topReps: 0, sets: L.times.length, dateISO: L.dateISO };
  const mk = (
    rule: ProgRule,
    holdSec: number,
    change: 'up' | null,
    reason: string,
    version: ProgressionTarget['version'] = null,
  ): ProgressionTarget => ({
    ...base,
    last,
    holdSec,
    change,
    action: change === 'up' ? 'increase' : 'hold',
    reason,
    rule,
    version,
  });

  const gap = daysBetween(input.breakFromISO && input.breakFromISO > L.dateISO ? input.breakFromISO : L.dateISO, todayISO);
  if (gap >= 21) {
    const weeks = Math.floor(gap / 7);
    return mk('T1', lowest, null, `Your last ${name} was ${weeks} weeks ago. Hold ${fmtDurationWords(lowest)} and see how it feels.`);
  }

  let goal: number | null = null;
  let before: number | null = null;
  let lastHit = false;
  for (const h of [...holds].reverse()) {
    const low = Math.min(...h.times);
    before = goal;
    if (h.times.length >= need && goal == null && median(h.times) > low) {
      // 16 Oct 2026 audit (C3-19): the first workout's holds were uneven (60, 60, 30 s) — its
      // usual hold, not its shortest + 5 s ("Time for 35 s" where he held 60).
      goal = Math.min(cap, median(h.times));
      lastHit = true;
    } else if (h.times.length >= need && (goal == null || low >= goal)) {
      // Capped inside the replay, so holding the cap keeps counting as a hit.
      goal = Math.min(cap, Math.max(goal ?? 0, low) + HOLD_STEP_SEC);
      lastHit = true;
    } else {
      if (goal == null) goal = low; // too few sets the first time: same time, every set
      lastHit = false;
    }
  }
  const next = Math.max(goal ?? lowest, lowest);

  if (L.times.length >= need && lowest >= cap) {
    if (input.harder) {
      return mk('Tcap', lowest, null, `You held ${list} — the top for ${name}. Try ${input.harder.name} next.`, {
        kind: 'harder',
        ...input.harder,
      });
    }
    return mk('Tcap', lowest, null, `You held ${list} — the top for ${name}. Hold it there, or make it harder.`);
  }
  if (lastHit) {
    const up = before != null && next > before + 1e-9;
    return mk('T2', next, up ? 'up' : null, `You held ${list}. Time for ${fmtDurationWords(next)} on every set.`);
  }
  return mk('T3', next, null, `Last time ${list}. Hold ${fmtDurationWords(next)} on every set before adding time.`);
}

// ---------------------------------------------------------------- display (shared by every screen)

type LineInput = Pick<OverloadTarget, 'targetWeightKg' | 'targetRepsMin' | 'targetRepsMax' | 'action'> & {
  repGoal?: number | null;
  /** Oct 2026: each working set's goal; printed when they differ ("40 kg · 11, 9, 8"). */
  setGoals?: readonly number[] | null;
  bodyweightOnly?: boolean;
  /** Phase 2 (absent on older saved cards = weight × reps). */
  logType?: LogType;
  holdSec?: number | null;
  version?: { kind: 'harder' | 'easier' } | null;
  /** Dumbbells: the weight is ONE dumbbell's ("12.5 kg each"). */
  each?: boolean;
  /** One side at a time: the rep goal is per side. */
  perSide?: boolean;
  /** No Target rule: the line says what to log. */
  free?: boolean;
  /** Phase 4: an easy week ("Easy week · 40 kg · 2 sets"). */
  easy?: boolean;
  targetSets?: number;
  /** Phase 4: "· RPE 8" for members who log RPE (`withEffort`). */
  effortRpe?: number;
};

/**
 * The one-line Target: "42.5 kg · aim for 9", "Bodyweight · aim for 11", "Hold 50 s",
 * "Assist 15 kg · aim for 8", and on a first time "First time · find a weight for 8–12"
 * (never a guessed number).
 */
/**
 * 16 Oct 2026 audit (C1-8): a Target's weight as the set row's grey hint and the saved set show
 * it — 2 decimals in kg ("41.25 kg", never "41.3"), 1 in lb. PURE but for the member's units.
 */
export function targetKgText(kg: number): string {
  const u = displayUnits();
  return `${trimNum(kgToShown(kg, u), u === 'imperial' ? 1 : 2)} ${weightUnitOf(u)}`;
}

export function targetLine(t: LineInput, fmtKg: (kg: number) => string = targetKgText): string {
  const range = t.targetRepsMin === t.targetRepsMax ? `${t.targetRepsMin}` : `${t.targetRepsMin}–${t.targetRepsMax}`;
  const lt = t.logType ?? 'weight_reps';
  if (t.free) return lt === 'time_distance' ? 'Time and distance' : lt === 'distance' ? 'Distance' : 'Time';
  const easySets = t.easy && t.targetSets ? ` · ${t.targetSets} ${t.targetSets === 1 ? 'set' : 'sets'}` : '';
  if (lt === 'time') {
    if (t.action === 'start') return 'First time · find a time you can hold';
    const hold = `Hold ${fmtDurationWords(t.holdSec ?? 0)}`;
    if (t.easy) return `Easy week · ${hold}${easySets}`;
    return t.version?.kind === 'harder' ? `${hold} · try a harder version` : hold;
  }
  if (t.action === 'start') {
    if (lt === 'assisted') return `First time · find the help you need for ${range} reps`;
    return t.bodyweightOnly ? `First time · bodyweight, ${range} reps` : `First time · find a weight for ${range} reps`;
  }
  if (lt === 'assisted' && t.version?.kind === 'harder') return 'Try it without help';
  const load = t.bodyweightOnly
    ? 'Bodyweight'
    : lt === 'assisted'
      ? t.targetWeightKg < 0
        ? `Assist ${fmtKg(Math.abs(t.targetWeightKg))}`
        : 'No help'
      : lt === 'weighted' || lt === 'reps'
        ? `+${fmtKg(t.targetWeightKg)}`
        : `${fmtKg(t.targetWeightKg)}${t.each ? ' each' : ''}`;
  if (t.easy) return `Easy week · ${load}${easySets}`;
  if (t.version?.kind === 'harder') return `${load} · try a harder version`;
  if (t.version?.kind === 'easier') return `${load} · try an easier version`;
  const side = t.perSide ? ' per side' : '';
  // Phase 4: this plan week's effort, for members who log RPE.
  const effort = t.effortRpe != null ? ` · RPE ${t.effortRpe}` : '';
  const goals = perSetLine(t.setGoals);
  if (t.repGoal != null && goals) return `${load} · ${goals}${side}${effort}`;
  if (t.repGoal != null) return `${load} · aim for ${t.repGoal}${side}${effort}`;
  return `${load} × ${range}${effort}`;
}

/** "11, 9, 8" when the per-set goals differ; null when there is one goal for every set. */
function perSetLine(goals: readonly number[] | null | undefined): string | null {
  if (!goals || goals.length < 2 || goals.every((g) => g === goals[0])) return null;
  return goals.join(', ');
}

/** What a Target fills into a set row: the TYPED values (help as a positive number). */
export interface TargetFill {
  weightKg: number;
  /** The rep goal (every set's, unless `setReps` says otherwise). */
  reps: number;
  durationSec?: number;
  /**
   * Oct 2026: each working set's rep goal, in working-set order (`ProgressionTarget.setGoals`) —
   * only when they differ. `fillForSet` gives a row the goal of its working-set number.
   */
  setReps?: number[];
  /**
   * 16 Oct 2026 audit (C3-4 / C3-5): last time's MAIN weight (kg). A row whose last-time set was
   * 10% or more away from it (a heavy top set, a lighter back-off) hints that set, not the Target.
   */
  fromKg?: number;
  /** R-143: where a lighter last-time set that reached the top of the range moves (`liftUpOf`). */
  liftUp?: LiftUp;
  /**
   * F74: what the live "felt easy / very hard" suggestion needs (engine/rpeNudge): the effort
   * planned (this plan week's RPE, else none = the app's default), the top of the rep range, and
   * one weight step up / down from the Target weight. Absent when not known.
   */
  nudge?: { effortRpe?: number; repMax?: number; stepUpKg?: number; stepDownKg?: number | null };
}

/** An easy week stops with this many reps left (easyWeek.ts: "stop with 3 or more reps left"). */
export const EASY_REPS_LEFT = 3;

/**
 * What the set rows hint (and a tick fills): the Target weight and its rep goal (or the hold
 * time). null — keep last time's hints — on a first time (there is no Target weight to fill),
 * after a pyramid (the Target is for the top set, not every row), and when a different
 * version is suggested (the member decides).
 */
export function targetFill(
  t: Pick<ProgressionTarget, 'targetWeightKg' | 'repGoal' | 'action' | 'topSetOnly'> &
    Partial<
      Pick<
        ProgressionTarget,
        | 'logType' | 'holdSec' | 'version' | 'free' | 'easy' | 'last' | 'setGoals' | 'change' | 'targetRepsMin' | 'targetRepsMax' | 'sameWeightKg'
        | 'effortRpe' | 'stepUpKg' | 'stepDownKg'
      >
    >,
): TargetFill | null {
  if (t.action === 'start' || t.version || t.free) return null;
  if (t.logType === 'time') return t.holdSec != null && t.holdSec > 0 ? { weightKg: 0, reps: 0, durationSec: t.holdSec } : null;
  if (t.topSetOnly) return null;
  const weightKg = t.logType === 'assisted' ? Math.abs(t.targetWeightKg) : t.targetWeightKg;
  // LW-22 / TG-09: an easy week's rows hint the easy Target — its weight, and last time's
  // reps less 3 ("stop with 3 or more reps left"), never last normal week's near-failure set.
  if (t.easy && t.repGoal == null) {
    const top = t.last?.topReps ?? 0;
    return top > 0 ? { weightKg, reps: Math.max(1, top - EASY_REPS_LEFT) } : null;
  }
  if (t.repGoal == null) return null;
  const perSet = !t.easy && perSetLine(t.setGoals) != null ? [...(t.setGoals as readonly number[])] : null;
  const out: TargetFill = perSet ? { weightKg, reps: t.repGoal, setReps: perSet } : { weightKg, reps: t.repGoal };
  if (!t.easy && (t.logType ?? 'weight_reps') === 'weight_reps' && t.last && t.last.weightKg > 0) {
    out.fromKg = t.last.weightKg;
    const up = liftUpOf({ ...t, last: t.last });
    if (up) out.liftUp = up;
  }
  return out;
}

/**
 * F74: `targetFill` plus what the live "felt easy / very hard" suggestion needs (`nudge`) — the
 * fill every set row of the live workout uses. Never in an easy week (no rep number to chase
 * there). PURE.
 */
export function rowTargetFill(t: Parameters<typeof targetFill>[0]): TargetFill | null {
  const out = targetFill(t);
  if (!out || t.easy || out.durationSec != null) return out;
  const nudge: NonNullable<TargetFill['nudge']> = {};
  if (t.effortRpe != null) nudge.effortRpe = t.effortRpe;
  if (t.targetRepsMax != null && t.targetRepsMax > 0) nudge.repMax = t.targetRepsMax;
  if (t.stepUpKg != null && t.stepUpKg > t.targetWeightKg) nudge.stepUpKg = t.stepUpKg;
  if (t.stepDownKg !== undefined) nudge.stepDownKg = t.stepDownKg;
  return Object.keys(nudge).length > 0 ? { ...out, nudge } : out;
}

/** A word only when the weight changes. null = say nothing (the first-time line already says "First time"). */
export function targetBadge(t: { change?: 'up' | 'down' | null }): 'Up' | 'Lighter' | null {
  if (t.change === 'up') return 'Up';
  if (t.change === 'down') return 'Lighter';
  return null;
}

// ---------------------------------------------------------------- helpers (exported for tests)

/**
 * Counted sets (normal + failure, reps > 0, a real weight); main weight = the weight with
 * the most sets, ties → heaviest. Weights compare at 3 decimals (lb-converted kg like
 * 61.2244898 would otherwise never match their own rounded key).
 */
export function summarise(s: ProgSession): Summary | null {
  const counted = s.sets.filter(
    (x) => (x.setType === 'normal' || x.setType === 'failure') && x.reps > 0 && Number.isFinite(x.weightKg) && Number.isFinite(x.reps),
  );
  if (counted.length === 0) return null;
  const tally = new Map<number, number>();
  for (const x of counted) {
    const k = round3(x.weightKg);
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  let mainWeight = -Infinity;
  let best = 0;
  for (const [kg, n] of tally) {
    if (n > best || (n === best && kg > mainWeight)) {
      best = n;
      mainWeight = kg;
    }
  }
  const mainSets = counted.filter((x) => sameWeight(round3(x.weightKg), mainWeight));
  if (mainSets.length === 0) return null;
  const offMain = mainWeight > 0 ? counted.filter((x) => Math.abs(x.weightKg - mainWeight) >= mainWeight * OFF_MAIN_SHARE - 1e-9).length : 0;
  return { dateISO: s.dateISO, mainWeight, mainSets, ramp: best === 1 && counted.length > 1, offMain };
}

/** C3-4: a set this far from the main weight is a top set or a back-off, not a main set. */
export const OFF_MAIN_SHARE = 0.1;

/**
 * R-143 (owner, 27-28 Oct 2026): where a LIGHTER set last time moves to next time. A set 10% or
 * more under last time's main weight is kept as it was (C3-4, a back-off) — unless it reached the
 * top of the rep range: then it moves up to the main weight, its reps back to the bottom of the
 * range, as the move-up rule (R2) does for the main sets. Only a lighter set that did not reach the
 * top (a true back-off) stays as last time; a heavy top set is never moved.
 */
export interface LiftUp {
  /** Reps at or above this on a lighter set = it reached the top of the range. */
  topReps: number;
  /** The weight it moves to: last time's main weight (never above today's Target weight). */
  weightKg: number;
  /** Its rep goal there: the bottom of the range. */
  reps: number;
}

/** The move-up for this Target's lighter sets, or null when none applies. PURE. */
export function liftUpOf(
  t: Pick<ProgressionTarget, 'targetWeightKg' | 'last'> &
    Partial<Pick<ProgressionTarget, 'targetRepsMin' | 'targetRepsMax' | 'sameWeightKg' | 'logType'>>,
): LiftUp | null {
  if ((t.logType ?? 'weight_reps') !== 'weight_reps') return null;
  if (!t.last || !(t.last.weightKg > 0) || !(t.targetWeightKg > 0)) return null;
  if (t.targetRepsMin == null || t.targetRepsMax == null || !(t.targetRepsMax > 0)) return null;
  const weightKg = Math.min(t.targetWeightKg, t.sameWeightKg ?? t.last.weightKg);
  return { topReps: t.targetRepsMax, weightKg, reps: Math.max(1, Math.min(t.targetRepsMin, t.targetRepsMax)) };
}

/** R-143: this last-time set was lighter than the main weight `mainKg` AND reached the top: it moves up. PURE. */
export function liftsUp(set: { weightKg: number; reps: number }, mainKg: number, up: LiftUp | null): up is LiftUp {
  if (!up || !(mainKg > 0) || !(set.weightKg > 0)) return false;
  const lighter = mainKg - set.weightKg >= mainKg * OFF_MAIN_SHARE - 1e-9;
  // Far ABOVE the range (C3-9's "range moved" spread: 80 x 10 after 100 x 5 in 4-6) is a planned
  // high-rep back-off with its own aim: it stays as last time (16 Oct audit C3-4).
  return lighter && set.weightKg < up.weightKg - 1e-9 && set.reps >= up.topReps && set.reps <= up.topReps + RANGE_MOVED_REPS;
}

/**
 * The most common weight INCREASE between one workout and the next (in date order) — the
 * jump the member actually makes at their gym. Drops (deloads, comebacks) are ignored, and
 * a jump seen only once is ignored as a typo. Ties → the smaller jump. Falls back to the
 * catalogue increment (2.5 kg when unset; its nearest pound step under "lb, miles"). `signed` (assisted moves): help is stored as a
 * negative weight, so taking help away is an increase too and non-positive weights count.
 */
export function learnStep(sessions: Summary[], exercise: Pick<Exercise, 'incrementKg'>, signed = false): number {
  // Under "lb, miles" the catalogue's kg step becomes the nearest pound step (2.5 kg → 5 lb).
  const fallback = stepFor(exercise.incrementKg > 0 ? exercise.incrementKg : 2.5);
  const gap = learnedGap(sessions, signed);
  return gap > 0 ? gap : fallback;
}

/** C3-2: a rise between two workouts counts toward the learned jump only up to the larger of these. */
const MAX_LEARNED_SHARE = 0.15;
const MAX_LEARNED_FLAT_KG = 5;

/** The learned jump of `learnStep`, or 0 when none was seen twice. */
function learnedGap(sessions: Summary[], signed: boolean): number {
  const byDate = [...sessions].filter((s) => signed || s.mainWeight > 0).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const gaps = new Map<number, number>();
  for (let i = 1; i < byDate.length; i++) {
    const g = round3(byDate[i].mainWeight - byDate[i - 1].mainWeight);
    // 16 Oct 2026 audit (C3-2): a rise of more than 15% (and over 5 kg) is a light day followed by
    // a heavy one, or a comeback — never his jump. Counted, alternating 80 / 100 kg days taught a
    // 20 kg "step" and Standard asked for 125 kg after 105.
    const low = Math.min(Math.abs(byDate[i].mainWeight), Math.abs(byDate[i - 1].mainWeight));
    if (g > 0 && g <= Math.max(MAX_LEARNED_FLAT_KG, low * MAX_LEARNED_SHARE) + 1e-9) gaps.set(g, (gaps.get(g) ?? 0) + 1);
  }
  let bestGap = 0;
  let bestN = 1; // must be seen at least twice
  for (const [g, n] of gaps) {
    if (n > bestN || (n === bestN && bestGap > 0 && g < bestGap)) {
      bestN = n;
      bestGap = g;
    }
  }
  return bestGap;
}

/** Rep cap before "ready for a harder version" on an unloaded bodyweight move. */
export function bodyweightCap(name: string): number {
  const n = name.toLowerCase();
  if (/pull|chin|dip|row/.test(n)) return 15;
  if (/push/.test(n)) return 25;
  return 20;
}

function median(xs: readonly number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

function daysBetween(fromISO: string, toISO: string): number {
  const ms = Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : 0;
}

function sameWeight(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
