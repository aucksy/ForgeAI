/**
 * "Member messages" (owner request, 12 Nov 2026): the menu badge. useMemberMessageCount() gives the conversations
 * waiting for a reply, or null while the page is not there for this gym (no 0069 yet, offline before the first
 * answer, the demo gym): the menu item is then hidden. Asked when the app opens, when the tab comes back into
 * view, and every 3 minutes while it is open (as QuestionParts.tsx does for Questions).
 */

import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '../auth/AuthProvider';
import * as api from '../shop/memberMessagesApi';

let count: number | null = null;
let countKey: string | null = null;
const listeners = new Set<() => void>();
// Every mounted user of the count (the app menu, the More page) leaves its asker here. One shared slot broke the
// badge: leaving More cleared it while the menu still showed the count, so a reply never lowered the badge (e2e,
// 12 Nov 2026).
const askers = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function set(key: string, next: number | null): void {
  if (countKey === key && count === next) return;
  countKey = key;
  count = next;
  for (const fn of [...listeners]) fn();
}

async function readCount(key: string): Promise<void> {
  try {
    const n = await api.getTalkCount(key);
    set(key, typeof n === 'number' ? n : null);
  } catch (e) {
    // Offline or a hiccup: keep what was shown; the next tick asks again.
    console.warn('[member messages] reading the count', e);
  }
}

/** Ask again now (after a reply, "done", or Refresh on the page). */
export function refreshMemberMessageCount(): void {
  const ask = askers.values().next().value;
  ask?.();
}

/** Conversations waiting for a reply; null when Member messages is not there (hide the menu item). */
export function useMemberMessageCount(): number | null {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const n = useSyncExternalStore(subscribe, () => (countKey === key ? count : null));
  useEffect(() => {
    if (!key || api.memberMessagesMissing()) return;
    const run = (): void => void readCount(key);
    askers.add(run);
    run();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, 3 * 60 * 1000);
    const onShow = (): void => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      askers.delete(run);
    };
  }, [key]);
  return key ? n : null;
}
