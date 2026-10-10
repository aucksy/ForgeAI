/**
 * Boot gate + the data lifecycle actions, as UI state — Phase O2 (W1).
 *
 * `status` decides what the root layout renders:
 *   'loading'  DB is still opening
 *   'welcome'  no profile row → a real first run, show the welcome flow
 *   'ready'    a profile exists → the app
 *   'error'    start-up failed (see `bootError`) → the error screen, never the app
 *
 * Erasing flips the app back to 'welcome' in place, with no restart, because the
 * welcome flow is rendered instead of the navigator rather than pushed onto it.
 */
import { create } from 'zustand';

import { initDb, resetDb } from '@/db';
import { startupStep } from '@/db/startupError';
import { useChat } from '@/store/chatStore';
import { syncExerciseCatalog } from '@/tracker/catalog/catalogSync';
import { initTrackerSchema } from '@/tracker/db/trackerSchema';
import { useDashboard } from '@/store/dashboardStore';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { phoneAfterErase } from '@/tracker/phone/phoneSync';
import { useRestTimer } from '@/tracker/store/restTimerStore';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

import { bootFailureFrom, type BootFailure } from '../bootFailure';
import { initMemberSchema } from '../db/memberSchema';
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
  /** Why start-up failed, when `status` is 'error' (null otherwise). */
  bootError: BootFailure | null;
  /**
   * The whole start-up, called once from the root layout: open the database, run EVERY
   * upgrade step, sync the bundled exercise library, then `boot()`. Any open or upgrade
   * failure lands on 'error' — the app never opens on a half-upgraded database (DS-08).
   */
  start: () => Promise<void>;
  /** The error screen's "Try again": drop the database handle and run `start()` again (SH-11). */
  retry: () => Promise<void>;
  /** Read the DB and decide what to render (the database must already be open). */
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
    // v0.27.0: reminders and Health Connect sending off, widgets blank (a fresh start).
    await phoneAfterErase();
  } catch {
    /* caches only — the committed write stands */
  }
}

/** One start-up at a time: a double tap on "Try again" joins the run already going. */
let startRun: Promise<void> | null = null;

async function openAndUpgrade(): Promise<void> {
  await initDb(); // tags its own failures 'open' / 'upgrade'
  await startupStep('upgrade', async () => {
    await initTrackerSchema(); // additive tracker columns
    await initMemberSchema(); // additive member columns (phone)
  });
  // Phase 2: once per library version, link this member's exercises to the bundled library
  // and add the new ones (a fresh install gets the whole library at onboarding instead). A
  // failure never blocks the app — it retries next launch. (Not an upgrade step: the app
  // works without it, and the exercise reads do not depend on it.)
  if (await hasMemberProfile().catch(() => false)) await syncExerciseCatalog().catch(() => false);
}

export const useOnboarding = create<OnboardingState>()((set, get) => ({
  status: 'loading',
  demo: false,
  busy: false,
  bootError: null,

  start: () => {
    startRun ??= (async () => {
      try {
        await openAndUpgrade();
      } catch (e) {
        // Logged so a phone test's JS-error scan sees it; the screen shows plain words.
        console.error('[boot] start-up failed:', e);
        set({ status: 'error', demo: false, bootError: bootFailureFrom(e) });
        return;
      }
      await get().boot();
    })().finally(() => {
      startRun = null;
    });
    return startRun;
  },

  retry: async () => {
    if (startRun) return startRun;
    set({ status: 'loading', bootError: null });
    await resetDb();
    await get().start();
  },

  boot: async () => {
    try {
      const [profile, demo] = await Promise.all([hasMemberProfile(), isDemoData()]);
      set({ status: profile ? 'ready' : 'welcome', demo, bootError: null });
    } catch (e) {
      // NEVER fall back to 'welcome': a transient read failure on a device full of
      // real training would present a first-run screen over it. Show a retry
      // instead — the member's data is safe and untouched behind it.
      console.error('[boot] reading the database failed:', e);
      set({ status: 'error', demo: false, bootError: bootFailureFrom(e) });
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
      // v0.25.1: the body figure is the member's own choice — the next member on this phone
      // starts on the default figure, like a fresh install.
      try {
        useTrackerPrefs.getState().setBodyFigure('male');
      } catch {
        /* a preference only — the erase stands */
      }
      set({ status: 'welcome', demo: false, busy: false });
    } catch (err) {
      set({ busy: false });
      throw err;
    }
  },
}));
