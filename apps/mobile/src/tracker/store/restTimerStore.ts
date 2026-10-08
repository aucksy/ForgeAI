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
 */
import { AppState } from 'react-native';
import { create } from 'zustand';

import { getMeta, setMeta } from '@/db';
import { success } from '@/lib/haptics';

import { DEFAULT_REST_SEC } from '../services/restRules';
import { cancelRestEnd, scheduleRestEnd } from '../services/workoutAlerts';
import { playWorkoutSound } from '../services/workoutSounds';

const DEFAULT_KEY = 'restTimerDefaultSec';
const MIN_SEC = 5;
const MAX_SEC = 600;
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
  defaultSec: number;
  loaded: boolean;
  loadDefault: () => Promise<void>;
  setDefaultSec: (sec: number) => void;
  start: (sec?: number, nextLabel?: string | null) => void;
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
          playWorkoutSound('rest');
        }
        // Do NOT cancel/dismiss the scheduled alert here. In the background it is
        // the member's only alert, and it fires at this same moment — dismissing it
        // would delete it as it appears (seen on the device QA emulator). In the
        // foreground the alert handler suppresses it anyway.
        set({ endsAt: null });
      },
      Math.max(0, endsAt - Date.now()),
    );
  };

  return {
    endsAt: null,
    durationSec: DEFAULT_REST_SEC,
    startedAt: null,
    nextLabel: null,
    defaultSec: DEFAULT_REST_SEC,
    loaded: false,

    loadDefault: async () => {
      if (get().loaded) return;
      const raw = await getMeta(DEFAULT_KEY);
      const n = raw ? parseInt(raw, 10) : NaN;
      set({ defaultSec: Number.isFinite(n) && n >= 0 ? n : DEFAULT_REST_SEC, loaded: true });
    },

    setDefaultSec: (sec) => {
      // 0 = no default timer; otherwise clamp to a sane range.
      const clamped = sec <= 0 ? 0 : Math.max(MIN_SEC, Math.min(MAX_SEC, Math.round(sec)));
      set({ defaultSec: clamped, loaded: true });
      void setMeta(DEFAULT_KEY, String(clamped));
    },

    start: (sec, nextLabel = null) => {
      const dur = sec && sec > 0 ? sec : get().defaultSec;
      if (!dur || dur <= 0) return;
      const startedAt = Date.now();
      const endsAt = startedAt + dur * 1000;
      set({ endsAt, durationSec: dur, nextLabel, startedAt });
      arm(endsAt);
      void scheduleRestEnd(endsAt, nextLabel, startedAt);
    },

    addSec: (delta) => {
      const cur = get().endsAt;
      if (cur == null) return;
      const newEnds = Math.max(Date.now(), cur + delta * 1000);
      set({
        endsAt: newEnds,
        durationSec: Math.max(get().durationSec, Math.ceil((newEnds - Date.now()) / 1000)),
      });
      arm(newEnds);
      void scheduleRestEnd(newEnds, get().nextLabel, get().startedAt ?? Date.now());
    },

    skip: () => {
      clearExpiry();
      if (get().endsAt != null) set({ endsAt: null });
      void cancelRestEnd();
    },

    fromCard: (c) => {
      if (c.kind === 'stop') {
        clearExpiry();
        if (get().endsAt != null) set({ endsAt: null });
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
