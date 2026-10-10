import type { TodaySummary } from '@/types/models';

type TodayLike = { planDayId: string | null; targets: readonly unknown[]; today?: TodaySummary };

/**
 * v0.28.0 — where Home's "Today" card goes: today's routine opens its preview (every exercise,
 * then Start). Audit Phase 3 (SH-03 / RP-11): with no plan, or a plan with no exercises yet,
 * the routines screen (ready programs, build a plan, your routines); otherwise the Workout
 * tab. PURE.
 */
export function todayLink(tw: TodayLike): '/today' | '/workout' | '/routines' {
  if (tw.today?.status === 'noPlan' || tw.today?.status === 'emptyPlan') return '/routines';
  return tw.planDayId != null && tw.targets.length > 0 ? '/today' : '/workout';
}

/**
 * Today's routine was already done today (audit Phase 3: the one "Today" answer says so).
 * Older shapes without it: the old headline "… is in the books …".
 */
export function doneToday(tw: { headline: string; today?: TodaySummary } | null): boolean {
  if (tw == null) return false;
  if (tw.today) return tw.today.status === 'doneToday';
  return / is in the books /.test(tw.headline);
}
