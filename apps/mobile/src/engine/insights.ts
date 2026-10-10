/**
 * Dashboard insight line — PURE (no DB imports).
 * One coach-voice sentence. Priority: records > plateau > protein gap > volume > streak.
 *
 * Phase 3 (D9, D10): the streak is WEEKS in a row (`lib/streak`), and records are counted
 * as LIFTS that beat their best this week (`tracker/engine/headline`) — the same numbers
 * Home's streak row and Progress show.
 */
export function buildInsight(d: {
  streakWeeks: number;
  proteinGapG: number;
  /** Lifts that beat a best this week (the one record rule). */
  liftsUp: number;
  plateauedExercise: string | null;
  weeklyVolumeDeltaPct: number;
  todayTrained: boolean;
}): string {
  const { streakWeeks, proteinGapG, liftsUp, plateauedExercise, weeklyVolumeDeltaPct, todayTrained } = d;

  if (liftsUp > 0) {
    return liftsUp === 1
      ? '1 lift beat its best this week — your strength curve is pointing exactly where we want it.'
      : `${liftsUp} lifts beat their best this week — strength is trending exactly where we want it.`;
  }

  if (plateauedExercise) {
    return `${plateauedExercise} has been flat for three weeks — time to deload and build back stronger.`;
  }

  if (proteinGapG > 0) {
    const g = Math.round(proteinGapG);
    return g <= 30
      ? `You're only ${g} g away from your protein goal — one scoop of whey closes it.`
      : `Still ${g} g of protein to go today — build your next meals around it.`;
  }

  if (Math.abs(weeklyVolumeDeltaPct) >= 10) {
    const pct = Math.round(Math.abs(weeklyVolumeDeltaPct));
    return weeklyVolumeDeltaPct > 0
      ? `Weekly volume is up ${pct}% on last week — earn it back with sleep and protein.`
      : `Volume is ${pct}% down on last week — ${todayTrained ? "tomorrow's" : "today's"} session is the comeback.`;
  }

  if (streakWeeks >= 2) {
    return `${streakWeeks}-week streak and counting — consistency is what builds physiques.`;
  }

  return todayTrained
    ? 'Work is done for today — recovery is where the growth happens.'
    : 'Nothing logged yet today — even a short session keeps the momentum alive.';
}
