/**
 * Phase 6, point 4 — "Done" on the rest card: log the next set from the phone's shade, the lock
 * screen or the watch, without opening the app. PURE (the runner is `restDoneRun.ts`).
 *
 *  - `restTarget`: the row the card names ("Bench Press, set 2") and its Done ticks — the first
 *    unticked row after the exercise's last ticked row (a new exercise starts with its warm-up),
 *    else its first unticked working set. A warm-up the member skipped is never gone back to.
 *    The exercise is the one `nextUpLabel` picks (the first, from the one just trained, with an
 *    unticked working set), so the card and the in-app "Next up" agree.
 *  - `cardDoneTarget`: what the card's Done carries — the workout (its start time) and the row's
 *    own keys, so a card left over from another workout or a removed set can never tick a
 *    different row; `open` when the row has nothing to save (no typed numbers, no grey hint):
 *    Done then opens the app on that set instead of ticking. Review fix: also the grey hint the row
 *    showed (`values`), so a tap read after a cold start, before the routine's Targets are
 *    back, can never save last session's numbers instead of the Target: a row whose hint
 *    changed since is opened, never ticked. (Numbers typed into the row still win, as on screen.)
 *  - `decideRestDone`: what a Done tap does once the app reads it (at once, or when it next
 *    starts): tick exactly what the row shows (`setTick.tickValues` with the row's own hint),
 *    open the app on the set ("Add reps first", or its numbers changed since the card), ignore a
 *    tap older than 10 minutes, stay quiet when that row is already ticked (a second tap, or
 *    ticked in the app), or — the workout ended or changed, the set is gone — save nothing.
 */
import type { DraftExercise, DraftSet, SetFill } from '../store/activeWorkoutStore';
import { missingText, tickValues, type TickMissing } from './setTick';

/** A Done tap older than this is not acted on (the member has moved on). */
export const DONE_MAX_AGE_MS = 10 * 60_000;

/** The row a rest card names and its Done ticks. */
export interface RestTarget {
  exKey: string;
  setKey: string;
  /** "Bench Press, set 2" / "Squat, warm-up 1". */
  label: string;
}

/** What the card's Done button carries (handed to the native card). */
export interface CardDone {
  /** The workout's start time (epoch ms): its identity. */
  workout: number;
  exKey: string;
  setKey: string;
  /** True: the row has nothing to save, so Done opens the app on it. */
  open: boolean;
  /** The row's grey hint when the card was posted (`hintSignature`); null with `open`. */
  values: string | null;
}

/** A Done tap as the phone kept it. */
export interface DoneRequest {
  workout: number;
  exKey: string;
  setKey: string;
  /** The rest's end when the button was posted (kept for the record). */
  endsAt: number;
  /** When it was tapped (epoch ms). */
  at: number;
  open: boolean;
  label: string | null;
  /** The row's hint when the card was posted (`hintSignature`); null = not carried ("open" Done). */
  values: string | null;
}

/** The grey hint a row shows (`fillForSet` with the card's Target). */
export type RowFill = (ex: DraftExercise, setKey: string) => SetFill | null;

export type DoneStep =
  /** Too old: dropped without a word. */
  | { do: 'ignore' }
  /** The card no longer fits the workout: save nothing, at most open the app. */
  | { do: 'stale' }
  /** That row is already ticked (a second tap, or ticked in the app): nothing to do or say. */
  | { do: 'already' }
  | { do: 'tick'; exKey: string; setKey: string; fill: SetFill | null }
  | { do: 'open'; exKey: string; setKey: string; missing: TickMissing | null; text: string | null };

/** "Bench Press, set 2" (warm-ups not counted) or "Bench Press, warm-up 1". */
export function rowLabel(ex: DraftExercise, setKey: string): string | null {
  let warm = 0;
  let work = 0;
  for (const s of ex.sets) {
    if (s.isWarmup) warm += 1;
    else work += 1;
    if (s.key === setKey) return s.isWarmup ? `${ex.name}, warm-up ${warm}` : `${ex.name}, set ${work}`;
  }
  return null;
}

