/**
 * Fresh eyes (14 Nov 2026): Today stacked three set-up cards at once (Get started, "Get alerts on this device" and
 * "Put the admin app on your phone"), pushing the gym's own news down. Now one shows at a time, in this order: the
 * next one comes when the one before is done or closed. PURE: ui/SetupSlot.tsx shares the turn on Today.
 * R-526 (14 Nov 2026): Get started left Today for its own page (Set up your gym), so two cards take turns now.
 */

export type SetupCardId = 'alerts' | 'install';

/** Alerts first (one tap), then the admin app on the phone. */
export const SETUP_ORDER: readonly SetupCardId[] = ['alerts', 'install'];

/** The one card whose turn it is: the first in SETUP_ORDER that wants to show; null when none does. PURE. */
export function setupTurn(wants: Readonly<Partial<Record<SetupCardId, boolean>>>): SetupCardId | null {
  return SETUP_ORDER.find((id) => wants[id] === true) ?? null;
}
