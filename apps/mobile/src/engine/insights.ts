/**
 * Dashboard insight line — PURE (no DB imports).
 * One coach-voice sentence. Priority: PR > plateau > protein gap > volume > streak.
 */
export function buildInsight(d: {
  streakDays: number;
  proteinGapG: number;
  recentPrCount: number;
  plateauedExercise: string | null;
  weeklyVolumeDeltaPct: number;
  todayTrained: boolean;
}): string {
  const { streakDays, proteinGapG, recentPrCount, plateauedExercise, weeklyVolumeDeltaPct, todayTrained } = d;

  if (recentPrCount > 0) {
    return recentPrCount === 1
      ? 'New PR this week — your strength curve is pointing exactly where we want it.'
      : `${recentPrCount} new PRs this week — strength is trending exactly where we want it.`;
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

  if (streakDays >= 2) {
    return `${streakDays}-day streak and counting — consistency is what builds physiques.`;
  }

  return todayTrained
    ? 'Work is done for today — recovery is where the growth happens.'
    : 'Nothing logged yet today — even a short session keeps the momentum alive.';
}
