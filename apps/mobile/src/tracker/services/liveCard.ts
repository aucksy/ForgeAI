/**
 * The live workout card's words (13 Oct 2026, the owner's Hevy comparison). PURE.
 *
 * While a workout is open the phone shows one ongoing card (WorkoutCard.kt), as Hevy's:
 *  - title: the exercise being trained — the one whose next set is open, picked as the rest
 *    card picks it (`restTarget`, from the exercise of the last ticked set; the first exercise
 *    before any tick);
 *  - text: that set — "Set 3 of 5 · 35 kg × 11" ("Warm-up 1 of 2 · 20 kg × 10") — its numbers
 *    being exactly what a tick saves: the typed ones, else the row's grey hint (the Target,
 *    else last time's; `fillForSet`), in the member's units and the card's counting. A row with
 *    nothing to save reads "Set 3 of 5 · add reps in the app" (no "Complete set");
 *  - "Complete set": the rest card's Done for that row (`cardDoneTarget`), so a tap ticks that
 *    set with those numbers and starts the rest;
 *  - every working set ticked: "All sets done · Finish", no button; no exercise yet: "Add an
 *    exercise to start".
 *  - R-166 (28 Oct 2026): `watch`, the same row in three short lines for the watch app: where it
 *    is ("Set 3 of 5"), last time's numbers for that very set (`prevForSet`, the PREVIOUS column's
 *    own source) and what a tick saves (`goal`: the text's numbers, the Target else last time's).
 */
import { kgToShown, weightUnitOf, type UnitSystem } from '@/lib/units';

import { hasReps, hasWeight } from '../engine/logTypes';
import { setInWords } from '../lib/previousSource';
import { prevForSet, type DraftExercise, type DraftSet, type SetFill } from '../store/activeWorkoutStore';
import { cardDoneTarget, restTarget, rowLabel, type CardDone, type RowFill } from './restDone';
import { afterSetCompleted } from './restRules';
import { shownValues, weightStepShown } from './setEntry';
import { tickValues } from './setTick';

export interface LiveCard {
  title: string;
  text: string;
  /** The exercise named in the title (its picture is the card's large icon); null = none. */
  exKey: string | null;
  /** "Complete set" (null = no button); `open` = nothing to save, so no button either. */
  done: CardDone | null;
  /** "Bench Press, set 3" — what a queued tap's note names. */
  label: string | null;
  /** R-166: the row for the watch app; absent / null when no set is named ("All sets done"). */
  watch?: WatchLines | null;
}

/**
 * R-166 (28 Oct 2026): the next set on the watch, in the member's units. Each "" when unknown.
 *  - set: "Set 3 of 5" / "Warm-up 1 of 2";
 *  - last: last time's numbers for this very set ("60 kg × 8"), the set row's PREVIOUS;
 *  - goal: what "Complete set" saves ("62.5 kg × 8": typed, else the Target, else last time's).
 */
export interface WatchLines {
  set: string;
  last: string;
  goal: string;
  /** Watch logging (3 Nov 2026): the row's numbers for the watch's own Done; null = none. */
  entry?: WatchEntry | null;
}

/**
 * Watch logging (3 Nov 2026, the owner's approved watch design): the next set's boxes as the watch
 * shows and edits them. Numbers are in the member's unit, exactly what the row's boxes show (typed,
 * else the grey hint), so a Done on the watch saves what a tick on the phone would.
 */
export interface WatchEntry {
  /** The row has a weight box / a reps box. */
  wOn: boolean;
  rOn: boolean;
  /** The weight shown (kg to 0.01, lb to 0.1); null = the box is empty. */
  w: number | null;
  /** The reps shown; null = the box is empty. */
  r: number | null;
  unit: 'kg' | 'lb';
  /** One crown step of weight, in `unit` (the exercise's own step, as the phone's +/- uses). */
  step: number;
  warm: boolean;
  /** "Track RPE" is on: the watch asks how hard the set was (not for warm-ups). */
  rpe: boolean;
  /** Seconds of rest after this set (0 = none): the watch starts it if the phone cannot be reached. */
  rest: number;
}

/** Options for the watch lines (the store's "Track RPE"). */
export interface WatchOpts {
  rpe?: boolean;
}

/** The row's boxes for the watch (`WatchEntry`); rest 0 until the plan fills it. PURE. */
export function watchEntry(ex: DraftExercise, s: DraftSet, fill: SetFill | null, units: UnitSystem, opts: WatchOpts = {}): WatchEntry {
  const lt = ex.logType ?? 'weight_reps';
  const shown = shownValues(s, fill, lt);
  const wOn = hasWeight(lt);
  const rOn = hasReps(lt);
  const dp = units === 'imperial' ? 10 : 100;
  return {
    wOn,
    rOn,
    w: wOn && shown.weightKg != null ? Math.round(kgToShown(shown.weightKg, units) * dp) / dp : null,
    r: rOn && shown.reps != null ? Math.round(shown.reps) : null,
    unit: weightUnitOf(units),
    step: weightStepShown(ex.incrementKg, units),
    warm: s.isWarmup === true,
    rpe: opts.rpe === true && !s.isWarmup,
    rest: 0,
  };
}