function nextRow(ex: DraftExercise): DraftSet | null {
  let last = -1;
  ex.sets.forEach((s, i) => {
    if (s.done) last = i;
  });
  for (let i = last + 1; i < ex.sets.length; i += 1) {
    if (!ex.sets[i].done) return ex.sets[i];
  }
  return ex.sets.find((s) => !s.done && !s.isWarmup) ?? null;
}

/** The row the card names next, from the exercise just trained (or its superset partner). */
export function restTarget(exercises: readonly DraftExercise[], fromExKey: string): RestTarget | null {
  const start = exercises.findIndex((e) => e.key === fromExKey);
  if (start < 0) return null;
  const order = [...exercises.slice(start), ...exercises.slice(0, start)];
  for (const ex of order) {
    if (!ex.sets.some((s) => !s.done && !s.isWarmup)) continue;
    const r = nextRow(ex);
    const label = r ? rowLabel(ex, r.key) : null;
    if (r && label) return { exKey: ex.key, setKey: r.key, label };
  }
  return null;
}

type TickCheck = { ok: true; fill: SetFill | null } | { ok: false; missing: TickMissing };

/** "80|8||" (no hint: "none"): the row's grey hint in one string the card carries and compares. */
export function hintSignature(fill: SetFill | null): string {
  if (!fill) return 'none';
  const n = (v: number | null | undefined): string => (v == null ? '' : String(v));
  return `${n(fill.weightKg)}|${n(fill.reps)}|${n(fill.durationSec)}|${n(fill.distanceM)}`;
}

/** Could a tick on this row save something right now (typed numbers, else its grey hint)? */
function checkRow(ex: DraftExercise, s: DraftSet, fillFor: RowFill): TickCheck {
  const fill = fillFor(ex, s.key);
  const out = tickValues(ex.logType ?? 'weight_reps', s, fill);
  return out.ok ? { ok: true, fill } : { ok: false, missing: out.missing };
}

/** The card's Done for `t`, or null (no next row, or no live workout). */
export function cardDoneTarget(
  w: { startedAt: number | null; exercises: readonly DraftExercise[] },
  t: RestTarget | null,
  fillFor: RowFill,
): CardDone | null {
  if (!t || w.startedAt == null) return null;
  const ex = w.exercises.find((e) => e.key === t.exKey);
  const s = ex?.sets.find((x) => x.key === t.setKey);
  if (!ex || !s || s.done) return null;
  const c = checkRow(ex, s, fillFor);
  return { workout: w.startedAt, exKey: t.exKey, setKey: t.setKey, open: !c.ok, values: c.ok ? hintSignature(c.fill) : null };
}

/** What a Done tap does, read against the workout as it is now. */
export function decideRestDone(
  req: DoneRequest,
  w: {
    active: boolean;
    startedAt: number | null;
    editingSessionId: string | null;
    pastLog: boolean;
    exercises: readonly DraftExercise[];
  },
  fillFor: RowFill,
  now: number,
): DoneStep {
  // A clock moved back a lot also reads as "old": never act on a tap from the future.
  if (now - req.at > DONE_MAX_AGE_MS || req.at - now > 60_000) return { do: 'ignore' };
  if (!w.active || w.editingSessionId != null || w.pastLog || w.startedAt !== req.workout) return { do: 'stale' };
  const ex = w.exercises.find((e) => e.key === req.exKey);
  const s = ex?.sets.find((x) => x.key === req.setKey);
  if (!ex || !s) return { do: 'stale' };
  // Already ticked (in the app, or a second tap — a watch can lag behind the newer card): the
  // set IS saved, so nothing is said. Done never moves on to another row by itself.
  if (s.done) return { do: 'already' };
  const c = checkRow(ex, s, fillFor);
  if (!c.ok) return { do: 'open', exKey: ex.key, setKey: s.key, missing: c.missing, text: missingText(c.missing) };
  // The hint is not the one the card's Done was for (a cold start before the Targets are back
  // shows last session's; or the set above was changed since): open the set, never guess.
  if (req.open || req.values == null || req.values !== hintSignature(c.fill)) {
    return { do: 'open', exKey: ex.key, setKey: s.key, missing: null, text: null };
  }
  return { do: 'tick', exKey: ex.key, setKey: s.key, fill: c.fill };
}
