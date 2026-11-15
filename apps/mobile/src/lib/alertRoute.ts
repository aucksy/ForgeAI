/**
 * R-583 (owner, 15 Nov 2026: "Tapping that notification did not directly take me to that conversation"): a tapped
 * notification opens the page its `route` names. Before, the tap handler (tracker/components/WorkoutPresenceHost.tsx)
 * knew only 4 routes, so a gym reply (/shop/message), the MettleUp team's reply (/settings/feedback), an order
 * (/shop/orders), a diet plan (/shop/diet) and new measures (/measures) only opened the app.
 * PURE.
 */

/**
 * The in-app path a tapped notification may open, or null. Only a plain app path ("/shop/message"): lower-case
 * letters, digits, "-" and "_" between slashes, at most 60 characters, never a link to another app or site.
 */
export function alertTapPath(route: unknown): string | null {
  if (typeof route !== 'string' || route.length > 60) return null;
  return /^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/.test(route) ? route : null;
}
