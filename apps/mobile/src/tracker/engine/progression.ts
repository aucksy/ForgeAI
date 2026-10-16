/**
 * Progression engine v2 — the "Target" line on each planned exercise. PURE (no DB).
 *
 * Replaces the frozen `engine/overload.ts` for every Target the member sees (the frozen
 * file stays as-is: the demo-history seed and its tests still use it). Spec and evidence:
 * `Resources/Progressive-Overload-Research-v3.docx` §4 (outside the repo).
 *
 * Core: double progression — same weight, add reps until every main set reaches the top
 * of the range, then add weight and start from the bottom again. Oct 2026 (owner): the jump is
 * the member's "Weight jumps" setting (about 2.5 / 5 / 10%, always at least the gym's smallest
 * step — `jumpRungKg`), and each set gets its own rep goal (`perSetGoals`, `setGoals`). Around it:
 *  - drop sets and lighter back-off sets never block progress (main-weight rule);
 *  - the weight step is LEARNED from the weights the member actually logs;
 *  - a step bigger than 20% of the weight asks for more reps first (big-jump guard);
 *  - logged RPE adds up to 2 "reps in the tank" to a set's score; no RPE = reps only;
 *  - bodyweight moves progress by reps, never by kilos the member has never added;
 *  - a long break holds or lightens the weight; a stall waits 4 workouts before a cut.
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
import { defaultBarKg, gymFloorKg, type GymPlates } from '@/tracker/services/plateMath';
import type { Exercise, OverloadTarget, UserProfile } from '@/types/models';

import { fmtDurationWords, isBodyweightFamily, type LoadMode, type LogType } from './logTypes';
import { buildLadder, downRungKg, jumpRungKg, ladderKind, sameRungKg, unitToKg, upRungsKg } from './weightLadder';

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

/**
 * Review fix (Oct 2026): how far the beginner fast lane (R2c, "that looked easy") may go - at most
 * ONE size above the member's own choice: Small -> the Standard share, Standard -> the Large share,
 * Large -> no fast lane (it is already the largest).
 */
const FAST_LANE_SHARE: Readonly<Record<WeightJump, number | null>> = {
  small: JUMP_SHARE.standard,
  standard: JUMP_SHARE.large,
  large: null,
};

/**
 * Review fix (Oct 2026): what the warm-up rows need to follow a weight change - last time's
 * warm-ups were done for `fromKg`; scaled to the new working weight they are rounded DOWN to a
 * weight the member can load (`warmupWeightKg`).
 */
export interface WarmScale {
  /** Last time's working weight (kg). */
  fromKg: number;
  /** Round down to whole steps of this (kg): his own learned step, else 2.5 kg / 5 lb. */
  stepKg: number;
  /** The empty bar (kg) on a barbell lift - a warm-up never goes under it; null otherwise. */
  barKg: number | null;
  /** The gym's bar and plates (a barbell, Plates and bars set up): round down through them. */
  gym?: GymPlates | null;
}

/**
 * A warm-up's weight for a new working weight (review fix, Oct 2026). Last time a 40 kg warm-up
 * for 60 kg, now 65 kg: 40 x 65/60 = 43.3 -> 42.5 kg. Rounded DOWN to a loadable step, never under
 * the empty bar on a barbell, never above the new working weight. The same working weight =
 * last time's warm-up as it was. PURE.
 */
export function warmupWeightKg(lastWarmKg: number, newWorkKg: number, w: WarmScale): number {
  if (!(lastWarmKg > 0) || !(w.fromKg > 0) || !(newWorkKg > 0)) return lastWarmKg;
  const ratio = newWorkKg / w.fromKg;
  if (Math.abs(ratio - 1) < 1e-9) return lastWarmKg;
  const raw = lastWarmKg * ratio;
  let v: number;
  if (w.gym) v = gymFloorKg(raw, w.gym);
  else if (w.stepKg > 0) v = Math.floor(raw / w.stepKg + 1e-9) * w.stepKg;
  else v = raw;
  if (w.barKg != null) v = Math.max(v, w.barKg);
  v = Math.min(v, newWorkKg);
  return Math.round(v * 1e6) / 1e6;
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
}

