/**
 * Progression engine v2 — the "Target" line on each planned exercise. PURE (no DB).
 *
 * Replaces the frozen `engine/overload.ts` for every Target the member sees (the frozen
 * file stays as-is: the demo-history seed and its tests still use it). Spec and evidence:
 * `Resources/Progressive-Overload-Research-v3.docx` §4 (outside the repo).
 *
 * Core: double progression — same weight, add reps until every main set reaches the top
 * of the range, then add one weight step and start from the bottom again. Around it:
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
import type { Exercise, OverloadTarget, UserProfile } from '@/types/models';

import { fmtDurationWords, isBodyweightFamily, type LogType } from './logTypes';

export type ProgSetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface ProgSet {
  weightKg: number;
  reps: number;
  rpe: number | null;
  setType: ProgSetType;
  /** Time sets (Phase 2); absent on weight × reps rows. */
  durationSec?: number | null;
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
  /** One rep number to beat on every main set; null on the first time (show the range). */
  repGoal: number | null;
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
/** A beginner's double step must stay within ACSM's 10%. */
const DOUBLE_STEP_SHARE = 0.1;
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
}

export function computeProgressionTarget(input: ProgressionInput): ProgressionTarget {
  const logType = input.logType ?? 'weight_reps';
  if (logType === 'time') return holdTarget(input);

  const { exercise, target, todayISO } = input;
  const min = Math.max(1, Math.min(target.repRangeMin, target.repRangeMax));
  const max = Math.max(target.repRangeMin, target.repRangeMax);
  const name = exercise.name;
  const assisted = logType === 'assisted';

  const all = input.history.map(summarise).filter((s): s is Summary => s !== null);
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
  /** " at 40 kg", " at +10 kg", " with 20 kg of help" — how the weight reads in a sentence. */
  const at = (kg: number) =>
    assisted ? (kg < 0 ? ` with ${trimNum(-kg)} kg of help` : ' with no help') : kg > 0 ? ` at ${trimNum(kg)} kg` : '';
  /** "40 kg", "20 kg of help", "no help". */
  const load = (kg: number) => (assisted ? (kg < 0 ? `${trimNum(-kg)} kg of help` : 'no help') : `${trimNum(kg)} kg`);

  const out = (
    rule: ProgRule,
    weightKg: number,
    repGoal: number,
    reason: string,
    version: ProgressionTarget['version'] = null,
  ): ProgressionTarget => {
    const change = weightKg > w + 1e-6 ? 'up' : weightKg < w - 1e-6 ? 'down' : null;
    return {
      ...base,
      last,
      targetWeightKg: round3(weightKg),
      targetRepsMax: Math.max(max, repGoal),
      repGoal,
      change,
      action: change === 'up' ? 'increase' : change === 'down' ? 'deload' : 'hold',
      reason,
      rule,
      topSetOnly: L.ramp,
      version,
    };
  };

  // R1 / R1b — coming back after a break.
  const gap = daysBetween(L.dateISO, todayISO);
  if (gap >= 21) {
    const weeks = Math.floor(gap / 7);
    if (gap >= 42 && !bodyweightOnly) {
      const lighter = assisted ? round3(w - step) : stepDown(w, step);
      if (lighter !== null) {
        return out(
          'R1b',
          lighter,
          min,
          assisted
            ? `${weeks} weeks since your last ${name}. Start with a little more help, ${load(lighter)}, and build back.`
            : `${weeks} weeks since your last ${name}. Start a little lighter at ${trimNum(lighter)} kg and build back.`,
        );
      }
    }
    return out(
      'R1',
      w,
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
      const next = round3(w + step);
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
    // Added weight on a bodyweight move is small next to the body itself: never "big".
    const big = !isBodyweight && w > 0 && step / w > BIG_STEP_SHARE + 1e-9;
    if (big) {
      const expandCap = max + 4;
      if (minScore >= expandCap) {
        const goal = Math.max(1, min - 2);
        return out('R2', w + step, goal, `${did} Time for ${trimNum(w + step)} kg — a big jump, so ${goal} reps is a win.`);
      }
      const goal = Math.min(expandCap, Math.max(max + 2, lowestReps + 1));
      const pct = Math.round((step / w) * 100);
      return out('R2b', w, goal, `The next step is ${trimNum(w + step)} kg, a ${pct}% jump. Add reps first: aim for ${goal}.`);
    }
    if (input.experience === 'beginner' && minScore >= max + 3 && w > 0 && (2 * step) / w <= DOUBLE_STEP_SHARE + 1e-9) {
      return out('R2c', w + 2 * step, min, `That looked easy: ${repsList}${at(w)}. Jumping to ${trimNum(w + 2 * step)} kg.`);
    }
    return out('R2', w + step, min, `${did} Time for ${trimNum(w + step)} kg.`);
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
      const more = round3(w - step);
      return out('R3', more, min, `Reps fell under ${min} twice${at(w)}. Use ${load(more)} and build back up.`);
    }
    const lighter = stepDown(w, step);
    if (lighter !== null) {
      return out('R3', lighter, min, `Reps fell under ${min} twice at ${trimNum(w)} kg. Drop to ${trimNum(lighter)} kg and build back up.`);
    }
    return out('R3', w, min, `Reps fell under ${min} twice at ${trimNum(w)} kg. Stay here and build back to ${min}.`);
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
        const more = round3(w - step);
        return out('R4', more, mid, `Stuck${at(w)} for ${judged.length} workouts. A little more help, ${load(more)}, usually breaks it.`);
      }
      const lighter = stepDown(w, step);
      if (lighter !== null) {
        return out('R4', lighter, mid, `Stuck at ${trimNum(w)} kg for ${judged.length} workouts. A small step back to ${trimNum(lighter)} kg usually breaks it.`);
      }
      return out('R4', w, mid, `Stuck at ${trimNum(w)} kg for ${judged.length} workouts. Keep the weight and aim for ${mid} clean reps.`);
    }
  }

  // R5 — same weight, one more rep.
  const goal = Math.min(max, Math.max(min, lowestReps + 1));
  return out(
    'R5',
    w,
    goal,
    `Last time ${repsList}${at(w)}. ${assisted ? 'Same help' : 'Same weight'}, aim for ${goal} ${L.ramp ? 'on your top set' : 'on every set'}.`,
  );
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
};

