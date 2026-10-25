/**
 * The gym's calls for its opening hours (R-124): thin wrappers over the RPCs in
 * supabase/migrations/0036_gym_timings.sql. Every call carries the owner or desk key; the server
 * checks it, keeps each gym (each branch) to its own hours and lets only the owner save. A server
 * without 0036 answers PGRST202 (`isNoSuchFunction`): the screen then says it is not switched on yet.
 */

import type { GymHours } from '@forgeai/theme';

import { timingsFromAnswer, type TimingsAnswer } from '../logic/gymTimings';
import { call } from './api';

export async function getTimings(key: string): Promise<TimingsAnswer> {
  return timingsFromAnswer(await call<unknown>('owner_gym_timings', { p_key: key }));
}

/** Save (or, with null, remove) the hours. Throws OWNER_ONLY / INVALID / SUSPENDED. */
export async function saveTimings(key: string, hours: GymHours | null): Promise<TimingsAnswer> {
  return timingsFromAnswer(await call<unknown>('owner_save_gym_timings', { p_key: key, p_hours: hours }));
}
