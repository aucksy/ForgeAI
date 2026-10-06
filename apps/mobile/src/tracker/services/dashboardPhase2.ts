/**
 * Home's data by the Phase 2 rules — one loader for the Home screen and the coach's
 * snapshot, so the two can never disagree.
 *
 * The frozen `getDashboardData()` stays the base. On top of it: today's workout with the
 * v2 Targets, volume and recovery by the one volume rule, and the "New PR" insight counting
 * only records a member would recognise. Each extra read may fail on its own; the frozen
 * numbers then stand.
 */
import { todayISO } from '@/lib/date';
import { getDashboardData } from '@/services/dashboard';
import type { DashboardData } from '@/types/models';

import { getTodaysWorkoutWithTargets } from './coachTargets';
import { getMeaningfulPrs, recentPrCount } from './records';
import { getRecentSessionDetailsWithVolume, getWeeklyVolumeKg, withPhase2Volume } from './volumeService';

/** Sessions read for the recovery score (the frozen dashboard reads the same 12). */
const RECENT_SESSIONS = 12;

export async function getDashboardDataPhase2(): Promise<DashboardData> {
  const raw = await getDashboardData();
  const today = todayISO();
  const [tw, weeks, recent, prs] = await Promise.all([
    getTodaysWorkoutWithTargets().catch(() => null),
    getWeeklyVolumeKg(6).catch(() => null),
    getRecentSessionDetailsWithVolume(RECENT_SESSIONS).catch(() => null),
    getMeaningfulPrs().catch(() => null),
  ]);
  const data: DashboardData = tw ? { ...raw, todaysWorkout: tw } : raw;
  if (!weeks) return data;
  return withPhase2Volume(data, weeks, recent?.[0]?.totalVolumeKg ?? null, today, {
    recentPrCount: prs ? recentPrCount(prs, today) : null,
    recentDetails: recent,
  });
}
