/**
 * R-506/R-510: the gym's alerts from the gym server (supabase/migrations/0075_gym_alerts.sql owner_alerts). Every
 * call carries the owner's, desk's or trainer's key; the server shows each person only what they may see.
 *
 * Until 0075 is on the server, the first call answers PGRST202 ("no such function"): this page then remembers
 * "not here" for the life of the page, and Needs you keeps working from the lists it reads itself (as
 * questionsApi.ts does for 0053). Any other failure is not remembered. The demo gym never calls.
 */

import { isDemoLocked } from '../../lib/demoLock';
import { gymAlertsFrom, type GymAlert } from '../logic/gymAlerts';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

let missing = false;

/** True once the server said it has no 0075 (or in the demo gym). */
export function alertsMissing(): boolean {
  return missing || isDemoLocked();
}

/** The alerts of the last 3 days this key may see, newest first. 'missing': no 0075. */
export async function getAlerts(key: string): Promise<GymAlert[] | 'missing'> {
  if (alertsMissing()) return 'missing';
  try {
    const list = gymAlertsFrom(await call<unknown>('owner_alerts', { p_key: key }));
    if (!list) throw new Error('unreadable answer');
    return list;
  } catch (e) {
    if (isNoSuchFunction(e)) {
      if (!missing) console.info('[alerts] this gym server has no alerts list yet (0075 not applied)');
      missing = true;
      return 'missing';
    }
    throw e;
  }
}
