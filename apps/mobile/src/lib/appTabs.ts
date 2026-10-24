/**
 * Release A, "make room" (docs/ux/MEMBER-APP-MAP.md §3.1 and A1/A5, owner yes 24 Oct 2026): the app
 * has 4 tabs, ALWAYS the same 4, in this order: Workout (opens first) · Progress · Gym · Profile.
 *
 *  - The Gym tab is there with or without a gym, and is always called "Gym". Without a gym it is one
 *    "Join your gym" screen; the shop, when the gym has one, is a part of it. Its address stays
 *    `/shop` so every older link, notification and What's new button still opens it.
 *  - Progress holds the charts, exercises, records, body numbers and reports that sat behind the
 *    Profile's tiles.
 *  - Coach stays in the navigator (old links) but is never shown as a tab.
 * PURE.
 */
export const APP_TABS = [
  { route: 'workout', title: 'Workout' },
  { route: 'progress', title: 'Progress' },
  { route: 'shop', title: 'Gym' },
  { route: 'profile', title: 'Profile' },
] as const;

export type AppTabRoute = (typeof APP_TABS)[number]['route'];

/** Routes in the tab navigator that never show as a tab (still reachable by link). */
export const HIDDEN_TAB_ROUTES: readonly string[] = ['coach'];

/** True for the 4 tabs the bar shows. PURE. */
export function isShownTab(route: string): route is AppTabRoute {
  return APP_TABS.some((t) => t.route === route);
}

/** The bar's label for a route ("Gym" for the shop route), or null for a hidden one. PURE. */
export function tabTitle(route: string): string | null {
  return APP_TABS.find((t) => t.route === route)?.title ?? null;
}
