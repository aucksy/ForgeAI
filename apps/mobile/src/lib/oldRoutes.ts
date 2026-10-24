/**
 * Redesign R5/R6 and Release A (PLAN §6, MEMBER-APP-MAP §4, "nothing gets lost"): where an old
 * page's link lands now, so links kept by an older widget, shortcut, notification, What's new button
 * or phone test still open something sensible. Each old address keeps a route file that redirects
 * here. PURE.
 *
 *   /history                → the Profile tab (its Workouts feed)
 *   /history?view=calendar  → Calendar
 *   /analytics              → Charts (Progress)
 *   /library                → Exercises (Progress)
 *   /routines               → the Workout tab
 *   /bodyweight             → Body (Progress), on Body weight          (Release A, A13)
 *   /measurements           → Body, on the measure the link named     (A13)
 *   /measurements/log       → Body's add form                          (A13)
 *   /settings/details       → Your profile, the one profile editor    (A9)
 *   /settings/workouts      → Settings, whose Workouts group holds those rows now (A7/A8)
 *   /settings/gym, no gym   → the Gym tab's "Join your gym" screen     (A2)
 */
export type OldRouteTarget = '/profile' | '/calendar' | '/stats' | '/exercises';

/** Where "/history" goes. */
export function historyTarget(view: string | string[] | undefined): OldRouteTarget {
  const v = Array.isArray(view) ? view[0] : view;
  return v === 'calendar' ? '/calendar' : '/profile';
}

/** Every old address that only redirects now, and where it goes (before any query it carries). */
export const MOVED_ROUTES: Readonly<Record<string, string>> = {
  '/analytics': '/stats',
  '/library': '/exercises',
  '/routines': '/workout',
  '/bodyweight': '/measures',
  '/measurements': '/measures',
  '/measurements/log': '/measures/add',
  '/settings/details': '/edit-profile',
  '/settings/workouts': '/settings',
};

/** The one value of a link's `kind` (a measure: "bodyweight", "waist"…), or undefined. PURE. */
export function firstParam(v: string | string[] | undefined): string | undefined {
  const one = Array.isArray(v) ? v[0] : v;
  return one && /^[a-z_]{1,32}$/.test(one) ? one : undefined;
}

/**
 * Where an old body page's link lands: Body (or Body's add form) on the measure it named. The old
 * Body weight page always meant body weight. PURE.
 */
export function bodyTarget(
  old: '/bodyweight' | '/measurements' | '/measurements/log',
  kind: string | string[] | undefined,
): { pathname: '/measures' | '/measures/add'; params: { kind?: string } } {
  const k = old === '/bodyweight' ? 'bodyweight' : firstParam(kind);
  const pathname = old === '/measurements/log' ? '/measures/add' : '/measures';
  return { pathname, params: k ? { kind: k } : {} };
}