/**
 * The one-line Target: "42.5 kg · aim for 9", "Bodyweight · aim for 11", "Hold 50 s",
 * "Assist 15 kg · aim for 8", and on a first time "First time · find a weight for 8–12"
 * (never a guessed number).
 */
export function targetLine(t: LineInput, fmtKg: (kg: number) => string = (kg) => `${trimNum(kg)} kg`): string {
  const range = t.targetRepsMin === t.targetRepsMax ? `${t.targetRepsMin}` : `${t.targetRepsMin}–${t.targetRepsMax}`;
  const lt = t.logType ?? 'weight_reps';
  if (t.free) return lt === 'time_distance' ? 'Time and distance' : lt === 'distance' ? 'Distance' : 'Time';
  if (lt === 'time') {
    if (t.action === 'start') return 'First time · find a time you can hold';
    const hold = `Hold ${fmtDurationWords(t.holdSec ?? 0)}`;
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
  if (t.version?.kind === 'harder') return `${load} · try a harder version`;
  if (t.version?.kind === 'easier') return `${load} · try an easier version`;
  const side = t.perSide ? ' per side' : '';
  if (t.repGoal != null) return `${load} · aim for ${t.repGoal}${side}`;
  return `${load} × ${range}`;
}

/** What a Target fills into a set row: the TYPED values (help as a positive number). */
export interface TargetFill {
  weightKg: number;
  reps: number;
  durationSec?: number;
}

/**
 * What the set rows hint (and a tick fills): the Target weight and its rep goal (or the hold
 * time). null — keep last time's hints — on a first time (there is no Target weight to fill),
 * after a pyramid (the Target is for the top set, not every row), and when a different
 * version is suggested (the member decides).
 */
export function targetFill(
  t: Pick<ProgressionTarget, 'targetWeightKg' | 'repGoal' | 'action' | 'topSetOnly'> &
    Partial<Pick<ProgressionTarget, 'logType' | 'holdSec' | 'version' | 'free'>>,
): TargetFill | null {
  if (t.action === 'start' || t.version || t.free) return null;
  if (t.logType === 'time') return t.holdSec != null && t.holdSec > 0 ? { weightKg: 0, reps: 0, durationSec: t.holdSec } : null;
  if (t.topSetOnly || t.repGoal == null) return null;
  const weightKg = t.logType === 'assisted' ? Math.abs(t.targetWeightKg) : t.targetWeightKg;
  return { weightKg, reps: t.repGoal };
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
 * catalogue increment (2.5 kg when unset). `signed` (assisted moves): help is stored as a
 * negative weight, so taking help away is an increase too and non-positive weights count.
 */
export function learnStep(sessions: Summary[], exercise: Pick<Exercise, 'incrementKg'>, signed = false): number {
  const fallback = exercise.incrementKg > 0 ? exercise.incrementKg : 2.5;
  const byDate = [...sessions].filter((s) => signed || s.mainWeight > 0).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const gaps = new Map<number, number>();
  for (let i = 1; i < byDate.length; i++) {
    const g = round3(byDate[i].mainWeight - byDate[i - 1].mainWeight);
    if (g > 0) gaps.set(g, (gaps.get(g) ?? 0) + 1);
  }
  let bestGap = 0;
  let bestN = 1; // must be seen at least twice
  for (const [g, n] of gaps) {
    if (n > bestN || (n === bestN && bestGap > 0 && g < bestGap)) {
      bestN = n;
      bestGap = g;
    }
  }
  return bestGap > 0 ? bestGap : fallback;
}

/** About 10% lighter, in whole steps (nearest, at least one). null when that would reach zero. */
function stepDown(weightKg: number, step: number): number | null {
  const steps = Math.max(1, Math.round((weightKg * 0.1) / step));
  const next = round3(weightKg - steps * step);
  return next > 0 ? next : null;
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
