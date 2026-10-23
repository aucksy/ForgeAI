/**
 * Keeps the phone-side features in step (v0.27.0): Health Connect, the home-screen widgets and
 * the workout reminders.
 *  - a workout finished or edited → sent to Health Connect (if on), widgets and reminders redone
 *    (and, tracker schema v14, the record log of any exercise whose records start on a day);
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
import { clearShortcuts, refreshWidgets } from './widgets';

export async function phoneAfterWorkout(sessionId: string): Promise<void> {
  // Tracker schema v14: an exercise whose records count from a day gets its record log (Home's
  // record count, the strength score, the coach) put right after the save. Loaded on use:
  // prRebuild imports this file. Not awaited: Health Connect and the widgets never wait on it.
  void import('@/tracker/services/prRebuild')
    .then((m) => m.reconcileRecordStartsForSession(sessionId))
    .catch(() => undefined);
  await sendWorkoutToHealth(sessionId).catch(() => undefined);
  await refreshWidgets().catch(() => undefined);
  await refreshReminders().catch(() => undefined);
  // R-86 review NIT 3: a saved workout may move the workout offer's count; the offer sync sends
  // its dates (only for a member who joined it) and keeps the answer, which sets the gym reminders
  // ("almost there", "ending soon") again. Not awaited: the save never waits on the gym.
  void syncOfferAfterWorkout();
}

async function syncOfferAfterWorkout(): Promise<void> {
  try {
    const { useGymShop } = await import('@/shop/gymStore');
    const link = useGymShop.getState().link;
    if (!link) return;
    const { syncOfferDates } = await import('@/shop/offerActions');
    await syncOfferDates(link);
  } catch (e) {
    console.warn('[ForgeErr] after a workout: the workout offer and gym reminders', e);
  }
}

/**
 * Gym branding: the app's look changed (a join, Leave gym, the owner's new look shown). The
 * widgets are drawn again in the new accent, and the reminders — which keep the colour they were
 * scheduled with — are set again (their stamp holds the accent: reminders.ts reminderStampKey).
 */
export async function phoneAfterLookChange(): Promise<void> {
  await refreshWidgets().catch(() => undefined);
  await refreshReminders().catch(() => undefined);
  // R-86: the gym's reminders keep their colour too; a join or Leave also starts or ends them.
  await import('@/shop/gymReminders')
    .then((m) => m.refreshGymReminders())
    .catch((e: unknown) => console.warn('[ForgeErr] look change: the gym reminders', e));
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
  clearShortcuts();
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
