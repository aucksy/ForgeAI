/**
 * Keeps the phone's "Workout in progress" card in step with the open workout
 * (Phase 1), and tidies up when the workout ends:
 *  - workout open → quiet card: "3 of 18 sets done", or "Resting · next set at 6:42 pm";
 *  - workout finished / discarded → card removed and any rest timer cancelled;
 *  - editing a past workout → no card (nothing is being trained).
 *
 * Started once from the root layout; listens to the two stores, so it works no
 * matter which screen is showing. Card updates are de-duplicated on their text.
 */
import { AppState } from 'react-native';

import { countWord } from '@/lib/words';

import { useActiveWorkout } from '../store/activeWorkoutStore';
import { useRestTimer } from '../store/restTimerStore';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { onRestCardChange, readRestCard, reconcileWithCard, restCardHolds, showRestCard } from './restCard';
import { cancelRestEnd, clearWorkoutOngoing, showWorkoutOngoing } from './workoutAlerts';

/** "6:42 pm" in the phone's local time. */
export function clockTime(epochMs: number): string {
  const d = new Date(epochMs);
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** The card's body text for the current state (pure, for tests). */
export function ongoingText(
  exercises: { sets: { done: boolean; isWarmup: boolean }[] }[],
  restEndsAt: number | null,
): string {
  if (restEndsAt != null) return `Resting · next set at ${clockTime(restEndsAt)}`;
  let total = 0;
  let done = 0;
  for (const e of exercises) {
    for (const s of e.sets) {
      if (s.isWarmup) continue;
      total += 1;
      if (s.done) done += 1;
    }
  }
  if (total === 0) return 'Add an exercise to start';
  return `${done} of ${countWord(total, 'set')} done`;
}

let started = false;

export function startWorkoutPresence(): () => void {
  if (started) return () => undefined;
  started = true;
  let last = '';

  const update = (): void => {
    const w = useActiveWorkout.getState();
    const r = useRestTimer.getState();
    // v0.26.1: before the saved workout is read back, "no workout" is not known yet — a rest
    // the watch card kept running while the app was closed must survive until then.
    if (!w.active && !w.hydrated) return;
    if (!w.active || w.editingSessionId) {
      if (!w.active && r.endsAt != null) r.skip(); // workout over → no stray bell
      if (last !== 'off') {
        last = 'off';
        void clearWorkoutOngoing();
        // Also covers an alarm left by a previous app run that was killed mid-rest.
        if (!w.active) void cancelRestEnd();
      }
      return;
    }
    const body = ongoingText(w.exercises, r.endsAt);
    if (body === last) return;
    last = body;
    void showWorkoutOngoing('Workout in progress', body);
  };

  // v0.26.1: the watch card. Its buttons change the app's timer while JS runs; when the app
  // comes back (or starts) it catches up with whatever the card did meanwhile.
  let wasHydrated = useActiveWorkout.getState().hydrated;
  const catchUp = (): void => {
    const w = useActiveWorkout.getState();
    if (!w.active || w.editingSessionId) return;
    const r = useRestTimer.getState();
    const step = reconcileWithCard({ endsAt: r.endsAt, onCard: restCardHolds() }, readRestCard(), Date.now());
    if (step.do === 'adopt') {
      r.fromCard({ kind: 'adopt', endsAt: step.endsAt, startedAt: step.startedAt, next: step.next });
      // Re-post it: after a force-stop Android removed the card and its alarm, though the saved
      // rest stayed (review M1). Posting the same rest again is harmless otherwise.
      showRestCard(step.startedAt, step.endsAt, step.next, !useTrackerPrefs.getState().sounds);
    } else if (step.do === 'stop') r.fromCard({ kind: 'stop' });
  };
  const offCard = onRestCardChange((c) => {
    const r = useRestTimer.getState();
    if (c.kind === 'add') r.fromCard(c);
    else if (c.kind === 'skip') r.fromCard({ kind: 'stop' });
  });
  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') catchUp();
  });

  const u1 = useActiveWorkout.subscribe((s) => {
    if (s.hydrated && !wasHydrated) {
      wasHydrated = true;
      catchUp();
    }
    update();
  });
  const u2 = useRestTimer.subscribe(update);
  if (wasHydrated) catchUp();
  update();
  return () => {
    u1();
    u2();
    offCard();
    appState.remove();
    started = false;
  };
}
