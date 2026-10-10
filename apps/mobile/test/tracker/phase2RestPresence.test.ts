/**
 * Phase 2, packet D — the workout cards during a rest (RT-05) and alert choices that change
 * mid-rest (RT-07, RT-12). Fails on the code before this packet.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const seen = { ongoing: [] as string[], quiet: [] as boolean[], dnd: [] as boolean[] };
let holds = false;
vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async () => undefined,
  cancelRestEnd: async () => undefined,
  showWorkoutOngoing: async (_t: string, body: string) => {
    seen.ongoing.push(body);
  },
  clearWorkoutOngoing: async () => undefined,
}));
vi.mock('@/tracker/services/restCard', () => ({
  onRestCardChange: () => () => undefined,
  readRestCard: () => undefined,
  reconcileWithCard: () => ({ do: 'nothing' }),
  restCardHolds: () => holds,
  showRestCard: () => true,
  phoneUses24Hour: () => true,
  ringerMode: () => 'normal',
  setRestQuiet: (q: boolean) => {
    seen.quiet.push(q);
  },
  setRestRingThroughDnd: (on: boolean) => {
    seen.dnd.push(on);
  },
}));
vi.mock('@/tracker/services/workoutSounds', () => ({ playWorkoutSound: () => undefined }));
vi.mock('@/lib/haptics', () => ({ success: () => undefined }));
vi.mock('@/db', () => ({ getMeta: async () => null, setMeta: async () => undefined }));
vi.mock('@/tracker/store/activeWorkoutStore', async () => {
  const { create } = await import('zustand');
  const useActiveWorkout = create(() => ({
    active: true,
    hydrated: true,
    editingSessionId: null as string | null,
    exercises: [{ sets: [{ done: true, isWarmup: false }, { done: false, isWarmup: false }] }] as unknown[],
  }));
  return { useActiveWorkout };
});
vi.mock('react-native', () => ({
  AppState: { currentState: 'background', addEventListener: () => ({ remove: () => undefined }) },
  Platform: { OS: 'test' },
}));

import { startWorkoutPresence } from '@/tracker/services/workoutPresence';
import { useRestAlertPrefs } from '@/tracker/store/restAlertPrefsStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

describe('workout cards during a rest', () => {
  beforeEach(() => {
    seen.ongoing = [];
    seen.quiet = [];
    seen.dnd = [];
    useRestTimer.setState({ endsAt: null, startedAt: null, source: null });
    useTrackerPrefs.setState({ sounds: true });
    useRestAlertPrefs.setState({ ringThroughDnd: false });
  });

  it('RT-05: one card — the workout card keeps the set count while the rest card shows the rest', () => {
    const stop = startWorkoutPresence();
    holds = true;
    useRestTimer.setState({ endsAt: new Date(2026, 9, 5, 18, 42).getTime() });
    expect(seen.ongoing.at(-1)).toBe('1 of 2 sets done');
    holds = false; // a build without the rest card: this card names the rest, in 24-hour time
    useRestTimer.setState({ endsAt: new Date(2026, 9, 5, 18, 43).getTime() });
    expect(seen.ongoing.at(-1)).toBe('Resting · next set at 18:43');
    stop();
  });

  it('RT-07 / RT-12: sounds and Do Not Disturb choices reach the running rest at once', () => {
    const stop = startWorkoutPresence();
    expect(seen.quiet).toEqual([false]);
    useTrackerPrefs.getState().setSounds(false);
    expect(seen.quiet).toEqual([false, true]);
    useRestAlertPrefs.getState().setRingThroughDnd(true);
    expect(seen.dnd).toEqual([false, true]);
    stop();
  });
});
