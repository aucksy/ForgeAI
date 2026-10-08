/**
 * Keeps the phone-side features in step (v0.27.0): Health Connect, the home-screen widgets and
 * the workout reminders.
 *  - a workout finished or edited → sent to Health Connect (if on), widgets and reminders redone;
 *  - a workout deleted → taken out of Health Connect, widgets redone;
 *  - the app opens, comes back, or goes to the background (the member is about to see the home
 *    screen) → widgets redone; reminders redone on open.
 *  - Erase all data → everything off and cleared.
 */
import { AppState } from 'react-native';

import { removeWorkoutFromHealth, sendWorkoutToHealth } from './healthConnect';
import { phoneNative } from './native';
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
}

/** Erase all data: reminders off and cancelled, Health Connect sending off, widgets blank. */
export async function phoneAfterErase(): Promise<void> {
  usePhonePrefs.getState().reset();
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
