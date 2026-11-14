/**
 * F147 Bring a friend: the panel's one call to the gym server (supabase/migrations/0056_bring_a_friend.sql).
 * The friends' forms themselves arrive as ordinary enquiries through the usual sync, and the owner's
 * thank-you uses the usual "extra days" on a plan, so the only new call is the Settings card's count.
 *
 * Until 0056 is on the server, the first read answers PGRST202 ("no such function"): the panel then
 * remembers "not here yet" for the life of the page and the Settings card stays hidden, with no error
 * shown (the same as plan requests, F150). Any other failure (no internet) is not remembered.
 */

import { isDemoLocked } from '../../lib/demoLock';
import { demoServer } from '../../lib/demoServerSlot';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

export type FriendServer = 'unknown' | 'yes' | 'no';

export interface FriendSummary {
  /** Members who opened their invite link at least once. */
  links: number;
  /** Friends who left their number. */
  asked: number;
  /** Of those, the ones the gym made members. */
  joined: number;
}

let server: FriendServer = 'unknown';

export function friendServer(): FriendServer {
  return (isDemoLocked() && !demoServer()) ? 'no' : server;
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/** The counts for the Settings card, or 'missing' while the server has no 0056 (then remembered). */
export async function friendSummary(key: string): Promise<FriendSummary | 'missing'> {
  if (friendServer() === 'no') return 'missing';
  try {
    const raw = await call<unknown>('owner_friend_summary', { p_key: key });
    server = 'yes';
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return { links: count(r.links), asked: count(r.asked), joined: count(r.joined) };
  } catch (e) {
    if (isNoSuchFunction(e)) {
      if (server !== 'no') console.info('[bring a friend] this gym server has no friend invites yet (0056 not applied); the card stays hidden');
      server = 'no';
      return 'missing';
    }
    throw e;
  }
}

/** Tests only: back to a fresh page. */
export function resetFriendServerForTest(): void {
  server = 'unknown';
}
