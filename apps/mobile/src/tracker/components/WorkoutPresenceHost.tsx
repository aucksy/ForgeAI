/**
 * Mounted once beside the navigator (Phase 1). On launch it restores an open
 * workout (so the minimised bar shows on every tab, not only after visiting the
 * Workout tab), loads the default rest, starts the lock-screen card sync, and
 * sends a tapped workout notification to the workout screen. Renders nothing.
 */
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { startPhoneSync } from '../phone/phoneSync';
import { listenForShares } from '../phone/sharedImport';
import { onRestOpen, takeRestOpenRequest } from '../services/restCard';
import { listenForAlertTaps, setupWorkoutAlerts, WORKOUT_ROUTE } from '../services/workoutAlerts';
import { startWorkoutPresence } from '../services/workoutPresence';
import { useActiveWorkout } from '../store/activeWorkoutStore';
import { useRestTimer } from '../store/restTimerStore';
import { useWorkoutUi } from '../store/workoutUiStore';

export function WorkoutPresenceHost() {
  const router = useRouter();

  useEffect(() => {
    void setupWorkoutAlerts();
    void useRestTimer.getState().loadDefault().catch(() => undefined);
    const stop = startWorkoutPresence();
    // v0.27.0: Health Connect, widgets and reminders kept in step (quiet, never in the way).
    startPhoneSync();
    void useActiveWorkout.getState().hydrate().catch(() => undefined);

    const openWorkout = (route: string): void => {
      // v0.27.0: a workout reminder opens the Workout tab.
      if (route === '/workout') {
        setTimeout(() => router.navigate('/workout'), 300);
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
      stop();
      unlisten();
      unlistenCard();
      unlistenShare();
    };
  }, [router]);

  return null;
}
