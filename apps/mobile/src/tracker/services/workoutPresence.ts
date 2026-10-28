/**
 * Keeps the phone's "Workout in progress" card in step with the open workout
 * (Phase 1), and tidies up when the workout ends:
 *  - workout open → quiet card: "3 of 18 sets done", or "Resting · next set at 6:42 pm";
 *  - workout finished / discarded → card removed and any rest timer cancelled;
 *  - editing a past workout → no card (nothing is being trained).
 *
 * Started once from the root layout; listens to the two stores, so it works no
 * matter which screen is showing. Card updates are de-duplicated on their text.
 *
 * Phase 2, packet D:
 *  - RT-05: while the native rest card shows the rest, this card keeps "3 of 18 sets done" —
 *    one rest, one card; its clock follows the phone's 12/24-hour setting.
 *  - RT-07 / RT-12: "Workout sounds" and "Ring through Do Not Disturb" reach the running
 *    rest's "Rest is over" the moment they change.
 *
 * 13 Oct 2026 (Hevy's live card): on a build with the native piece the card is the LIVE workout
 * card instead — the exercise being trained, its next set ("Set 3 of 5 · 35 kg × 11"), its
 * picture and "Complete set" (`liveCard.ts`, WorkoutCard.kt), in the phone's normal section.
 * Re-posted only when it changes, at most every ~0.4 s (typing re-words it; Android drops
 * updates that come faster). An older build keeps the quiet card above.
 *
 * ONE workout notification at a time (13 Oct 2026, device QA: the live card and the rest card
 * side by side were grouped under one "ForgeAI" header, both collapsed — Done / +15 s / Skip and
 * Complete set hidden). While the rest card holds a rest, the live card is taken down (its words
 * kept natively, the next set); when the rest ends, is skipped or Done, it is posted again with
 * the then-next set (`liveCardShown`). "Rest is over" keeps it down natively until it goes; with
 * the app open that alert leaves after 60 s, so the card is posted again then too.
 *
 * v0.37.1 (notification audit): each post also hands over the plan of the sets ahead (`livePlan`)
 * so "Complete set" works with the app closed (C1); a tick or a rest starting / ending is posted
 * at once, past the re-wording throttle (C8); the app coming to the front clears an old "Rest is
 * over" (C2).
 */
import { AppState } from 'react-native';

import { countWord } from '@/lib/words';

import { useActiveWorkout } from '../store/activeWorkoutStore';
import { useRestTimer } from '../store/restTimerStore';
import { useRestAlertPrefs } from '../store/restAlertPrefsStore';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import {
  dismissRestOver,
  onRestCardChange,
  phoneUses24Hour,
  readRestCard,
  reconcileWithCard,
  restCardHolds,
  setRestQuiet,
  setRestRingThroughDnd,
  setRestSoundNative,
  showRestCard,
} from './restCard';
import { cancelRestEnd, clearWorkoutOngoing, showWorkoutOngoing } from './workoutAlerts';
import { displayUnits } from '@/lib/units';

import { useTargets } from '../store/targetStore';
import { clearLiveWorkoutCard, hideLiveWorkoutCard, liveWorkoutCardAvailable, showLiveWorkoutCard } from './restCard';
import { liveCardContent, liveCardKey, type LiveCard } from './liveCard';
import { liveCardImage } from './liveCardImage';
import { liveClock } from './liveClock';
import { livePlan } from './livePlan';
import { rowFill } from './restDoneRun';

/** The live card is re-posted at most this often (Android drops faster updates). */
export const LIVE_CARD_EVERY_MS = 400;
/** After a rest, the live card is posted once more when the app-open "Rest is over" has left (60 s). */
export const AFTER_OVER_MS = 61_000;

/**
 * One workout notification at a time: is the live card up (true) or down for the rest card
 * (false)? Down while a rest runs on the native rest card; up otherwise. PURE.
 */
export function liveCardShown(rest: { endsAt: number | null }, restCardHoldsIt: boolean): boolean {
  return !(rest.endsAt != null && restCardHoldsIt);
}