export interface ProgSession {
  dateISO: string;
  sets: ProgSet[];
}

export type ProgRule =
  | 'R0' | 'R1' | 'R1b' | 'R2' | 'R2b' | 'R2c' | 'R3' | 'R4' | 'R5'
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
  /**
   * Review fix (Oct 2026): set when the weight moves (`change`), so the warm-up rows scale with it
   * (`targetFill` -> `fillForSet` -> `warmupWeightKg`). Absent = the warm-ups stay as last time.
   */
  warm?: WarmScale;
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
  /** Phase 4: this plan week's effort for members who log RPE (`withEffort`): the RPE to stop at. */
  effortRpe?: number;
  /**
   * TG-02: last time's weight as it reads on the member's ladder (a clean number in the unit on
   * screen: 165 lb logged, shown in kg -> 75). The easy week keeps this weight.
   */
  sameWeightKg?: number;
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
/**
 * A step larger than this share of the weight is a "big jump": add reps first. ACSM's
 * 2–10% would make the empty 20 kg bar's first step (+2.5 kg = 12.5%) "big", so the line
 * is drawn at 20%: 5 → 7.5 kg dumbbells (+50%) and a 20 → 25 kg machine (+25%) are big;
 * 20 → 22.5 kg on the bar and 12.5 → 15 kg dumbbells are not.
 */
const BIG_STEP_SHARE = 0.2;
/** Logged RPE at or under this on the set that gets the extra rep: aim 2 more instead of 1. */
const EASY_SET_RPE = 7;
/** At most this many reps-in-reserve count toward a set's score. */
const MAX_EFFORT_CREDIT = 2;
/** Timed holds: seconds added when every set reached its target (research §4.5). */
export const HOLD_STEP_SEC = 5;

interface Summary {
  dateISO: string;
  mainWeight: number;
  mainSets: ProgSet[];
  /** Every counted set at a different weight (pyramid / ramp): judged on its top set alone. */
  ramp: boolean;
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
}

/** Loaded equipment: a blank weight here is "no weight logged", never "bodyweight" (TG-07). */
const LOADED: ReadonlySet<Exercise['equipment']> = new Set(['barbell', 'dumbbell', 'machine', 'cable']);

