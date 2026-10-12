/**
 * Redesign R2 — the Profile's history chart against REAL SQL (test/helpers/realDb.ts), on the
 * demo's 13 weeks of training (dumbbells counted "each", pull-ups with body weight, warm-ups):
 *  - every weekly kg-lifted bar equals Progress's "Kg lifted each week" (`getWeeklyVolumeKg`);
 *  - every monthly bar equals the month report's totals (kg lifted, time, workouts) — the
 *    number the finish screen, the cards and the share picture use;
 *  - reps are the working sets' reps;
 *  - the feed counts each card's records from one list, equal to the workout's own records;
 *  - Edit profile's photo, bio and link are saved, and kept by the Drive backup.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { bootRealApp, type RealDb } from '../helpers/realDb';

let db: RealDb;

beforeEach(async () => {
  db = await bootRealApp();
  const { loadDemoData } = await import('@/onboarding/db/dataActions');
  await loadDemoData();
});

describe('the chart is the one volume rule, the same numbers as everywhere else', () => {
  it('Last 12 weeks: each bar equals the weekly kg lifted', async () => {
    const { getHistoryChart } = await import('@/tracker/services/profileService');
    const { getWeeklyVolumeKg } = await import('@/tracker/services/volumeService');
    const bars = await getHistoryChart('weeks');
    const weekly = await getWeeklyVolumeKg(12);
    expect(bars.map((b) => b.start)).toEqual(weekly.map((w) => w.dateISO));
    bars.forEach((b, i) => expect(b.volumeKg).toBeCloseTo(weekly[i].volumeKg, 6));
    expect(bars.reduce((n, b) => n + b.volumeKg, 0)).toBeGreaterThan(1000);
  });

  it('Year: each month equals the month report (kg lifted, time, workouts)', async () => {
    const { getHistoryChart } = await import('@/tracker/services/profileService');
    const { getMonthReport } = await import('@/tracker/services/reportsService');
    const bars = await getHistoryChart('year');
    const trained = bars.filter((b) => b.workouts > 0);
    expect(trained.length).toBeGreaterThanOrEqual(3);
    for (const b of trained) {
      const { report } = await getMonthReport(b.start.slice(0, 7));
      expect(b.volumeKg).toBeCloseTo(report.totals.volumeKg, 6);
      expect(b.durationSec).toBe(report.totals.durationSec);
      expect(b.workouts).toBe(report.totals.workouts);
    }
  });

  it('All time = Year here (the demo is younger than a year); reps are the working sets’ reps', async () => {
    const { getHistoryChart } = await import('@/tracker/services/profileService');
    const all = await getHistoryChart('all');
    const year = await getHistoryChart('year');
    const sum = (bs: { volumeKg: number }[]) => bs.reduce((n, b) => n + b.volumeKg, 0);
    expect(sum(all)).toBeCloseTo(sum(year), 6);
    // The all-time total's workouts equal the Profile header's Workouts (the owner compares them).
    const { getProfileHeader } = await import('@/tracker/services/profileService');
    const { rangeTotals } = await import('@/tracker/engine/historyChart');
    expect(rangeTotals(all).workouts).toBe((await getProfileHeader()).workouts);
    for (const b of all) {
      const row = db.all<{ r: number | null }>(
        `SELECT SUM(se.reps) AS r FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
          WHERE se.is_warmup = 0 AND ws.date_iso BETWEEN ? AND ?`,
        [b.start, b.end],
      )[0];
      expect(b.reps).toBe(row.r ?? 0);
    }
  });

  it('a workout saved later moves the latest bar (nothing kept from before)', async () => {
    const { getHistoryChart } = await import('@/tracker/services/profileService');
    const before = (await getHistoryChart('weeks')).at(-1)!;
    const repo = await import('@/db/repos/workoutRepo');
    const { todayISO } = await import('@/lib/date');
    const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
    const s = await repo.createSession({ dateISO: todayISO(), dayType: 'push', source: 'manual' });
    await repo.addSets(s.id, [{ exerciseId: bench, weightKg: 100, reps: 5, isWarmup: false }]);
    const after = (await getHistoryChart('weeks')).at(-1)!;
    expect(after.volumeKg - before.volumeKg).toBeCloseTo(500, 6);
    expect(after.reps - before.reps).toBe(5);
    expect(after.workouts - before.workouts).toBe(1);
  });
});

describe('the Profile header and the feed', () => {
  it('Workouts · Weeks in a row · Records, and each card’s records from one list', async () => {
    const { getProfileHeader, getFeedPage } = await import('@/tracker/services/profileService');
    const { getRecordEvents, getSessionRecords } = await import('@/tracker/services/recordsService');
    const h = await getProfileHeader();
    expect(h.workouts).toBe(db.count('workout_sessions'));
    expect(h.records).toBe((await getRecordEvents()).length);
    expect(h.weeksInARow).toBeGreaterThan(0);

    const page = await getFeedPage();
    expect(page.items).toHaveLength(30);
    expect(page.next).not.toBeNull();
    for (const f of page.items.slice(0, 8)) expect(f.records).toBe((await getSessionRecords(f.item.id)).length);
    const more = await getFeedPage(page.next);
    expect(more.items[0].item.dateISO <= page.items[29].item.dateISO).toBe(true);
    expect(new Set([...page.items, ...more.items].map((x) => x.item.id)).size).toBe(page.items.length + more.items.length);
  });

  it('Edit profile: photo, bio and link are saved, and the Drive backup keeps them', async () => {
    const { setProfileExtras, getProfileExtras } = await import('@/tracker/db/profileExtras');
    await setProfileExtras({ bio: 'Fitness, music and tech', link: 'https://example.com/me', photoUri: 'file:///x/profile-photo/a.jpg' });
    expect(await getProfileExtras()).toEqual({ bio: 'Fitness, music and tech', link: 'https://example.com/me', photoUri: 'file:///x/profile-photo/a.jpg' });
    const { exportSnapshot, parseSnapshot, importSnapshot } = await import('@/cloud/snapshot');
    const json = await exportSnapshot();
    await setProfileExtras({ bio: null, link: null, photoUri: null });
    await importSnapshot(parseSnapshot(json));
    expect((await getProfileExtras()).bio).toBe('Fitness, music and tech');
  });
});
