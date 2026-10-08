/**
 * v0.26.1 review (L1): since the watch card, the start-up clean-up waits until the saved workout
 * is read back. A read that fails must still end the restore, or a stale card from a stopped app
 * would never be cleared.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({
  getDb: () => {
    throw new Error('no db');
  },
  getMeta: async () => {
    throw new Error('disk error');
  },
  setMeta: async () => undefined,
}));

import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

describe('restoring the saved workout', () => {
  it('ends (as "no workout") when the saved draft cannot be read', async () => {
    await useActiveWorkout.getState().hydrate().catch(() => undefined);
    expect(useActiveWorkout.getState().hydrated).toBe(true);
    expect(useActiveWorkout.getState().active).toBe(false);
  });
});
