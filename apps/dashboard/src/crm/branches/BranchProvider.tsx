/**
 * Branches for the signed-in person (tracker #41, 24 Oct 2026). Sits above the panel, so it lives
 * on while the panel remounts for another branch.
 *
 * - Reads the branch list (owner_branches) for an online, signed-in session. A browser-only gym, an
 *   old owner key, or a server without 0031: the gym is its own only branch, nothing else changes.
 * - Keeps one key per branch on this device (logic.ts BRANCH_KEYS), so switching does not make a
 *   new sign-in each time. A key that stopped working is replaced through owner_open_branch.
 * - `switchTo` makes another branch the open one: the device's key becomes that branch's key and
 *   the whole panel remounts on it (every screen is then that branch's).
 * - `dataFor` opens ANOTHER branch's records without switching (All branches page, import).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '../auth/AuthProvider';
import * as authApi from '../auth/api';
import { authErrorCode, authErrorWords, type SignedIn } from '../auth/signin';
import type { CrmData } from '../data/adapter';
import { CloudCrmData } from '../data/cloud';
import type { KeyValueStore } from '../data/local';
import * as branchApi from './api';
import { BranchContext, singleBranch, type BranchContextValue } from './context';
import { branchErrorWords, readBranchKeys, writeBranchKeys, type BranchList } from './logic';

export interface BranchActions {
  /** The list as the server last said, or null while it loads / for a gym with no branches. */
  list: BranchList | null;
  /** The server has branches (0031). False on an older server: "Add a branch" says it is coming. */
  serverReady: boolean;
  /** Make another branch the open one (the panel remounts on it). Rejects with plain words. */
  switchTo: (gymId: string) => Promise<void>;
  /** A new branch; resolves to it. The open branch stays open until `switchTo`. */
  addBranch: (name: string, copyPlans: boolean) => Promise<{ gymId: string; name: string; receiptPrefix: string | null; plansCopied: number }>;
  renameGroup: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** The open branch's key (desk calls about members of other branches). */
  currentKey: string | null;
}

const BranchActionsContext = createContext<BranchActions | null>(null);

const NO_ACTIONS: BranchActions = {
  list: null,
  serverReady: false,
  switchTo: () => Promise.reject(new Error('This gym has no other branches.')),
  addBranch: () => Promise.reject(new Error('Put your gym online first. Then you can add a branch.')),
  renameGroup: () => Promise.reject(new Error('Put your gym online first.')),
  refresh: () => Promise.resolve(),
  currentKey: null,
};

export function useBranchActions(): BranchActions {
  return useContext(BranchActionsContext) ?? NO_ACTIONS;
}

function safeStore(): KeyValueStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (e) {
    console.warn('[ForgeErr] storage blocked', e);
    return null;
  }
}

