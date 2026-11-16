/**
 * R-608 (owner, 16 Nov 2026: "the birthdays are set to be automated but the AI assistant is still suggesting that"):
 * is the gym's automatic birthday wish on (Messages & offers > Automatic reminders, owner_auto_reminders)? The AI
 * Assistant's birthday idea and Today's "Messages to send" then leave out the members whose phone app wishes them.
 * One answer for the whole panel, asked at most every 5 minutes; the reminders page passes on every change it saves.
 * null = not known (offline, demo, still loading, a server without automatic reminders, a failed call): the panel
 * then suggests a wish for every birthday, as before.
 */
import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '../auth/AuthProvider';
import type { RemindersAnswer } from '../logic/autoReminders';
import { isNoSuchFunction } from '../logic/workoutOffer';
import * as api from './api';

const FRESH_MS = 5 * 60 * 1000;

interface State {
  key: string | null;
  on: boolean | null;
  at: number;
}

let state: State = { key: null, on: null, at: 0 };
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

/** The reminders page's answer (loaded or just saved): every screen updates at once. */
export function noteAutoReminders(key: string, a: RemindersAnswer): void {
  set({ key, on: a.settings.birthday.on, at: Date.now() });
}

async function ask(key: string): Promise<void> {
  if (asking === key) return;
  asking = key;
  try {
    noteAutoReminders(key, await api.getAutoReminders(key));
  } catch (e) {
    // A failure is remembered too (not asked again for 5 minutes): the screens keep the old behaviour meanwhile.
    if (!isNoSuchFunction(e)) console.warn('[ForgeErr] automatic birthday wish: asking the server', e);
    set({ key, on: null, at: Date.now() });
  } finally {
    asking = null;
  }
}

/** True / false once the server answered for this gym; null while not known. */
export function useBirthdayAutoWish(): boolean | null {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const s = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    if (!key) return;
    if (state.key !== key || Date.now() - state.at > FRESH_MS) void ask(key);
  }, [key]);
  return key !== null && s.key === key ? s.on : null;
}
