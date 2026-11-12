/**
 * F56 MettleUp Plus, the gym owner's switch: the panel's calls to the gym server
 * (supabase/migrations/0070_member_plus_lock.sql). Rules and words: logic/plusLock.ts.
 *
 * Until 0070 is on the server, the first read answers PGRST202 ("no such function"): the panel then remembers
 * "not here yet" for the life of the page and the Settings card stays hidden, with no error shown (the same as
 * Bring a friend). Any other failure (no internet) is not remembered.
 */

import { isDemoLocked } from '../../lib/demoLock';
import { plusLockFrom, type PlusLock } from '../logic/plusLock';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

export type PlusLockServer = 'unknown' | 'yes' | 'no';

let server: PlusLockServer = 'unknown';

export function plusLockServer(): PlusLockServer {
  return isDemoLocked() ? 'no' : server;
}

/** The switch for the Settings card, or 'missing' while the server has no 0070 (then remembered). */
export async function getPlusLock(key: string): Promise<PlusLock | 'missing'> {
  if (plusLockServer() === 'no') return 'missing';
  try {
    const raw = await call<unknown>('owner_plus_lock', { p_key: key });
    server = 'yes';
    return plusLockFrom(raw);
  } catch (e) {
    if (isNoSuchFunction(e)) {
      if (server !== 'no') console.info('[plus lock] this gym server has no Plus switch yet (0070 not applied); the card stays hidden');
      server = 'no';
      return 'missing';
    }
    throw e;
  }
}

/** Save the switch (the owner only; the desk gets OWNER_ONLY). */
export async function savePlusLock(key: string, lockAfterEnd: boolean): Promise<PlusLock> {
  return plusLockFrom(await call<unknown>('owner_save_plus_lock', { p_key: key, p_on: lockAfterEnd }));
}

/** Tests only: back to a fresh page. */
export function resetPlusLockServerForTest(): void {
  server = 'unknown';
}
