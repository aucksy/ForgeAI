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
 * The words on the card's action, true to where it goes (SH-23: never "Start workout" on a
 * tap that only opens another screen). PURE.
 */
export function todayAction(tw: TodayLike): string {
  const link = todayLink(tw);
  if (link === '/routines') return tw.today?.status === 'emptyPlan' ? 'Open your routines' : 'Pick a program or build one';
  if (link === '/today') return tw.today?.status === 'doneToday' ? 'See what’s next' : 'See workout';
  return 'Choose a workout';
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
