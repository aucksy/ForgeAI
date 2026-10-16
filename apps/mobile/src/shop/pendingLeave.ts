/**
 * Audit C6-2: Leave and "Erase all data" with no signal. The gym's server keeps the member's
 * mobile number until `member_leave` reaches it (it clears both numbers and stops counting the
 * member in messages). The phone used to forget the key first and try once, so an offline Leave
 * left the number on the server for good. Now the key alone is kept here, under its own name, until
 * the gym confirms; every start of the app (and the hourly check on return) sends it again.
 *
 * Only member keys are kept — no name, number or gym. Erase leaves this one entry on purpose: it is
 * what lets the gym forget the member, and it is removed the moment the gym confirms.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiLeaveQuietly } from './gymApi';

export const LEAVE_PENDING_STORAGE_KEY = 'forgeai-gym-leave-pending';
/** A start-up retry waits at most this long per key (it runs in the background anyway). */
const RETRY_MS = 4000;
/** More than a member could ever leave offline in a row; the oldest goes first past it. */
const MAX_KEPT = 10;

async function readKeys(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(LEAVE_PENDING_STORAGE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string' && k.length > 0) : [];
  } catch (e) {
    console.warn('[ForgeErr] pending leave: could not read the kept keys', e);
    return [];
  }
}

async function writeKeys(keys: readonly string[]): Promise<void> {
  try {
    if (keys.length === 0) await AsyncStorage.removeItem(LEAVE_PENDING_STORAGE_KEY);
    else await AsyncStorage.setItem(LEAVE_PENDING_STORAGE_KEY, JSON.stringify(keys.slice(-MAX_KEPT)));
  } catch (e) {
    console.warn('[ForgeErr] pending leave: could not save the kept keys', e);
  }
}

/** One at a time: a Leave and a start-up retry never read and write the list over each other. */
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

/**
 * Tell the gym this key has left: kept first (so a closed app still retries), sent, and forgotten
 * only once the gym confirms. True when the gym confirmed.
 */
export function leaveOnServer(key: string): Promise<boolean> {
  return oneAtATime(async () => {
    const kept = await readKeys();
    if (!kept.includes(key)) await writeKeys([...kept, key]);
    const told = await apiLeaveQuietly(key);
    if (told) await writeKeys((await readKeys()).filter((k) => k !== key));
    return told;
  });
}

/** Send every kept leave again. Returns how many the gym has still not confirmed. */
export function retryPendingLeaves(): Promise<number> {
  return oneAtATime(async () => {
    const kept = await readKeys();
    if (kept.length === 0) return 0;
    const left: string[] = [];
    for (const key of kept) {
      if (!(await apiLeaveQuietly(key, RETRY_MS))) left.push(key);
    }
    await writeKeys(left);
    return left.length;
  });
}

/** The line on the join card after a Leave the gym did not hear yet. PURE. */
export function leavePendingText(gymName: string): string {
  return `You left ${gymName}'s shop on this phone. The gym couldn't be reached, so it will be told the next time the app is online.`;
}
