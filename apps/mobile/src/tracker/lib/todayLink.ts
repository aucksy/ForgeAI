/**
 * v0.28.0 — where Home's "Today" card goes: today's routine opens its preview (every exercise,
 * then Start); with nothing planned, the Workout tab as before. PURE.
 */
export function todayLink(tw: { planDayId: string | null; targets: readonly unknown[] }): '/today' | '/workout' {
  return tw.planDayId != null && tw.targets.length > 0 ? '/today' : '/workout';
}

/**
 * v0.28.1 — today's routine was already done today. The rotation then shows that same routine
 * (its headline says it "is in the books"), so the Today page says so instead of only "Start".
 */
export function doneToday(tw: { headline: string } | null): boolean {
  return tw != null && / is in the books /.test(tw.headline);
}
