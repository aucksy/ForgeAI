/**
 * The one cloud gym this browser runs — its OWNER KEY and the code members join with.
 *
 * There are no sign-in accounts: `demo_start_gym` hands back a random owner key and
 * the cloud only stores its hash, so this browser holding the key IS the login.
 * Lose it and the gym is unreachable, which is acceptable for a demo gym and is why
 * Settings offers "Start over with a new demo gym" rather than a recovery path.
 *
 * Since 0010 (14 Oct 2026) a person can SIGN IN with their mobile number and a code: then
 * `ownerKey` holds that person's SESSION key (every owner call accepts it), `person` says who is
 * signed in, and `online` is true once the gym's records live in the cloud rather than in this
 * browser.
 */

import type { KeyValueStore } from '../data/local';
import { personFromRow, type Person } from '../auth/signin';

export const CLOUD_GYM_KEY = 'forgeai.cloudGym.v1';

export interface CloudGym {
  gymId: string;
  ownerKey: string;
  joinCode: string;
  name: string;
  /**
   * True when this browser's CRM was filled with the sample members at the same
   * time. Only then may a dead key also wipe the CRM — a real gym that later turned
   * the shop on must never lose its own members because the shop went away.
   */
  demo: boolean;
  /** The records live online (CloudCrmData), not in this browser. */
  online?: boolean;
  /** Who is signed in on this device; absent for an old owner key. */
  person?: Person | null;
}

function store(s?: KeyValueStore): KeyValueStore | null {
  if (s) return s;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readCloudGym(s?: KeyValueStore): CloudGym | null {
  const st = store(s);
  if (!st) return null;
  try {
    const raw = st.getItem(CLOUD_GYM_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CloudGym>;
    if (typeof v.ownerKey !== 'string' || v.ownerKey.length < 16 || typeof v.gymId !== 'string') return null;
    return {
      gymId: v.gymId,
      ownerKey: v.ownerKey,
      joinCode: typeof v.joinCode === 'string' ? v.joinCode : '',
      name: typeof v.name === 'string' ? v.name : '',
      demo: v.demo === true,
      online: v.online === true,
      person: personFromRow(v.person),
    };
  } catch {
    return null;
  }
}

export function writeCloudGym(gym: CloudGym, s?: KeyValueStore): void {
  store(s)?.setItem(CLOUD_GYM_KEY, JSON.stringify(gym));
}

export function clearCloudGym(s?: KeyValueStore): void {
  store(s)?.removeItem(CLOUD_GYM_KEY);
}
