/**
 * F103 / T77 step 2: one shared read of the gym's entry machines and members' machine numbers, for
 * Settings -> Entry machines, the member page and the job that queues member updates. Read once per page
 * and again after a change (refreshEntryMachines), never polled on its own except on the Entry machines
 * screen (to show Online / Offline).
 */
import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { entryErrorWords, type EntryLoad } from '../machines/entryMachineAdmin';
import * as entryApi from '../shop/entryMachinesApi';
import { errorWords } from '../shop/logic';

export type EntryState = EntryLoad & { numbers?: Readonly<Record<string, string>> };

let state: EntryState = { state: 'loading' };
let forKey: string | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: EntryState): void {
  state = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Read the machines again (after adding, removing, a number change, or on the screen's clock). */
export function refreshEntryMachines(key: string | null): Promise<void> {
  if (!key) {
    forKey = null;
    set({ state: 'off' });
    return Promise.resolve();
  }
  if (inFlight && forKey === key) return inFlight;
  if (forKey !== key) {
    forKey = key;
    set({ state: 'loading' });
  }
  inFlight = entryApi
    .getEntryMachines(key)
    .then((r) => {
      if (forKey !== key) return;
      if (r === 'missing') set({ state: 'missing' });
      else set({ state: 'ready', canEdit: r.canEdit, machines: r.machines, numbers: r.numbers });
    })
    .catch((e: unknown) => {
      console.warn('[ForgeErr] entry machines: reading', e);
      if (forKey !== key) return;
      // Keep a list we already have (a short outage on the clock read); say it only when there is none.
      if (state.state !== 'ready') set({ state: 'error', message: entryErrorWords(e) ?? errorWords(e) });
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** The online key, or null for a gym kept in this browser only (and the demo). */
export function useEntryKey(): string | null {
  const { session } = useAuth();
  return session?.online ? (session.ownerKey ?? null) : null;
}

/** The shared read; the first user on a page starts it. */
export function useEntryMachines(): { load: EntryState; key: string | null } {
  const key = useEntryKey();
  const load = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (key !== forKey || (state.state === 'loading' && !inFlight)) void refreshEntryMachines(key);
  }, [key]);
  return { load: key === null ? { state: 'off' } : load, key };
}

/** Tests only. */
export function resetEntryStateForTest(): void {
  state = { state: 'loading' };
  forKey = null;
  inFlight = null;
}
