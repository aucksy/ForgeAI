/**
 * Release A, "make room" (docs/ux/MEMBER-APP-MAP.md §3.1 and A1/A5, owner yes 24 Oct 2026), then F199
 * (owner R-403, 8 Nov 2026: "Let's remove the progress section, put it somewhere inside the profile"): the
 * app has 3 tabs, ALWAYS the same 3, in this order: Workout (opens first) · Gym · Profile.
 *
 *  - The Gym tab is there with or without a gym, and is always called "Gym". Without a gym it is one
 *    "Join your gym" screen; the shop, when the gym has one, is a part of it. Its address stays
 *    `/shop` so every older link, notification and What's new button still opens it.
 *  - Profile holds the overview chart, today's goal and "Your progress" (Charts, Exercises, Records,
 *    Body, Reports), which were the Progress tab until F199.
 *  - Progress and Coach stay in the navigator (old links, notifications, What's new buttons) but are
 *    never shown as a tab: `/progress` redirects to Profile, `/coach` to Workout.
 * PURE.
 */
export const APP_TABS = [
  { route: 'workout', title: 'Workout' },
  { route: 'shop', title: 'Gym' },
  { route: 'profile', title: 'Profile' },
] as const;

export type AppTabRoute = (typeof APP_TABS)[number]['route'];

/** Routes in the tab navigator that never show as a tab (still reachable by link; they redirect). */
export const HIDDEN_TAB_ROUTES: readonly string[] = ['progress', 'coach'];

/** True for the 3 tabs the bar shows. PURE. */
export function isShownTab(route: string): route is AppTabRoute {
  return APP_TABS.some((t) => t.route === route);
}

/** The bar's label for a route ("Gym" for the shop route), or null for a hidden one. PURE. */
export function tabTitle(route: string): string | null {
  return APP_TABS.find((t) => t.route === route)?.title ?? null;
}
