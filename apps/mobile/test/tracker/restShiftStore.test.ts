/**
 * Owner backlog (21 Oct 2026): changing an exercise's rest while its own rest runs moves the running
 * timer by the difference (the real store, the timer store; native pieces stubbed).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const restStarts: number[] = [];
vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async (endsAt: number) => {
    restStarts.push(endsAt);
  },
  cancelRestEnd: async () => undefined,
}));
vi.mock('@/tracker/services/restCard', async (orig) => {
  const real = (await orig()) as typeof import('@/tracker/services/restCard');
  return { ...real, ringerMode: () => 'normal', dismissRestOver: () => undefined, postDoneNote: () => undefined };
});
vi.mock('@/tracker/services/workoutSounds', () => ({ playWorkoutSound: () => undefined }));
vi.mock('@/lib/haptics', () => ({ success: () => undefined, tap: () => undefined, warn: () => undefined }));
vi.mock('@/db', () => ({
  getDb: () => {
    throw new Error('no db in unit tests');
  },
  getMeta: async () => null,
  setMeta: async () => undefined,
}));
vi.mock('react-native', () => {
  const fixed: Record<string, unknown> = {
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
    AccessibilityInfo: { announceForAccessibility: () => undefined },
    Platform: { OS: 'test' },
  };
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

import { useActiveWorkout, type DraftExercise } from '@/tracker/store/activeWorkoutStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';

const card = (key: string, exerciseId: string, restSec: number | null): DraftExercise =>
  ({ key, exerciseId, restSec, sets: [], name: exerciseId }) as unknown as DraftExercise;

afterEach(() => {
  useRestTimer.setState({ endsAt: null, source: null });
});

describe('rest change moves the running rest', () => {
  it('2:30 -> 3:00 on the lift whose tick started the rest adds 30 s; another lift changes nothing', async () => {
    const now = Date.now();
    useActiveWorkout.setState({ exercises: [card('a', 'bench', 150), card('b', 'row', 90)] } as never);
    useRestTimer.setState({ endsAt: now + 100_000, startedAt: now - 50_000, durationSec: 150, defaultSec: 90, source: { exKey: 'a', setKey: 's1' } });
    await useActiveWorkout.getState().setRestSec('a', 180);
    expect(useRestTimer.getState().endsAt).toBe(now + 130_000);
    await useActiveWorkout.getState().setRestSec('b', 300);
    expect(useRestTimer.getState().endsAt).toBe(now + 130_000);
  });

  it('switching the rest off leaves the running rest alone', async () => {
    const now = Date.now();
    useActiveWorkout.setState({ exercises: [card('a', 'bench', 150)] } as never);
    useRestTimer.setState({ endsAt: now + 60_000, startedAt: now, durationSec: 150, defaultSec: 90, source: { exKey: 'a', setKey: 's1' } });
    await useActiveWorkout.getState().setRestSec('a', 0);
    expect(useRestTimer.getState().endsAt).toBe(now + 60_000);
  });
});
