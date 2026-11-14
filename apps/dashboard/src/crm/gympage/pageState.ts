/**
 * F207: what the panel knows about this gym's web page, shared by the menu row ("Your web page"), Set up your gym's step
 * "Make your free gym web page" (ticks itself once the page is published) and the editor (which tells it after a save).
 * Asked once per sign-in key (owner_gym_page); a server without the web page part, the demo gym and a gym kept only in
 * this browser have none: then neither the row nor the step shows. Nor while gym web pages are not open to visitors
 * (pagesOpen.ts, the Worker's GYM_PAGES switch): then nothing is asked and nothing shows, until the switch turns on.
 */
import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { useDemo } from '../demo/demoMode';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { getPage } from './api';
import { usePagesOpen } from './pagesOpen';
import type { PageAnswer } from './logic';

type Known = { key: string; answer: PageAnswer | null };

let known: Known | null = null;
let asking: string | null = null;
const listeners = new Set<() => void>();

function tell() {
  for (const f of listeners) f();
}

/** The editor read or saved the page: everyone shows the new state at once. */
export function rememberPage(key: string, answer: PageAnswer | null): void {
  known = { key, answer };
  tell();
}

async function ask(key: string): Promise<void> {
  if (asking === key) return;
  asking = key;
  try {
    rememberPage(key, await getPage(key));
  } catch (e) {
    // A server before 0080 has no such function: quietly none. Anything else is logged; the row stays hidden and the
    // editor (opened by hand) asks again and says what went wrong.
    if (!isNoSuchFunction(e)) console.warn('[web page] could not read the page state', e);
    rememberPage(key, null);
  } finally {
    if (asking === key) asking = null;
  }
}

function subscribe(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * This sign-in's page: undefined while not known yet, null when the gym has no web page part (or no internet key, or
 * gym web pages are not open), else the answer (page null = not made yet).
 */
export function useWebPage(): PageAnswer | null | undefined {
  const { session } = useAuth();
  const demo = useDemo() !== null;
  const open = usePagesOpen();
  const key = open && !demo && session?.online ? session.ownerKey : null;
  const snap = useSyncExternalStore(subscribe, () => known);
  useEffect(() => {
    if (key && known?.key !== key) void ask(key);
  }, [key]);
  if (!key) return null;
  return snap?.key === key ? snap.answer : undefined;
}

/** For tests: forget what is known. */
export function forgetPageState(): void {
  known = null;
  asking = null;
  tell();
}
