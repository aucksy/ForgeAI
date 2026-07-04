/**
 * Strength score — PURE (no DB imports).
 * Composite of key-lift e1RM vs bodyweight benchmarks, 0-100.
 */
import { clamp } from '@/lib/format';
import type { StrengthScore } from '@/types/models';

/** Key-lift benchmarks as multiples of body weight (e1RM), matched by name contains. */
const BENCHMARKS: { match: RegExp; multiple: number }[] = [
  { match: /bench/i, multiple: 1.25 },
  { match: /squat/i, multiple: 1.75 },
  { match: /deadlift/i, multiple: 2.0 },
  { match: /overhead|shoulder press/i, multiple: 0.75 },
  { match: /row/i, multiple: 1.0 },
];

export function computeStrengthScore(input: {
  bodyWeightKg: number;
  lifts: { exerciseName: string; e1rmKg: number }[]; // best e1RM of key lifts
}): StrengthScore {
  const { bodyWeightKg, lifts } = input;
  const keyLifts: StrengthScore['keyLifts'] = [];
  const components: number[] = [];

  if (bodyWeightKg > 0) {
    const used = new Set<string>();
    for (const bench of BENCHMARKS) {
      let best: { exerciseName: string; e1rmKg: number } | null = null;
      for (const lift of lifts) {
        if (used.has(lift.exerciseName) || !bench.match.test(lift.exerciseName)) continue;
        if (!best || lift.e1rmKg > best.e1rmKg) best = lift;
      }
      if (!best || best.e1rmKg <= 0) continue;
      used.add(best.exerciseName);
      const ratio = best.e1rmKg / bodyWeightKg;
      components.push(Math.min(ratio / bench.multiple, 1.2)); // cap so one lift can't run away
      keyLifts.push({
        exerciseName: best.exerciseName,
        e1rmKg: best.e1rmKg,
        ratio: Math.round(ratio * 100) / 100,
      });
    }
  }

  const score =
    components.length === 0
      ? 0
      : clamp(
          Math.round((components.reduce((a, b) => a + b, 0) / components.length) * 83.33),
          0,
          100,
        );

  const label =
    score < 40 ? 'Building the base' : score < 60 ? 'Getting strong' : score < 80 ? 'Strong' : 'Elite territory';

  return { score, label, keyLifts };
}
