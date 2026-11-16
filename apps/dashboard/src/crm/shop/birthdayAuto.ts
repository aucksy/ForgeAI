/**
 * R-608 (owner, 16 Nov 2026: "the birthdays are set to be automated but the AI assistant is still suggesting that"):
 * the automatic birthday wish for the AI Assistant's birthday idea and Today's "Messages to send" (answer.ts AutoWish).
 * One read for the whole panel of two server answers: the switch (owner_auto_reminders, Messages & offers > Automatic
 * reminders) and the gym's app members (owner_app_members), from which logic/autoWish.ts works out, by the server's
 * own rule, who gets the wish on their phone. Read again every 5 minutes while a screen uses it; the reminders page
 * passes on every switch it loads or saves.
 *  - not online (offline, demo): null, everything as before;
 *  - online, not answered yet: 'waiting' (no birthday idea or row for a moment, never a count that jumps);
 *  - the switch off, or the switch or the app list could not be read (old server, failed call): null, as before.
 * Review (16 Nov): a late answer for a gym the owner already left is dropped.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import type { AutoWish } from '../assistant/answer';
import { useAuth } from '../auth/AuthProvider';
import type { RemindersAnswer } from '../logic/autoReminders';
import { autoWishIds } from '../logic/autoWish';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { useCrm } from '../store';
import * as api from './api';
import type { AppMember } from './logic';

const FRESH_MS = 5 * 60 * 1000;

interface State {
  key: string | null;
  /** undefined: not answered yet; null: could not be read. */
  on: boolean | null | undefined;
  app: AppMember[] | null | undefined;
}

let state: State = { key: null, on: undefined, app: undefined };
/** The gym the panel is on now: an answer for any other is dropped. */
let current: string | null = null;
let asking: string | null = null;
const listeners = new Set<() => void>();

function set(next: State): void {
  state = next;
  for (const l of listeners) l();
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const read = (): State => state;

/** Start over for a gym the panel just moved to. */
function enterGym(key: string): void {
  current = key;
  if (state.key !== key) set({ key, on: undefined, app: undefined });
}

/** The reminders page's answer (loaded or just saved): every screen follows the birthday switch at once. */
export function noteAutoReminders(key: string, a: RemindersAnswer): void {
  enterGym(key);
  set({ ...state, on: a.settings.birthday.on });
  if (state.app === undefined) void ask(key);
}

async function ask(key: string): Promise<void> {
  if (asking === key) return;
  asking = key;
  try {
    const [sw, app] = await Promise.allSettled([api.getAutoReminders(key), api.listAppMembers(key)]);
    if (current !== key) return; // the owner moved to another gym meanwhile
    if (sw.status === 'rejected' && !isNoSuchFunction(sw.reason)) console.warn('[ForgeErr] automatic birthday wish: the switch', sw.reason);
    if (app.status === 'rejected') console.warn('[ForgeErr] automatic birthday wish: the app members', app.reason);
    // A failure is an answer too (null): the screens keep the old behaviour until the next read, 5 minutes on.
    set({ key, on: sw.status === 'fulfilled' ? sw.value.settings.birthday.on : null, app: app.status === 'fulfilled' ? app.value : null });
  } finally {
    if (asking === key) asking = null;
  }
}

/** answer.ts AutoWish for the gym on screen (its members not archived, as the server counts them). */
export function useAutoWish(): AutoWish {
  const { session } = useAuth();
  const { memberViews } = useCrm();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const s = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    if (!key) return undefined;
    enterGym(key);
    if (state.on === undefined || state.app === undefined) void ask(key);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void ask(key);
    }, FRESH_MS);
    return () => window.clearInterval(timer);
  }, [key]);
  return useMemo<AutoWish>(() => {
    if (!key) return null;
    if (s.key !== key || s.on === undefined) return 'waiting';
    if (s.on !== true) return null;
    if (s.app === undefined) return 'waiting';
    if (s.app === null) return null;
    return autoWishIds(memberViews, s.app);
  }, [key, s, memberViews]);
}
