/**
 * The ForgeAI member account: "Continue with Google" (tracker #43 A, owner 24 Oct 2026), so a
 * member's workouts can come back on a new phone (#50). Supabase Auth with Google's ID token:
 *
 *   GoogleSignin.signIn()  (@react-native-google-signin/google-signin 16, already in the app for
 *                           the Drive backup; Android Credential flow, no browser)
 *   → supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
 *
 * (Supabase's own guide for Expo / React Native, read 24 Oct 2026.) The ID token's audience is the
 * WEB client id (app.json extra.googleWebClientId, the same one Drive uses); the Android client
 * (the app's Play package id, tracker #57, + the release key's SHA-1) only has to exist in the same Google Cloud
 * project. Until the owner makes them (supabase/README.md "Member accounts"), the id is a
 * placeholder and nothing here shows or runs (`isAccountConfigured`).
 *
 * "Join with your gym code" (the gym's member key, no account) and "Use without an account" are
 * not touched: an account is an extra. Asking Google for sign-in only never asks for Drive: the
 * Drive backup asks for its own permission when the member links it.
 */
import Constants from 'expo-constants';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';

import { getDb, getMeta, setMeta } from '@/db';

import { LAST_USER_KEY, MERGE_PENDING_KEY, NEEDS_SIGN_IN_KEY, ownerDecision, setStoredAccount, type StoredAccount } from './accountMeta';
import { ACCOUNT_WORDS, AccountError, copyFailureWords } from './accountWords';
import { getSupabase } from './client';
import { isAccountBuild, isCloudConfigured } from './config';
import { clearCopyTables } from './copyLocal';
import { forgetDriveConfigure } from './drive';

const webClientId: string = (Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined)?.googleWebClientId ?? '';

/** Shown and usable only when the build has the server and a real Google client id. */
export function isAccountConfigured(): boolean {
  return isAccountBuild();
}

/** The Google answer's ID token and name, whatever shape this google-signin version returns. */
function googleOf(res: unknown): { idToken: string | null; email: string | null; name: string | null } {
  const r = res as { data?: { idToken?: string | null; user?: { email?: string; name?: string | null } }; idToken?: string | null; user?: { email?: string; name?: string | null } } | null;
  const user = r?.data?.user ?? r?.user;
  return { idToken: r?.data?.idToken ?? r?.idToken ?? null, email: user?.email ?? null, name: user?.name ?? null };
}

/**
 * Sign in. Returns the account, or null when the member closed Google's sheet. Every other failure
 * throws an AccountError with words to show (the reason itself only reaches the log).
 */
export async function signInWithGoogle(): Promise<StoredAccount | null> {
  if (!isAccountConfigured()) throw new AccountError(ACCOUNT_WORDS.notInThisVersion, 'no googleWebClientId or Supabase config in this build');
  // Sign-in only (name and email): never Drive's permission. Drive sets its own again when used.
  GoogleSignin.configure({ webClientId, offlineAccess: false });
  forgetDriveConfigure();
  let res: unknown;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    res = await GoogleSignin.signIn();
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new AccountError(ACCOUNT_WORDS.noPlayServices, 'PLAY_SERVICES_NOT_AVAILABLE');
    }
    const code = (e as { code?: unknown })?.code;
    if (code === 'DEVELOPER_ERROR' || code === 10 || code === '10') {
      throw new AccountError(ACCOUNT_WORDS.notInThisVersion, 'DEVELOPER_ERROR: the Android OAuth client (this app’s package id + this build’s SHA-1) is missing in Google Cloud');
    }
    throw new AccountError(ACCOUNT_WORDS.couldNotSignIn, `google sign-in failed: ${String(code ?? '')} ${(e as { message?: string })?.message ?? ''}`);
  }
  if ((res as { type?: string })?.type === 'cancelled') return null;
  const g = googleOf(res);
  if (!g.idToken) throw new AccountError(ACCOUNT_WORDS.notInThisVersion, 'Google returned no ID token: googleWebClientId is not the project’s WEB client id');

  const { data, error } = await getSupabase().auth.signInWithIdToken({ provider: 'google', token: g.idToken });
  if (error || !data.user) {
    const msg = error?.message ?? 'no user';
    // "Provider is not enabled" / "Unacceptable audience": the owner's Supabase step is not done.
    const notReady = /provider|audience|not enabled/i.test(msg);
    throw new AccountError(notReady ? copyFailureWords('not-ready') : ACCOUNT_WORDS.couldNotSignIn, `supabase signInWithIdToken: ${msg}`);
  }
  // Whose copy records are on this phone (kept across a sign-out; gone with an erase)?
  const last = (await getMeta(LAST_USER_KEY)) || null;
  const workouts = await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions');
  const decision = ownerDecision(last, data.user.id, (workouts?.n ?? 0) > 0);
  if (decision === 'refuse') {
    // Another person's workouts are on this phone: never merge them into, or send them to, this account.
    try {
      await getSupabase().auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('[account] could not forget the refused sign-in', e);
    }
    throw new AccountError(ACCOUNT_WORDS.otherPerson, 'a different account than the one whose workouts are on this phone');
  }
  if (decision === 'clear') await clearCopyTables();
  const account: StoredAccount = { userId: data.user.id, email: data.user.email ?? g.email, name: g.name, since: Date.now() };
  // Bring the server copy back before anything on the phone is sent (cleared only by a bring-back that works).
  await setMeta(MERGE_PENDING_KEY, '1');
  await setMeta(LAST_USER_KEY, data.user.id);
  await setStoredAccount(account);
  await setMeta(NEEDS_SIGN_IN_KEY, '');
  return account;
}

/** Is the server sign-in still there (it renews itself while the app is open)? */
export async function hasLiveSignIn(): Promise<boolean> {
  if (!isCloudConfigured()) return false;
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session != null;
  } catch (e) {
    console.warn('[account] could not read the sign-in', e);
    return false;
  }
}

/**
 * Sign out on this phone: the workouts stay; the copy simply stops. Works offline (the local sign-in
 * is forgotten even when the server cannot be told). Google itself is signed out too, unless the
 * Drive backup still uses that Google account.
 *
 * What this phone copied (and what still waits to be sent) is KEPT, with whose it is: signing in
 * again as the same person carries on with the newest edits winning; another person's sign-in
 * empties it first (signInWithGoogle).
 */
export async function signOutAccount(): Promise<void> {
  try {
    if (isCloudConfigured()) await getSupabase().auth.signOut({ scope: 'local' });
  } catch (e) {
    console.warn('[account] server sign-out failed; the phone forgets the sign-in anyway', e);
  }
  await setStoredAccount(null);
  await setMeta(NEEDS_SIGN_IN_KEY, '');
  if ((await getMeta('drive_linked')) !== '1') {
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      console.warn('[account] Google sign-out failed', e);
    }
  }
}

/**
 * Delete the server copy and the account (Google Play's "Delete my account"). The phone's workouts
 * stay. 'kept': the account is also a gym's sign-in (an owner's, a trainer's, an older gym-sync
 * member's), so the server deleted only the copy and kept the sign-in.
 */
export async function deleteAccount(): Promise<'deleted' | 'kept'> {
  const { apiAccountDelete } = await import('./copyApi');
  const r = await apiAccountDelete();
  if (!r.ok) throw new AccountError(copyFailureWords(r.failure), `member_account_delete: ${r.failure}`);
  // The copy is gone on the server: this phone's record of it means nothing now.
  await clearCopyTables();
  await setMeta(LAST_USER_KEY, '');
  await setMeta(MERGE_PENDING_KEY, '');
  await signOutAccount();
  return r.data;
}