export function computeProgressionTarget(input: ProgressionInput): ProgressionTarget {
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
  const ladder = buildLadder(ladderWeights, ladderKind(exercise.equipment, logType), {
    learnedStepKg: learnedGap(all, false),
    catalogStepKg: exercise.incrementKg,
    // The gym's plates make a bar's weights (a belt on a pull-up keeps the usual step).
    ...(gym ? { gym } : {}),
  });
  /** Last time's weight as the Target shows and fills it (a clean number in this unit). */
  const same = assisted || bodyweightOnly ? w : sameRungKg(w, ladder);
  const upTo = (n: number): number => upRungsKg(w, n, ladder)[n - 1];
  const lighter = (): number | null => downRungKg(w, ladder);
  /** " at 40 kg", " at +10 kg", " with 20 kg of help" — how the weight reads in a sentence. */
  const at = (kg: number) =>
    assisted ? (kg < 0 ? ` with ${targetKgText(-kg)} of help` : ' with no help') : kg > 0 ? ` at ${targetKgText(kg)}` : '';
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
    // Review fix: a moved weight takes the warm-ups with it (loaded weights only).
    const warm: WarmScale | null =
      change != null && logType === 'weight_reps' && !bodyweightOnly && w > 0 && weightKg > 0
        ? {
            fromKg: w,
            stepKg: unitToKg(learnedGap(all, false) > 0 && ladder.step != null ? ladder.step : ladder.units === 'imperial' ? 5 : 2.5, ladder.units),
            barKg: exercise.equipment === 'barbell' ? (gym?.barKg ?? defaultBarKg(ladder.units)) : null,
            ...(gym ? { gym } : {}),
          }
        : null;
    return {
      ...base,
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
      ...(warm ? { warm } : {}),
    };
  };

  // R1 / R1b — coming back after a break.
  const gap = daysBetween(L.dateISO, todayISO);
  if (gap >= 21) {
    const weeks = Math.floor(gap / 7);
    if (gap >= 42 && !bodyweightOnly) {
      const down = assisted ? clean(round3(w - step)) : lighter();
      if (down !== null) {
        return out(
          'R1b',
          down,
          min,
          assisted
            ? `${weeks} weeks since your last ${name}. Start with a little more help, ${load(down)}, and build back.`
            : `${weeks} weeks since your last ${name}. Start a little lighter at ${targetKgText(down)} and build back.`,
        );
      }
    }
    return out(
      'R1',
      same,
      min,
      `Your last ${name} was ${weeks} weeks ago. ${bodyweightOnly ? 'Aim' : assisted ? 'Same help, aim' : 'Same weight, aim'} for ${min} and see how it feels.`,
    );
  }

  const need = Math.max(1, target.targetSets - 1);
  const scores = L.mainSets.map(score);
  const minScore = Math.min(...scores);
  const enoughSets = L.ramp || L.mainSets.length >= need;
  const best = (s: Summary) => Math.max(...s.mainSets.map(score));

  // B1 / B2 / B2cap — bodyweight the member has never loaded: reps only, never kilos.
  if (bodyweightOnly) {
    const cap = Math.max(input.repCap && input.repCap > 0 ? input.repCap : bodyweightCap(name), max + 2);
    if (enoughSets && minScore >= cap) {
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
      return out('B2cap', 0, keep, `You did ${repsList}. That's plenty — ready for a harder version, or a little added weight.`);
    }
    const goal = Math.min(cap, Math.max(1, lowestReps + 1));
    if (enoughSets && minScore >= max) {
      return out('B2', 0, goal, `You did ${repsList}. Keep adding reps: aim for ${goal} on every set.`);
    }
    // Four workouts running under the range at body weight → an easier version builds up to it.
    if (input.easier && sessions.length >= RULE_WINDOW && sessions.every((s) => s.mainWeight <= 0 && best(s) < min)) {
      return out(
        'B1easy',
        0,
        goal,
        `Under ${min} reps for ${RULE_WINDOW} workouts. ${input.easier.name} builds you up to it — then come back.`,
        { kind: 'easier', ...input.easier },
      );
    }
    return out('B1', 0, goal, `Last time ${repsList}. Aim for ${goal} on every set.`);
  }

  // R2 / R2b / R2c — ready to add weight (or, assisted, to take help away).
  if (enoughSets && minScore >= max) {
    const usedCredit = L.mainSets.some((s) => s.reps < max);
    const did = `You did ${repsList}${at(w)}${usedCredit ? ' with reps to spare' : ''}.`;
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
      return out('R2', next, min, `${did} Time for ${load(next)}.`);
    }
    // The next rung of the member's own ladder (TG-01) — the single smallest step up.
    const up = upTo(1);
    // Added weight on a bodyweight move is small next to the body itself: never "big".
    const big = !isBodyweight && w > 0 && (up - w) / w > BIG_STEP_SHARE + 1e-9;
    if (big) {
      const expandCap = max + 4;
      if (minScore >= expandCap) {
        const goal = Math.max(1, min - 2);
        return out('R2', up, goal, `${did} Time for ${targetKgText(up)} — a big jump, so ${goal} reps is a win.`);
      }
      const goal = Math.min(expandCap, Math.max(max + 2, lowestReps + 1));
      const pct = Math.round(((up - w) / w) * 100);
      return out('R2b', same, goal, `The next step is ${targetKgText(up)}, a ${pct}% jump. Add reps first: aim for ${goal}.`);
    }
    // Oct 2026 (owner, "Weight jumps"): the heaviest rung within the chosen 2.5 / 5 / 10% —
    // never less than one step (overrules TG-01's "never more than one rung").
    const jumpKey: WeightJump = isWeightJump(input.jump) ? input.jump : DEFAULT_JUMP;
    const share = JUMP_SHARE[jumpKey];
    const next = w > 0 ? jumpRungKg(w, share, ladder) : up;
    // R2c - a beginner who found it easy may go ONE size further than his choice (review fix:
    // Small never jumps past the Standard share; Large has no fast lane).
    const fast = FAST_LANE_SHARE[jumpKey];
    if (input.experience === 'beginner' && minScore >= max + 3 && w > 0 && fast != null) {
      const jump = jumpRungKg(w, fast, ladder);
      if (jump > next + 1e-6) {
        return out('R2c', jump, min, `That looked easy: ${repsList}${at(w)}. Jumping to ${targetKgText(jump)}.`);
      }
    }
    return out('R2', next, min, `${did} Time for ${targetKgText(next)}.`);
  }

  // Sessions at today's main weight, newest first (the "run").
  let runLen = 0;
  while (runLen < sessions.length && sameWeight(sessions[runLen].mainWeight, w)) runLen++;
  const run = sessions.slice(0, runLen);
  // The first workout after a weight increase doesn't count toward a cut.
  const afterIncrease = runLen < sessions.length && sessions[runLen].mainWeight < w - 1e-6;
  const judged = afterIncrease ? run.slice(0, -1) : run;

  // R3 — under the range two workouts running at this weight, and not climbing.
  const sum = (s: Summary) => s.mainSets.map(score).reduce((a, b) => a + b, 0);
  if (judged.length >= 2 && best(judged[0]) < min && best(judged[1]) < min && sum(judged[0]) <= sum(judged[1])) {
    if (assisted) {
      const more = clean(round3(w - step));
      return out('R3', more, min, `Reps fell under ${min} twice${at(w)}. Use ${load(more)} and build back up.`);
    }
    const down = lighter();
    if (down !== null) {
      return out('R3', down, min, `Reps fell under ${min} twice at ${targetKgText(w)}. Drop to ${targetKgText(down)} and build back up.`);
    }
    return out('R3', same, min, `Reps fell under ${min} twice at ${targetKgText(w)}. Stay here and build back to ${min}.`);
  }

  // R4 — stalled: 4 workouts at this weight and no better than the oldest of them.
  // Never when the newest workout was within one rep of moving up.
  if (judged.length >= 4 && minScore < max - 1) {
    const n = Math.min(...judged.slice(0, 4).map((s) => s.mainSets.length));
    const total = (s: Summary) =>
      s.mainSets.map(score).sort((a, b) => b - a).slice(0, n).reduce((a, b) => a + b, 0);
    const oldest = total(judged[3]);
    if (judged.slice(0, 3).every((s) => total(s) <= oldest)) {
      const mid = Math.round((min + max) / 2);
      if (assisted) {
        const more = clean(round3(w - step));
        return out('R4', more, mid, `Stuck${at(w)} for ${judged.length} workouts. A little more help, ${load(more)}, usually breaks it.`);
      }
      const down = lighter();
      if (down !== null) {
        return out('R4', down, mid, `Stuck at ${targetKgText(w)} for ${judged.length} workouts. A small step back to ${targetKgText(down)} usually breaks it.`);
      }
      return out('R4', same, mid, `Stuck at ${targetKgText(w)} for ${judged.length} workouts. Keep the weight and aim for ${mid} clean reps.`);
    }
  }

  // R5 — same weight, one more rep.
  // Assisted moves and pyramids keep one goal for every set (their own rules).
  if (assisted || L.ramp) {
    const goal = Math.min(max, Math.max(min, lowestReps + 1));
    return out(
      'R5',
      same,
      goal,
      `Last time ${repsList}${at(w)}. ${assisted ? 'Same help' : 'Same weight'}, aim for ${goal} ${L.ramp ? 'at your heaviest weight' : 'on every set'}.`,
    );
  }
  // Oct 2026 (owner): a goal per set. Last time under the range on every set (RPE 10 gives no
  // credit, so a hard set under the range is a miss) → the same numbers again; else one more
  // rep on the first set still below the top, every other set last time's own number.
  const miss = best(L) < min;
  const goals = perSetGoals(L.mainSets, target.targetSets, max, miss, min);
  const top = Math.max(...goals);
  const uniform = goals.every((g) => g === goals[0]);
  const aim = uniform ? `aim for ${goals[0]} on every set` : `aim for ${goals.join(', ')}`;
  return out(
    'R5',
    same,
    top,
    miss
      ? `Last time ${repsList}${at(w)}. Same weight: match it, ${uniform ? `${goals[0]} on every set` : goals.join(', ')}, then build from there.`
      : `Last time ${repsList}${at(w)}. Same weight, ${aim}.`,
    null,
    goals,
  );
}