/** The most recently ticked set (by tick time), or null. PURE. */
export function lastTick(exercises: readonly DraftExercise[]): { exKey: string; setKey: string } | null {
  let best: { exKey: string; setKey: string; at: number } | null = null;
  for (const e of exercises) {
    for (const s of e.sets) {
      if (s.done && s.doneAt != null && (!best || s.doneAt > best.at)) best = { exKey: e.key, setKey: s.key, at: s.doneAt };
    }
  }
  return best ? { exKey: best.exKey, setKey: best.setKey } : null;
}

/**
 * Where the card looks for the next set: the exercise the screen goes to after the last tick —
 * the same rule as the set row's tick (`afterSetCompleted(...).nextExKey ?? exKey`), so in a
 * superset the card names the partner, as the rest card's Done does (review fix) — else the
 * first exercise. PURE.
 */
export function liveFrom(exercises: readonly DraftExercise[]): string | null {
  const last = lastTick(exercises);
  if (!last) return exercises[0]?.key ?? null;
  return afterSetCompleted([...exercises], last.exKey, last.setKey, 0).nextExKey ?? last.exKey;
}

/** "Set 3 of 5" / "Warm-up 1 of 2" for a row of `ex`. PURE. */
export function setPosition(ex: DraftExercise, setKey: string): string | null {
  const warm = ex.sets.filter((s) => s.isWarmup);
  const work = ex.sets.filter((s) => !s.isWarmup);
  const wi = warm.findIndex((s) => s.key === setKey);
  if (wi >= 0) return `Warm-up ${wi + 1} of ${warm.length}`;
  const i = work.findIndex((s) => s.key === setKey);
  return i >= 0 ? `Set ${i + 1} of ${work.length}` : null;
}

const NOT_SAVED: Record<'reps' | 'weight' | 'time' | 'distance', string> = {
  reps: 'add reps in the app',
  weight: 'add the weight in the app',
  time: 'add a time in the app',
  distance: 'add a distance in the app',
};

/**
 * The card for the workout as it is now. PURE.
 *
 * 15 Oct 2026 (pause the workout): while the workout timer is paused the text starts "Paused · ".
 * R-55 (22 Oct 2026): the card's header now shows the workout clock (liveClock.ts); while paused
 * it stands still, so nothing in the shade keeps counting a paused workout.
 */
export function liveCardContent(
  w: { startedAt: number | null; exercises: readonly DraftExercise[]; workoutName?: string | null; pausedAt?: number | null },
  fillFor: RowFill,
  units: UnitSystem,
  opts: WatchOpts = {},
): LiveCard {
  const card = cardNow(w, fillFor, units, opts);
  return w.pausedAt != null ? { ...card, text: `Paused · ${card.text}` } : card;
}

function cardNow(
  w: { startedAt: number | null; exercises: readonly DraftExercise[]; workoutName?: string | null },
  fillFor: RowFill,
  units: UnitSystem,
  opts: WatchOpts,
): LiveCard {
  const name = w.workoutName?.trim() || 'Workout in progress';
  if (w.exercises.length === 0) return { title: name, text: 'Add an exercise to start', exKey: null, done: null, label: null };
  const from = liveFrom(w.exercises);
  const t = from ? restTarget(w.exercises, from) : null;
  const ex = t ? w.exercises.find((e) => e.key === t.exKey) : undefined;
  const s = t && ex ? ex.sets.find((x) => x.key === t.setKey) : undefined;
  if (!t || !ex || !s) return { title: name, text: 'All sets done · Finish', exKey: null, done: null, label: null };
  const where = setPosition(ex, s.key) ?? '';
  const lt = ex.logType ?? 'weight_reps';
  const fill = fillFor(ex, s.key);
  const out = tickValues(lt, s, fill);
  const what = out.ok
    ? setInWords(
        { weightKg: out.weightKg ?? 0, reps: out.reps ?? 0, durationSec: out.durationSec, distanceM: out.distanceM },
        lt,
        units,
        ex.loadMode ?? 'one',
        ex.distUnit ?? 'km',
      )
    : NOT_SAVED[out.missing];
  const prev = prevForSet(ex, s.key);
  const last = prev ? setInWords(prev, lt, units, ex.loadMode ?? 'one', ex.distUnit ?? 'km') : null;
  return {
    title: ex.name,
    text: what ? `${where} · ${what}` : where,
    exKey: ex.key,
    done: cardDoneTarget(w, t, fillFor),
    label: rowLabel(ex, s.key),
    watch: { set: where, last: last ?? '', goal: out.ok ? (what ?? '') : '', entry: watchEntry(ex, s, fill, units, opts) },
  };
}

/** One string per card as posted, so an unchanged card is not posted again. PURE. */
export function liveCardKey(c: LiveCard, image: string | null): string {
  return JSON.stringify([c.title, c.text, image, c.done?.exKey ?? null, c.done?.setKey ?? null, c.done?.open ?? null, c.done?.values ?? null, c.watch ?? null]);
}
