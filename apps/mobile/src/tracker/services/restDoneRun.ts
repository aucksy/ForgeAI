/**
 * Phase 6, point 4 — the app's side of "Done" on the rest card (rules: `restDone.ts`).
 *
 * A Done tap lands in the native piece (`modules/forge-rest`), which keeps it ("pending done")
 * and tells the app if its JS is running. The app takes it ONCE — at once, or when the saved
 * workout is read back on the next start, or when the app comes back to the front — and:
 *  - ticks the row through the store's normal tick (`toggleDone` with the row's own grey hint,
 *    saved through the queued draft), then starts that set's rest as a tick on screen would
 *    (`afterTick`): the card re-posts with the next set;
 *  - or opens the app on the set ("Add reps first") when the row has nothing to save, or when
 *    its grey hint is no longer the one the card's Done was for (review fix: a tap read on a
 *    cold start before the Targets are back never saves last session's numbers);
 *  - or stays quiet when that row is already ticked (a second tap: the set IS saved);
 *  - or, for a card that no longer fits the workout, saves nothing and at most opens the app.
 * With the app in the background it cannot open itself (Android blocks that), so it leaves a
 * quiet note that opens ForgeAI when tapped. Review fix: once the tap is handled and its save
 * has left the write queue, the native piece is told (`settleDone`), which ends the broadcast
 * it kept open so Android could not freeze the app before the tick.
 */
import { AppState } from 'react-native';

import { writeQueueIdle } from '@/db/writeQueue';

import { targetFill } from '../engine/progression';
import { fillForSet, useActiveWorkout, type ActiveWorkoutState, type DraftExercise, type SetFill } from '../store/activeWorkoutStore';
import { useTargets } from '../store/targetStore';
import { onRestCardChange, postDoneNote, settleDone, takePendingDone } from './restCard';
import { cardDoneTarget, decideRestDone, restTarget, type CardDone } from './restDone';
import { missingText, type TickMissing } from './setTick';

/** The grey hint the row shows on screen: `fillForSet` with the card's Target (as the card does). */
export function rowFill(ex: DraftExercise, setKey: string): SetFill | null {
  const t = useTargets.getState().targets.get(ex.key);
  return fillForSet(ex, setKey, t ? targetFill(t) : null);
}

/**
 * For a tick's rest: what the card names next and what its Done ticks. Null label = nothing
 * left (the caller then uses its own label, if any).
 */
export function nextForCard(fromExKey: string): { label: string | null; done: CardDone | null } {
  const w = useActiveWorkout.getState();
  const t = restTarget(w.exercises, fromExKey);
  return { label: t?.label ?? null, done: cardDoneTarget(w, t, rowFill) };
}

export interface RestDoneDeps {
  /** The screen's after-tick step (record alert, the rest, superset hand-off). */
  afterTick: (exKey: string, setKey: string) => void;
  /** Bring the workout screen up, on this set, saying what is missing (all null: just open it). */
  openSet: (exKey: string | null, setKey: string | null, missing: TickMissing | null) => void;
}

/** Start listening for Done taps. Returns the stop function. */
export function startRestDone(deps: RestDoneDeps): () => void {
  const run = (): void => {
    const w = useActiveWorkout.getState();
    // Before the saved workout is read back nothing can match: leave the tap with the phone.
    if (!w.hydrated) return;
    try {
      handle(w);
    } finally {
      // The tick's draft save is queued: tell the phone once it has been written (or failed).
      void writeQueueIdle().then(settleDone, settleDone);
    }
  };

  const handle = (w: ActiveWorkoutState): void => {
    const req = takePendingDone();
    if (!req) return;
    const step = decideRestDone(req, w, rowFill, Date.now());
    // An "open" Done launched the app itself; otherwise only an app on screen may change screens.
    const front = req.open || AppState.currentState === 'active';
    const name = req.label ?? 'your set';
    const openOrNote = (exKey: string, setKey: string, missing: TickMissing | null): void => {
      if (front) deps.openSet(exKey, setKey, missing);
      else postDoneNote(`Open ForgeAI to log ${name}`, missing ? `${missingText(missing)} — nothing was saved.` : 'Nothing was saved yet.');
    };
    switch (step.do) {
      case 'ignore':
      case 'already':
        return;
      case 'stale':
        if (front) deps.openSet(null, null, null);
        else postDoneNote('Open ForgeAI to log your set', 'That rest card was out of date, so nothing was saved.');
        return;
      case 'open':
        openOrNote(step.exKey, step.setKey, step.missing);
        return;
      case 'tick': {
        const missing = w.toggleDone(step.exKey, step.setKey, step.fill);
        if (missing) {
          openOrNote(step.exKey, step.setKey, missing);
          return;
        }
        deps.afterTick(step.exKey, step.setKey);
        return;
      }
    }
  };

  const offCard = onRestCardChange((c) => {
    if (c.kind === 'done') run();
  });
  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') run();
  });
  const offStore = useActiveWorkout.subscribe((s, prev) => {
    if (s.hydrated && !prev.hydrated) run();
  });
  run();
  return () => {
    offCard();
    appState.remove();
    offStore();
  };
}
