/**
 * R-404 (owner rule, 8 Nov 2026: "every chart behaves the same"): a bar chart taps like the line
 * chart. Which bar a finger is on (`barIndexAt`), and which days a week or month bar covers
 * (`barRange`), so its box opens that period's workouts. PURE.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { barIndexAt } from '@/components/charts/util';
import { chartAxisDateText, type ChartBar } from '@/tracker/engine/historyChart';
import { barRange, historyRangeText } from '@/tracker/lib/historyRange';

describe('which bar a finger is on', () => {
  // 340 wide, plot from 40 to 332: 4 bars of 73 px each.
  const at = (x: number) => barIndexAt(x, 340, 4, 40, 8);
  it('anywhere in a bar’s slot picks that bar, not only its thin column', () => {
    expect(at(41)).toBe(0);
    expect(at(112)).toBe(0);
    expect(at(114)).toBe(1);
    expect(at(250)).toBe(2);
    expect(at(331)).toBe(3);
  });
  it('the edges of the plot stay on the first and last bar', () => {
    expect(at(37)).toBe(0);
    expect(at(335)).toBe(3);
  });
  it('a finger on the axis labels is outside (it puts the picked bar away)', () => {
    expect(at(10)).toBeNull();
    expect(at(339)).toBeNull();
  });
  it('no bars or no width: nothing to pick', () => {
    expect(barIndexAt(100, 340, 0, 40, 8)).toBeNull();
    expect(barIndexAt(100, 0, 4, 40, 8)).toBeNull();
  });
});

describe('the Profile chart’s axis says months on a chart of months', () => {
  const bar = (kind: 'week' | 'month', start: string, end: string): ChartBar => ({ kind, start, end, workouts: 0, durationSec: 0, volumeKg: 0, reps: 0, sets: 0 });
  it('a month point reads "Nov 2025", even the first one of Last 12 months that starts mid-month', () => {
    expect(chartAxisDateText(bar('month', '2025-11-09', '2025-11-30'))).toBe('Nov 2025');
    expect(chartAxisDateText(bar('month', '2026-11-01', '2026-11-30'))).toBe('Nov 2026');
  });
  it('a week point keeps its Monday, "17 Aug"', () => {
    expect(chartAxisDateText(bar('week', '2026-08-17', '2026-08-23'))).toBe('17 Aug');
  });
  it('the card passes it to the line only when the points are months', () => {
    const card = readFileSync(join(__dirname, '..', '..', 'src', 'tracker', 'components', 'profile', 'HistoryChartCard.tsx'), 'utf8');
    expect(card).toMatch(/xAxisLabel=\{list\.some\(\(b\) => b\.kind === 'month'\)/);
    expect(card).toContain('chartAxisDateText(b)');
  });
});

describe('the days one bar covers', () => {
  it('a week bar runs Monday to Sunday, across a month and a year end', () => {
    expect(barRange('2026-10-05', 'week')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(barRange('2026-09-28', 'week')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(barRange('2025-12-29', 'week')).toEqual({ from: '2025-12-29', to: '2026-01-04' });
  });
  it('a month bar runs to its last day (a "YYYY-MM" month too), leap years included', () => {
    expect(barRange('2026-10-01', 'month')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(barRange('2026-11', 'month')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(barRange('2028-02', 'month')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(barRange('2026-02', 'month')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
  it('the box says the period as the Profile chart does', () => {
    expect(historyRangeText(barRange('2026-10-05', 'week'), '2026-11-08')).toBe('5–11 Oct');
    expect(historyRangeText(barRange('2026-10', 'month'), '2026-11-08')).toBe('Oct 2026');
  });
});
