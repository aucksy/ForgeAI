/**
 * Rest timer — the countdown between sets.
 *
 * Phase 1 (Hevy parity) changes:
 *  - The timer lives HERE, not in the on-screen bar, so it keeps counting while the
 *    workout is minimised and the member looks at other tabs.
 *  - At zero it vibrates and plays the rest bell (when the app is open). A phone
 *    notification is scheduled for the same moment, so a locked phone or a
 *    backgrounded app still sounds — see `workoutAlerts`.
 *  - If the app was in the background when the rest ended, coming back must not
 *    fire a second, late alert — the notification already did that job.
 *
 * The default rest length is stored in the frozen `meta` table (unchanged key).
 *
 * Phase 2, packet D:
 *  - RT-03 / LW-29: the rest remembers the set whose tick started it (`source`); unticking
 *    that set (or the second tap of a quick double tap) cancels the rest, card and alarm too.
 *  - RT-04: "−15" past zero ends the rest quietly, like Skip — no bell, no "Rest is over".
 *  - RT-08: the in-app bell follows the ringer: silent or vibrate → no sound (the haptic stays).
 *  - RT-11: saving the default rest reports whether it was kept.
 */
import { AppState } from 'react-native';
import { create } from 'zustand';

import { getMeta, setMeta } from '@/db';
import { success } from '@/lib/haptics';

import { ringerMode } from '../services/restCard';
import { DEFAULT_REST_SEC, REST_MAX_SEC, REST_MIN_SEC } from '../services/restRules';
import { cancelRestEnd, scheduleRestEnd } from '../services/workoutAlerts';
import { playWorkoutSound } from '../services/workoutSounds';

const DEFAULT_KEY = 'restTimerDefaultSec';
const MIN_SEC = REST_MIN_SEC;
const MAX_SEC = REST_MAX_SEC;
/** A tick noted this recently is the one a `start` belongs to (both run in the same tap). */
const TICK_LINK_MS = 2000;

/** The set whose tick started a rest. */
export interface RestSource {
  exKey: string;
  setKey: string;
}
/** Later than this past zero = the app was asleep; the notification already alerted. */
const LATE_MS = 1500;

export interface RestTimerState {
  /** Epoch ms when the current rest ends, or null when no timer is running. */
  endsAt: number | null;
  /** Configured length of the current timer (for the progress bar). */
  durationSec: number;
  /** Epoch ms the current rest began (the watch card shows endsAt − startedAt as its length). */
  startedAt: number | null;
  /** What comes next, for the notification text ("Bench Press"). */
  nextLabel: string | null;
  /** RT-03: the set whose tick started this rest (null: adopted from the card, or unknown). */
  source: RestSource | null;
  defaultSec: number;
  loaded: boolean;
  loadDefault: () => Promise<void>;
  /** RT-11: resolves false when the choice could not be saved (it still applies until restart). */
  setDefaultSec: (sec: number) => Promise<boolean>;
  start: (sec?: number, nextLabel?: string | null) => void;
  /** RT-03: a set was just ticked; a rest started in the same tap belongs to it. */
  noteTick: (exKey: string, setKey: string) => void;
  /** RT-03: this set was unticked; if its tick started the running rest, cancel that rest. */
  cancelIfStartedBy: (exKey: string, setKey: string) => void;
  addSec: (delta: number) => void;
  skip: () => void;
  /**
   * v0.26.1: the rest was changed on the watch card ("+15 s" / "Skip") or the card's rest is
   * adopted after the app slept. Changes the app's timer only — the card already knows.
   */
  fromCard: (c: { kind: 'add'; endsAt: number; startedAt: number } | { kind: 'stop' } | {
    kind: 'adopt';
    endsAt: number;
    startedAt: number;
    next: string | null;
  }) => void;
}

let expiry: ReturnType<typeof setTimeout> | null = null;
let pendingTick: (RestSource & { at: number }) | null = null;

/** RT-08: may the bell make a sound? Silent or vibrate → no; unknown (no native piece) → yes. */
function ringerAllowsSound(): boolean {
  try {
    const m = ringerMode();
    return m == null || m === 'normal';
  } catch {
    return true;
  }
}
function clearExpiry(): void {
  if (expiry) clearTimeout(expiry);
  expiry = null;
}

