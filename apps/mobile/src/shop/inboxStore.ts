/**
 * Gym messages, Phase 1: the inbox on this phone — the last list from the gym (so the bell's count
 * and the inbox show at once, and offline), for ONE member link: a list kept for another member
 * (joined elsewhere, left, re-joined) is never shown. Seen ids the server has not taken yet are
 * kept and sent again on the next refresh.
 *
 * Saved under its own name; "Erase all data" and Leave clear it (onboarding/eraseDevice.ts step
 * "gym-shop"; gymActions.leaveGym). Nothing here talks to the server: gymActions.ts does.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { inboxFromRow, mergeSeen, type InboxMessage } from './inbox';

export const GYM_INBOX_STORAGE_KEY = 'forgeai-gym-inbox';

interface InboxBlob {
  /** The member link this list belongs to; null = none yet. */
  memberId: string | null;
  messages: InboxMessage[];
  /** Seen on this phone, not yet confirmed by the server. */
  unsent: string[];
}

export interface InboxState extends InboxBlob {
  /** The gym's list for this member, with this phone's own "seen" laid over it. */
  setList: (memberId: string, messages: InboxMessage[]) => void;
  /** The inbox showed these: seen here now, the server is told by gymActions. */
  markSeen: (memberId: string, ids: string[]) => void;
  /** The server took these seen ids. */
  confirmSeen: (ids: string[]) => void;
  clear: () => void;
}

const EMPTY: InboxBlob = { memberId: null, messages: [], unsent: [] };

/** What was saved, checked; anything damaged is dropped. PURE. */
export function cleanInboxBlob(raw: unknown): InboxBlob {
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const r = raw as Record<string, unknown>;
  const memberId = typeof r.memberId === 'string' && r.memberId ? r.memberId : null;
  if (!memberId) return { ...EMPTY };
  const messages = (Array.isArray(r.messages) ? r.messages : []).map(inboxFromRow).filter((m): m is InboxMessage => m !== null);
  const unsent = (Array.isArray(r.unsent) ? r.unsent : []).filter((x): x is string => typeof x === 'string').slice(0, 100);
  return { memberId, messages, unsent };
}

export const useGymInbox = create<InboxState>()(
  persist(
    (set, get) => ({
      ...EMPTY,
      setList: (memberId, messages) => {
        const s = get();
        const unsent = s.memberId === memberId ? s.unsent : [];
        set({ memberId, messages: mergeSeen(messages, new Set(unsent)), unsent });
      },
      markSeen: (memberId, ids) => {
        const s = get();
        if (s.memberId !== memberId || ids.length === 0) return;
        const fresh = ids.filter((id) => s.messages.some((m) => m.id === id && !m.seen));
        if (fresh.length === 0) return;
        const add = new Set(fresh);
        set({
          messages: s.messages.map((m) => (add.has(m.id) ? { ...m, seen: true } : m)),
          unsent: [...new Set([...s.unsent, ...fresh])].slice(-100),
        });
      },
      confirmSeen: (ids) => {
        const done = new Set(ids);
        set({ unsent: get().unsent.filter((id) => !done.has(id)) });
      },
      clear: () => set({ ...EMPTY }),
    }),
    {
      name: GYM_INBOX_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s): InboxBlob => ({ memberId: s.memberId, messages: s.messages, unsent: s.unsent }),
      merge: (persisted, current) => ({ ...current, ...cleanInboxBlob(persisted) }),
    },
  ),
);

/** The messages for the member this phone is linked as now — none for any other. */
export function inboxFor(s: Pick<InboxState, 'memberId' | 'messages'>, memberId: string | null | undefined): InboxMessage[] {
  return memberId && s.memberId === memberId ? s.messages : [];
}
