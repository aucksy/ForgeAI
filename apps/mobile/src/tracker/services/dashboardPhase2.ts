/**
 * Home's data by the Phase 2 rules — one loader for the Home screen and the coach's
 * snapshot, so the two can never disagree.
 *
 * The frozen `getDashboardData()` stays the base. On top of it: today's workout with the
 * v2 Targets, volume and recovery by the one volume rule, and (Phase 3, D10) the lifts that
 * beat a best THIS WEEK (Monday to today) by the one record rule — the same events the
 * finish screen, Progress and the records list show, so a first-ever set is never a
 * "record". Each extra read may fail on its own; the frozen numbers then stand.
 */
import { todayISO, weekStartISO } from '@/lib/date';
import { getDashboardData } from '@/services/dashboard';
import type { DashboardData } from '@/types/models';

import { liftsBeatingBest } from '../engine/headline';
import { getTodaysWorkoutWithTargets } from './coachTargets';
import { getRecordEvents } from './recordsService';
import { getRecentSessionDetailsWithVolume, getWeeklyVolumeKg, withPhase2Volume } from './volumeService';

/** Sessions read for the recovery score (the frozen dashboard reads the same 12). */
const RECENT_SESSIONS = 12;

/** Lifts that beat a best this week (Monday to today), by the one record rule. */
export async function getLiftsUpThisWeek(today: string = todayISO()): Promise<number> {
  const from = weekStartISO(today);
  return liftsBeatingBest(await getRecordEvents({ from, to: today }), from, today);
}

export async function getDashboardDataPhase2(): Promise<DashboardData> {
  const raw = await getDashboardData();
  const today = todayISO();
  const [tw, weeks, recent, liftsUp] = await Promise.all([
    getTodaysWorkoutWithTargets().catch(() => null),
    getWeeklyVolumeKg(6).catch(() => null),
    getRecentSessionDetailsWithVolume(RECENT_SESSIONS).catch(() => null),
    getLiftsUpThisWeek(today).catch(() => null),
  ]);
  const data: DashboardData = tw ? { ...raw, todaysWorkout: tw } : raw;
  if (!weeks) return liftsUp != null ? { ...data, liftsUpThisWeek: liftsUp } : data;
  return withPhase2Volume(data, weeks, recent?.[0]?.totalVolumeKg ?? null, today, {
    liftsUp,
    recentDetails: recent,
  });
}
