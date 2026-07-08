import { getSupabase } from '@/cloud/client';
import { CONSENT_VERSION, isCloudConfigured } from '@/cloud/config';
import { getDb, getMeta, setMeta } from '@/db';

/**
 * Cloud identity + auth. Identity lives in the SQLite `meta` table (NOT on domain
 * tables); the Supabase auth session lives in AsyncStorage via the client. Beta
 * uses Supabase Auth (email + password) for members — free within 50k MAU.
 */

const IDENTITY_KEY = 'cloud_identity';

export interface CloudIdentity {
  memberId: string;
  gymId: string;
  gymName: string;
  displayName: string;
  consentVersion: string;
}

interface GymRow {
  gym_id: string;
  name: string;
}

export async function getIdentity(): Promise<CloudIdentity | null> {
  const raw = await getMeta(IDENTITY_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as CloudIdentity;
    return v?.gymId ? v : null;
  } catch {
    return null;
  }
}

async function setIdentity(id: CloudIdentity | null): Promise<void> {
  await setMeta(IDENTITY_KEY, id ? JSON.stringify(id) : '');
}

/**
 * THE OFFLINE FIREWALL. Cloud work runs ONLY when the build is configured AND a
 * gym is linked. With no account this is false everywhere → zero network, the
 * client is never constructed, the offline demo is untouched.
 */
export async function isCloudActive(): Promise<boolean> {
  if (!isCloudConfigured()) return false;
  return (await getIdentity()) !== null;
}

/** On launch: if configured + linked, let supabase-js restore its stored session. */
export async function restoreCloudSession(): Promise<void> {
  if (!isCloudConfigured()) return;
  if ((await getIdentity()) === null) return; // not linked → construct nothing
  try {
    await getSupabase().auth.getSession();
  } catch {
    // offline / transient — the outbox drains later
  }
}

/** True only when linked AND holding a live Supabase session (else needs re-auth). */
export async function hasCloudSession(): Promise<boolean> {
  if (!isCloudConfigured()) return false;
  if ((await getIdentity()) === null) return false;
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session !== null;
  } catch {
    return false;
  }
}

/** Sign in or create the member account. Returns the authenticated user id. */
export async function authenticate(
  email: string,
  password: string,
  createAccount: boolean,
): Promise<string> {
  const sb = getSupabase();
  if (createAccount) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw new Error(friendlyAuthError(error.message));
    if (!data.session) {
      // Email confirmation is ON — beta projects should turn it OFF (see supabase/README).
      throw new Error('Check your email to confirm your account, then sign in.');
    }
    return data.user?.id ?? '';
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyAuthError(error.message));
  return data.user?.id ?? '';
}

/** Join a gym by its code (Postgres RPC), then persist identity locally. */
export async function joinGymByCode(
  code: string,
  displayName: string,
): Promise<CloudIdentity> {
  const sb = getSupabase();
  const { data: userRes } = await sb.auth.getUser();
  const memberId = userRes.user?.id;
  if (!memberId) throw new Error('Not signed in.');

  const { data, error } = await sb.rpc('join_gym_by_code', { code: code.trim() });
  if (error) {
    const m = error.message;
    throw new Error(
      m.includes('INVALID_CODE')
        ? 'That gym code is not valid — check with your gym.'
        : m.includes('ALREADY_STAFF')
          ? 'This account is a gym owner/trainer — use the owner dashboard, not the member app.'
          : 'Could not join the gym — please try again.',
    );
  }
  const gym = (Array.isArray(data) ? data[0] : data) as GymRow | null;
  if (!gym?.gym_id) throw new Error('That gym code is not valid — check with your gym.');

  const identity: CloudIdentity = {
    memberId,
    gymId: gym.gym_id,
    gymName: gym.name,
    displayName: displayName.trim() || 'Member',
    consentVersion: CONSENT_VERSION,
  };
  await setIdentity(identity);
  return identity;
}

/** Disconnect: sign out of Supabase, forget the local identity, and CLEAR the
 *  outbox so a leftover pending row can't push under a different re-linked account. */
export async function signOutCloud(): Promise<void> {
  try {
    if (isCloudConfigured()) await getSupabase().auth.signOut();
  } finally {
    await getDb().runAsync('DELETE FROM sync_outbox');
    await setIdentity(null);
  }
}

/**
 * DPDP: erase the cloud replica (RPC) then disconnect. Only disconnects on a
 * CONFIRMED server delete — if offline / the RPC errors, it throws so the UI keeps
 * the linked state and the user can retry (never falsely reports "deleted").
 */
export async function deleteCloudData(): Promise<void> {
  if (!isCloudConfigured()) {
    await signOutCloud();
    return;
  }
  const { error } = await getSupabase().rpc('delete_my_cloud_data');
  if (error) {
    throw new Error('Could not delete your cloud data — connect to the internet and try again.');
  }
  await signOutCloud();
}

/** Re-authenticate an already-linked identity (session expired / reinstall). Must be
 *  the SAME account that owns the local identity, or it's rejected. */
export async function reauthenticate(email: string, password: string): Promise<void> {
  const identity = await getIdentity();
  if (!identity) throw new Error('No gym is linked on this device.');
  const userId = await authenticate(email.trim(), password, false);
  if (userId && userId !== identity.memberId) {
    await getSupabase().auth.signOut();
    throw new Error('That is a different account. Sign in with the account linked to this gym.');
  }
}

function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already registered')) return 'That email already has an account — sign in instead.';
  if (m.includes('invalid login')) return 'Wrong email or password.';
  if (m.includes('password')) return 'Password must be at least 6 characters.';
  return 'Sign-in failed — please try again.';
}
