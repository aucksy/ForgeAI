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
 *  - R-267: the app opens or comes back → workouts still owed to Health Connect are sent again.
 *  - F55: the app opens or comes back → new weigh-ins in Health Connect join the body-weight log
 *    (only after the member's yes; at most every 10 minutes).
 */
import { AppState } from 'react-native';

import { getRoutine } from '../db/routineRepo';
import { removeWorkoutFromHealth, retryOwedHealth, sendWorkoutToHealth } from './healthConnect';
import { readHealthWeights } from './healthRead';
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
  await sendWorkoutToHealth(sessionId).catch((e: unknown) => console.warn('[ForgeErr] health: the finished workout was not sent', e));
  await refreshWidgets().catch(() => undefined);
  await refreshReminders().catch(() => undefined);
  // R-86 review NIT 3: a saved workout may move the workout offer's count; the offer sync sends
  // its dates (only for a member who joined it) and keeps the answer, which sets the gym reminders
  // ("almost there", "ending soon") again. Not awaited: the save never waits on the gym.
  void syncOfferAfterWorkout();
  // R-133: the gym leaderboard's day totals (only a phone in a gym, never demo data; quiet on failure).
  void pushBoardLater('workout');
}

/** R-133: tell the gym's leaderboard (leaderboardPush.ts decides whether to send). Never throws, never waited on. */
async function pushBoardLater(trigger: 'workout' | 'start' | 'active'): Promise<void> {
  try {
    const { pushBoard } = await import('@/shop/leaderboardSync');
    await pushBoard(trigger);
  } catch (e) {
    console.warn('[board] push could not start', e);
  }
  // R-164: the workouts shared with gym mates, only while that switch is on (mateShare.ts decides).
  try {
    const { shareWithMates } = await import('@/shop/mateSync');
    await shareWithMates(trigger);
  } catch (e) {
    console.warn('[mates] share could not start', e);
  }
  // F137: busy machines; sends only when the gym switched it on (machineBusySync.ts decides; never throws).
  try {
    const { syncMachinesQuietly } = await import('@/shop/machineBusySync');
    await syncMachinesQuietly(trigger);
  } catch (e) {
    console.warn('[machines] sync could not start', e);
  }
  // F109: the weekly summary for the gym's trainers, only while that switch is on (trainerSync.ts; never throws).
  try {
    const { shareWithTrainers } = await import('@/shop/trainerSync');
    await shareWithTrainers(trigger);
  } catch (e) {
    console.warn('[trainer] share could not start', e);
  }
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
  await removeWorkoutFromHealth(sessionId).catch((e: unknown) => console.warn('[ForgeErr] health: the deleted workout was not removed', e));
  await refreshWidgets().catch(() => undefined);
  await refreshReminders().catch(() => undefined);
  // R-133: a deleted workout leaves the gym's leaderboard too.
  void pushBoardLater('workout');
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

/** R-267: send owed workouts again (at most every 10 minutes; never throws, never waited on). */
async function retryOwedLater(): Promise<void> {
  try {
    await retryOwedHealth();
  } catch (e) {
    console.warn('[ForgeErr] health: owed workouts could not be sent again', e);
  }
}

/** F55: new weigh-ins from Health Connect (at most every 10 minutes; never throws, never waited on). */
async function readWeightsLater(): Promise<void> {
  try {
    await readHealthWeights();
  } catch (e) {
    console.warn('[ForgeErr] health: weigh-ins could not be read', e);
  }
}

let started = false;
export function startPhoneSync(): void {
  if (started) return;
  started = true;
  void refreshWidgets();
  void refreshReminders();
  void pushBoardLater('start');
  // R-267: workouts Health Connect has not got yet (refused, or the app closed mid-send) go by themselves.
  void retryOwedLater();
  void readWeightsLater();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      void refreshWidgets();
      void refreshReminders();
      void retryOwedLater();
      void readWeightsLater();
      // R-133: back in the app: a name switch the gym has not heard yet is sent again.
      void pushBoardLater('active');
    } else if (s === 'background') void refreshWidgets();
  });
}
