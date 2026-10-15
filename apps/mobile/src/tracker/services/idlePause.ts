/**
 * Forgotten Finish (15 Oct 2026): the app-wide watch that pauses a workout left open. Checked when
 * the app comes back to the screen and once a minute while it is open; the rule itself is
 * finishCheck.idlePauseAt (PURE). A workout closed in the background is caught the next time the
 * app opens, and the pause is back-dated, so the saved length is right either way.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useActiveWorkout } from '../store/activeWorkoutStore';
import { useRestTimer } from '../store/restTimerStore';
import { idlePauseAt, lastActivity } from './finishCheck';

/** Pause the open workout now if it has been idle an hour. Never throws. */
export function checkIdlePause(now: number = Date.now()): void {
  try {
    const s = useActiveWorkout.getState();
    if (!s.active || s.startedAt == null || s.pausedAt != null || s.editingSessionId != null || s.pastLog) return;
    const last = lastActivity(s.exercises, useRestTimer.getState().defaultSec);
    const at = idlePauseAt({
      startedAt: s.startedAt,
      lastActionAt: last.at,
      restSec: last.restSec,
      now,
      pause: { pausedAt: s.pausedAt, pausedTotalMs: s.pausedTotalMs, pauses: s.pauses },
    });
    if (at != null) s.autoPause(at);
  } catch (e) {
    console.warn('[ForgeErr] idle pause check', e);
  }
}

/** Mount once (root layout): the check on open, on coming back, and every minute. */
export function useIdlePause(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    checkIdlePause();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') checkIdlePause();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') checkIdlePause();
    }, 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [enabled]);
}