/** "6:42 pm" in the phone's local time, or "18:42" when the phone uses the 24-hour clock. */
export function clockTime(epochMs: number, use24Hour = false): string {
  const d = new Date(epochMs);
  const h24 = d.getHours();
  if (use24Hour) return `${String(h24).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** The card's body text for the current state (pure, for tests). */
export function ongoingText(
  exercises: { sets: { done: boolean; isWarmup: boolean }[] }[],
  restEndsAt: number | null,
  use24Hour = false,
  /** 15 Oct 2026: the workout timer is paused (the text then starts "Paused · "). */
  paused = false,
): string {
  const text = ongoingBody(exercises, restEndsAt, use24Hour);
  return paused ? `Paused · ${text}` : text;
}

function ongoingBody(
  exercises: { sets: { done: boolean; isWarmup: boolean }[] }[],
  restEndsAt: number | null,
  use24Hour: boolean,
): string {
  if (restEndsAt != null) return `Rest · next set at ${clockTime(restEndsAt, use24Hour)}`;
  let total = 0;
  let done = 0;
  for (const e of exercises) {
    for (const s of e.sets) {
      if (s.isWarmup) continue;
      total += 1;
      if (s.done) done += 1;
    }
  }
  if (total === 0) return 'Add an exercise to start';
  return `${done} of ${countWord(total, 'set')} done`;
}

/** The row the live card names (a change is a tick, or a set added / removed ahead of it). PURE. */
export function liveRow(c: Pick<LiveCard, 'exKey' | 'done'>): string {
  return JSON.stringify([c.exKey, c.done?.setKey ?? null]);
}

/**
 * v0.37.1 (C8): must the live card be posted now, past the re-wording throttle? Yes when it goes
 * up or down (a rest started or ended) or names another row than the one last posted.
 */
function mustPostNow(lastShown: boolean | null, lastRow: string): boolean {
  if (liveCardShown(useRestTimer.getState(), restCardHolds()) !== lastShown) return true;
  return liveRow(liveCardContent(useActiveWorkout.getState(), rowFill, displayUnits())) !== lastRow;
}

let started = false;

export function startWorkoutPresence(): () => void {
  if (started) return () => undefined;
  started = true;
  let last = '';
  /** The live card (native) is showing: the old quiet card has been removed. */
  let live = false;
  let liveTimer: ReturnType<typeof setTimeout> | null = null;
  let liveLastAt = 0;
  /** The live card was down for a rest (the next post after it is never skipped as unchanged). */
  let downForRest = false;
  let afterOver: ReturnType<typeof setTimeout> | null = null;
  const stopLiveTimer = (): void => {
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = null;
    if (afterOver) clearTimeout(afterOver);
    afterOver = null;
  };

  /** The live card as last posted: up or down, and the row it names (v0.37.1, C8). */
  let lastShown: boolean | null = null;
  let lastRow = '';

  /** Post the live card for the workout as it is now; false = no native card (use the old one). */
  const postLive = (): boolean => {
    if (!liveWorkoutCardAvailable()) return false;
    const w = useActiveWorkout.getState();
    const units = displayUnits();
    const card = liveCardContent(w, rowFill, units);
    const image = liveCardImage(w.exercises.find((e) => e.key === card.exKey));
    const shown = liveCardShown(useRestTimer.getState(), restCardHolds());
    // v0.37.1 (C1): the sets ahead, so "Complete set" works with the app closed (OfflineTick.kt).
    const images = new Map<string, string | null>();
    const imageFor = (exKey: string): string | null => {
      if (!images.has(exKey)) images.set(exKey, liveCardImage(w.exercises.find((e) => e.key === exKey)));
      return images.get(exKey) ?? null;
    };
    const plan = livePlan(w, rowFill, units, useRestTimer.getState().defaultSec, imageFor);
    const planJson = plan ? JSON.stringify(plan) : null;
    // R-55: the workout time in the card's header; the same every second while it runs (no re-post to tick).
    const clock = liveClock(w.startedAt, w, Date.now());
    const key = `live:${shown ? 'up' : 'down'}:${liveCardKey(card, image)}:${planJson ?? ''}:${JSON.stringify(clock)}`;
    if (key === last) return true;
    const ok = shown
      ? showLiveWorkoutCard(card.title, card.text, image, card.done, card.label, planJson, clock, card.watch ?? null)
      : hideLiveWorkoutCard(card.title, card.text, image, card.done, card.label, planJson, clock, card.watch ?? null);
    if (!ok) return false;
    lastShown = shown;
    lastRow = liveRow(card);
    if (shown && downForRest) {
      // Back after a rest: once more when an app-open "Rest is over" (60 s) has surely left.
      if (afterOver) clearTimeout(afterOver);
      afterOver = setTimeout(() => {
        afterOver = null;
        const now = useActiveWorkout.getState();
        if (!now.active || now.editingSessionId || now.pastLog || !liveCardShown(useRestTimer.getState(), restCardHolds())) return;
        last = '';
        postLive();
      }, AFTER_OVER_MS);
    }
    downForRest = !shown;
    last = key;
    liveLastAt = Date.now();
    if (!live) {
      live = true;
      void clearWorkoutOngoing(); // the old quiet card, if one was up
    }
    return true;
  };

  const update = (): void => {
    const w = useActiveWorkout.getState();
    const r = useRestTimer.getState();
    // v0.26.1: before the saved workout is read back, "no workout" is not known yet — a rest
    // the watch card kept running while the app was closed must survive until then.
    if (!w.active && !w.hydrated) return;
    if (!w.active || w.editingSessionId || w.pastLog) {
      if (last !== 'off') {
        last = 'off';
        stopLiveTimer();
        // Always (review fix): a card left by a killed app run goes too, as the old card does.
        // First, so the rest's clearing below never brings it back (WorkoutCard.restore).
        clearLiveWorkoutCard();
        live = false;
        downForRest = false;
        lastShown = null;
        lastRow = '';
        void clearWorkoutOngoing();
        // Also covers an alarm left by a previous app run that was killed mid-rest.
        if (!w.active) void cancelRestEnd();
      }
      if (!w.active && r.endsAt != null) r.skip(); // workout over → no stray bell
      return;
    }
    // 13 Oct 2026: the live card, when the native piece has it (at most every LIVE_CARD_EVERY_MS).
    if (live || last === '' || last === 'off') {
      const wait = LIVE_CARD_EVERY_MS - (Date.now() - liveLastAt);
      // v0.37.1 (C8): only re-wording (typing) waits. A tick (the card names another row) or the
      // card going up / down for a rest is posted AT ONCE: the native side brings the card back
      // with the last words it was given (a tick that skips a running rest showed the set just
      // done for up to 0.4 s).
      if (live && wait > 0 && !mustPostNow(lastShown, lastRow)) {
        if (!liveTimer) {
          liveTimer = setTimeout(() => {
            liveTimer = null;
            const now = useActiveWorkout.getState();
            if (now.active && !now.editingSessionId && !now.pastLog) postLive();
          }, wait);
        }
        return;
      }
      if (postLive()) return;
    }
    // RT-05: the rest card shows the rest (counting down); this card keeps the set count.
    const restForThisCard = r.endsAt != null && !restCardHolds() ? r.endsAt : null;
    const body = ongoingText(w.exercises, restForThisCard, phoneUses24Hour() === true, w.pausedAt != null);
    if (body === last) return;
    last = body;
    void showWorkoutOngoing('Workout in progress', body);
  };

  // v0.26.1: the watch card. Its buttons change the app's timer while JS runs; when the app
  // comes back (or starts) it catches up with whatever the card did meanwhile.
  let wasHydrated = useActiveWorkout.getState().hydrated;
  const catchUp = (): void => {
    const w = useActiveWorkout.getState();
    if (!w.active || w.editingSessionId || w.pastLog) return;
    const r = useRestTimer.getState();
    const step = reconcileWithCard({ endsAt: r.endsAt, onCard: restCardHolds() }, readRestCard(), Date.now());
    if (step.do === 'adopt') {
      // Re-post it: after a force-stop Android removed the card and its alarm, though the saved
      // rest stayed (review M1). Posting the same rest again is harmless otherwise. Posted first,
      // so the workout card (updated when the timer changes) knows the rest card holds it (RT-05).
      showRestCard(step.startedAt, step.endsAt, step.next, !useTrackerPrefs.getState().sounds);
      r.fromCard({ kind: 'adopt', endsAt: step.endsAt, startedAt: step.startedAt, next: step.next });
    } else if (step.do === 'stop') r.fromCard({ kind: 'stop' });
  };
  const offCard = onRestCardChange((c) => {
    const r = useRestTimer.getState();
    if (c.kind === 'add') r.fromCard(c);
    else if (c.kind === 'skip') r.fromCard({ kind: 'stop' });
  });
  const appState = AppState.addEventListener('change', (s) => {
    if (s !== 'active') return;
    // v0.37.1 (C2): the member is looking at the app: an old "Rest is over" has done its job; it
    // goes and the live card comes back (one at a time). A running rest is left alone.
    dismissRestOver();
    catchUp();
  });
  if (AppState.currentState === 'active') dismissRestOver();

  const u1 = useActiveWorkout.subscribe((s) => {
    if (s.hydrated && !wasHydrated) {
      wasHydrated = true;
      catchUp();
    }
    update();
  });
  const u2 = useRestTimer.subscribe(update);
  // The card's numbers follow the Targets (they are the rows' grey hints).
  const u5 = useTargets.subscribe(update);
  // RT-07 / RT-12: push alert choices to the native card as they change (and once now).
  setRestQuiet(!useTrackerPrefs.getState().sounds);
  setRestRingThroughDnd(useRestAlertPrefs.getState().ringThroughDnd);
  // R-55 (review): the rest-over sound only once the saved choice is read. Sending the default first
  // deleted a member's Bell / Beep / Whistle channels on every cold start, then made them again.
  let unhydrated: (() => void) | null = null;
  // No `persist` (a test's stand-in store): nothing to wait for.
  const saved = useTrackerPrefs.persist as typeof useTrackerPrefs.persist | undefined;
  if (!saved || saved.hasHydrated()) setRestSoundNative(useTrackerPrefs.getState().restSound);
  else {
    unhydrated = saved.onFinishHydration((p) => {
      unhydrated?.();
      unhydrated = null;
      setRestSoundNative(p.restSound);
    });
  }
  const u3 = useTrackerPrefs.subscribe((p, prev) => {
    if (p.sounds !== prev.sounds) setRestQuiet(!p.sounds);
    if (p.restSound !== prev.restSound) setRestSoundNative(p.restSound);
  });
  const u4 = useRestAlertPrefs.subscribe((p, prev) => {
    if (p.ringThroughDnd !== prev.ringThroughDnd) setRestRingThroughDnd(p.ringThroughDnd);
  });
  if (wasHydrated) catchUp();
  update();
  return () => {
    u1();
    u2();
    u3();
    unhydrated?.();
    u4();
    u5();
    stopLiveTimer();
    offCard();
    appState.remove();
    started = false;
  };
}
