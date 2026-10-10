import { create } from 'zustand';

import { maybeSync } from '@/cloud/sync';
import { FEATURES } from '@/lib/features';
import { getDashboardDataPhase2 } from '@/tracker/services/dashboardPhase2';
import type { DashboardData } from '@/types/models';

export interface DashboardState {
  data: DashboardData | null;
  loading: boolean;
  /**
   * SH-13: the last read failed. Home shows "Couldn't load your summary — Try again" when
   * there is no data to show, instead of a skeleton that never ends. Cleared by the next
   * read that succeeds (and while a retry is in flight, so Try again shows loading).
   */
  error: boolean;
  /** Refresh from the DB. Call after any logging mutation and on focus. */
  refresh: () => Promise<void>;
}

let refreshSeq = 0;

export const useDashboard = create<DashboardState>()((set) => ({
  data: null,
  loading: false,
  error: false,

  refresh: async () => {
    const seq = ++refreshSeq;
    set({ loading: true, error: false });
    try {
      // The frozen dashboard, with the v2 Targets (same as the workout screen and the
      // chat), Phase 2 volume and recovery, and only records a member would recognise.
      const data = await getDashboardDataPhase2();
      if (seq === refreshSeq) set({ data, loading: false, error: false });
    } catch {
      // The last good summary (if any) stays on screen; with none, Home shows LoadError.
      if (seq === refreshSeq) set({ loading: false, error: true });
    }
    // One-way cloud push (no-op unless a gym is linked → offline demo unaffected).
    // Gym sync is hidden from members (owner decision D4), so a phone linked before
    // that never keeps uploading in the background.
    if (FEATURES.gymSync) void maybeSync();
  },
}));
