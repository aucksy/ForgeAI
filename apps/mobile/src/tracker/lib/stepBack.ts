/**
 * R-306 / R-308 (owner, 3 Nov 2026): the words on the exercise card when a lift is stuck. PURE.
 *  - Under "Ask me", a small card asks before the weight goes down ("Try 40 kg today?"), with
 *    "Try 40 kg" and "Stay at 45 kg". Gone once any set of the exercise is ticked today.
 *  - When the Target's weight IS lower than the previous workout's main weight, one short line
 *    says why ("Stuck at 45 kg, so a small step back to 40 kg.").
 * Member words: never "volume", "PR" or "session".
 */
import type { ProgressionTarget, StepBackOffer } from '../engine/progression';

export interface StepBackAsk {
  text: string;
  tryLabel: string;
  stayLabel: string;
}

/** The offer's question and its two buttons. `fmt` writes a weight as the card does ("40 kg"). PURE. */
export function stepBackAsk(o: StepBackOffer, fmt: (kg: number) => string): StepBackAsk {
  const n = o.workouts;
  return {
    text:
      // Fresh-eyes review (5 Nov 2026): no research citation in member words, and it says plainly that
      // the lighter weight is a suggestion instead of the plan above (which stays until "Try" is tapped).
      `Stuck at ${fmt(o.fromKg)} for ${n} ${n === 1 ? 'workout' : 'workouts'}. ` +
      'A lighter weight with more reps builds about the same muscle. ' +
      `Try ${fmt(o.weightKg)} this time instead of ${fmt(o.fromKg)}?`,
    tryLabel: `Try ${fmt(o.weightKg)}`,
    stayLabel: `Stay at ${fmt(o.fromKg)}`,
  };
}

/** The offer shows only while nothing of this exercise is ticked today. PURE. */
export function showStepBack(t: Pick<ProgressionTarget, 'stepBack'> | null | undefined, anyTicked: boolean): t is Pick<ProgressionTarget, 'stepBack'> & { stepBack: StepBackOffer } {
  return !!t?.stepBack && !anyTicked;
}

/** The one-line reason, only when the suggested weight is below the previous main weight. PURE. */
export function dropLine(t: Pick<ProgressionTarget, 'dropNote' | 'change' | 'targetWeightKg' | 'last'> | null | undefined): string | null {
  if (!t?.dropNote || t.change !== 'down' || !t.last) return null;
  return t.targetWeightKg < t.last.weightKg - 1e-6 ? t.dropNote : null;
}
