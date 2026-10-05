/**
 * Device-QA regression (5 Oct 2026): when the rest ends on its own, the store must not
 * cancel or dismiss the scheduled "Rest is over" alert. On a locked phone the app's own
 * timer fires at the same moment the alert posts, and the old clean-up deleted the alert
 * as it appeared — the member was never told the rest was over.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = { schedule: 0, cancel: 0 };
vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async () => {
    calls.schedule += 1;
  },
  cancelRestEnd: async () => {
    calls.cancel += 1;
  },
}));
vi.mock('@/tracker/services/workoutSounds', () => ({ playWorkoutSound: () => undefined }));
vi.mock('@/lib/haptics', () => ({ success: () => undefined }));
vi.mock('@/db', () => ({ getMeta: async () => null, setMeta: async () => undefined }));
// The phone is locked: the app is in the background when the rest runs out.
vi.mock('react-native', () => ({ AppState: { currentState: 'background' } }));

import { useRestTimer } from '@/tracker/store/restTimerStore';

describe('rest timer expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    calls.schedule = 0;
    calls.cancel = 0;
    useRestTimer.setState({ endsAt: null, defaultSec: 90, loaded: true });
  });
  afterEach(() => vi.useRealTimers());

  it('schedules the alert, then leaves it alone when the rest runs out', () => {
    useRestTimer.getState().start(30, 'Bench Press');
    expect(calls.schedule).toBe(1);
    vi.advanceTimersByTime(31_000);
    expect(useRestTimer.getState().endsAt).toBeNull();
    expect(calls.cancel).toBe(0);
  });

  it('still cancels the alert when the member skips the rest', () => {
    useRestTimer.getState().start(30, null);
    useRestTimer.getState().skip();
    expect(calls.cancel).toBe(1);
    vi.advanceTimersByTime(31_000);
    expect(calls.cancel).toBe(1);
  });
});
