import { useEffect, useRef, useState } from 'react';

import { getProfile } from '@/db/repos/userRepo';
import { getStreakDays } from '@/db/repos/workoutRepo';
import { todayISO } from '@/lib/date';
import { getAnalyticsBundle } from '@/services/analytics';
import type { UserProfile } from '@/types/models';

export type RangeDays = 30 | 90 | 180;

export type AnalyticsBundle = Awaited<ReturnType<typeof getAnalyticsBundle>>;

const EMPTY_BUNDLE: AnalyticsBundle = {
  weight: [],
  weeklyVolume: [],
  frequency: [],
  calories: [],
  muscleVolume: [],
  consistency: [],
  prTimeline: [],
  strengthTrend: [],
};

export interface AnalyticsState {
  range: RangeDays;
  setRange: (r: RangeDays) => void;
  bundle: AnalyticsBundle | null;
  profile: UserProfile | null;
  streak: number;
  loading: boolean;
}

/**
 * Local analytics state: refetches the full bundle whenever the range changes.
 * Out-of-order responses are dropped (rapid range switching), and any failure
 * degrades to an empty bundle so every section falls back to its EmptyState.
 */
export function useAnalyticsData(): AnalyticsState {
  const [range, setRange] = useState<RangeDays>(90);
  const [bundle, setBundle] = useState<AnalyticsBundle | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  useEffect(() => {
    const req = ++reqRef.current;
    setLoading(true);
    (async () => {
      try {
        const [b, p, s] = await Promise.all([
          getAnalyticsBundle(range),
          getProfile(),
          getStreakDays(todayISO()),
        ]);
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
  }, [range]);

  return { range, setRange, bundle, profile, streak, loading };
}
