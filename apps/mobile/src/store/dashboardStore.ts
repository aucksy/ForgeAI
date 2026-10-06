import { create } from 'zustand';

import { maybeSync } from '@/cloud/sync';
import { getDashboardData } from '@/services/dashboard';
import { getTodaysWorkoutWithTargets } from '@/tracker/services/coachTargets';
import type { DashboardData } from '@/types/models';

export interface DashboardState {
  data: DashboardData | null;
  loading: boolean;
  /** Refresh from the DB. Call after any logging mutation and on focus. */
  refresh: () => Promise<void>;
}

let refreshSeq = 0;

export const useDashboard = create<DashboardState>()((set) => ({
  data: null,
  loading: false,

  refresh: async () => {
    const seq = ++refreshSeq;
    set({ loading: true });
    try {
      const raw = await getDashboardData();
      // The frozen dashboard carries the frozen engine's targets; Home must show the same
      // Target as the workout screen and the chat (progression v2). Fall back if it fails.
      const tw = await getTodaysWorkoutWithTargets().catch(() => null);
      const data = tw ? { ...raw, todaysWorkout: tw } : raw;
      if (seq === refreshSeq) set({ data, loading: false });
    } catch {
      if (seq === refreshSeq) set({ loading: false });
    }
    // One-way cloud push (no-op unless a gym is linked → offline demo unaffected).
    void maybeSync();
  },
}));
