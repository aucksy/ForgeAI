/**
 * Which ForgeAI member account this phone is signed in to (tracker #50/#43), kept in the `meta`
 * table. Kept apart from account.ts (Google's native sign-in) so the copy and its tests can ask
 * "is anyone signed in?" without loading it.
 *
 * In `meta` on purpose: "Erase all data" and "Load demo data" wipe `meta`, so the copy stops at the
 * same moment the workouts go, and an empty phone can never send deletes for them. A Drive restore
 * leaves `meta` alone (snapshot.ts), so the account stays signed in across it.
 */
import { getMeta, setMeta } from '@/db';

export const ACCOUNT_KEY = 'member_account';
/** When the copy last reached the server (ms), for Settings. */
export const LAST_COPY_KEY = 'cloud_copy_last_at';
/** The server said this phone is not signed in any more: '1' until the member signs in again. */
export const NEEDS_SIGN_IN_KEY = 'cloud_copy_needs_sign_in';
/** The server's room for this member is full: '1' until a write goes through again. */
export const COPY_FULL_KEY = 'cloud_copy_full';
/**
 * The account whose copy this phone's copy records describe. Kept on sign-out, so signing in again
 * as the same person keeps them; another person's sign-in empties them first. Gone with an erase.
 */
export const LAST_USER_KEY = 'cloud_copy_owner';
/**
 * '1' = bring the server copy back before the next scan (set at sign-in, after a restore replaced the
 * data, when the scan's safety rule fired, or when the server held newer edits). Cleared only by a
 * bring-back that worked: until then nothing on the phone is sent as "new".
 */
export const MERGE_PENDING_KEY = 'cloud_copy_merge_pending';

export interface StoredAccount {
  userId: string;
  email: string | null;
  name: string | null;
  /** When this phone signed in (ms). */
  since: number;
}

/** The account in a `meta` value, or null when there is none or it is unreadable. PURE. */
export function parseStoredAccount(raw: string | null | undefined): StoredAccount | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredAccount> | null;
    if (!v || typeof v.userId !== 'string' || !v.userId) return null;
    return {
      userId: v.userId,
      email: typeof v.email === 'string' ? v.email : null,
      name: typeof v.name === 'string' ? v.name : null,
      since: typeof v.since === 'number' ? v.since : 0,
    };
  } catch {
    // quiet: a damaged value reads as "not signed in"; signing in again writes a good one
    return null;
  }
}

/**
 * At a sign-in: what to do with the copy records already on this phone. `last` = whose they are
 * (null = unknown: never signed in, or erased). The same person: keep them (the newest edits keep
 * winning). Another person while this phone holds workouts: refuse (their workouts must never go to
 * this account). Otherwise: empty them first. PURE.
 */
export function ownerDecision(last: string | null, next: string, phoneHasWorkouts: boolean): 'keep' | 'clear' | 'refuse' {
  if (last === next) return 'keep';
  if (last && phoneHasWorkouts) return 'refuse';
  return 'clear';
}

export async function getStoredAccount(): Promise<StoredAccount | null> {
  return parseStoredAccount(await getMeta(ACCOUNT_KEY));
}

export async function setStoredAccount(a: StoredAccount | null): Promise<void> {
  await setMeta(ACCOUNT_KEY, a ? JSON.stringify(a) : '');
}
