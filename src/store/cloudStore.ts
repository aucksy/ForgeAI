import { create } from 'zustand';

import { startConnectivityWatch, stopConnectivityWatch } from '@/cloud/connectivity';
import {
  authenticate,
  deleteCloudData,
  getIdentity,
  hasCloudSession,
  joinGymByCode,
  reauthenticate,
  restoreCloudSession,
  signOutCloud,
  type CloudIdentity,
} from '@/cloud/session';
import { maybeSync } from '@/cloud/sync';

export interface ConnectInput {
  email: string;
  password: string;
  code: string;
  displayName: string;
  createAccount: boolean;
}

export interface CloudState {
  ready: boolean;
  linked: boolean;
  /** Linked in meta but the Supabase session is gone (expiry / reinstall) → re-auth. */
  needsReauth: boolean;
  identity: CloudIdentity | null;
  busy: boolean;
  /** Restore the linked state at launch (gated — no-op with no account). */
  init: () => Promise<void>;
  /** Sign in/up + join a gym. Throws a user-safe Error on failure. */
  connect: (input: ConnectInput) => Promise<void>;
  /** Re-sign-in for an already-linked identity (same account). Throws on failure. */
  reauth: (email: string, password: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** DPDP: erase the cloud replica + disconnect. Throws if the server delete fails. */
  deleteData: () => Promise<void>;
}

export const useCloud = create<CloudState>()((set) => ({
  ready: false,
  linked: false,
  needsReauth: false,
  identity: null,
  busy: false,

  init: async () => {
    await restoreCloudSession();
    const identity = await getIdentity();
    // Start the network reachability watcher ONLY when a gym is linked, so the
    // offline demo never engages NetInfo (its reachability probe = a network call).
    const needsReauth = identity !== null && !(await hasCloudSession());
    if (identity !== null) startConnectivityWatch();
    set({ ready: true, linked: identity !== null, identity, needsReauth });
  },

  connect: async ({ email, password, code, displayName, createAccount }) => {
    set({ busy: true });
    try {
      await authenticate(email.trim(), password, createAccount);
      let identity: CloudIdentity;
      try {
        identity = await joinGymByCode(code, displayName);
      } catch (e) {
        // Auth succeeded but the join failed — don't leave an orphaned session.
        await signOutCloud().catch(() => {});
        throw e;
      }
      startConnectivityWatch();
      set({ linked: true, identity, needsReauth: false });
      void maybeSync(); // push the first summary immediately
    } finally {
      set({ busy: false });
    }
  },

  reauth: async (email, password) => {
    set({ busy: true });
    try {
      await reauthenticate(email, password);
      startConnectivityWatch();
      set({ needsReauth: false });
      void maybeSync();
    } finally {
      set({ busy: false });
    }
  },

  disconnect: async () => {
    set({ busy: true });
    try {
      await signOutCloud();
      stopConnectivityWatch();
      set({ linked: false, identity: null });
    } finally {
      set({ busy: false });
    }
  },

  deleteData: async () => {
    set({ busy: true });
    try {
      await deleteCloudData();
      stopConnectivityWatch();
      set({ linked: false, identity: null });
    } finally {
      set({ busy: false });
    }
  },
}));
