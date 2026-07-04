import { create } from 'zustand';

import { getDashboardData } from '@/services/dashboard';
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
      const data = await getDashboardData();
      if (seq === refreshSeq) set({ data, loading: false });
    } catch {
      if (seq === refreshSeq) set({ loading: false });
    }
  },
}));
