/**
 * 12 Oct 2026 statistics audit (src/tracker/engine/statistics.ts, used by src/app/stats.tsx).
 * "Today" is Monday 12 Oct 2026 throughout: the day the owner said the numbers made no sense.
 */
import { describe, expect, it } from 'vitest';

import {
  chartFrom,
  comparisonText,
  fullPeriodBefore,
  periodPair,
  rangeFrom,
  setsSeries,
  setsSinceText,
  type StatSession,
} from '@/tracker/engine/statistics';

const TODAY = '2026-10-12'; // a Monday

const stat = (dateISO: string, chest: number): StatSession => ({
  sessionId: dateISO,
  dateISO,
  durationSec: 3600,
  volumeKg: 1000,
  sets: chest,
  exercises: [],
  groups: { chest },
});

describe('Sets per muscle group: every bar is a whole week or month', () => {
  it('starts "30 days" by week on the Monday of its first day, not on a one-day stub', () => {
    // 30 days back from Mon 12 Oct is Sun 13 Sep; its week starts Mon 7 Sep.
    expect(rangeFrom('30d', TODAY, null)).toBe('2026-09-13');
    expect(chartFrom('30d', TODAY, null, 'week')).toBe('2026-09-07');
    // A member who trains every Monday, Wednesday and Friday, 4 sets each.
    const sessions: StatSession[] = [];
    for (let d = new Date(2026, 8, 7); d <= new Date(2026, 9, 12); d.setDate(d.getDate() + 1)) {
      if ([1, 3, 5].includes(d.getDay())) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        sessions.push(stat(iso, 4));
      }
    }
    // Before: the first bar ("Sep 7") counted only Sunday 13 Sep — 0 sets, a slump that never was.
    expect(setsSeries(sessions, rangeFrom('30d', TODAY, null), TODAY, 'week', ['chest'])[0]).toEqual({ bucket: '2026-09-07', sets: 0 });
    // After: every finished week reads the same 12 sets; this week (Monday only) reads 4.
    const series = setsSeries(sessions, chartFrom('30d', TODAY, null, 'week'), TODAY, 'week', ['chest']);
    expect(series.map((p) => p.sets)).toEqual([12, 12, 12, 12, 12, 4]);
  });
  it('starts "Year" by month on the 1st, so the first October is a whole month', () => {
    expect(rangeFrom('1y', TODAY, null)).toBe('2025-10-13');
    expect(chartFrom('1y', TODAY, null, 'month')).toBe('2025-10-01');
    const sessions = [stat('2025-10-02', 10), stat('2025-10-20', 10)];
    expect(setsSeries(sessions, chartFrom('1y', TODAY, null, 'month'), TODAY, 'month', ['chest'])[0]).toEqual({ bucket: '2025-10-01', sets: 20 });
  });
  it('starts "All time" on the first workout\'s week or month', () => {
    expect(chartFrom('all', TODAY, '2023-01-18', 'week')).toBe('2023-01-16');
    expect(chartFrom('all', TODAY, '2023-01-18', 'month')).toBe('2023-01-01');
  });
  it('says what the total counts and from when, with the phone\'s grouping', () => {
    expect(setsSinceText(412, '2026-09-07', TODAY)).toBe('412 sets since 7 Sep');
    expect(setsSinceText(1, '2026-10-12', TODAY)).toBe('1 set since 12 Oct');
    expect(setsSinceText(4.5, '2026-10-12', TODAY)).toBe('4.5 sets since 12 Oct');
    // All time: the year is said, and a big total is grouped ("12,480", not "12480").
    expect(setsSinceText(12480, '2023-01-16', TODAY)).toMatch(/^12.480 sets since 16 Jan 2023$/);
  });
});

describe('Muscle distribution: a fair "before"', () => {
  it('compares two rolling periods of equal length, so a Monday is not "1 day against 7"', () => {
    const p = periodPair('30d', TODAY);
    expect(p.cur).toEqual({ from: '2026-09-13', to: TODAY });
    expect(p.prev).toEqual({ from: '2026-08-14', to: '2026-09-12' });
  });
  it('only compares when the member\'s log covers the whole period before', () => {
    const p = periodPair('30d', TODAY);
    expect(fullPeriodBefore(p, '2025-01-01')).toBe(true);
    expect(fullPeriodBefore(p, '2026-08-14')).toBe(true); // first workout on its first day
    expect(fullPeriodBefore(p, '2026-08-15')).toBe(false); // started 40 days ago: no "+200%"
    expect(fullPeriodBefore(p, '2026-10-01')).toBe(false);
    expect(fullPeriodBefore(p, null)).toBe(false);
  });
  it('names the period plainly — a rolling year is "Last 12 months", never "Last year"', () => {
    expect(comparisonText('30d', true)).toBe('Last 30 days, against the 30 days before');
    expect(comparisonText('3m', true)).toBe('Last 3 months, against the 3 months before');
    expect(comparisonText('1y', true)).toBe('Last 12 months, against the 12 months before');
    expect(comparisonText('30d', false)).toBe('Last 30 days. Your log is too new to compare with the 30 days before.');
    for (const r of ['30d', '3m', '1y'] as const) for (const c of [true, false]) expect(comparisonText(r, c)).not.toMatch(/last year|volume|session/i);
  });
});
