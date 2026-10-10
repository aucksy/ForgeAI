/**
 * Keeps the phone-side features in step (v0.27.0): Health Connect, the home-screen widgets and
 * the workout reminders.
 *  - a workout finished or edited → sent to Health Connect (if on), widgets and reminders redone;
 *  - a workout deleted → taken out of Health Connect, widgets and reminders redone (HI-17:
 *    deleting today's workout brings today's reminder back);
 *  - a workout opened / closed (audit Phase 6, PH-07 / PH-09) → reminders skip today while it
 *    is open, and the Today widget says "Resume"; a discard brings today's reminder back;
 *  - the app opens, comes back, or goes to the background (the member is about to see the home
 *    screen) → widgets redone; reminders checked on open and return (PH-08: they are set again
 *    only when something changed — the time zone included).
 *  - Erase all data → everything off and cleared.
 */
import { AppState } from 'react-native';

import { getRoutine } from '../db/routineRepo';
import { removeWorkoutFromHealth, sendWorkoutToHealth } from './healthConnect';
import { phoneNative } from './native';
import { setLiveWorkout, type LiveWorkout } from './liveWorkout';
import { usePhonePrefs } from './phonePrefs';
import { refreshReminders } from './reminders';
import { refreshWidgets } from './widgets';

export async function phoneAfterWorkout(sessionId: string): Promise<void> {
  await sendWorkoutToHealth(sessionId).catch(() => undefined);
  await refreshWidgets().catch(() => undefined);
  await refreshReminders().catch(() => undefined);
}

export async function phoneAfterDelete(sessionId: string): Promise<void> {
  await removeWorkoutFromHealth(sessionId).catch(() => undefined);
  await refreshWidgets().catch(() => undefined);
  await refreshReminders().catch(() => undefined);
}

/**
 * A workout was opened (started, or restored at launch) or closed (finished, discarded). Null =
 * none open. Finishing also runs `phoneAfterWorkout`; this keeps a discard and a start right.
 */
export async function phoneWorkoutLive(w: { name: string | null; routineId: string | null } | null): Promise<void> {
  let live: LiveWorkout | null = null;
  if (w) {
    const routine = !w.name && w.routineId ? await getRoutine(w.routineId).catch(() => null) : null;
    live = { name: w.name?.trim() || routine?.name || 'Workout' };
  }
  setLiveWorkout(live);
  await refreshWidgets().catch(() => undefined);
  await refreshReminders().catch(() => undefined);
}

/** Erase all data: reminders off and cancelled, Health Connect sending off, widgets blank. */
export async function phoneAfterErase(): Promise<void> {
  usePhonePrefs.getState().reset();
  setLiveWorkout(null);
  await refreshReminders().catch(() => undefined);
  try {
    phoneNative()?.widgetSave('{}');
  } catch {
    // quiet
  }
}

let started = false;
export function startPhoneSync(): void {
  if (started) return;
  started = true;
  void refreshWidgets();
  void refreshReminders();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      void refreshWidgets();
      void refreshReminders();
    } else if (s === 'background') void refreshWidgets();
  });
}
