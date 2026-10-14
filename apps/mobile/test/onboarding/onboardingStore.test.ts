/**
 * Phase O2 (W1) — the boot gate.
 *
 * `status` decides whether a member sees the first-run welcome screen or their
 * app, and completing the welcome screen wipes the database. So the dangerous
 * case is not "does onboarding work" but "can the app EVER show a first-run
 * screen to someone who already has training". These tests pin that it can't.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  state: {
    hasProfile: false,
    demo: false,
    throwOnRead: false,
    completeError: null as Error | null,
    completed: 0,
    erased: 0,
    demoLoaded: 0,
    resets: 0,
    eraseFailed: [] as string[],
    eraseError: null as Error | null,
  },
  // Declared inside vi.hoisted so the mock factory (also hoisted) can reference it.
  FakeExistingDataError: class FakeExistingDataError extends Error {},
}));

vi.mock('@/onboarding/db/dataActions', () => ({
  ExistingDataError: h.FakeExistingDataError,
  hasMemberProfile: async () => {
    if (h.state.throwOnRead) throw new Error('database is locked');
    return h.state.hasProfile;
  },
  isDemoData: async () => {
    if (h.state.throwOnRead) throw new Error('database is locked');
    return h.state.demo;
  },
  completeOnboarding: async () => {
    if (h.state.completeError) throw h.state.completeError;
    h.state.completed += 1;
    h.state.hasProfile = true;
  },
  eraseAllData: async () => {
    if (h.state.eraseError) throw h.state.eraseError;
    h.state.erased += 1;
    h.state.hasProfile = false;
    h.state.demo = false;
    return h.state.eraseFailed;
  },
  loadDemoData: async () => {
    h.state.demoLoaded += 1;
    h.state.hasProfile = true;
    h.state.demo = true;
  },
}));

// The caches reset() touches — each records that it ran, and the workout draft can
// be made to fail so we can prove a committed wipe is not reported as a failure.
const failing = { discard: false };
vi.mock('@/tracker/store/activeWorkoutStore', () => ({
  useActiveWorkout: {
    getState: () => ({
      discard: async () => {
        h.state.resets += 1;
        if (failing.discard) throw new Error('meta write failed');
      },
    }),
  },
}));
vi.mock('@/tracker/store/restTimerStore', () => ({
  useRestTimer: { getState: () => ({ skip: () => undefined }) },
}));
vi.mock('@/store/chatStore', () => ({
  useChat: { getState: () => ({ load: async () => undefined }) },
}));
vi.mock('@/store/dashboardStore', () => ({
  useDashboard: { getState: () => ({ refresh: async () => undefined }) },
}));
// v0.25.1: the body figure the member chose in Profile.
const prefs = vi.hoisted(() => ({ figure: 'female' as 'male' | 'female' }));
vi.mock('@/tracker/store/trackerPrefsStore', () => ({
  useTrackerPrefs: { getState: () => ({ setBodyFigure: (f: 'male' | 'female') => (prefs.figure = f) }) },
}));

import { useOnboarding } from '@/onboarding/store/onboardingStore';
import type { OnboardingInput } from '@/onboarding/form';

const INPUT = {
  name: 'Rahul Sharma',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 0,
  heightCm: 0,
  gymName: '',
  bodyWeightKg: null,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
} satisfies OnboardingInput;

beforeEach(() => {
  h.state.hasProfile = false;
  h.state.demo = false;
  h.state.throwOnRead = false;
  h.state.completeError = null;
  h.state.completed = 0;
  h.state.erased = 0;
  h.state.demoLoaded = 0;
  h.state.resets = 0;
  h.state.eraseFailed = [];
  h.state.eraseError = null;
  failing.discard = false;
  useOnboarding.setState({ status: 'loading', demo: false, busy: false });
});

describe('boot', () => {
  it('shows the welcome flow only when there is genuinely no profile', async () => {
    await useOnboarding.getState().boot();
    expect(useOnboarding.getState().status).toBe('welcome');
  });

  it('goes straight into the app when a profile exists (every pre-O2 install)', async () => {
    h.state.hasProfile = true;
    await useOnboarding.getState().boot();
    expect(useOnboarding.getState().status).toBe('ready');
  });

  it('NEVER falls back to the welcome flow when the read fails', async () => {
    // A first-run screen over a device full of real training would invite the
    // member to "set up", and setting up wipes. Retry instead.
    h.state.hasProfile = true;
    h.state.throwOnRead = true;
    await useOnboarding.getState().boot();
    expect(useOnboarding.getState().status).toBe('error');
  });

  it('recovers from the error state once the read works again', async () => {
    h.state.hasProfile = true;
    h.state.throwOnRead = true;
    await useOnboarding.getState().boot();
    h.state.throwOnRead = false;
    await useOnboarding.getState().boot();
    expect(useOnboarding.getState().status).toBe('ready');
  });

  it('carries the demo flag through', async () => {
    h.state.hasProfile = true;
    h.state.demo = true;
    await useOnboarding.getState().boot();
    expect(useOnboarding.getState().demo).toBe(true);
  });
});

describe('complete', () => {
  it('enters the app and clears the demo flag', async () => {
    await useOnboarding.getState().complete(INPUT);
    expect(h.state.completed).toBe(1);
    expect(useOnboarding.getState()).toMatchObject({ status: 'ready', demo: false, busy: false });
  });

  it('re-boots into the app (rather than surfacing an error) when the DB turns out to hold data', async () => {
    h.state.completeError = new h.FakeExistingDataError();
    h.state.hasProfile = true;
    await useOnboarding.getState().complete(INPUT);
    expect(useOnboarding.getState().status).toBe('ready');
    expect(useOnboarding.getState().busy).toBe(false);
  });

  it('rethrows a genuine write failure and stays on the welcome screen', async () => {
    useOnboarding.setState({ status: 'welcome' });
    h.state.completeError = new Error('disk full');
    await expect(useOnboarding.getState().complete(INPUT)).rejects.toThrow('disk full');
    expect(useOnboarding.getState()).toMatchObject({ status: 'welcome', busy: false });
  });
});

describe('erase / loadDemo', () => {
  it('erase returns to the welcome flow', async () => {
    useOnboarding.setState({ status: 'ready', demo: true });
    await useOnboarding.getState().erase();
    expect(h.state.erased).toBe(1);
    expect(useOnboarding.getState()).toMatchObject({ status: 'welcome', demo: false, busy: false });
  });

  it('v0.25.1 review: erase puts the body figure back on the default (before: the next member kept the last one\'s)', async () => {
    prefs.figure = 'female';
    useOnboarding.setState({ status: 'ready' });
    await useOnboarding.getState().erase();
    expect(prefs.figure).toBe('male');
    // Loading demo data is not an erase: the figure stays as chosen.
    prefs.figure = 'female';
    await useOnboarding.getState().loadDemo();
    expect(prefs.figure).toBe('female');
  });

  it('a cache-reset failure does NOT report the committed erase as failed', async () => {
    // Reporting "could not erase" over an emptied database would tell the member
    // nothing happened and invite them to run it again.
    useOnboarding.setState({ status: 'ready' });
    failing.discard = true;
    await expect(useOnboarding.getState().erase()).resolves.toEqual([]);
    expect(useOnboarding.getState().status).toBe('welcome');
  });

  it('audit H1: leaves for the welcome screen only after a full erase', async () => {
    useOnboarding.setState({ status: 'ready', demo: true });
    const left: string[] = [];
    await expect(useOnboarding.getState().erase({ beforeWelcome: () => left.push(useOnboarding.getState().status) })).resolves.toEqual([]);
    // The screen was left while the app was still showing (before the welcome screen replaced it).
    expect(left).toEqual(['ready']);
    expect(useOnboarding.getState().status).toBe('welcome');
  });

  it('audit H1: a step left behind keeps the member on the screen and names it', async () => {
    useOnboarding.setState({ status: 'ready', demo: true });
    h.state.eraseFailed = ['ai-keys', 'drive-link'];
    const leave = vi.fn();
    await expect(useOnboarding.getState().erase({ beforeWelcome: leave })).resolves.toEqual(['ai-keys', 'drive-link']);
    expect(leave).not.toHaveBeenCalled();
    expect(useOnboarding.getState()).toMatchObject({ status: 'ready', demo: false, busy: false });
    // "Start over anyway": then the welcome screen, after leaving.
    await useOnboarding.getState().welcomeAfterErase(leave);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(useOnboarding.getState().status).toBe('welcome');
  });

  it('audit H1: a database that could not be wiped throws, and nothing moves', async () => {
    useOnboarding.setState({ status: 'ready' });
    h.state.eraseError = new Error('disk I/O error');
    const leave = vi.fn();
    await expect(useOnboarding.getState().erase({ beforeWelcome: leave })).rejects.toThrow('disk I/O error');
    expect(leave).not.toHaveBeenCalled();
    expect(useOnboarding.getState()).toMatchObject({ status: 'ready', busy: false });
  });

  it('loadDemo enters the app flagged as demo', async () => {
    await useOnboarding.getState().loadDemo();
    expect(h.state.demoLoaded).toBe(1);
    expect(useOnboarding.getState()).toMatchObject({ status: 'ready', demo: true, busy: false });
  });

  it('drops the in-memory caches on every destructive action', async () => {
    await useOnboarding.getState().erase();
    await useOnboarding.getState().loadDemo();
    await useOnboarding.getState().complete(INPUT);
    expect(h.state.resets).toBe(3);
  });

  it('refreshDemoFlag re-reads the flag (a restore can clear it mid-session)', async () => {
    useOnboarding.setState({ demo: true });
    h.state.demo = false;
    await useOnboarding.getState().refreshDemoFlag();
    expect(useOnboarding.getState().demo).toBe(false);
  });
});
