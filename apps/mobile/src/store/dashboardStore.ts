import { create } from 'zustand';

import { maybeSync } from '@/cloud/sync';
import { FEATURES } from '@/lib/features';
import { onWriteFailed, quietSince, writeQueueMark } from '@/db/writeQueue';
import { getDashboardDataPhase2Checked, homeStamp } from '@/tracker/services/dashboardPhase2';
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
  /**
   * Audit Phase 8 (packet C): what `data` was read at (`homeStamp`) — null when unknown. A stamp
   * taken BEFORE the read, so a save during the read is never mistaken for "already shown".
   * Kept only when the whole read worked and no queued write ran during it (its rows may roll
   * back — audit Phase 8 review); otherwise null, and the next visit reads again.
   */
  stamp: string | null;
  /** Refresh from the DB. Call after any logging mutation. */
  refresh: () => Promise<void>;
  /**
   * Audit Phase 8 (packet C): Home's focus. Reads again only when something was saved since the
   * data on screen was read (or a new day began, or there is nothing good to show). True when
   * it read. `stamp`: one the caller already read (`homeStamp`), else it is read here.
   */
  refreshIfChanged: (stamp?: string | null) => Promise<boolean>;
}

let refreshSeq = 0;
/** The read in flight and the stamp it was started at (a focus during it waits for it). */
let inflight: { stamp: string | null; promise: Promise<void> } | null = null;

/** The stamp, or null when it can't be read (a read then always happens). */
async function currentStamp(): Promise<string | null> {
  try {
    return await homeStamp();
  } catch {
    return null;
  }
}

export const useDashboard = create<DashboardState>()((set, get) => {
  // Audit Phase 8 review: a failed (rolled-back) write — an import, a Finish, an edit, a merge —
  // may have been read while it ran; Home reads again at once.
  onWriteFailed(() => {
    void get()
      .refresh()
      .catch(() => undefined);
  });
  const load = (stampRead: Promise<string | null>): Promise<void> => {
    const seq = ++refreshSeq;
    // Synchronously: a retry in flight shows loading, never the old error.
    set({ loading: true, error: false });
    const entry: { stamp: string | null; promise: Promise<void> } = { stamp: null, promise: Promise.resolve() };
    entry.promise = (async () => {
      const mark = writeQueueMark();
      const stamp = await stampRead;
      entry.stamp = stamp;
      try {
        // The frozen dashboard, with the v2 Targets (same as the workout screen and the
        // chat), Phase 2 volume and recovery, and only records a member would recognise.
        const { data, partial } = await getDashboardDataPhase2Checked();
        const keep = !partial && quietSince(mark);
        if (seq === refreshSeq) set({ data, loading: false, error: false, stamp: keep ? stamp : null });
      } catch {
        // The last good summary (if any) stays on screen; with none, Home shows LoadError.
        if (seq === refreshSeq) set({ loading: false, error: true, stamp: null });
      }
      // One-way cloud push (no-op unless a gym is linked → offline demo unaffected).
      // Gym sync is hidden from members (owner decision D4), so a phone linked before
      // that never keeps uploading in the background.
      if (FEATURES.gymSync) void maybeSync();
    })();
    inflight = entry;
    const done = (): void => {
      if (inflight === entry) inflight = null;
    };
    entry.promise.then(done, done);
    return entry.promise;
  };

  return {
    data: null,
    loading: false,
    error: false,
    stamp: null,

    refresh: () => load(currentStamp()),

    refreshIfChanged: async (known) => {
      const stamp = known !== undefined ? known : await currentStamp();
      if (stamp != null) {
        // A read already under way at this same stamp (Finish refreshes Home as it closes).
        const running = inflight;
        if (running && running.stamp === stamp) {
          await running.promise;
          return false;
        }
        const s = get();
        if (stamp === s.stamp && s.data != null && !s.error && !s.loading) return false;
      }
      await load(Promise.resolve(stamp));
      return true;
    },
  };
});
