/**
 * "Numbers to confirm" (0048): the calls to the gym server. Thin wrappers over
 * supabase/migrations/0048_security_fixes.sql (owner_phone_links, owner_decide_phone_link); every call
 * carries the owner or desk key and the server keeps each gym to its own numbers. Rules and words:
 * logic/phoneLinks.ts.
 *
 * Until 0048 is on the server, the first read answers PGRST202 ("no such function"): the panel then
 * remembers "nothing here" for the life of the page and the card stays hidden, with no error shown
 * and one quiet note in the console (as planRequestApi.ts does for 0044). Any other failure (no
 * internet) is not remembered: the next read asks again.
 */

import { isDemoLocked } from '../../lib/demoLock';
import { phoneLinkRowsFrom, type PhoneLinkRow } from '../logic/phoneLinks';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

export type PhoneLinkServer = 'unknown' | 'yes' | 'no';

let server: PhoneLinkServer = 'unknown';

export function phoneLinkServer(): PhoneLinkServer {
  return isDemoLocked() ? 'no' : server;
}

function markNoServer(): void {
  if (server === 'no') return;
  server = 'no';
  console.info('[phone links] this gym server has no number checks yet (0048 not applied); the card stays hidden');
}

/** The gym's typed numbers (pending first). 'missing' when the server has not had 0048 (then remembered). */
export async function listPhoneLinks(key: string): Promise<PhoneLinkRow[] | 'missing'> {
  if (phoneLinkServer() === 'no') return 'missing';
  try {
    const rows = phoneLinkRowsFrom(await call<unknown>('owner_phone_links', { p_key: key }));
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

/** Yes (approved: the app member gets this number) or No. Throws the server's refusal as-is. */
export async function decidePhoneLink(key: string, linkId: string, decision: 'approved' | 'declined'): Promise<void> {
  await call<unknown>('owner_decide_phone_link', { p_key: key, p_link: linkId, p_decision: decision });
}

/** Tests only: back to a fresh page. */
export function resetPhoneLinksForTest(): void {
  server = 'unknown';
}
