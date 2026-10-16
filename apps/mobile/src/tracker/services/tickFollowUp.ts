/**
 * What follows a tick that landed in the store (record alert, "on last time" line, rest timer,
 * superset hand-off). Every tick path calls it: the ✓, the RPE sheet, the hold timer and the rest
 * card's "Done" (restDoneRun). Moved out of SetRow.tsx (16 Oct 2026 audit C1) so it can be tested.
 *
 * C1-1 (16 Oct 2026): a workout being CORRECTED — "Edit workout" or "Log a past workout" — gets
 * no rest timer, no "Rest is over" alarm and no pop-ups. Before, only an edit was skipped, so a
 * past workout being typed in rang "Rest is over" 90 s after a tick.
 */
import { AccessibilityInfo } from 'react-native';

import { deltaWords } from '@/components/ui/a11y';
import { success } from '@/lib/haptics';
import { displayUnits } from '@/lib/units';

import { isCorrecting, prevForSet, useActiveWorkout } from '../store/activeWorkoutStore';
import { useRestTimer } from '../store/restTimerStore';
import { useWorkoutUi } from '../store/workoutUiStore';
import { recordLabel, recordLines, toastHit } from './liveRecords';
import { nextForCard } from './restDoneRun';
import { afterSetCompleted, nextUpLabel } from './restRules';
import { typoCheck, typoText } from './setTick';
import { vsLastTimeText } from './vsLastTime';
import { playWorkoutSound } from './workoutSounds';

/** After a tick lands in the store: record alert + rest timer + superset hand-off. */
export function afterTick(exKey: string, setKey: string): void {
  const st = useActiveWorkout.getState();
  const ex = st.exercises.find((e) => e.key === exKey);
  const done = ex?.sets.find((s) => s.key === setKey);
  if (!ex || !done?.done) return; // a blank set with nothing to fill stays unticked

  // D7 — C1-14 (16 Oct 2026 audit): a number far above the member's best gets one question,
  // whichever way the set was ticked (✓, RPE sheet, rest card). It is already saved. Asked while
  // correcting too, as the ✓ always did.
  if (!done.isWarmup) {
    const typo = typoCheck(ex.logType ?? 'weight_reps', done, ex.bests);
    if (typo) {
      const text = typoText(typo, done, displayUnits());
      useWorkoutUi.getState().askTypo(exKey, setKey, text, typo.kind);
      AccessibilityInfo.announceForAccessibility(text);
    }
  }

  // Correcting a past workout (an edit, or a past workout being logged): no timers, no fanfare.
  if (isCorrecting(st)) return;

  // Phase 3 review: the pop-up counts the same lift on other cards, and stays quiet for a set
  // already beaten by another ticked set (the medal still follows set order).
  // Phase 4: an easy week stays out of records, so it never claims one.
  const hit = st.easyWeek ? null : toastHit(st.exercises, exKey, setKey);
  if (hit) {
    success();
    playWorkoutSound('record');
    const ctx = { logType: ex.logType ?? 'weight_reps', loadMode: ex.loadMode ?? 'one', distUnit: ex.distUnit ?? 'km' } as const;
    useWorkoutUi.getState().showRecord(ex.name, recordLabel(hit, ctx), recordLines(hit, ctx));
  } else if (!st.easyWeek && !done.isWarmup && done.setType !== 'drop') {
    // Review fix: a drop set is lighter on purpose, so drop sets are never compared.
    // Not a record, but better than the same set last time (the PREVIOUS the row shows): one
    // quiet line in the record toast's place. No sound; the tick's own haptic is enough. Equal
    // or worse says nothing. An easy week is lighter on purpose, so it is never compared.
    const text = vsLastTimeText(
      done,
      prevForSet(ex, setKey),
      ex.logType ?? 'weight_reps',
      ex.loadMode ?? 'one',
      displayUnits(),
      ex.distUnit ?? 'km',
    );
    if (text) {
      useWorkoutUi.getState().showLastTime(ex.name, text);
      AccessibilityInfo.announceForAccessibility(`${ex.name}, ${deltaWords(text)}`);
    }
  }

  const timer = useRestTimer.getState();
  const d = afterSetCompleted(st.exercises, exKey, setKey, timer.defaultSec);
  // v0.26.1: "Bench Press, set 3" for the watch card and "Rest is over". Phase 6: the card's
  // "Done" ticks exactly the row it names, so the name comes from that row.
  const card = nextForCard(d.nextExKey ?? exKey);
  const nextName = card.label ?? nextUpLabel(st.exercises, d.nextExKey ?? exKey);
  // Ticked during an older rest, and this set means "no rest" (drop set next,
  // mid-superset, rest off) → the old bell must not ring mid-set; v0.37.1 (C2): and an old
  // "Rest is over" goes, the live workout card back on the next set.
  timer.afterTickRest(d.restSec, nextName, card.done);
  if (d.nextExKey) useWorkoutUi.getState().requestScroll(d.nextExKey);
}
