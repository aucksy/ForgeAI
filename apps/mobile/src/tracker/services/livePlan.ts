/**
 * v0.37.1 (notification audit C1) — the live workout card's PLAN of the sets ahead. PURE.
 *
 * "Complete set" on the live card (and "Done" on the rest card) must work while Android has
 * closed ForgeAI, phone in a pocket, often from a watch. The phone cannot run the app's JS then,
 * so the app hands the native card, with every post, what the next taps would do:
 *  - each row the card will name, in order — its words (`liveCardContent`), the numbers a tick
 *    saves (`values`, the row's grey hint as `hintSignature` carries it) and its label;
 *  - the rest after ticking it (`afterSetCompleted`: the exercise's rest, none mid-superset or
 *    with the rest off);
 *  - and, last, the row the plan stops at: one with nothing to save ("add reps in the app": the
 *    app must be opened) or "All sets done · Finish".
 * Worked out by ticking a copy of the workout row by row exactly as a tick would (`tickValues`,
 * so a row's hint follows the numbers ticked above it, `fillForSet`). The native side
 * (OfflineTick.kt) starts each rest and moves the card on from it; the app saves the ticks when it
 * next starts (`restDoneRun.ts`).
 */
import type { UnitSystem } from '@/lib/units';

import type { DraftExercise } from '../store/activeWorkoutStore';
import { liveCardContent, type WatchLines } from './liveCard';
import type { RowFill } from './restDone';
import { afterSetCompleted } from './restRules';
import { tickValues } from './setTick';

/** One row of the plan. `exKey` null = "All sets done" (nothing left). */
export interface PlanStep {
  exKey: string | null;
  setKey: string | null;
  /** The row has nothing to save: no "Complete set" (the plan stops here). */
  open: boolean;
  /** What a tick saves, as the card's Done carries it (`hintSignature`); null when `open` / done. */
  values: string | null;
  /** "Bench Press, set 3" (the rest card names it); null when all sets are done. */
  label: string | null;
  /** The live card's title and text for this row. */
  title: string;
  text: string;
  image: string | null;
  /** R-166: the row's lines for the watch app (OfflineTick.kt passes them on); null = none. */
  watch: WatchLines | null;
  /** Seconds of rest after this row is ticked (0 = none). */
  rest: number;
}

export interface LivePlan {
  /** The workout's start time (its identity, as the card's Done carries it). */
  workout: number;
  steps: PlanStep[];
}

/** At most this many rows ahead (more than any workout's remaining sets). */
export const PLAN_MAX_ROWS = 40;

/** The plan for the workout as it is now; null when there is no live workout. */
export function livePlan(
  w: { startedAt: number | null; exercises: readonly DraftExercise[]; workoutName?: string | null },
  fillFor: RowFill,
  units: UnitSystem,
  defaultRestSec: number,
  imageFor: (exKey: string) => string | null = () => null,
): LivePlan | null {
  if (w.startedAt == null || w.exercises.length === 0) return null;
  let exercises: DraftExercise[] = [...w.exercises];
  // A simulated tick is the latest tick (the card follows the last tick).
  let clock = 0;
  for (const e of exercises) for (const s of e.sets) if (s.doneAt != null && s.doneAt > clock) clock = s.doneAt;
  const steps: PlanStep[] = [];
  for (let i = 0; i < PLAN_MAX_ROWS; i += 1) {
    const card = liveCardContent({ startedAt: w.startedAt, exercises, workoutName: w.workoutName }, fillFor, units);
    const d = card.done;
    const base = { title: card.title, text: card.text, image: card.exKey ? imageFor(card.exKey) : null, watch: card.watch ?? null };
    if (!d) {
      steps.push({ exKey: null, setKey: null, open: false, values: null, label: null, ...base, rest: 0 });
      break;
    }
    if (d.open) {
      steps.push({ exKey: d.exKey, setKey: d.setKey, open: true, values: null, label: card.label, ...base, rest: 0 });
      break;
    }
    const ex = exercises.find((e) => e.key === d.exKey);
    const s = ex?.sets.find((x) => x.key === d.setKey);
    if (!ex || !s) break;
    const out = tickValues(ex.logType ?? 'weight_reps', s, fillFor(ex, s.key));
    if (!out.ok) break;
    clock += 1;
    const ticked = { ...s, done: true, doneAt: clock, weightKg: out.weightKg, reps: out.reps, durationSec: out.durationSec, distanceM: out.distanceM };
    exercises = exercises.map((e) => (e.key === ex.key ? { ...e, sets: e.sets.map((x) => (x.key === s.key ? ticked : x)) } : e));
    const rest = afterSetCompleted(exercises, ex.key, s.key, defaultRestSec).restSec ?? 0;
    steps.push({ exKey: d.exKey, setKey: d.setKey, open: false, values: d.values, label: card.label, ...base, rest });
  }
  return { workout: w.startedAt, steps };
}