export const useRestTimer = create<RestTimerState>()((set, get) => {
  const arm = (endsAt: number): void => {
    clearExpiry();
    expiry = setTimeout(
      () => {
        expiry = null;
        const cur = get().endsAt;
        if (cur !== endsAt) return; // moved or skipped meanwhile
        // In the background the scheduled notification makes the sound — playing the
        // bell too would ring twice.
        if (Date.now() - endsAt <= LATE_MS && AppState.currentState === 'active') {
          success();
          if (ringerAllowsSound()) playWorkoutSound('rest');
        }
        // Do NOT cancel/dismiss the scheduled alert here. In the background it is
        // the member's only alert, and it fires at this same moment — dismissing it
        // would delete it as it appears (seen on the device QA emulator). In the
        // foreground the alert handler suppresses it anyway.
        set({ endsAt: null, source: null });
      },
      Math.max(0, endsAt - Date.now()),
    );
  };

  return {
    endsAt: null,
    durationSec: DEFAULT_REST_SEC,
    startedAt: null,
    nextLabel: null,
    source: null,
    defaultSec: DEFAULT_REST_SEC,
    loaded: false,

    loadDefault: async () => {
      if (get().loaded) return;
      const raw = await getMeta(DEFAULT_KEY);
      const n = raw ? parseInt(raw, 10) : NaN;
      set({ defaultSec: Number.isFinite(n) && n >= 0 ? n : DEFAULT_REST_SEC, loaded: true });
    },

    setDefaultSec: async (sec) => {
      // 0 = no default timer; otherwise clamp to a sane range.
      const clamped = sec <= 0 ? 0 : Math.max(MIN_SEC, Math.min(MAX_SEC, Math.round(sec)));
      set({ defaultSec: clamped, loaded: true });
      try {
        await setMeta(DEFAULT_KEY, String(clamped));
        return true;
      } catch {
        return false;
      }
    },

    start: (sec, nextLabel = null) => {
      const dur = sec && sec > 0 ? sec : get().defaultSec;
      if (!dur || dur <= 0) return;
      const startedAt = Date.now();
      const endsAt = startedAt + dur * 1000;
      const t = pendingTick;
      pendingTick = null;
      const source = t && startedAt - t.at <= TICK_LINK_MS ? { exKey: t.exKey, setKey: t.setKey } : null;
      arm(endsAt);
      // Hand the rest to the card BEFORE the state changes, so the "Workout in progress" card
      // (updated on that change) already knows the rest card shows the rest (RT-05).
      void scheduleRestEnd(endsAt, nextLabel, startedAt);
      set({ endsAt, durationSec: dur, nextLabel, startedAt, source });
    },

    noteTick: (exKey, setKey) => {
      pendingTick = { exKey, setKey, at: Date.now() };
    },

    cancelIfStartedBy: (exKey, setKey) => {
      if (pendingTick && pendingTick.exKey === exKey && pendingTick.setKey === setKey) pendingTick = null;
      const s = get();
      if (s.endsAt == null || !s.source) return;
      if (s.source.exKey !== exKey || s.source.setKey !== setKey) return;
      get().skip();
    },

    addSec: (delta) => {
      const cur = get().endsAt;
      if (cur == null) return;
      // RT-04: taken down past zero → the member is ready; end quietly, like Skip.
      if (cur + delta * 1000 <= Date.now()) {
        get().skip();
        return;
      }
      const newEnds = cur + delta * 1000;
      set({
        endsAt: newEnds,
        durationSec: Math.max(get().durationSec, Math.ceil((newEnds - Date.now()) / 1000)),
      });
      arm(newEnds);
      void scheduleRestEnd(newEnds, get().nextLabel, get().startedAt ?? Date.now());
    },

    skip: () => {
      clearExpiry();
      if (get().endsAt != null || get().source) set({ endsAt: null, source: null });
      void cancelRestEnd();
    },

    fromCard: (c) => {
      if (c.kind === 'stop') {
        clearExpiry();
        if (get().endsAt != null || get().source) set({ endsAt: null, source: null });
        return;
      }
      const now = Date.now();
      if (c.endsAt <= now) return;
      const left = Math.ceil((c.endsAt - now) / 1000);
      if (c.kind === 'adopt') {
        // The app slept (or restarted) while the card ran: take the card's rest as it is.
        set({
          endsAt: c.endsAt,
          startedAt: c.startedAt,
          durationSec: Math.max(left, Math.round((c.endsAt - c.startedAt) / 1000)),
          nextLabel: c.next,
          source: null,
        });
      } else {
        set({ endsAt: c.endsAt, startedAt: c.startedAt, durationSec: Math.max(get().durationSec, left) });
      }
      arm(c.endsAt);
    },
  };
});

/** Seconds left on the running timer (0 when none). */
export function restRemainingSec(endsAt: number | null, durationSec: number, now: number): number {
  if (endsAt == null) return 0;
  return Math.min(durationSec, Math.max(0, Math.ceil((endsAt - now) / 1000)));
}
