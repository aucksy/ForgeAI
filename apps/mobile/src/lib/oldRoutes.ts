/**
 * Redesign R5/R6 (PLAN §6, "nothing gets lost"): where an old page's link lands now, so links
 * kept by an older widget, shortcut or notification still open something sensible. PURE.
 *
 *   /history                → the Profile tab (its Workouts feed)
 *   /history?view=calendar  → Calendar
 *   /analytics              → Statistics
 *   /library                → Exercises
 *   /bodyweight             → stays (the body-weight page still works); the shortcut and the
 *                             widget open Measures on Body weight instead
 */
export type OldRouteTarget = '/profile' | '/calendar' | '/stats' | '/exercises';

/** Where "/history" goes. */
export function historyTarget(view: string | string[] | undefined): OldRouteTarget {
  const v = Array.isArray(view) ? view[0] : view;
  return v === 'calendar' ? '/calendar' : '/profile';
}
