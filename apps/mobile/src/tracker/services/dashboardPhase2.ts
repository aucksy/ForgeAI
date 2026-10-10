/**
 * Home's data by the Phase 2 rules — one loader for the Home screen and the coach's
 * snapshot, so the two can never disagree.
 *
 * The frozen dashboard stays the base. On top of it: today's workout with the
 * v2 Targets, volume and recovery by the one volume rule, and (Phase 3, D10) the lifts that
 * beat a best THIS WEEK (Monday to today) by the one record rule — the same events the
 * finish screen, Progress and the records list show, so a first-ever set is never a
 * "record". Each extra read may fail on its own; the frozen numbers then stand.
 *
 * Audit Phase 8 (packet C) — the same answer from far fewer reads (125 statements → ~40):
 *  - the newest 12 workouts are read ONCE, in three batched reads with their sets' own counting
 *    (they were read twice, two reads per workout each time);
 *  - today's workout is read once, with the v2 Targets; the frozen v1 Targets (each exercise's
 *    history, then thrown away) are read only when the v2 read fails;
 *  - the "flat for three weeks" check (seven history reads) feeds only the insight line, and the
 *    stored records (1,400 rows on five years) only the strength score — both only the coach
 *    shows, so both are read only while the coach is switched on;
 *  - `homeStamp()` tells Home whether anything was saved since its last read, so coming back to
 *    the tab with nothing changed reads nothing again (`store/dashboardStore`).
 */
import { todayISO, weekStartISO } from '@/lib/date';
import { FEATURES } from '@/lib/features';
import { buildDashboardData } from '@/services/dashboard';
import type { DashboardData } from '@/types/models';

import { dataStamp } from '../db/dataStamp';
import { getRecentSessionDetailsAndModes } from '../db/sessionDetails';
import { liftsBeatingBest } from '../engine/headline';
import { getTodaysWorkoutWithTargets } from './coachTargets';
import { getRecordEvents } from './recordsService';
import { getWeeklyVolumeKg, withPhase2Volume, withVolume } from './volumeService';

/** Sessions read for the recovery score (the frozen dashboard reads the same 12). */
const RECENT_SESSIONS = 12;

/** Lifts that beat a best this week (Monday to today), by the one record rule. */
export async function getLiftsUpThisWeek(today: string = todayISO()): Promise<number> {
  const from = weekStartISO(today);
  return liftsBeatingBest(await getRecordEvents({ from, to: today }), from, today);
}

/**
 * What Home's data was read at: anything saved since, or a new day (the streak, this week and
 * today's workout move at midnight), changes it. null = can't tell (read again).
 */
export async function homeStamp(): Promise<string | null> {
  const s = await dataStamp();
  return s == null ? null : `${s}|${todayISO()}`;
}

export async function getDashboardDataPhase2(opts: { coach?: boolean } = {}): Promise<DashboardData> {
  return (await getDashboardDataPhase2Checked(opts)).data;
}

/**
 * The same, saying whether any of its own extra reads failed (`partial`): the frozen numbers then
 * stand in, and Home must not mark the data as read at its stamp — or the stand-in would stay on
 * screen until something is saved (audit Phase 8 review).
 */
export async function getDashboardDataPhase2Checked(
  opts: { coach?: boolean } = {},
): Promise<{ data: DashboardData; partial: boolean }> {
  const coach = opts.coach ?? FEATURES.coach;
  const today = todayISO();
  // The newest 12 workouts, once: the frozen numbers use them as read, Phase 2 by the volume rule.
  const recentRead = getRecentSessionDetailsAndModes(RECENT_SESSIONS);
  let partial = false;
  const failed = (): null => {
    partial = true;
    return null;
  };
  const [tw, weeks, recent, liftsUp] = await Promise.all([
    getTodaysWorkoutWithTargets().catch(failed),
    getWeeklyVolumeKg(6).catch(failed),
    recentRead.then(({ details, setModes }) => withVolume(details, setModes)).catch(failed),
    getLiftsUpThisWeek(today).catch(failed),
  ]);
  const raw = await buildDashboardData({
    // With the coach on, the frozen read runs as before: its Targets name the lift the
    // insight line checks for a plateau. Otherwise the v2 answer stands in (or, when it failed,
    // the frozen read as the fallback it always was).
    todaysWorkout: coach || !tw ? undefined : tw,
    recentDetails: recentRead.then((r) => r.details),
    plateau: coach,
    strength: coach,
  });
  const data: DashboardData = tw ? { ...raw, todaysWorkout: tw } : raw;
  if (!weeks) return { data: liftsUp != null ? { ...data, liftsUpThisWeek: liftsUp } : data, partial };
  return {
    data: withPhase2Volume(data, weeks, recent?.[0]?.totalVolumeKg ?? null, today, {
      liftsUp,
      recentDetails: recent,
    }),
    partial,
  };
}
