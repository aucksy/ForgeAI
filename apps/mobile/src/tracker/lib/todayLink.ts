/**
 * v0.28.0 — where Home's "Today" card goes: today's routine opens its preview (every exercise,
 * then Start); with nothing planned, the Workout tab as before. PURE.
 */
export function todayLink(tw: { planDayId: string | null; targets: readonly unknown[] }): '/today' | '/workout' {
  return tw.planDayId != null && tw.targets.length > 0 ? '/today' : '/workout';
}
