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
import { useActiveWorkout } from '../store/activeWorkoutStore';
import { useRestTimer } from '../store/restTimerStore';
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
  return `${done} of ${total} sets done`;
}

let started = false;

export function startWorkoutPresence(): () => void {
  if (started) return () => undefined;
  started = true;
  let last = '';

  const update = (): void => {
    const w = useActiveWorkout.getState();
    const r = useRestTimer.getState();
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

  const u1 = useActiveWorkout.subscribe(update);
  const u2 = useRestTimer.subscribe(update);
  update();
  return () => {
    u1();
    u2();
    started = false;
  };
}
