/**
 * v0.26.1 — the rest timer on the watch (tracker plan Phase 5, option A). The card itself is
 * native (modules/forge-rest); these tests cover the app's side: what the card names as next,
 * how the app catches up with a card changed on the watch, and that a rest the card kept
 * running while the app was closed is not wiped before the saved workout is read back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { schedule: unknown[][]; cancel: number; ongoing: number } = { schedule: [], cancel: 0, ongoing: 0 };
vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async (...a: unknown[]) => {
    calls.schedule.push(a);
  },
  cancelRestEnd: async () => {
    calls.cancel += 1;
  },
  showWorkoutOngoing: async () => {
    calls.ongoing += 1;
  },
  clearWorkoutOngoing: async () => undefined,
}));
let card: { startedAt: number; endsAt: number; next: string | null } | null | undefined;
let cardListener: ((c: unknown) => void) | null = null;
const reposted: unknown[][] = [];
vi.mock('@/tracker/services/restCard', async (orig) => {
  const real = (await orig()) as typeof import('@/tracker/services/restCard');
  return {
    ...real,
    readRestCard: () => card,
    restCardHolds: () => true,
    showRestCard: (...a: unknown[]) => {
      reposted.push(a);
      return true;
    },
    onRestCardChange: (cb: (c: unknown) => void) => {
      cardListener = cb;
      return () => {
        cardListener = null;
      };
    },
  };
});
vi.mock('@/tracker/services/workoutSounds', () => ({ playWorkoutSound: () => undefined }));
vi.mock('@/lib/haptics', () => ({ success: () => undefined }));
vi.mock('@/db', () => ({ getMeta: async () => null, setMeta: async () => undefined }));
vi.mock('@/tracker/store/activeWorkoutStore', async () => {
  const { create } = await import('zustand');
  const useActiveWorkout = create(() => ({
    active: false,
    hydrated: false,
    editingSessionId: null as string | null,
    exercises: [] as unknown[],
  }));
  return { useActiveWorkout };
});
const appStateCbs: ((s: string) => void)[] = [];
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'background',
    addEventListener: (_e: string, cb: (s: string) => void) => {
      appStateCbs.push(cb);
      return { remove: () => undefined };
    },
  },
  Platform: { OS: 'test' },
}));

import { reconcileWithCard } from '@/tracker/services/restCard';
import { nextUpLabel } from '@/tracker/services/restRules';
import { startWorkoutPresence } from '@/tracker/services/workoutPresence';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import type { DraftExercise } from '@/tracker/store/activeWorkoutStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';

function ex(key: string, name: string, sets: { done?: boolean; warm?: boolean }[]): DraftExercise {
  return {
    key,
    name,
    sets: sets.map((s, i) => ({ key: `${key}-${i}`, done: !!s.done, isWarmup: !!s.warm, setType: s.warm ? 'warmup' : 'normal' })),
  } as unknown as DraftExercise;
}

describe('what the card names as next', () => {
  it('names the exercise and its next working set, warm-ups not counted', () => {
    const list = [ex('a', 'Bench Press', [{ warm: true, done: true }, { done: true }, { done: true }, {}])];
    expect(nextUpLabel(list, 'a')).toBe('Bench Press, set 3');
  });

  it('moves on to the next exercise after the last set', () => {
    const list = [ex('a', 'Bench Press', [{ done: true }, { done: true }]), ex('b', 'Row', [{ warm: true }, {}, {}])];
    expect(nextUpLabel(list, 'a')).toBe('Row, set 1');
  });

  it('goes back up the list for a skipped exercise, and says nothing when all is done', () => {
    const open = [ex('a', 'Squat', [{}]), ex('b', 'Curl', [{ done: true }])];
    expect(nextUpLabel(open, 'b')).toBe('Squat, set 1');
    const done = [ex('a', 'Squat', [{ done: true }]), ex('b', 'Curl', [{ done: true }])];
    expect(nextUpLabel(done, 'b')).toBeNull();
  });
});

describe('catching up with the card', () => {
  const now = 1_000_000;
  it('adopts a rest moved on the watch, or one the app never had', () => {
    const c = { startedAt: now - 30_000, endsAt: now + 75_000, next: 'Row, set 2' };
    expect(reconcileWithCard({ endsAt: now + 60_000, onCard: true }, c, now)).toEqual({ do: 'adopt', ...c });
    expect(reconcileWithCard({ endsAt: null, onCard: false }, c, now)).toEqual({ do: 'adopt', ...c });
    expect(reconcileWithCard({ endsAt: c.endsAt, onCard: true }, c, now)).toEqual({ do: 'nothing' });
  });

  it('stops a rest skipped on the watch; leaves alone a build without the card', () => {
    expect(reconcileWithCard({ endsAt: now + 60_000, onCard: true }, null, now)).toEqual({ do: 'stop' });
    expect(reconcileWithCard({ endsAt: now + 60_000, onCard: false }, null, now)).toEqual({ do: 'nothing' });
    expect(reconcileWithCard({ endsAt: now + 60_000, onCard: true }, undefined, now)).toEqual({ do: 'nothing' });
  });
});

describe('the app timer and the card', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    calls.schedule = [];
    calls.cancel = 0;
    card = undefined;
    useRestTimer.setState({ endsAt: null, startedAt: null, defaultSec: 90, loaded: true, durationSec: 90 });
    useActiveWorkout.setState({ active: false, hydrated: false, editingSessionId: null, exercises: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('hands the card the start time, so its length stays right after +15 s in the app', () => {
    useRestTimer.getState().start(90, 'Bench Press, set 2');
    vi.advanceTimersByTime(10_000);
    useRestTimer.getState().addSec(15);
    expect(calls.schedule[0]).toEqual([1_090_000, 'Bench Press, set 2', 1_000_000]);
    expect(calls.schedule[1]).toEqual([1_105_000, 'Bench Press, set 2', 1_000_000]);
  });

  it('takes "+15 s" and "Skip" from the watch without telling the card back', () => {
    useRestTimer.getState().start(90, null);
    useRestTimer.getState().fromCard({ kind: 'add', endsAt: 1_105_000, startedAt: 1_000_000 });
    expect(useRestTimer.getState().endsAt).toBe(1_105_000);
    useRestTimer.getState().fromCard({ kind: 'stop' });
    expect(useRestTimer.getState().endsAt).toBeNull();
    expect(calls.schedule.length).toBe(1);
    expect(calls.cancel).toBe(0);
    vi.advanceTimersByTime(200_000); // the old end never rings
    expect(useRestTimer.getState().endsAt).toBeNull();
  });

  it('keeps the card running until the saved workout is read back, then adopts it', () => {
    card = { startedAt: 990_000, endsAt: 1_060_000, next: 'Row, set 2' };
    const stop = startWorkoutPresence();
    // Before v0.26.1 this first look ("no workout yet") cancelled the rest at once.
    expect(calls.cancel).toBe(0);
    useActiveWorkout.setState({ active: true, hydrated: true, exercises: [] });
    expect(useRestTimer.getState().endsAt).toBe(1_060_000);
    expect(useRestTimer.getState().nextLabel).toBe('Row, set 2');
    expect(calls.cancel).toBe(0);
    // Review M1: a force-stop removed the card and its alarm, so the adopted rest is posted again.
    expect(reposted.at(-1)).toEqual([990_000, 1_060_000, 'Row, set 2', false]); // + quiet: "Workout sounds" on
    stop();
  });

  it('still clears up when the read-back finds no workout', () => {
    const stop = startWorkoutPresence();
    useActiveWorkout.setState({ active: false, hydrated: true });
    expect(calls.cancel).toBe(1);
    stop();
  });

  it('catches up when the app comes back from the background', () => {
    useActiveWorkout.setState({ active: true, hydrated: true, exercises: [] });
    const stop = startWorkoutPresence();
    useRestTimer.getState().start(90, null);
    card = null; // skipped on the watch while the app slept
    appStateCbs.at(-1)?.('active');
    expect(useRestTimer.getState().endsAt).toBeNull();
    // ...and a live "+15 s" from the watch while the app runs
    useRestTimer.getState().start(90, null);
    cardListener?.({ kind: 'add', endsAt: 1_105_000, startedAt: 1_000_000 });
    expect(useRestTimer.getState().endsAt).toBe(1_105_000);
    stop();
  });
});
