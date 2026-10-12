/**
 * Redesign R2 — the Profile's history chart engine (PURE): Hevy's bars, the big number and its
 * period, tap a bar / tap again, the axis, and the words. The equality with the app's existing
 * totals is proven on real SQL in test/db/historyChartReal.test.ts.
 */
import { describe, expect, it } from 'vitest';

import {
  barValue,
  CHART_RANGES,
  chartAxisText,
  chartBackText,
  chartBars,
  chartBuckets,
  chartMetricLabel,
  chartCaptionText,
  chartPeriodText,
  chartSpan,
  chartSummary,
  chartTicks,
  chartTotalCaptionText,
  chartValueText,
  chartXLabelIndexes,
  chartXText,
  rangeTotals,
  shownBar,
  tapBar,
  type ChartSession,
} from '@/tracker/engine/historyChart';
import { feedCardFacts, feedDate, feedMonthLine, feedRows, recordsPerWorkout } from '@/tracker/services/feedCard';
import { cleanBio, cleanLink, linkLabel } from '@/tracker/db/profileExtras';

const TODAY = '2026-10-11'; // a Sunday
const s = (dateISO: string, volumeKg = 1000, durationSec = 3600, reps = 50): ChartSession => ({ dateISO, volumeKg, durationSec, reps });