/** Plain words for a branch call that failed. */
export function branchFailWords(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e ? String((e as { message?: unknown }).message ?? '') : String(e ?? '');
  // TOO_MANY_LOOKUPS before TOO_MANY: the shorter word is inside the longer one.
  for (const code of ['NAME_TAKEN', 'STAFF_ELSEWHERE', 'NOT_ALLOWED', 'TOO_MANY_LOOKUPS', 'TOO_MANY']) {
    if (new RegExp(`\\b${code}\\b`).test(msg)) return branchErrorWords(code) ?? authErrorWords(e);
  }
  if (branchApi.isMissingFunction(e)) return 'Branches are not switched on for your gym yet. Message MettleUp on WhatsApp.';
  return authErrorWords(e);
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const { session, adopt } = useAuth();
  const key = session?.online && session.person ? session.ownerKey : null;
  const phone = session?.person?.phone ?? '';
  const isOwner = session?.person?.role === 'owner';
  const [list, setList] = useState<BranchList | null>(null);
  const [serverReady, setServerReady] = useState(false);
  /** Other branches' records opened this visit, by gym id. */
  const opened = useRef(new Map<string, CrmData>());

  // This device's key for the open branch is always in the keyring.
  useEffect(() => {
    if (!key || !session || !isOwner) return;
    const store = safeStore();
    const keys = readBranchKeys(store, phone);
    if (keys[session.gymId] !== key) writeBranchKeys(store, phone, { ...keys, [session.gymId]: key });
  }, [key, session, phone, isOwner]);

  const load = useCallback(async () => {
    if (!key || !session) {
      setList(null);
      setServerReady(false);
      return;
    }
    try {
      const l = await branchApi.listBranches(key, { gymId: session.gymId, name: session.name, joinCode: session.joinCode });
      setList(l);
      setServerReady(true);
    } catch (e) {
      if (branchApi.isMissingFunction(e)) {
        setServerReady(false);
        setList(null);
        return;
      }
      // Offline: keep what we had; the panel still works on the open branch.
      console.warn('[ForgeErr] owner_branches', e);
    }
  }, [key, session]);

  useEffect(() => {
    opened.current = new Map();
    void load();
  }, [load]);

  /** A live key for `gymId` on this device: the kept one when it still works, else a new one. */
  const keyFor = useCallback(
    async (gymId: string): Promise<{ key: string; signed: SignedIn | null }> => {
      if (!key || !session) throw new Error('Sign in first.');
      if (gymId === session.gymId) return { key, signed: null };
      const store = safeStore();
      const keys = readBranchKeys(store, phone);
      const kept = keys[gymId];
      if (kept) {
        try {
          const me = await authApi.whoAmI(kept);
          if (me.person) {
            return { key: kept, signed: { gymId, name: me.name, joinCode: me.joinCode, sessionKey: kept, person: me.person } };
          }
        } catch (e) {
          if (authErrorCode(e) !== 'BAD_KEY') throw new Error(branchFailWords(e));
          // quiet: that branch's key on this device was signed out; a new one is made below.
        }
      }
      try {
        const signed = await branchApi.openBranch(key, gymId);
        writeBranchKeys(store, phone, { ...readBranchKeys(store, phone), [gymId]: signed.sessionKey });
        return { key: signed.sessionKey, signed };
      } catch (e) {
        console.warn('[ForgeErr] owner_open_branch', e);
        throw new Error(branchFailWords(e));
      }
    },
    [key, session, phone],
  );

  const switchTo = useCallback(
    async (gymId: string) => {
      if (!session || gymId === session.gymId) return;
      const { signed } = await keyFor(gymId);
      if (!signed) return;
      adopt(signed, { online: true });
    },
    [keyFor, adopt, session],
  );

  const dataFor = useCallback(
    async (gymId: string): Promise<CrmData> => {
      const have = opened.current.get(gymId);
      if (have) return have;
      if (!isOwner) throw new Error('Only an owner can open another branch.');
      const { key: k } = await keyFor(gymId);
      const data = new CloudCrmData(k, authApi.cloudApi, {
        role: 'owner',
        // Never signs this device out: only this branch's key is forgotten; the next open makes a new one.
        onSignedOut: () => {
          opened.current.delete(gymId);
          const store = safeStore();
          const keys = readBranchKeys(store, phone);
          delete keys[gymId];
          writeBranchKeys(store, phone, keys);
        },
      });
      try {
        await data.load();
      } catch (e) {
        console.warn('[ForgeErr] branch load', gymId, e);
        throw new Error(`That branch could not be opened. ${branchFailWords(e)}`);
      }
      opened.current.set(gymId, data);
      return data;
    },
    [keyFor, isOwner, phone],
  );

  const addBranch = useCallback(
    async (name: string, copyPlans: boolean) => {
      if (!key || !session) throw new Error('Put your gym online first. Then you can add a branch.');
      try {
        const r = await branchApi.addBranch(key, name, copyPlans);
        const store = safeStore();
        writeBranchKeys(store, phone, { ...readBranchKeys(store, phone), [r.gymId]: r.sessionKey });
        await load();
        return { gymId: r.gymId, name: r.name, receiptPrefix: r.receiptPrefix, plansCopied: r.plansCopied };
      } catch (e) {
        console.warn('[ForgeErr] owner_add_branch', e);
        throw new Error(branchFailWords(e));
      }
    },
    [key, session, phone, load],
  );

  const renameGroup = useCallback(
    async (name: string) => {
      if (!key) throw new Error('Put your gym online first.');
      try {
        await branchApi.renameGroup(key, name);
      } catch (e) {
        console.warn('[ForgeErr] owner_rename_group', e);
        throw new Error(branchFailWords(e));
      }
      await load();
    },
    [key, load],
  );

  const value = useMemo<BranchContextValue>(() => {
    if (!session) return singleBranch('', '', '');
    if (!list) return singleBranch(session.gymId, session.name, session.joinCode);
    const branches = list.branches.map((b) => ({
      gymId: b.gymId,
      name: b.gymId === session.gymId ? session.name || b.name : b.name,
      joinCode: b.joinCode,
      receiptPrefix: b.receiptPrefix,
      isCurrent: b.gymId === session.gymId,
    }));
    return {
      branches,
      groupName: list.groupName,
      currentGymId: session.gymId,
      canOpenOthers: list.canOpen && isOwner,
      multi: branches.length >= 2,
      dataFor: (gymId: string) => (gymId === session.gymId ? Promise.reject(new Error('Use this branch’s own screens.')) : dataFor(gymId)),
    };
  }, [session, list, isOwner, dataFor]);

  const actions = useMemo<BranchActions>(
    () => ({ list, serverReady, switchTo, addBranch, renameGroup, refresh: load, currentKey: key }),
    [list, serverReady, switchTo, addBranch, renameGroup, load, key],
  );

  return (
    <BranchContext.Provider value={value}>
      <BranchActionsContext.Provider value={actions}>{children}</BranchActionsContext.Provider>
    </BranchContext.Provider>
  );
}
