/**
 * Phase 3, packet B — "two ways" (audit plan §7 point 2): one realistic member in the REAL
 * database (test/helpers/realDb.ts), and every headline number worked out through EACH
 * screen's own read — Home (`getDashboardDataPhase2`), Progress (`loadProgress`, its records
 * and month counts), History (its feed read and `getWeekStreak`), the month report and the
 * year in review. The test fails on any difference.
 *
 * The member (today = Wed 14 Oct 2026, local time):
 *  - trains Mon/Wed/Fri, 3–21 Aug, skips the week of 24 Aug, then Mon/Fri every week from
 *    31 Aug, and Monday 12 Oct → a 7-week streak (weekends and the empty Tuesday-Wednesday
 *    this week never break it);
 *  - bench climbs slowly (records), squat stays flat (no records after the first);
 *  - on Monday 12 Oct: a bench best, the same squat, and a FIRST-EVER deadlift — the frozen
 *    PR table calls that deadlift a "PR"; by the one record rule it is not, so exactly
 *    1 lift beat its best this week;
 *  - weighs in every few days (82 → 80.6 kg), goal fat loss.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

const MEMBER: OnboardingInput = {
  name: 'Two Ways',
  phoneE164: '+919876543210',
  goal: 'fat_loss',
  experience: 'intermediate',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: null,
  targets: { calorieTarget: 2400, proteinTargetG: 140, carbsTargetG: 300, fatTargetG: 70 },
} as OnboardingInput;

const TODAY = '2026-10-14';
let db: RealDb;

const at = (iso: string, h: number): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, h, 0, 0).getTime();
};
const exId = (name: string): string => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0].id;

function trainingDays(): string[] {
  const days = ['2026-08-03', '2026-08-05', '2026-08-07', '2026-08-10', '2026-08-12', '2026-08-14', '2026-08-17', '2026-08-19', '2026-08-21'];
  // From 31 Aug: Monday and Friday every week, up to 9 Oct; then Monday 12 Oct.
  for (let mon = new Date(2026, 7, 31); mon < new Date(2026, 9, 10); mon.setDate(mon.getDate() + 7)) {
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    for (const d of [mon, fri]) days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  days.push('2026-10-12');
  return days;
}

async function seed(): Promise<void> {
  const { createSession, addSets } = await import('@/db/repos/workoutRepo');
  const { logBodyWeight } = await import('@/db/repos/userRepo');
  const bench = exId('Barbell Bench Press');
  const squat = exId('Barbell Squat');
  const dead = exId('Deadlift');
  const days = trainingDays();
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const s = await createSession({ dateISO: d, dayType: 'full', source: 'manual' as never, startedAt: at(d, 18), endedAt: at(d, 19) });
    const benchKg = 60 + Math.ceil(i / 2) * 2.5; // a best every other workout, Monday 12 Oct included
    const sets = [
      { exerciseId: bench, weightKg: 40, reps: 10, isWarmup: true },
      { exerciseId: bench, weightKg: benchKg, reps: 5 },
      { exerciseId: bench, weightKg: benchKg, reps: 5 },
      { exerciseId: squat, weightKg: 100, reps: 5 },
      { exerciseId: squat, weightKg: 100, reps: 5 },
    ];
    if (d === '2026-10-12') sets.push({ exerciseId: dead, weightKg: 140, reps: 3 });
    await addSets(s.id, sets);
  }
  const weights: [string, number][] = [
    ['2026-08-01', 83],
    ['2026-09-10', 82],
    ['2026-09-20', 81.7],
    ['2026-10-01', 81.2],
    ['2026-10-08', 80.9],
    ['2026-10-13', 80.6],
  ];
  for (const [d, kg] of weights) await logBodyWeight(d, kg);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0, 0));
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  await seed();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('two ways: every headline number agrees on every screen', () => {
  it('workouts, streak, lifts that beat a best, volume and body-weight change', async () => {
    const { todayISO, weekStartISO } = await import('@/lib/date');
    expect(todayISO()).toBe(TODAY);
    const weekFrom = weekStartISO(TODAY);
    const { getDashboardDataPhase2 } = await import('@/tracker/services/dashboardPhase2');
    const { loadProgress } = await import('@/components/analytics/useAnalyticsData');
    const { getRecordEvents } = await import('@/tracker/services/recordsService');
    const { getRecentSessionDetailsBatched } = await import('@/tracker/db/sessionDetails');
    const { withVolume } = await import('@/tracker/services/volumeService');
    const { getWeekStreak } = await import('@/tracker/services/history');
    const { getMonthCounts, getMonthReport, getYearReview } = await import('@/tracker/services/reportsService');
    const { getBodyWeightHistory } = await import('@/db/repos/userRepo');
    const { liftsBeatingBest, weightChange } = await import('@/tracker/engine/headline');

    // Each screen's own read.
    const home = await getDashboardDataPhase2();
    const progress = await loadProgress(30);
    const events = await getRecordEvents();
    const counts = await getMonthCounts(); // Progress's reports card
    const feed = await withVolume(await getRecentSessionDetailsBatched(50)); // History's feed read
    const history = await getWeekStreak();
    const month = await getMonthReport('2026-10', TODAY);
    const year = await getYearReview(2026, TODAY);
    const weighIns = await getBodyWeightHistory(); // the Body weight screen's read

    // ---- workouts this month: Progress card = month report = year review = History feed
    const octFeed = feed.filter((s) => s.dateISO.startsWith('2026-10'));
    expect(counts.get('2026-10')).toBe(4); // Fri 2, Mon 5, Fri 9, Mon 12 Oct
    expect(month.report.totals.workouts).toBe(counts.get('2026-10'));
    expect(year.byMonth.find((m) => m.month === '2026-10')?.workouts).toBe(counts.get('2026-10'));
    expect(octFeed.length).toBe(counts.get('2026-10'));
    expect(year.totals.workouts).toBe(feed.length);

    // ---- the streak (D9): weeks in a row — Home = Progress = History; the year's longest ≥ it
    expect(home.streakWeeks).toBe(7);
    expect(progress.streak).toBe(home.streakWeeks);
    expect(history.weeks).toBe(home.streakWeeks);
    expect(year.longestStreakWeeks).toBeGreaterThanOrEqual(home.streakWeeks);

    // ---- lifts that beat a best (D10, one record rule): the first-ever deadlift is no record
    expect(home.liftsUpThisWeek).toBe(1);
    expect(liftsBeatingBest(events, weekFrom, TODAY)).toBe(home.liftsUpThisWeek);
    const frozenPrLifts = db.all<{ n: number }>('SELECT COUNT(DISTINCT exercise_id) AS n FROM personal_records WHERE date_iso >= ?', [weekFrom])[0].n;
    expect(frozenPrLifts).toBe(2); // the stored table would have said "2 new PRs" (bench + deadlift)
    expect(home.insight).not.toMatch(/2 lifts|PR/);
    // Month: the report, Progress's card and the share picture count the same lifts.
    const octLifts = liftsBeatingBest(events, '2026-10-01', '2026-10-31');
    expect(octLifts).toBe(1); // only bench ever beats its best
    expect(liftsBeatingBest(month.records)).toBe(octLifts);
    expect(year.recordCount).toBe(liftsBeatingBest(events, '2026-01-01', '2026-12-31'));

    // ---- volume: Home's week = Progress's last week = History's cards this week
    const weekFeed = feed.filter((s) => s.dateISO >= weekFrom);
    const weekVolume = weekFeed.reduce((n, s) => n + s.totalVolumeKg, 0);
    expect(weekVolume).toBeGreaterThan(0);
    expect(home.weeklyVolumeKg).toBeCloseTo(weekVolume, 6);
    expect(progress.bundle.weeklyVolume[progress.bundle.weeklyVolume.length - 1].volumeKg).toBeCloseTo(weekVolume, 6);
    // Month: the report's total = the History cards of October.
    expect(month.report.totals.volumeKg).toBeCloseTo(octFeed.reduce((n, s) => n + s.totalVolumeKg, 0), 6);

    // ---- body weight (one rule, says its span): Home's 30 days = Progress's 30-day range
    const homeChange = weightChange(home.bodyWeightTrend);
    const progressChange = weightChange(progress.bundle.weight);
    expect(homeChange).toMatchObject({ changeKg: -1.1, fromISO: '2026-09-20', toISO: '2026-10-13', days: 23 });
    expect(progressChange).toEqual(homeChange);
    expect(weightChange(weighIns, '2026-09-15')).toEqual(homeChange); // the Body weight screen's data
    // Month: the report's line = the one rule over October.
    const octChange = weightChange(weighIns, '2026-10-01', '2026-10-31');
    expect(month.report.bodyweight?.change).toBe(octChange?.changeKg);
    expect(month.report.bodyweight?.change).toBe(-0.6);
    // …and its start and end weights are the two weigh-ins that change compared.
    expect(month.report.bodyweight?.start).toBe(octChange?.fromKg);
    expect(month.report.bodyweight?.end).toBe(octChange?.toKg);
  });
});