/**
 * Each working set's rep goal at the same weight (Oct 2026, owner). PURE.
 *  - Last time's set i is set i's floor (sets beyond last time's count take its last set).
 *  - Not a miss: the first set still below the top of the range aims one more (two when that
 *    set was logged at RPE 7 or easier), never past the top. So 10, 9, 8 → 11, 9, 8 and
 *    12, 9, 8 (range 8–12) → 12, 10, 8.
 *  - Not a miss: no set aims under the bottom of the range `min` (review fix: 10, 7, 6 in 8-12
 *    -> 11, 8, 8, never "11, 7, 6").
 *  - A miss: last time's numbers again.
 */
export function perSetGoals(sets: readonly ProgSet[], targetSets: number, max: number, miss: boolean, min = 1): number[] {
  if (sets.length === 0) return [];
  const n = Math.max(1, targetSets);
  const last = Array.from({ length: n }, (_, i) => sets[Math.min(i, sets.length - 1)].reps);
  if (miss) return last;
  const floor = Math.min(Math.max(1, min), max);
  const goals = last.map((g) => Math.max(g, floor));
  const i = last.findIndex((g) => g < max);
  if (i < 0) return goals;
  const rpe = i < sets.length ? sets[i].rpe : null;
  const easy = rpe != null && Number.isFinite(rpe) && rpe >= 6 && rpe <= EASY_SET_RPE;
  goals[i] = Math.min(max, Math.max(goals[i], last[i] + (easy ? 2 : 1)));
  return goals;
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

  const gap = daysBetween(L.dateISO, todayISO);
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
    if (h.times.length >= need && (goal == null || low >= goal)) {
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
  /** Review fix (Oct 2026): the weight moved - warm-up rows scale with it (`warmupWeightKg`). */
  warm?: WarmScale;
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
    Partial<Pick<ProgressionTarget, 'logType' | 'holdSec' | 'version' | 'free' | 'easy' | 'last' | 'setGoals' | 'warm' | 'change'>>,
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
  if (t.warm && t.change != null && !t.easy) out.warm = t.warm;
  return out;
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
  return { dateISO: s.dateISO, mainWeight, mainSets, ramp: best === 1 && counted.length > 1 };
}

/** Reps plus logged reps-in-reserve (10 − RPE), capped at 2. RPE outside the app's 6–10 scale is ignored. */
export function score(s: ProgSet): number {
  if (s.rpe == null || !Number.isFinite(s.rpe) || s.rpe < 6 || s.rpe > 10) return s.reps;
  return s.reps + Math.max(0, Math.min(MAX_EFFORT_CREDIT, 10 - s.rpe));
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
