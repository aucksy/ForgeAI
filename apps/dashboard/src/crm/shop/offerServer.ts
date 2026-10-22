/**
 * Has this gym's server had 0025 (the workout offer, group and timed messages)? Asked once per key
 * with owner_offers: PostgREST's PGRST202 ("no such function") means no, and the panel behaves
 * exactly as before (an in-app message goes to every app member; the Workout offer page says it is
 * not switched on yet). Any other answer, or a failure that is not PGRST202 (offline), is not
 * remembered: the next screen asks again.
 */

import { useEffect, useState } from 'react';

import { isNoSuchFunction, type OffersAnswer } from '../logic/workoutOffer';
import * as api from './api';

export type OfferServer = 'unknown' | 'yes' | 'no';

const known = new Map<string, Exclude<OfferServer, 'unknown'>>();

/** For a test or a sign-out: forget what was learned. */
export function forgetOfferServer(): void {
  known.clear();
}

/** The probe: 'yes' with the answer, 'no' on PGRST202; other failures are thrown. */
export async function probeOffers(key: string): Promise<{ server: 'yes'; answer: OffersAnswer } | { server: 'no' }> {
  try {
    const answer = await api.listOffers(key);
    known.set(key, 'yes');
    return { server: 'yes', answer };
  } catch (e) {
    if (isNoSuchFunction(e)) {
      known.set(key, 'no');
      return { server: 'no' };
    }
    throw e;
  }
}

/** What is known for this key now, and asks once when nothing is. */
export function useOfferServer(key: string | null): OfferServer {
  const [state, setState] = useState<OfferServer>(() => (key ? (known.get(key) ?? 'unknown') : 'unknown'));
  useEffect(() => {
    if (!key) return;
    const k = known.get(key);
    if (k) {
      setState(k);
      return;
    }
    let live = true;
    probeOffers(key).then(
      (r) => {
        if (live) setState(r.server);
      },
      (e: unknown) => {
        // Offline or a dead key: stay 'unknown' (old behaviour) and ask again next time.
        console.warn('[ForgeErr] offers: asking the server', e);
      },
    );
    return () => {
      live = false;
    };
  }, [key]);
  return key ? state : 'unknown';
}
