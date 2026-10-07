import { useEffect, useRef, useState } from 'react';

import { getDb } from '@/db';
import { getProfile } from '@/db/repos/userRepo';
import { getStreakDays } from '@/db/repos/workoutRepo';
import { addDays, todayISO } from '@/lib/date';
import { getAnalyticsBundle } from '@/services/analytics';
import type { MuscleSetsSlice } from '@/tracker/engine/volume';
import { isMeaningfulPr } from '@/tracker/services/finishSummary';
import { getConsistencyCells, getMuscleSetsBetween, getWeeklyVolumeKg } from '@/tracker/services/volumeService';
import type { UserProfile } from '@/types/models';

export type RangeDays = 30 | 90 | 180;

/** The frozen bundle, with Phase 2's sets per finer muscle. */
export type AnalyticsBundle = Awaited<ReturnType<typeof getAnalyticsBundle>> & { muscleSets: MuscleSetsSlice[] };

const EMPTY_BUNDLE: AnalyticsBundle = {
  weight: [],
  weeklyVolume: [],
  frequency: [],
  calories: [],
  muscleVolume: [],
  consistency: [],
  prTimeline: [],
  strengthTrend: [],
  muscleSets: [],
};

export interface AnalyticsState {
  range: RangeDays;
  setRange: (r: RangeDays) => void;
  bundle: AnalyticsBundle | null;
  profile: UserProfile | null;
  streak: number;
  loading: boolean;
}

/** log_type per exercise id, to drop records that say nothing (0 kg, an assisted move's "heaviest" help). */
async function logTypes(): Promise<Map<string, string | null>> {
  const rows = await getDb().getAllAsync<{ id: string; log_type: string | null }>('SELECT id, log_type FROM exercises');
  return new Map(rows.map((r) => [r.id, r.log_type]));
}

/**
 * Phase 2: the frozen bundle sums `weight × reps`. Weekly volume and the consistency shading
 * are re-read with the one volume rule (body weight on pull-ups and dips, both dumbbells, no
 * kilos for time and distance), the muscle split becomes working sets per finer muscle, and
 * records that say nothing are dropped.
 */
async function loadBundle(range: RangeDays): Promise<AnalyticsBundle> {
  const today = todayISO();
  const from = addDays(today, -(range - 1));
  const [b, weekly, cells, muscleSets, types] = await Promise.all([
    getAnalyticsBundle(range),
    getWeeklyVolumeKg(Math.ceil(range / 7)),
    getConsistencyCells(range),
    getMuscleSetsBetween(from, today),
    logTypes(),
  ]);
  return {
    ...b,
    weeklyVolume: weekly,
    consistency: cells,
    prTimeline: b.prTimeline.filter((p) => isMeaningfulPr(p.value, types.get(p.exerciseId))),
    muscleSets,
  };
}

/**
 * Local analytics state: refetches the full bundle whenever the range changes.
 * Out-of-order responses are dropped (rapid range switching), and any failure
 * degrades to an empty bundle so every section falls back to its EmptyState.
 *
 * Phase 3: also refetches when Progress comes back into view (`focusKey`), so a workout
 * finished on another tab shows without switching the range. The old numbers stay on
 * screen while the new ones load — no skeleton flash on every visit.
 */
export function useAnalyticsData(focusKey = 1): AnalyticsState {
  const [range, setRange] = useState<RangeDays>(90);
  const [bundle, setBundle] = useState<AnalyticsBundle | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  useEffect(() => {
    if (focusKey <= 0) return; // not shown yet
    const req = ++reqRef.current;
    setLoading(true);
    (async () => {
      try {
        const [b, p, s] = await Promise.all([loadBundle(range), getProfile(), getStreakDays(todayISO())]);
        if (reqRef.current !== req) return;
        setBundle(b);
        setProfile(p);
        setStreak(s);
      } catch {
        if (reqRef.current !== req) return;
        setBundle(EMPTY_BUNDLE);
      } finally {
        if (reqRef.current === req) setLoading(false);
      }
    })();
  }, [range, focusKey]);

  return { range, setRange, bundle, profile, streak, loading };
}
