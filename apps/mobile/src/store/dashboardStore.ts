import { create } from 'zustand';

import { maybeSync } from '@/cloud/sync';
import { getDashboardDataPhase2 } from '@/tracker/services/dashboardPhase2';
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
      // The frozen dashboard, with the v2 Targets (same as the workout screen and the
      // chat), Phase 2 volume and recovery, and only records a member would recognise.
      const data = await getDashboardDataPhase2();
      if (seq === refreshSeq) set({ data, loading: false });
    } catch {
      if (seq === refreshSeq) set({ loading: false });
    }
    // One-way cloud push (no-op unless a gym is linked → offline demo unaffected).
    void maybeSync();
  },
}));
