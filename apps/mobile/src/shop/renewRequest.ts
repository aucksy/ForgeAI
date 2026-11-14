/**
 * R-505: "Renew my plan" under a locked "Ask a trainer" goes where renewing already goes in the app: the Gym tab's
 * "My gym" part, scrolled to the top, where the "My membership" card's own "Renew my plan" opens its plan list
 * (PlanRequestPanel, F150). When the gym offers no plan to pick in the app, the card's "Renew at the desk to keep
 * training." is what shows there. A request older than RENEW_REQUEST_MS is dropped, so a later visit never opens
 * the plan list by surprise.
 */
import { create } from 'zustand';

import { requestGymSection } from './gymSectionRequest';

export const RENEW_REQUEST_MS = 15_000;

type RenewRequest = { at: number | null };

export const useRenewRequest = create<RenewRequest>(() => ({ at: null }));

/** Ask the Gym tab to show "My gym" from the top and open the plan list. */
export function requestRenew(now: number = Date.now()): void {
  useRenewRequest.setState({ at: now });
  requestGymSection('gym');
}

/** Take the waiting request (once): true when there was one, made in the last RENEW_REQUEST_MS. */
export function takeRenewRequest(now: number = Date.now()): boolean {
  const at = useRenewRequest.getState().at;
  if (at == null) return false;
  useRenewRequest.setState({ at: null });
  return now - at >= 0 && now - at <= RENEW_REQUEST_MS;
}
