/**
 * Mounted once beside the navigator (Phase 1). On launch it restores an open
 * workout (so the minimised bar shows on every tab, not only after visiting the
 * Workout tab), loads the default rest, starts the lock-screen card sync, and
 * sends a tapped workout notification to the workout screen. Renders nothing.
 */
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { NOTICE_ROUTE } from '@/shop/noticeAlerts';

import { phoneWorkoutLive, startPhoneSync } from '../phone/phoneSync';
import { listenForShares } from '../phone/sharedImport';
import { onRestOpen, takeRestOpenRequest } from '../services/restCard';
import { startRestDone } from '../services/restDoneRun';
import { listenForAlertTaps, setupWorkoutAlerts, WORKOUT_ROUTE } from '../services/workoutAlerts';
import { startWatchOpen } from '../services/watchOpen';
import { startWorkoutPresence } from '../services/workoutPresence';
import { isCorrecting, useActiveWorkout, type ActiveWorkoutState } from '../store/activeWorkoutStore';
import { useRestTimer } from '../store/restTimerStore';
import { useWorkoutUi } from '../store/workoutUiStore';
import { afterTick } from './SetRow';

export function WorkoutPresenceHost() {
  const router = useRouter();

  useEffect(() => {
    void setupWorkoutAlerts();
    void useRestTimer.getState().loadDefault().catch(() => undefined);
    // v0.37.1: the cards' coordinator starts after the Done listener (below), so when the saved
    // workout is read back the ticks made with the app closed are saved FIRST, and the cards
    // are then posted from the ticked workout (never once from the stale one).
    let stop: () => void = () => undefined;
    // v0.27.0: Health Connect, widgets and reminders kept in step (quiet, never in the way).
    startPhoneSync();
    // Audit Phase 6 (PH-07, PH-09): a workout open → no reminder today, the widget says
    // "Resume"; closed → both back. A correction of a saved workout is never "open".
    const isLive = (s: ActiveWorkoutState): boolean => s.active && !isCorrecting(s);
    const unwatch = useActiveWorkout.subscribe((s, prev) => {
      if (isLive(s) === isLive(prev)) return;
      void phoneWorkoutLive(isLive(s) ? { name: s.workoutName, routineId: s.planDayId ?? s.routineId } : null);
    });
    void useActiveWorkout.getState().hydrate().catch(() => undefined);

    const openWorkout = (route: string): void => {
      // v0.27.0: a workout reminder opens the Workout tab.
      if (route === '/workout') {
        setTimeout(() => router.navigate('/workout'), 300);
        return;
      }
      // R-86: a gym reminder opens the gym's tab (the offer card and My membership at its top).
      if (route === '/shop') {
        setTimeout(() => router.navigate('/shop'), 300);
        return;
      }
      // A gym notice that popped up on the phone opens the Gym inbox.
      if (route === NOTICE_ROUTE) {
        setTimeout(() => router.navigate(NOTICE_ROUTE), 400);
        return;
      }
      if (route !== WORKOUT_ROUTE) return;
      void useActiveWorkout
        .getState()
        .hydrate()
        .catch(() => undefined)
        .then(() => {
          // Let the navigator mount first on a cold start.
          setTimeout(() => {
            // Already on the workout screen (phone locked on it) → just come back to it.
            if (useActiveWorkout.getState().active && !useWorkoutUi.getState().screenOpen) {
              router.push('/session/active');
            }
          }, 300);
        });
    };
    const unlisten = listenForAlertTaps(openWorkout);
    // v0.26.1: the watch card and its "Rest is over" are native alerts — a tap opens the app
    // with a flag (cold start: read once here; app already running: an event).
    const unlistenCard = onRestOpen(() => openWorkout(WORKOUT_ROUTE));
    if (takeRestOpenRequest()) openWorkout(WORKOUT_ROUTE);
    // Phase 6: "Done" on the rest card (phone or watch) ticks the next set; when that row has
    // nothing to save (or the card is out of date) the app opens on it instead.
    const stopDone = startRestDone({
      afterTick,
      openSet: (exKey, setKey, missing) => {
        openWorkout(WORKOUT_ROUTE);
        if (!exKey) return;
        // After the screen is up (a cold start mounts the navigator first).
        setTimeout(() => {
          useWorkoutUi.getState().requestScroll(exKey);
          if (setKey && missing) useWorkoutUi.getState().showRowNote(exKey, setKey, missing);
        }, 900);
      },
    });
    stop = startWorkoutPresence();
    // 29 Oct 2026: starting a workout opens MettleUp on the watch (Settings can turn it off).
    const stopWatchOpen = startWatchOpen();
    // v0.28.0: an export shared to ForgeAI opens the import with it (after the navigator mounts).
    // Audit IM-17: one ForgeAI could not take opens the import too, saying why.
    const unlistenShare = listenForShares((f) =>
      setTimeout(
        () =>
          router.push(
            'error' in f
              ? { pathname: '/import', params: { shareError: f.error } }
              : { pathname: '/import', params: { file: f.uri, name: f.name, type: f.type } },
          ),
        300,
      ),
    );
    return () => {
      unwatch();
      stop();
      stopWatchOpen();
      unlisten();
      unlistenCard();
      stopDone();
      unlistenShare();
    };
  }, [router]);

  return null;
}
