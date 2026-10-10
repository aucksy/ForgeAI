/**
 * Phase 2, packet D — a rest timer you never miss (RT-02 … RT-11, LW-29, owner decision D8 = A).
 * Each test fails on the code before this packet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = { schedule: [] as unknown[][], cancel: 0, sound: 0, haptic: 0 };
let ringer: 'normal' | 'vibrate' | 'silent' | null = 'normal';
let metaFails = false;
vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async (...a: unknown[]) => {
    calls.schedule.push(a);
  },
  cancelRestEnd: async () => {
    calls.cancel += 1;
  },
}));
vi.mock('@/tracker/services/restCard', async (orig) => {
  const real = (await orig()) as typeof import('@/tracker/services/restCard');
  return { ...real, ringerMode: () => ringer };
});
vi.mock('@/tracker/services/workoutSounds', () => ({
  playWorkoutSound: () => {
    calls.sound += 1;
  },
}));
vi.mock('@/lib/haptics', () => ({
  success: () => {
    calls.haptic += 1;
  },
}));
vi.mock('@/db', () => ({
  getDb: () => {
    throw new Error('no db in unit tests');
  },
  getMeta: async () => null,
  setMeta: async () => {
    if (metaFails) throw new Error('disk full');
  },
}));
// react-native and the other native packages share one stub file, so this stands in for all of
// them: the app is on screen; anything else behaves like the stub (a function that throws).
vi.mock('react-native', () => {
  const fixed: Record<string, unknown> = { AppState: { currentState: 'active' }, Platform: { OS: 'test' } };
  const stub: unknown = new Proxy(
    {},
    {
      has: () => true,
      get(_t, k) {
        if (k === 'default') return stub;
        if (k === '__esModule') return true;
        if (k === 'then' || typeof k === 'symbol') return undefined;
        if (k in fixed) return fixed[k];
        return () => {
          throw new Error(`native ${String(k)} in a unit test`);
        };
      },
    },
  );
  return stub as Record<string, unknown>;
});

import { REST_CHOICES, parseCustomRest } from '@/tracker/services/restRules';
import { restAlertStatus, shouldAskExact } from '@/tracker/services/restAlertAccess';
import { clockTime, ongoingText } from '@/tracker/services/workoutPresence';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';

function set(key: string, patch: Partial<DraftSet> = {}): DraftSet {
  return { key, weightKg: 60, reps: 8, isWarmup: false, done: false, ...patch };
}
function bench(sets: DraftSet[]): DraftExercise {
  return { key: 'e1', exerciseId: 'bench', name: 'Bench', muscleGroup: 'chest', equipment: 'barbell', previousSets: [], sets };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  calls.schedule = [];
  calls.cancel = 0;
  calls.sound = 0;
  calls.haptic = 0;
  ringer = 'normal';
  metaFails = false;
  useRestTimer.setState({ endsAt: null, startedAt: null, defaultSec: 90, loaded: true, durationSec: 90, source: null });
  useActiveWorkout.setState({ active: true, startedAt: 1_000_000, editingSessionId: null, exercises: [] });
});
afterEach(() => vi.useRealTimers());

describe('RT-03 / LW-29: unticking the set that started the rest', () => {
  it('cancels that rest', () => {
    useActiveWorkout.setState({ exercises: [bench([set('s1'), set('s2')])] });
    const st = useActiveWorkout.getState();
    st.toggleDone('e1', 's1');
    useRestTimer.getState().start(90, 'Bench, set 2');
    expect(useRestTimer.getState().endsAt).not.toBeNull();
    st.toggleDone('e1', 's1'); // untick
    expect(useRestTimer.getState().endsAt).toBeNull();
    expect(calls.cancel).toBe(1);
  });

  it('a quick double tap leaves no rest running', () => {
    useActiveWorkout.setState({ exercises: [bench([set('s1')])] });
    const st = useActiveWorkout.getState();
    st.toggleDone('e1', 's1');
    useRestTimer.getState().start(90, null);
    st.toggleDone('e1', 's1'); // second tap of the double tap
    expect(useRestTimer.getState().endsAt).toBeNull();
    vi.advanceTimersByTime(100_000);
    expect(calls.sound).toBe(0);
  });

  it('unticking a different set leaves the rest alone', () => {
    useActiveWorkout.setState({ exercises: [bench([set('s1', { done: true }), set('s2')])] });
    const st = useActiveWorkout.getState();
    st.toggleDone('e1', 's2');
    useRestTimer.getState().start(90, null);
    st.toggleDone('e1', 's1'); // an older set
    expect(useRestTimer.getState().endsAt).not.toBeNull();
  });
});

describe('RT-04: −15 with less than 15 s left', () => {
  it('ends the rest quietly — no bell, no haptic, no "Rest is over"', () => {
    useRestTimer.getState().start(30, null);
    vi.advanceTimersByTime(20_000);
    useRestTimer.getState().addSec(-15);
    expect(useRestTimer.getState().endsAt).toBeNull();
    vi.advanceTimersByTime(1_000);
    expect(calls.sound).toBe(0);
    expect(calls.haptic).toBe(0);
    expect(calls.cancel).toBe(1); // card and alarm cleared, nothing posted
    expect(calls.schedule).toHaveLength(1); // only the start; no re-post ending "now"
  });
});

describe('RT-08: the bell follows the ringer', () => {
  it('rings on normal, stays silent on vibrate and silent', () => {
    useRestTimer.getState().start(10, null);
    vi.advanceTimersByTime(10_000);
    expect(calls.sound).toBe(1);
    ringer = 'vibrate';
    useRestTimer.getState().start(10, null);
    vi.advanceTimersByTime(10_000);
    expect(calls.sound).toBe(1);
    expect(calls.haptic).toBe(2);
    ringer = 'silent';
    useRestTimer.getState().start(10, null);
    vi.advanceTimersByTime(10_000);
    expect(calls.sound).toBe(1);
  });
});

describe('RT-11: a default rest that cannot be saved says so', () => {
  it('reports failure instead of claiming it was kept', async () => {
    metaFails = true;
    await expect(useRestTimer.getState().setDefaultSec(120)).resolves.toBe(false);
    metaFails = false;
    await expect(useRestTimer.getState().setDefaultSec(150)).resolves.toBe(true);
    expect(useRestTimer.getState().defaultSec).toBe(150);
  });
});

describe('RT-09: longer rests and a custom length', () => {
  it('offers up to 10:00', () => {
    expect(REST_CHOICES).toEqual([0, 30, 45, 60, 90, 120, 150, 180, 210, 240, 300, 360, 480, 600]);
  });
  it('reads minutes and seconds typed by the member', () => {
    expect(parseCustomRest('7', '')).toBe(420);
    expect(parseCustomRest('2', '45')).toBe(165);
    expect(parseCustomRest('', '20')).toBe(20);
    expect(parseCustomRest('10', '30')).toBeNull(); // over 10:00
    expect(parseCustomRest('0', '3')).toBeNull(); // under 0:05
    expect(parseCustomRest('1', '75')).toBeNull();
    expect(parseCustomRest('a', '')).toBeNull();
    expect(parseCustomRest('', '')).toBeNull();
  });
});

describe('RT-05: one card during a rest, the phone\'s own clock', () => {
  const exercises = [{ sets: [{ done: true, isWarmup: false }, { done: false, isWarmup: false }] }];
  it('keeps the set count while the rest card shows the rest', () => {
    expect(ongoingText(exercises, null)).toBe('1 of 2 sets done');
  });
  it('uses the 24-hour clock when the phone does', () => {
    const at = new Date(2026, 9, 5, 18, 42).getTime();
    expect(clockTime(at, true)).toBe('18:42');
    expect(clockTime(new Date(2026, 9, 5, 0, 5).getTime(), true)).toBe('00:05');
    expect(ongoingText(exercises, at, true)).toBe('Resting · next set at 18:42');
    expect(ongoingText(exercises, at)).toBe('Resting · next set at 6:42 pm');
  });
});

describe('D8 / RT-02: rest alert status', () => {
  it('names the three states', () => {
    expect(restAlertStatus({ notifications: true, exact: true })).toBe('on-time');
    expect(restAlertStatus({ notifications: true, exact: false })).toBe('may-be-late');
    expect(restAlertStatus({ notifications: false, exact: false })).toBe('off');
    expect(restAlertStatus({ notifications: false, exact: true })).toBe('off');
    expect(restAlertStatus({ notifications: null, exact: null })).toBe('unknown');
  });
  it('asks once, only when alerts would be late', () => {
    expect(shouldAskExact({ notifications: true, exact: false }, false)).toBe(true);
    expect(shouldAskExact({ notifications: true, exact: false }, true)).toBe(false);
    expect(shouldAskExact({ notifications: true, exact: true }, false)).toBe(false);
    expect(shouldAskExact({ notifications: false, exact: false }, false)).toBe(false);
    expect(shouldAskExact({ notifications: null, exact: null }, false)).toBe(false);
  });
});
