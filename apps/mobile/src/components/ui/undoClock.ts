/**
 * The UndoBar's clock, kept pure so it can be tested in Node. An undo must stay long enough
 * to reach with a sweaty thumb (Appendix B: "Undo for deletes"), so it never runs shorter than
 * 6 s, and it stands still while a finger is on the bar.
 */

/** The shortest an undo bar may stay on screen. */
export const UNDO_MIN_MS = 6000;

export interface UndoClockState {
  /** Time left when the clock last started or paused. */
  remainingMs: number;
  /** When the clock last started running; null while paused. */
  runningSince: number | null;
}

export const undoClock = {
  start(now: number, ms: number = UNDO_MIN_MS): UndoClockState {
    return { remainingMs: Math.max(UNDO_MIN_MS, ms), runningSince: now };
  },
  left(s: UndoClockState, now: number): number {
    if (s.runningSince == null) return s.remainingMs;
    return Math.max(0, s.remainingMs - (now - s.runningSince));
  },
  pause(s: UndoClockState, now: number): UndoClockState {
    if (s.runningSince == null) return s;
    return { remainingMs: undoClock.left(s, now), runningSince: null };
  },
  resume(s: UndoClockState, now: number): UndoClockState {
    if (s.runningSince != null) return s;
    return { remainingMs: s.remainingMs, runningSince: now };
  },
};
