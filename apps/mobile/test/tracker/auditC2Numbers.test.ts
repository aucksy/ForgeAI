/**
 * 16 Oct 2026 end-to-end audit, C2 (numbers against their labels) — Audit/e2e-v2/C2-numbers.md.
 * Each test failed on the code before its fix.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ dates: [] as string[] }));
vi.mock('@/db/repos/workoutRepo', () => ({
  // Answers like the real read: only the days between `from` and `to`, oldest first.
  getSessionsBetween: vi.fn(async (from: string, to: string) => h.dates.filter((d) => d >= from && d <= to).map((dateISO) => ({ dateISO }))),
}));
vi.mock('@/lib/date', async (orig) => {
  const actual = await orig<typeof import('@/lib/date')>();
  return { ...actual, todayISO: () => '2026-10-12' };
});

import { twelveMonthsFrom } from '@/lib/date';
import { chartBars, chartPeriodText, chartSpan, rangeTotals } from '@/tracker/engine/historyChart';
import { exerciseRecords, type RecordSession } from '@/tracker/engine/records';
import { bucketLabel, periodPair, rangeFrom, sessionLifts, setsOnceBetween, type StatSession } from '@/tracker/engine/statistics';
import { changeSinceText } from '@/tracker/lib/measuresView';
import { CHART_RANGES, metricSeries, metricValueText, rangeStart } from '@/tracker/services/exerciseChart';
import { liftRecordsTotal, recordsPerWorkout } from '@/tracker/services/feedCard';
import { getWeekStreak } from '@/tracker/services/history';
import { liveRecordHits } from '@/tracker/services/liveRecords';
import { recordValueText } from '@/tracker/services/recordText';
import type { VolumeSession } from '@/tracker/engine/volume';
import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const chart = (dateISO: string) => ({ dateISO, durationSec: 3600, volumeKg: 1000, reps: 50 });

describe('C2-1: "Last 12 months" is the 12 months ending today, on Profile and Statistics alike', () => {
  it('1 Oct 2026: a workout 351 days ago counts on Profile', () => {
    const bars = chartBars([chart('2025-10-15'), chart('2025-10-01'), chart('2026-10-01')], 'year', '2026-10-01');
    expect(rangeTotals(bars).workouts).toBe(2); // 15 Oct 2025 and today; 1 Oct 2025 is 366 days back
    expect(chartSpan('year', '2026-10-01', null)).toEqual({ from: '2025-10-02', to: '2026-10-31' });
    expect(chartPeriodText(bars[0], '2026-10-01')).toBe('2–31 Oct 2025');
  });

  it('Profile and Statistics start on the same day', () => {
    for (const today of ['2026-10-01', '2026-10-12', '2028-02-29', '2026-10-31']) {
      expect(chartSpan('year', today, null)?.from).toBe(rangeFrom('1y', today, null));
      expect(periodPair('1y', today).cur.from).toBe(twelveMonthsFrom(today));
    }
    expect(twelveMonthsFrom('2028-02-29')).toBe('2027-03-01');
    expect(chartBars([], 'year', '2026-10-31')).toHaveLength(12); // a month's last day: 12 whole months
    expect(periodPair('1y', '2026-10-12').prev).toEqual({ from: '2024-10-13', to: '2025-10-12' });
  });
});

describe('C2-2 (kept, owner rule): "Last 12 weeks" = 12 full Monday weeks ending this week', () => {
  it('on Monday 12 Oct it spans 27 Jul to Sun 18 Oct, 84 days', () => {
    expect(chartSpan('weeks', '2026-10-12', null)).toEqual({ from: '2026-07-27', to: '2026-10-18' });
  });
});

describe('C2-3: the Statistics headline counts each set once', () => {
  it('one bench set with every group picked is 1 set, not 2', () => {
    const v: VolumeSession = {
      dateISO: '2026-10-05',
      exercises: [
        {
          exercise: { id: 'bench', logType: 'weight_reps', loadMode: 'one', bwShare: 0, muscles: { primary: ['chest'], secondary: ['triceps', 'front_delts'] } } as never,
          sets: [{ weightKg: 60, reps: 8, isWarmup: false }] as never,
        },
      ],
    };
    const s = { dateISO: '2026-10-05', groups: { chest: 1, arms: 0.5, shoulders: 0.5 }, lifts: sessionLifts(v) } as unknown as StatSession;
    const all = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'] as const;
    expect(setsOnceBetween([s], '2026-10-05', '2026-10-12', all)).toBe(1);
    expect(setsOnceBetween([s], '2026-10-05', '2026-10-12', ['shoulders'])).toBe(0.5);
    expect(read('src/app/stats.tsx')).toMatch(/setsSinceText\(setsOnceBetween\(win\.data, setsFrom, today, picked\), setsFrom, today\)/);
  });
});

describe('C2-4: a lighter set doing more reps never gets an "Estimated 1-rep max" record', () => {
  const W = { logType: 'weight_reps', loadMode: 'one', bwShare: 0 } as const;
  const sess = (id: string, dateISO: string, sets: { weightKg: number; reps: number }[]): RecordSession => ({ sessionId: id, dateISO, startedAt: Date.parse(dateISO), sets });

  it('100 × 3, then 85 × 10: no 1-rep-max record, and the best stays 100 × 3 (wave-1 review item 1)', () => {
    const r = exerciseRecords([sess('a', '2026-09-01', [{ weightKg: 100, reps: 3 }]), sess('b', '2026-09-08', [{ weightKg: 85, reps: 10 }])], W, []);
    expect(r.events.filter((e) => e.kind === 'e1rm')).toEqual([]);
    // A silenced lighter set is never the best a later set must beat, nor its holder.
    expect(r.bests.find((b) => b.kind === 'e1rm')?.value).toBeCloseTo(100 * (1 + 3 / 30));
    // A heavier set that beats it is news again.
    const r2 = exerciseRecords(
      [sess('a', '2026-09-01', [{ weightKg: 100, reps: 3 }]), sess('b', '2026-09-08', [{ weightKg: 85, reps: 10 }]), sess('c', '2026-09-15', [{ weightKg: 105, reps: 5 }])],
      W,
      [],
    );
    expect(r2.events.filter((e) => e.kind === 'e1rm').map((e) => e.sessionId)).toEqual(['c']);
  });

  it('live: the same lighter set ticked today is no 1-rep-max pop-up', () => {
    const hits = liveRecordHits({
      bests: { weightKg: 100, e1rm: 110, by: { weight: 100, e1rm: 110 }, holderKg: { e1rm: 100 } },
      sets: [{ key: 'x', weightKg: 85, reps: 10, isWarmup: false, done: true }],
    });
    expect(hits.get('x')?.all?.some((h2) => h2.kind === 'e1rm') ?? false).toBe(false);
  });
});

describe('C2-5: a record weight reads as the set table does', () => {
  it('"Heaviest weight · 61.25 kg", and the exercise chart readout too', () => {
    const ctx = { logType: 'weight_reps', loadMode: 'one', distUnit: 'km', units: 'metric' } as const;
    expect(recordValueText({ kind: 'weight', value: 61.25, sessionId: 's', dateISO: '2026-10-01', startedAt: 0, set: { weightKg: 61.25, reps: 5 } }, ctx)).toBe('61.25 kg');
    const history = [{ dateISO: '2026-10-01', easyWeek: false, volumeKg: 306.25, sets: [{ weightKg: 61.25, reps: 5 }] }] as unknown as ExerciseHistoryEntry[];
    const pts = metricSeries('heaviest', history, [], 'metric', 'km');
    expect(pts[0].y).toBe(61.25);
    expect(metricValueText('heaviest', pts[0].y, 'metric', 'km')).toBe('61.25 kg');
  });
});

describe('C2-6: Measures says which year a change counts from', () => {
  it('"−4.2 kg since 12 Mar 2023"', () => {
    expect(changeSinceText(-4.2, 'kg', '2023-03-12', '2026-10-12')).toBe('−4.2 kg since 12 Mar 2023');
    expect(changeSinceText(1.5, 'cm', '2026-03-12', '2026-10-12')).toBe('+1.5 cm since 12 Mar');
    expect(read('src/app/measures/index.tsx')).toMatch(/changeSinceText\(change, unitOf\(chip\), sorted\[0\]\.dateISO\)/);
  });
});

describe('C2-7: Calendar rest days after a gap of over 3 years', () => {
  it('a history that ended Aug 2023 reads ~1,140 rest days, not 0', async () => {
    h.dates = ['2023-08-20', '2023-08-28'];
    const r = await getWeekStreak();
    expect(r.restDays).toBeGreaterThan(1000);
  });

  it('a 4-year unbroken run is not capped at 157 weeks', async () => {
    h.dates = [];
    for (let i = 0; i < 4 * 53; i++) {
      const d = new Date(2026, 9, 12 - 7 * i);
      h.dates.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    expect((await getWeekStreak()).weeks).toBe(4 * 53);
  });
});

describe('C2-8: the exercise chart says "12 months"', () => {
  it('the rolling range is named as on Statistics, and starts on the same day', () => {
    expect(CHART_RANGES.find((r) => r.id === '1y')?.label).toBe('12 months');
    expect(rangeStart('1y', '2026-10-01')).toBe('2025-10-02');
  });
});

describe('C2-9: week labels are day first', () => {
  it('"5 Oct", as the Profile chart', () => {
    expect(bucketLabel('2026-10-05', 'week')).toBe('5 Oct');
  });
});

describe('C2-10: "Records" counts lifts, as the finish screen does', () => {
  it('one heavy set that set 5 kinds of record is 1; two lifts are 2', () => {
    const ev = [
      ...['weight', 'e1rm', 'rep_record', 'best_set', 'best_session'].map(() => ({ sessionId: 's1', exerciseId: 'bench' })),
      { sessionId: 's1', exerciseId: 'row' },
      { sessionId: 's2', exerciseId: 'bench' },
    ];
    expect(recordsPerWorkout(ev).get('s1')).toBe(2);
    expect(liftRecordsTotal(ev)).toBe(3);
    expect(read('src/tracker/services/profileService.ts')).toMatch(/records: liftRecordsTotal\(events\)/);
  });
});
