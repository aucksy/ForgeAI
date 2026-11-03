/**
 * F151 "Workout of the day" and F148 "form videos": the calls to the gym server
 * (supabase/migrations/0051_gym_videos_and_wod.sql). Every call carries the owner or desk key; the server keeps
 * each gym to its own days.
 *
 * Until 0051 is on the server, the first read answers PGRST202 ("no such function"): this page then remembers
 * "not here" for the life of the page, and the workout-of-the-day card and the video link box stay hidden, with
 * no error shown and one quiet note in the console (the same as busy machines, 0049). Any other failure is not
 * remembered.
 */

import { isDemoLocked } from '../../lib/demoLock';
import { wodFromRow, wodsFromRow, type GymWod, type GymWodsAnswer, type WodPayload } from '../logic/gymWod';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

export type WodServer = 'unknown' | 'yes' | 'no';

let server: WodServer = 'unknown';

export function wodServer(): WodServer {
  return isDemoLocked() ? 'no' : server;
}

function markNoServer(): void {
  if (server === 'no') return;
  server = 'no';
  console.info('[workout of the day] this gym server has no workout of the day or video links yet (0051 not applied); both stay hidden');
}

/** Today's and the coming days' workouts. 'missing' when the server has not had 0051. */
export async function getWods(key: string): Promise<GymWodsAnswer | 'missing'> {
  if (wodServer() === 'no') return 'missing';
  try {
    const a = wodsFromRow(await call<unknown>('owner_gym_wods', { p_key: key }));
    if (!a) throw new Error('UNKNOWN');
    server = 'yes';
    return a;
  } catch (e) {
    if (isNoSuchFunction(e)) {
      markNoServer();
      return 'missing';
    }
    throw e;
  }
}

/** Set (or replace) one day's workout. Throws BAD_DATE / INVALID / SUSPENDED as they came. */
export async function saveWod(key: string, payload: WodPayload): Promise<GymWod> {
  const w = wodFromRow(await call<unknown>('owner_save_gym_wod', { p_key: key, p_wod: payload }));
  if (!w) throw new Error('UNKNOWN');
  return w;
}

/** Take one day's workout off. */
export async function clearWod(key: string, day: string): Promise<void> {
  await call<boolean>('owner_clear_gym_wod', { p_key: key, p_day: day });
}

/** Tests only: back to a fresh page. */
export function resetWodForTest(): void {
  server = 'unknown';
}
