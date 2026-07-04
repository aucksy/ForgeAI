/**
 * Progressive-overload engine — PURE (no DB imports).
 * All weights kg. History is newest-first, working sets only.
 */
import { trimNum } from '@/lib/format';
import type { Exercise, OverloadTarget } from '@/types/models';

/** Epley estimated one-rep max: w * (1 + reps/30). */
export function epleyE1rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

/** Nearest loadable weight for the exercise's plate/stack increment. */
export function roundToIncrement(weightKg: number, incrementKg: number): number {
  if (incrementKg <= 0) return weightKg;
  return round3(Math.round(weightKg / incrementKg) * incrementKg);
}

/** Conservative first-session weights by equipment (kg). */
const START_WEIGHT: Record<Exercise['equipment'], number> = {
  barbell: 20, // empty bar
  dumbbell: 7.5,
  machine: 20,
  cable: 20,
  bodyweight: 0,
  other: 10,
};

interface PastSession {
  dateISO: string;
  sets: { weightKg: number; reps: number }[];
}

interface SessionSummary {
  dateISO: string;
  topWeightKg: number;
  topReps: number;
}

export function computeOverloadTarget(input: {
  exercise: Exercise;
  target: { targetSets: number; repRangeMin: number; repRangeMax: number };
  history: PastSession[]; // newest first, working sets
}): OverloadTarget {
  const { exercise, target } = input;
  const inc = exercise.incrementKg > 0 ? exercise.incrementKg : 2.5;
  const history = input.history.filter((h) => h.sets.length > 0);

  const base = {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    muscleGroup: exercise.muscleGroup,
    targetSets: target.targetSets,
    targetRepsMin: target.repRangeMin,
    targetRepsMax: target.repRangeMax,
  };

  // No history -> conservative start by equipment.
  if (history.length === 0) {
    const startKg = roundToIncrement(START_WEIGHT[exercise.equipment], inc);
    const reason =
      exercise.equipment === 'barbell'
        ? `First time on ${exercise.name} — start with the empty bar (20 kg) and own every rep.`
        : exercise.equipment === 'bodyweight'
          ? `First time on ${exercise.name} — bodyweight only today, focus on clean controlled reps.`
          : `First time on ${exercise.name} — starting light at ${trimNum(startKg)} kg to groove the movement.`;
    return { ...base, last: null, targetWeightKg: startKg, reason, action: 'start' };
  }

  const summaries = history.map(summarise);
  const lastS = summaries[0];
  const lastSets = history[0].sets;
  const last = {
    weightKg: lastS.topWeightKg,
    topReps: lastS.topReps,
    sets: lastSets.length,
    dateISO: lastS.dateISO,
  };

  // Every working set hit the top of the rep range at one weight -> add load.
  const allAtTop = lastSets.every(
    (s) => sameWeight(s.weightKg, lastS.topWeightKg) && s.reps >= target.repRangeMax,
  );
  if (allAtTop) {
    const nextKg = roundToIncrement(lastS.topWeightKg + inc, inc);
    const repsList = lastSets.map((s) => s.reps).join(', ');
    const reason =
      lastS.topWeightKg <= 0
        ? `You hit ${repsList} last session — time to add some load.`
        : `You hit ${repsList} at ${trimNum(lastS.topWeightKg)} kg — time to move up.`;
    return { ...base, last, targetWeightKg: nextKg, reason, action: 'increase' };
  }

  // Under the bottom of the range two sessions running -> deload and rebuild.
  if (
    summaries.length >= 2 &&
    lastS.topReps < target.repRangeMin &&
    summaries[1].topReps < target.repRangeMin
  ) {
    const dl = deload(lastS.topWeightKg, inc);
    return {
      ...base,
      last,
      targetWeightKg: dl,
      reason: `Reps have slipped under ${target.repRangeMin} two sessions in a row — resetting to ${trimNum(dl)} kg to build back up stronger.`,
      action: 'deload',
    };
  }

  // Same top weight three sessions running: plateau deload, or hold if reps climb.
  if (
    summaries.length >= 3 &&
    sameWeight(summaries[0].topWeightKg, summaries[1].topWeightKg) &&
    sameWeight(summaries[1].topWeightKg, summaries[2].topWeightKg)
  ) {
    const [r0, r1, r2] = [summaries[0].topReps, summaries[1].topReps, summaries[2].topReps];
    const repsClimbing = r0 > r1 || r0 > r2;
    if (!repsClimbing) {
      const dl = deload(lastS.topWeightKg, inc);
      return {
        ...base,
        last,
        targetWeightKg: dl,
        reason: `You've been stuck at ${trimNum(lastS.topWeightKg)} kg for three weeks — deloading to ${trimNum(dl)} kg to break the plateau.`,
        action: 'deload',
      };
    }
    const chase = Math.min(r0 + 1, target.repRangeMax);
    return {
      ...base,
      last,
      targetWeightKg: lastS.topWeightKg,
      targetRepsMin: Math.max(target.repRangeMin, chase),
      reason: `Three sessions at ${trimNum(lastS.topWeightKg)} kg but the reps keep climbing — chase ${chase} today.`,
      action: 'hold',
    };
  }

  // Default: hold the weight, add a rep.
  const chase = Math.min(lastS.topReps + 1, target.repRangeMax);
  const reason =
    lastS.topReps >= target.repRangeMax
      ? `Top set hit ${lastS.topReps} at ${trimNum(lastS.topWeightKg)} kg — bring every set to ${target.repRangeMax} and we add weight.`
      : `Solid ${trimNum(lastS.topWeightKg)} kg × ${lastS.topReps} last time — same weight, push for ${chase} today.`;
  return {
    ...base,
    last,
    targetWeightKg: lastS.topWeightKg,
    targetRepsMin: Math.max(target.repRangeMin, chase),
    reason,
    action: 'hold',
  };
}

/** 10% off the top weight, floored to the increment, never below one increment. */
function deload(topWeightKg: number, incrementKg: number): number {
  if (topWeightKg <= 0) return 0;
  const dropped = round3(Math.floor((topWeightKg * 0.9) / incrementKg + 1e-9) * incrementKg);
  return Math.max(dropped, incrementKg);
}

/** Top working set = heaviest weight; topReps = best reps at that weight. */
function summarise(s: PastSession): SessionSummary {
  let topWeightKg = s.sets[0].weightKg;
  let topReps = s.sets[0].reps;
  for (const set of s.sets) {
    if (set.weightKg > topWeightKg) {
      topWeightKg = set.weightKg;
      topReps = set.reps;
    } else if (sameWeight(set.weightKg, topWeightKg) && set.reps > topReps) {
      topReps = set.reps;
    }
  }
  return { dateISO: s.dateISO, topWeightKg, topReps };
}

function sameWeight(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
