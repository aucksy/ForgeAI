/**
 * 13 Oct 2026 — has anything in a sheet changed since it opened? The ✓ "Done" beside the × shows
 * only then (`TrackerSheet` `changed`). PURE.
 */
import type { DraftSet } from '../store/activeWorkoutStore';

/** What the "Set type" sheet changes on a set: its type and its RPE. */
export interface SetChoice {
  type: 'normal' | 'warmup' | 'drop' | 'failure';
  rpe: number | null;
}

export function setChoiceOf(set: Pick<DraftSet, 'isWarmup' | 'setType' | 'rpe'>): SetChoice {
  return { type: set.isWarmup ? 'warmup' : set.setType ?? 'normal', rpe: set.rpe ?? null };
}

/** True once the type or the RPE differs from when the sheet opened (back to the start = false). */
export function setChoiceChanged(start: SetChoice | null, now: SetChoice | null): boolean {
  if (!start || !now) return false;
  return start.type !== now.type || start.rpe !== now.rpe;
}
