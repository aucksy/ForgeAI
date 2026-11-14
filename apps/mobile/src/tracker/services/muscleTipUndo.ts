/**
 * R-482 / R-492: the line on the Undo bar after the member taps "Add" or "Swap" on a muscle tip.
 * The Workout tab floats that bar at the bottom of the screen (above the tab bar), so a member who
 * scrolled down before tapping still sees it and can undo (phone run 43564289562: the bar used to sit
 * where the tip was, above the screen). The words are the engine's, unchanged. PURE.
 */
import { addedLine, swappedLine } from '../engine/muscleBalance';
import type { MuscleTip, MuscleTipDone } from './muscleTips';

/** "Seated Leg Curl added to your Legs routine." after Add; "... now replaces ..." after Swap. */
export function tipUndoLine(tip: MuscleTip, done: MuscleTipDone): string {
  return done.kind === 'swap' && tip.kind === 'swap'
    ? swappedLine(tip.exerciseName, tip.outName, tip.routineName)
    : addedLine(tip.exerciseName, tip.routineName);
}