describe('the bars (Hevy’s rule)', () => {
  it('Last 12 weeks: 12 Monday weeks, the last one this week', () => {
    const b = chartBuckets('weeks', TODAY, '2020-01-01');
    expect(b).toHaveLength(12);
    expect(b[11]).toMatchObject({ kind: 'week', start: '2026-10-05', end: '2026-10-11' });
    expect(b[0].start).toBe('2026-07-20');
  });

  it('Year: 12 months, the last one this month', () => {
    const b = chartBuckets('year', TODAY, null);
    expect(b).toHaveLength(12);
    expect(b[0]).toMatchObject({ kind: 'month', start: '2025-11-01', end: '2025-11-30' });
    expect(b[11]).toMatchObject({ start: '2026-10-01', end: '2026-10-31' });
    expect(chartBuckets('year', '2024-03-15', null).find((x) => x.start === '2024-02-01')?.end).toBe('2024-02-29');
  });

  it('All time: one bar a month from the first workout’s month; none with no workout', () => {
    const b = chartBuckets('all', TODAY, '2022-05-17');
    expect(b[0].start).toBe('2022-05-01');
    expect(b[b.length - 1].start).toBe('2026-10-01');
    expect(b).toHaveLength(54);
    expect(chartBuckets('all', TODAY, null)).toEqual([]);
    expect(chartSpan('all', TODAY, null)).toBeNull();
    expect(chartSpan('weeks', TODAY, null)).toEqual({ from: '2026-07-20', to: '2026-10-11' });
  });

  it('fills each bar with its workouts’ totals; outside the range is left out', () => {
    const bars = chartBars([s('2026-10-05'), s('2026-10-11', 500, 1800, 20), s('2026-09-30'), s('2026-01-01')], 'weeks', TODAY);
    expect(bars[11]).toMatchObject({ workouts: 2, volumeKg: 1500, durationSec: 5400, reps: 70 });
    expect(bars[10]).toMatchObject({ workouts: 1, volumeKg: 1000 });
    expect(bars.reduce((n, b) => n + b.workouts, 0)).toBe(3);
    const months = chartBars([s('2026-10-01'), s('2026-10-31'), s('2026-09-15')], 'year', TODAY);
    expect(barValue(months[11], 'volume')).toBe(2000);
    expect(barValue(months[10], 'duration')).toBe(3600);
    expect(barValue(months[10], 'reps')).toBe(50);
  });

  it('All time starts at the first workout when none is given', () => {
    const bars = chartBars([s('2026-08-03'), s('2026-10-02')], 'all', TODAY);
    expect(bars.map((b) => b.start)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
  });
});

describe('the big number, its period, and tapping a bar', () => {
  it('shows the latest bar; a tapped bar; the same bar again → back to the latest', () => {
    const bars = chartBars([], 'weeks', TODAY);
    expect(shownBar(bars, null)).toBe(11);
    const sel = tapBar(null, 3);
    expect(shownBar(bars, sel)).toBe(3);
    expect(tapBar(sel, 3)).toBeNull();
    expect(tapBar(3, 5)).toBe(5);
    expect(shownBar([], null)).toBe(-1);
  });

  it('periods read like the app’s dates: a week with the year when it isn’t this year, a month always with its year', () => {
    const w = chartBuckets('weeks', TODAY, null);
    expect(chartPeriodText(w[11], TODAY)).toBe('5–11 Oct');
    expect(chartPeriodText({ ...w[0], start: '2026-09-28', end: '2026-10-04' }, TODAY)).toBe('28 Sep–4 Oct');
    const m = chartBuckets('year', TODAY, null);
    expect(chartPeriodText(m[11], TODAY)).toBe('Oct 2026');
    expect(chartPeriodText(m[0], TODAY)).toBe('Nov 2025');
    expect(chartXText(m[0])).toBe("Nov '25");
    expect(chartXText(w[11])).toBe('5 Oct');
  });

  it('values: "9,201 kg" / lb, "6h 20m", "1,240 reps"', () => {
    expect(chartValueText(9201, 'volume', 'metric')).toBe('9,201 kg');
    expect(chartValueText(1000, 'volume', 'imperial')).toBe('2,205 lb');
    expect(chartValueText(6 * 3600 + 20 * 60, 'duration', 'metric')).toBe('6h 20m');
    expect(chartValueText(0, 'duration', 'metric')).toBe('0 min');
    expect(chartValueText(1240, 'reps', 'metric')).toBe('1,240 reps');
    expect(chartValueText(1, 'reps', 'metric')).toBe('1 rep');
  });

  it('the axis: round steps in the member’s unit, labels "200k kg", "12h"', () => {
    expect(chartTicks(180_000, 'volume', 'metric')).toEqual([0, 100_000, 200_000]);
    expect(chartAxisText(200_000, 'volume', 'metric')).toBe('200k kg');
    expect(chartAxisText(12 * 3600, 'duration', 'metric')).toBe('12h');
    expect(chartAxisText(45 * 60, 'duration', 'metric')).toBe('45m');
    expect(chartTicks(0, 'reps', 'metric')).toEqual([0]);
    const lb = chartTicks(1000, 'volume', 'imperial'); // 2,205 lb → lines at 0, 2,000 and 4,000 lb
    expect(Math.round(lb[1] / 0.45359237)).toBe(2000);
    expect(lb[lb.length - 1]).toBeGreaterThanOrEqual(1000);
  });

  it('x labels: about five, evenly, always the last', () => {
    expect(chartXLabelIndexes(12)).toEqual([2, 5, 8, 11]);
    expect(chartXLabelIndexes(3)).toEqual([0, 1, 2]);
    expect(chartXLabelIndexes(54).at(-1)).toBe(53);
    expect(chartXLabelIndexes(0)).toEqual([]);
  });

  it('words: "Kg lifted" (never "volume"), and a summary for a screen reader', () => {
    expect(chartMetricLabel('volume', 'metric')).toBe('Kg lifted');
    expect(chartMetricLabel('volume', 'imperial')).toBe('Lb lifted');
    const bars = chartBars([s('2026-10-06', 9201), s('2026-08-04', 12480)], 'weeks', TODAY);
    expect(chartSummary(bars, 'volume', 'weeks', 'metric', TODAY)).toBe(
      'Kg lifted, last 12 weeks. Total 21,681 kg. Highest 12,480 kg, 3–9 Aug.',
    );
    expect(chartSummary(chartBars([], 'weeks', TODAY), 'reps', 'weeks', 'metric', TODAY)).toBe('Reps, last 12 weeks. No workouts yet.');
  });
});

const item = (o: Record<string, unknown> = {}) => ({
  title: 'Pull 1',
  dayType: 'pull' as const,
  dateISO: '2026-10-10',
  startedAt: 0,
  endedAt: 46 * 60_000,
  totalVolumeKg: 3611,
  distanceM: 0,
  exercises: ['Chin Up', 'Seated Incline Curl', 'T Bar Row', 'Face Pull', 'Shrug'].map((name, i) => ({
    exercise: { id: `e${i}`, name },
    volumeKg: 0,
    sets: [{ isWarmup: true, reps: 5 }, ...Array.from({ length: 3 + (i % 2) }, () => ({ isWarmup: false, reps: 10 }))],
  })),
  ...o,
});

describe('a feed card (Hevy’s)', () => {
  it('date, title, Time · Kg lifted · Records, the first 3 exercises and "See 2 more exercises"', () => {
    const f = feedCardFacts(item() as never, 2, 'metric');
    expect(f.date).toBe('Saturday, 10 Oct 2026');
    expect(f.title).toBe('Pull 1');
    expect(f.stats).toEqual([
      { label: 'Time', value: '46 min' },
      { label: 'Kg lifted', value: '3,611' },
      { label: 'Records', value: '2' },
    ]);
    expect(f.rows.map((r) => r.text)).toEqual(['3 sets Chin Up', '4 sets Seated Incline Curl', '3 sets T Bar Row']);
    expect(f.more).toBe('See 2 more exercises');
  });

  it('Reps instead of kg when nothing was lifted; no Records line without records; one more exercise', () => {
    const f = feedCardFacts(item({ totalVolumeKg: 0, exercises: item().exercises.slice(0, 4) }) as never, 0, 'metric');
    expect(f.stats.map((x) => x.label)).toEqual(['Time', 'Reps']);
    expect(f.stats[1].value).toBe('140');
    expect(f.more).toBe('See 1 more exercise');
    expect(feedCardFacts(item() as never, 0, 'imperial').stats[1]).toEqual({ label: 'Lb lifted', value: '7,961' });
  });

  it('records per workout come from one list; month lines between months', () => {
    expect(recordsPerWorkout([{ sessionId: 'a' }, { sessionId: 'a' }, { sessionId: 'b' }])).toEqual(new Map([['a', 2], ['b', 1]]));
    expect(feedMonthLine('2026-10', 12, TODAY)).toBe('October · 12 workouts');
    expect(feedMonthLine('2025-12', 1, TODAY)).toBe('December 2025 · 1 workout');
    const rows = feedRows([{ id: 'x', dateISO: '2026-10-02' }, { id: 'y', dateISO: '2026-10-01' }, { id: 'z', dateISO: '2026-09-30' }], { '2026-10': 5 });
    expect(rows.map((r) => (r.kind === 'month' ? `${r.ym}:${r.count}` : r.key))).toEqual(['2026-10:5', 'x', 'y', '2026-09:1', 'z']);
    expect(feedDate('2026-02-01')).toBe('Sunday, 1 Feb 2026');
  });
});

describe('Edit profile: bio and link', () => {
  it('a bio is trimmed, ≤ 150 characters and 3 lines; blank is none', () => {
    expect(cleanBio('  Fitness,   Music and Tech  ')).toBe('Fitness, Music and Tech');
    expect(cleanBio('x'.repeat(200))).toHaveLength(150);
    expect(cleanBio('a\nb\nc\nd')).toBe('a\nb\nc');
    expect(cleanBio('   ')).toBeNull();
  });

  it('a link is checked only enough to open it', () => {
    expect(cleanLink('www.Instagram.com/aakashpahuja108')).toEqual({ link: 'https://www.Instagram.com/aakashpahuja108', error: null });
    expect(cleanLink('http://example.com').link).toBe('http://example.com');
    expect(cleanLink('').link).toBeNull();
    expect(cleanLink('').error).toBeNull();
    expect(cleanLink('my site').error).toBeTruthy();
    expect(cleanLink('javascript:alert(1)').error).toBeTruthy();
    expect(cleanLink('nodot').error).toBeTruthy();
    expect(linkLabel('https://www.instagram.com/me/')).toBe('www.instagram.com/me');
  });
});

describe('chart caption (owner, 12 Oct 2026: "1,67,252 kg Jan 2023" read as a total)', () => {
  it('says what the big number counts, for which period, from how many workouts', () => {
    const m = { kind: 'month', start: '2023-01-01', end: '2023-01-31', workouts: 19, volumeKg: 167252, durationSec: 0, reps: 0 } as never;
    expect(chartCaptionText(m, 'volume', 'metric', '2026-10-12')).toBe('Kg lifted in Jan 2023 · 19 workouts');
    expect(chartCaptionText(m, 'reps', 'metric', '2026-10-12')).toBe('Reps in Jan 2023 · 19 workouts');
    expect(chartCaptionText({ ...(m as object), workouts: 1 } as never, 'duration', 'metric', '2026-10-12')).toBe('Time trained in Jan 2023 · 1 workout');
    expect(chartCaptionText(m, 'volume', 'imperial', '2026-10-12')).toMatch(/^Lb lifted/);
  });
});

describe('the big number is the range’s total (owner, 12 Oct 2026: "All time" showed only Oct; Last 12 weeks read 0 on a Monday)', () => {
  const MONDAY = '2026-10-12'; // a new week with no workout yet
  it('adds up every bar of the range, not the latest one', () => {
    const bars = chartBars([s('2026-10-06', 9201, 3600, 40), s('2026-08-04', 12480, 1800, 60)], 'weeks', MONDAY);
    expect(barValue(bars[bars.length - 1], 'volume')).toBe(0); // this week: nothing yet
    const t = rangeTotals(bars);
    expect(t).toEqual({ workouts: 2, volumeKg: 21681, durationSec: 5400, reps: 100 });
    expect(chartTotalCaptionText(bars, 'weeks', 'volume', 'metric')).toBe('Kg lifted in the last 12 weeks · 2 workouts');
  });

  it('All time counts from the first workout’s month and says so', () => {
    const bars = chartBars([s('2023-01-09', 167252), s('2026-10-06', 3965)], 'all', MONDAY);
    expect(barValue(rangeTotals(bars), 'volume')).toBe(171217);
    expect(chartTotalCaptionText(bars, 'all', 'reps', 'metric')).toBe('Reps since Jan 2023 · 2 workouts');
    expect(chartTotalCaptionText(chartBars([s('2026-10-06')], 'year', MONDAY), 'year', 'duration', 'metric')).toBe(
      'Time trained in the last 12 months · 1 workout',
    );
  });

  it('a tapped bar has a way back that names the range; the range names say their length', () => {
    expect(chartBackText('all')).toBe('Show all-time total');
    expect(chartBackText('weeks')).toBe('Show 12-week total');
    expect(chartBackText('year')).toBe('Show 12-month total');
    expect(CHART_RANGES.map((r) => r.label)).toEqual(['Last 12 weeks', 'Last 12 months', 'All time']);
  });
});
