/**
 * Who is signed in on this device, for the whole panel (14 Oct 2026; Gym Panel step 1).
 *
 * The device keeps ONE key (in `forgeai.cloudGym.v1`): an old owner key, or since 0010 a person's
 * session key. When the key changes — sign in, sign out, start a gym online — CrmApp remounts the
 * whole panel on the new key, so no screen ever shows one gym's records under another gym's key.
 *
 * Going online sets the browser's own copy of the gym ASIDE (kept under a dated key, never
 * deleted), so signing out later lands on the welcome screen instead of resurrecting old local
 * records next to nothing.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { STORAGE_KEY } from '../data/local';
import { CLOUD_GYM_KEY, clearCloudGym, readCloudGym, writeCloudGym, type CloudGym } from '../shop/cloudGym';
import * as authApi from './api';
import type { SignedIn } from './signin';

interface AuthContextValue {
  /** This device's cloud gym and key, or null for a browser-only gym. */
  session: CloudGym | null;
  /** A one-off message for the welcome screen (e.g. "you were signed out"). */
  notice: string | null;
  /** Keep a sign-in on this device. `online` false keeps the records in this browser for now. */
  adopt: (s: SignedIn, opts: { online: boolean; demo?: boolean }) => void;
  /** Sign this device out and forget its key. */
  signOut: () => Promise<void>;
  /** The key stopped working (removed, or signed out from another device). */
  lost: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Move this browser's own copy of the gym aside, if it holds anything. Never deletes it. */
export function setAsideLocalGym(store: Storage | null = safeStorage()): void {
  if (!store) return;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw === null) return;
    if (hasRecords(raw)) store.setItem(`${STORAGE_KEY}-before-online-${Date.now()}`, raw);
    store.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: nothing to set aside.
  }
}

function hasRecords(raw: string): boolean {
  try {
    const s = (JSON.parse(raw) as { snapshot?: Record<string, unknown[]> }).snapshot ?? {};
    return ['members', 'plans', 'payments', 'visits'].some((k) => Array.isArray(s[k]) && s[k].length > 0);
  } catch {
    return true; // unreadable: keep it, someone may want it
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CloudGym | null>(() => readCloudGym());
  const [notice, setNotice] = useState<string | null>(null);

  // Another tab signed in, out, or put the records online: this tab follows at once instead of
  // showing (and saving into) a gym that is no longer this device's.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CLOUD_GYM_KEY || e.key === null) window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const adopt = useCallback((s: SignedIn, opts: { online: boolean; demo?: boolean }) => {
    const gym: CloudGym = {
      gymId: s.gymId,
      ownerKey: s.sessionKey,
      joinCode: s.joinCode,
      name: s.name,
      demo: opts.demo === true,
      online: opts.online,
      person: s.person,
    };
    if (opts.online) setAsideLocalGym();
    writeCloudGym(gym);
    setNotice(null);
    setSession(gym);
  }, []);

  const signOut = useCallback(async () => {
    const key = readCloudGym()?.ownerKey;
    if (key) await authApi.signOut(key);
    clearCloudGym();
    setNotice('You are signed out of this device.');
    setSession(null);
  }, []);

  const lost = useCallback(() => {
    clearCloudGym();
    setNotice('You were signed out of this gym. Ask your gym owner for a new sign-in code.');
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, notice, adopt, signOut, lost }), [session, notice, adopt, signOut, lost]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
