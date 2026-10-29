/**
 * Pause / renew requests from the member app (F150): the calls to the gym server. Thin wrappers over
 * supabase/migrations/0044_plan_requests.sql; every call carries the owner or desk key and the
 * server keeps each gym to its own requests. Rules and words: logic/planRequests.ts.
 *
 * Until 0044 is on the server, the first read answers PGRST202 ("no such function"): the panel then
 * remembers "no requests here" for the life of the page and the requests card stays hidden, with no
 * error shown and one quiet note in the console (the same as member photos, F107). Any other failure
 * (no internet) is not remembered: the next read asks again.
 */

import { isDemoLocked } from '../../lib/demoLock';
import { planRequestRowFrom, planRequestRowsFrom, type PlanRequestRow } from '../logic/planRequests';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

export type PlanRequestServer = 'unknown' | 'yes' | 'no';

let server: PlanRequestServer = 'unknown';

export function planRequestServer(): PlanRequestServer {
  return isDemoLocked() ? 'no' : server;
}

function markNoServer(): void {
  if (server === 'no') return;
  server = 'no';
  console.info('[plan requests] this gym server has no app requests yet (0044 not applied); the requests card stays hidden');
}

/**
 * The gym's requests: pending first, then the ones answered in the last 14 days. 'missing' when the
 * server has not had 0044 (then remembered). Other failures are thrown as they came.
 */
export async function listPlanRequests(key: string): Promise<PlanRequestRow[] | 'missing'> {
  if (planRequestServer() === 'no') return 'missing';
  try {
    const rows = planRequestRowsFrom(await call<unknown>('owner_plan_requests', { p_key: key }));
    server = 'yes';
    return rows;
  } catch (e) {
    if (isNoSuchFunction(e)) {
      markNoServer();
      return 'missing';
    }
    throw e;
  }
}

/**
 * Approve (after the desk's own freeze or sale is saved: `membershipId` is that plan) or decline.
 * The server checks the plan is really there (NOT_DONE otherwise). Throws the server's refusal as-is.
 */
export async function decidePlanRequest(
  key: string,
  requestId: string,
  decision: 'approved' | 'declined',
  membershipId: string | null,
): Promise<PlanRequestRow | null> {
  const raw = await call<unknown>('owner_decide_plan_request', {
    p_key: key,
    p_request: requestId,
    p_decision: decision,
    p_membership: membershipId,
  });
  return planRequestRowFrom(raw);
}

/** Tests only: back to a fresh page. */
export function resetPlanRequestsForTest(): void {
  server = 'unknown';
}
