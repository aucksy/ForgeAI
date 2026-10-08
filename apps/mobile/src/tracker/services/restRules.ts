/**
 * Rest-timer rules — PURE (Phase 1, Hevy parity).
 *
 * Decides, at the moment a set is ticked, whether a rest countdown starts and how
 * long it runs, and which exercise the screen should bring into view next. Kept out
 * of the components so every rule below is unit-tested:
 *
 *  - Each exercise may carry its own rest length (`restSec`); `null`/absent means
 *    "use the default", `0` means "no timer for this exercise".
 *  - A warm-up set never starts a timer (unchanged from before Phase 1).
 *  - A set followed by a DROP set starts no timer — a drop set is done straight away.
 *  - Supersets rest per ROUND, not per exercise: ticking A1 jumps to B1 with no
 *    timer; ticking the last exercise of the round starts the rest and points back
 *    at the first exercise that still has a set to do.
 */
import type { DraftExercise } from '@/tracker/store/activeWorkoutStore';

/** Rest lengths offered in the picker, in seconds. 0 = off. */
export const REST_CHOICES: readonly number[] = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

export const DEFAULT_REST_SEC = 90;

/** "Off", "45s", "1:30", "2:00". */
export function fmtRest(sec: number): string {
  if (sec <= 0) return 'Off';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Seconds of rest this exercise uses; 0 = off. */
export function effectiveRestSec(ex: Pick<DraftExercise, 'restSec'>, defaultSec: number): number {
  const own = ex.restSec;
  if (own == null) return Math.max(0, defaultSec);
  return Math.max(0, own);
}

export interface RestDecision {
  /** Seconds to count down, or null for no timer. */
  restSec: number | null;
  /** Exercise the screen should scroll to next (supersets only), or null. */
  nextExKey: string | null;
}

const NONE: RestDecision = { restSec: null, nextExKey: null };

function hasOpenWorkingSet(ex: DraftExercise): boolean {
  return ex.sets.some((s) => !s.done && !s.isWarmup);
}

/**
 * v0.26.1: what the rest card and "Rest is over" name as next — "Bench Press, set 3".
 * Starts at `fromExKey` (the exercise the screen goes to next); when that one has no working
 * set left, the next exercise down the list that has one. The set number counts working sets
 * only (warm-ups are not numbered), as the set rows do. Null when nothing is left to do.
 */
export function nextUpLabel(exercises: DraftExercise[], fromExKey: string): string | null {
  const start = exercises.findIndex((e) => e.key === fromExKey);
  if (start < 0) return null;
  const order = [...exercises.slice(start), ...exercises.slice(0, start)];
  for (const ex of order) {
    let n = 0;
    for (const s of ex.sets) {
      if (s.isWarmup) continue;
      n += 1;
      if (!s.done) return `${ex.name}, set ${n}`;
    }
  }
  return null;
}

/**
 * Call AFTER the tick has been applied to `exercises` (the ticked set is `done`).
 * Unticking is not a completion — callers only ask on a completion.
 */
export function afterSetCompleted(
  exercises: DraftExercise[],
  exKey: string,
  setKey: string,
  defaultSec: number,
): RestDecision {
  const exIndex = exercises.findIndex((e) => e.key === exKey);
  if (exIndex < 0) return NONE;
  const ex = exercises[exIndex];
  const setIndex = ex.sets.findIndex((s) => s.key === setKey);
  if (setIndex < 0) return NONE;
  const set = ex.sets[setIndex];
  if (set.isWarmup) return NONE;

  // A drop set follows immediately — no rest before it.
  const next = ex.sets[setIndex + 1];
  if (next && !next.done && !next.isWarmup && next.setType === 'drop') return NONE;

  const rest = effectiveRestSec(ex, defaultSec);
  const restSec = rest > 0 ? rest : null;

  const group = ex.supersetGroup ?? null;
  if (group == null) return { restSec, nextExKey: null };

  // Superset: members in screen order.
  const members = exercises.filter((e) => (e.supersetGroup ?? null) === group);
  if (members.length < 2) return { restSec, nextExKey: null };
  const pos = members.findIndex((e) => e.key === exKey);

  // A later member still has work this round → go there, no rest yet.
  for (let i = pos + 1; i < members.length; i++) {
    if (hasOpenWorkingSet(members[i])) return { restSec: null, nextExKey: members[i].key };
  }
  // End of the round → rest, then start the next round at the first member with work.
  const first = members.find((m) => hasOpenWorkingSet(m));
  return { restSec, nextExKey: first && first.key !== exKey ? first.key : null };
}
