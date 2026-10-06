/**
 * Progression engine v2 — the "Target" line on each planned exercise. PURE (no DB).
 *
 * Replaces the frozen `engine/overload.ts` for every Target the member sees (the frozen
 * file stays as-is: the demo-history seed and its tests still use it). Spec and evidence:
 * `Resources/Progressive-Overload-Research-v1.docx` §4 (outside the repo).
 *
 * Core: double progression — same weight, add reps until every main set reaches the top
 * of the range, then add one weight step and start from the bottom again. Around it:
 *  - drop sets and lighter back-off sets never block progress (main-weight rule);
 *  - the weight step is LEARNED from the weights the member actually logs;
 *  - a step bigger than 10% of the weight asks for more reps first (big-jump guard);
 *  - logged RPE adds up to 2 "reps in the tank" to a set's score; no RPE = reps only;
 *  - bodyweight moves progress by reps, never by kilos the member has never added;
 *  - a long break holds or lightens the weight; a stall waits 4 workouts before a cut.
 *
 * First time on an exercise (rule R0) deliberately reuses the frozen engine's start
 * weights until the owner picks between "no kilos" and "light start weight".
 *
 * All weights kg. History is newest first, sessions BEFORE today, warm-ups excluded.
 */
import { computeOverloadTarget } from '@/engine/overload';
import { trimNum } from '@/lib/format';
import type { Exercise, OverloadTarget, UserProfile } from '@/types/models';

export type ProgSetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface ProgSet {
  weightKg: number;
  reps: number;
  rpe: number | null;
  setType: ProgSetType;
}

export interface ProgSession {
  dateISO: string;
  sets: ProgSet[];
}

export type ProgRule =
  | 'R0' | 'R1' | 'R1b' | 'R2' | 'R2b' | 'R2c' | 'R3' | 'R4' | 'R5'
  | 'B1' | 'B2' | 'B2cap';

export interface ProgressionTarget extends OverloadTarget {
  /** One rep number to beat on every main set; null on the first time (show the range). */
  repGoal: number | null;
  /** The weight moved from last time's main weight. null = same weight / first time. */
  change: 'up' | 'down' | null;
  /** Bodyweight move the member has never loaded: show no kilos at all. */
  bodyweightOnly: boolean;
  /** Which rule fired (tests + debugging; never shown). */
  rule: ProgRule;
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

interface Summary {
  dateISO: string;
  mainWeight: number;
  mainSets: ProgSet[];
  /** Every counted set at a different weight (pyramid / ramp): judged on its top set alone. */
  ramp: boolean;
}

export function computeProgressionTarget(input: {
  exercise: Exercise;
  target: { targetSets: number; repRangeMin: number; repRangeMax: number };
  /** Newest first, sessions before today. Pass more than 4 so the step can be learned. */
  history: ProgSession[];
  todayISO: string;
  experience?: UserProfile['experience'];
}): ProgressionTarget {
  const { exercise, target, todayISO } = input;
  const min = Math.max(1, Math.min(target.repRangeMin, target.repRangeMax));
  const max = Math.max(target.repRangeMin, target.repRangeMax);
  const name = exercise.name;

  const all = input.history.map(summarise).filter((s): s is Summary => s !== null);
  const isBodyweight = exercise.equipment === 'bodyweight';
  // Reps-only when the latest workout carried no weight (an unloaded pull-up, or a lift
  // logged at 0 kg); a first-time bodyweight move too. Never prints "0 kg".
  const bodyweightOnly = all.length === 0 ? isBodyweight : all[0].mainWeight <= 0;

  const base = {
    exerciseId: exercise.id,
    exerciseName: name,
    muscleGroup: exercise.muscleGroup,
    targetSets: target.targetSets,
    targetRepsMin: min,
    targetRepsMax: max,
    bodyweightOnly,
  };

  // R0 — first time. Frozen engine's start weights, unchanged (owner decision pending).
  if (all.length === 0) {
    const t = computeOverloadTarget({ exercise, target: { ...target, repRangeMin: min, repRangeMax: max }, history: [] });
    return { ...t, repGoal: null, change: null, bodyweightOnly, rule: 'R0' };
  }

  const sessions = all.slice(0, RULE_WINDOW);
  const L = sessions[0];
  const w = L.mainWeight;
  const repsList = L.mainSets.map((s) => s.reps).join(', ');
  const lowestReps = Math.min(...L.mainSets.map((s) => s.reps));
  const topReps = Math.max(...L.mainSets.map((s) => s.reps));
  const last = { weightKg: w, topReps, sets: L.mainSets.length, dateISO: L.dateISO };
  const step = learnStep(all, exercise);
  const at = (kg: number) => (kg > 0 ? ` at ${trimNum(kg)} kg` : '');

  const out = (
    rule: ProgRule,
    weightKg: number,
    repGoal: number,
    reason: string,
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
    };
  };

