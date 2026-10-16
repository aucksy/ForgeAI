/**
 * C5 audit (16 Oct 2026), C5-4 + C1-10: the in-app rest bell follows the same rule as the
 * "Rest is over" alert. The native piece reports who rings (`RestCard.restBell`: "native" — the
 * app-open alert rings itself at notification volume; "hold" — Do Not Disturb holds it, "Ring
 * through Do Not Disturb" is off; "app" — the app's own bell, as before). `ringerMode()`, the rest
 * timer's only question before it rings, answers 'silent' for the first two.
 *
 * Before: with the workout screen on, the bell played through MEDIA volume (often 0) next to the
 * alert, and played out loud under Do Not Disturb while the screen-off alert stayed silent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = { sound: 0, haptic: 0 };
let ringer: 'normal' | 'vibrate' | 'silent' | null = 'normal';
let bell: 'native' | 'hold' | 'app' | null = null;
vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async () => undefined,
  cancelRestEnd: async () => undefined,
}));
vi.mock('@/tracker/services/restCard', async (orig) => {
  const real = (await orig()) as typeof import('@/tracker/services/restCard');
  // The real rule, fed the phone's ringer and the native answer the test sets.
  return { ...real, ringerMode: () => real.ringerForBell(ringer, bell), restBell: () => bell };
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
  setMeta: async () => undefined,
}));
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

import { ringerForBell, restBell } from '@/tracker/services/restCard';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  calls.sound = 0;
  calls.haptic = 0;
  ringer = 'normal';
  bell = null;
  useRestTimer.setState({ endsAt: null, startedAt: null, defaultSec: 90, loaded: true, durationSec: 90, source: null });
  useActiveWorkout.setState({ active: true, startedAt: 1_000_000, editingSessionId: null, exercises: [] });
});
afterEach(() => vi.useRealTimers());

function restEnds(): void {
  useRestTimer.getState().start(10, null);
  vi.advanceTimersByTime(10_000);
}

describe('C5-4 / C1-10: one rule for the end-of-rest sound, screen on or off', () => {
  it('the app rings its own bell only when the alert cannot (or the native piece is too old to say)', () => {
    bell = 'app';
    restEnds();
    expect(calls.sound).toBe(1);
    bell = null;
    restEnds();
    expect(calls.sound).toBe(2);
  });

  it('the alert rings itself at notification volume: no second, MEDIA-volume bell', () => {
    bell = 'native';
    restEnds();
    expect(calls.sound).toBe(0);
    expect(calls.haptic).toBe(1); // the phone still buzzes once (the alert's channel does not)
  });

  it('Do Not Disturb holding the alert holds the bell too (it played out loud before)', () => {
    bell = 'hold';
    restEnds();
    expect(calls.sound).toBe(0);
    // C5 review: the app's own buzz is held too (it still buzzed under DND before).
    expect(calls.haptic).toBe(0);
  });

  it('the ringer still rules when the app rings', () => {
    bell = 'app';
    ringer = 'vibrate';
    restEnds();
    expect(calls.sound).toBe(0);
  });
});

describe('ringerForBell (PURE)', () => {
  it('is silent for native and hold, the raw ringer otherwise', () => {
    for (const r of ['normal', 'vibrate', 'silent', null] as const) {
      expect(ringerForBell(r, 'native')).toBe('silent');
      expect(ringerForBell(r, 'hold')).toBe('silent');
      expect(ringerForBell(r, 'app')).toBe(r);
      expect(ringerForBell(r, null)).toBe(r);
    }
  });

  it('no native piece (tests, web): restBell is unknown, so nothing changes', async () => {
    const real = await vi.importActual<typeof import('@/tracker/services/restCard')>('@/tracker/services/restCard');
    expect(real.restBell()).toBeNull();
    expect(restBell()).toBe(bell); // the mock above
  });
});
