/**
 * Boot gate + the data lifecycle actions, as UI state — Phase O2 (W1).
 *
 * `status` decides what the root layout renders:
 *   'loading'  DB is still opening
 *   'welcome'  no profile row → a real first run, show the welcome flow
 *   'ready'    a profile exists → the app
 *
 * Erasing flips the app back to 'welcome' in place, with no restart, because the
 * welcome flow is rendered instead of the navigator rather than pushed onto it.
 */
import { create } from 'zustand';

import { useChat } from '@/store/chatStore';
import { useDashboard } from '@/store/dashboardStore';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';

import type { OnboardingInput } from '../form';
import {
  ExistingDataError,
  completeOnboarding,
  eraseAllData,
  hasMemberProfile,
  isDemoData,
  loadDemoData,
} from '../db/dataActions';

export type BootStatus = 'loading' | 'welcome' | 'ready' | 'error';

export interface OnboardingState {
  status: BootStatus;
  /** True when the CURRENT data is the loaded demo, so the UI can say so. */
  demo: boolean;
  busy: boolean;
  /** Read the DB and decide what to render. Called once from the root layout. */
  boot: () => Promise<void>;
  /** Re-read the demo flag only (a restore/import can clear it mid-session). */
  refreshDemoFlag: () => Promise<void>;
  complete: (input: OnboardingInput) => Promise<void>;
  loadDemo: () => Promise<void>;
  erase: () => Promise<void>;
}

/**
 * Drop every in-memory cache that could still be holding pre-wipe rows (an
 * in-progress workout draft pointing at deleted exercises, a running rest timer,
 * the chat log, the dashboard snapshot). Without this the DB is empty but the UI
 * keeps showing ghosts until a restart.
 *
 * Best-effort by design: the DB transaction has already COMMITTED by the time this
 * runs, so a failure here must never make the caller report that the (irreversible)
 * action failed — that would show "nothing happened" over an emptied database.
 */
async function resetInMemoryState(): Promise<void> {
  try {
    useRestTimer.getState().skip();
    await useActiveWorkout.getState().discard();
    await Promise.all([useDashboard.getState().refresh(), useChat.getState().load()]);
  } catch {
    /* caches only — the committed write stands */
  }
}

export const useOnboarding = create<OnboardingState>()((set) => ({
  status: 'loading',
  demo: false,
  busy: false,

  boot: async () => {
    try {
      const [profile, demo] = await Promise.all([hasMemberProfile(), isDemoData()]);
      set({ status: profile ? 'ready' : 'welcome', demo });
    } catch {
      // NEVER fall back to 'welcome': a transient read failure on a device full of
      // real training would present a first-run screen over it. Show a retry
      // instead — the member's data is safe and untouched behind it.
      set({ status: 'error', demo: false });
    }
  },

  refreshDemoFlag: async () => {
    try {
      set({ demo: await isDemoData() });
    } catch {
      /* leave the last known value — this only drives a badge */
    }
  },

  complete: async (input) => {
    set({ busy: true });
    try {
      await completeOnboarding(input);
      await resetInMemoryState();
      set({ status: 'ready', demo: false, busy: false });
    } catch (err) {
      set({ busy: false });
      if (err instanceof ExistingDataError) {
        // The boot check was wrong (a failed read, a race): nothing was written.
        // Recover by re-reading and letting the member into their own app.
        await useOnboarding.getState().boot();
        return;
      }
      throw err;
    }
  },

  loadDemo: async () => {
    set({ busy: true });
    try {
      await loadDemoData();
      await resetInMemoryState();
      set({ status: 'ready', demo: true, busy: false });
    } catch (err) {
      set({ busy: false });
      throw err;
    }
  },

  erase: async () => {
    set({ busy: true });
    try {
      await eraseAllData();
      await resetInMemoryState();
      set({ status: 'welcome', demo: false, busy: false });
    } catch (err) {
      set({ busy: false });
      throw err;
    }
  },
}));