  // R1 / R1b — coming back after a break.
  const gap = daysBetween(L.dateISO, todayISO);
  if (gap >= 21) {
    const weeks = Math.floor(gap / 7);
    if (gap >= 42 && !bodyweightOnly) {
      const lighter = stepDown(w, step);
      if (lighter !== null) {
        return out('R1b', lighter, min, `${weeks} weeks since your last ${name}. Start a little lighter at ${trimNum(lighter)} kg and build back.`);
      }
    }
    return out(
      'R1',
      w,
      min,
      `Your last ${name} was ${weeks} weeks ago. ${bodyweightOnly ? 'Aim' : 'Same weight, aim'} for ${min} and see how it feels.`,
    );
  }

  const need = Math.max(1, target.targetSets - 1);
  const scores = L.mainSets.map(score);
  const minScore = Math.min(...scores);
  const enoughSets = L.ramp || L.mainSets.length >= need;

  // B1 / B2 / B2cap — bodyweight the member has never loaded: reps only, never kilos.
  if (bodyweightOnly) {
    const cap = Math.max(bodyweightCap(name), max + 2);
    if (enoughSets && minScore >= cap) {
      return out('B2cap', 0, cap, `You did ${repsList}. That's plenty — ready for a harder version, or a little added weight.`);
    }
    const goal = Math.min(cap, Math.max(1, lowestReps + 1));
    if (enoughSets && minScore >= max) {
      return out('B2', 0, goal, `You did ${repsList}. Keep adding reps: aim for ${goal} on every set.`);
    }
    return out('B1', 0, goal, `Last time ${repsList}. Aim for ${goal} on every set.`);
  }

  // R2 / R2b / R2c — ready to add weight.
  if (enoughSets && minScore >= max) {
    const usedCredit = L.mainSets.some((s) => s.reps < max);
    const did = `You did ${repsList}${at(w)}${usedCredit ? ' with reps to spare' : ''}.`;
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
  const best = (s: Summary) => Math.max(...s.mainSets.map(score));
  const sum = (s: Summary) => s.mainSets.map(score).reduce((a, b) => a + b, 0);
  if (judged.length >= 2 && best(judged[0]) < min && best(judged[1]) < min && sum(judged[0]) <= sum(judged[1])) {
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
      const lighter = stepDown(w, step);
      if (lighter !== null) {
        return out('R4', lighter, mid, `Stuck at ${trimNum(w)} kg for ${judged.length} workouts. A small step back to ${trimNum(lighter)} kg usually breaks it.`);
      }
      return out('R4', w, mid, `Stuck at ${trimNum(w)} kg for ${judged.length} workouts. Keep the weight and aim for ${mid} clean reps.`);
    }
  }

  // R5 — same weight, one more rep.
  const goal = Math.min(max, Math.max(min, lowestReps + 1));
  return out('R5', w, goal, `Last time ${repsList}${at(w)}. Same weight, aim for ${goal} ${L.ramp ? 'on your top set' : 'on every set'}.`);
}

// ---------------------------------------------------------------- display (shared by every screen)

type LineInput = Pick<OverloadTarget, 'targetWeightKg' | 'targetRepsMin' | 'targetRepsMax'> & {
  repGoal?: number | null;
  bodyweightOnly?: boolean;
};

/** The one-line Target: "42.5 kg · aim for 9", "Bodyweight · aim for 11", or the range on a first time. */
export function targetLine(t: LineInput): string {
  const load = t.bodyweightOnly ? 'Bodyweight' : `${trimNum(t.targetWeightKg)} kg`;
  if (t.repGoal != null) return `${load} · aim for ${t.repGoal}`;
  const range = t.targetRepsMin === t.targetRepsMax ? `${t.targetRepsMin}` : `${t.targetRepsMin}–${t.targetRepsMax}`;
  return `${load} × ${range}`;
}

/** A word only when the weight changes (or the first time). null = say nothing. */
export function targetBadge(t: { action: OverloadTarget['action']; change?: 'up' | 'down' | null }): 'Up' | 'Lighter' | 'Start' | null {
  if (t.action === 'start') return 'Start';
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
 * catalogue increment (2.5 kg when unset).
 */
export function learnStep(sessions: Summary[], exercise: Pick<Exercise, 'incrementKg'>): number {
  const fallback = exercise.incrementKg > 0 ? exercise.incrementKg : 2.5;
  const byDate = [...sessions].filter((s) => s.mainWeight > 0).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
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
function bodyweightCap(name: string): number {
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
