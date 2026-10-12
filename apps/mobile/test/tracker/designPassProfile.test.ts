/**
 * 12 Oct 2026 design pass — the Profile tab and the pages it opens. The pure rules behind:
 *  - the exercise chart: one point per day, a grid that covers every point, a latest-value label
 *    that never sits on the line;
 *  - the Dashboard tiles: a name never breaks inside its word — the icon goes above it instead.
 */
import { describe, expect, it } from 'vitest';

import { niceTicks } from '@/components/charts/util';
import { coveringTicks, lastLabelY } from '@/tracker/lib/chartTime';
import { dashboardTileStacked, tileLabelWidth } from '@/tracker/lib/tileFit';
import { bestPerDay } from '@/tracker/services/exerciseChart';

const niceStep = (lo: number, hi: number): number => {
  const t = niceTicks(lo, hi, 4);
  return t.length > 1 ? t[1] - t[0] : (hi - lo) / 3;
};

describe('exercise chart: one point per day', () => {
  it('keeps the heaviest of two workouts on one day (the cliff on the owner’s emulator)', () => {
    const pts = [
      { x: '2026-09-01', y: 130 },
      { x: '2026-10-04', y: 140 },
      { x: '2026-10-11', y: 661.4 },
      { x: '2026-10-11', y: 105 },
    ];
    expect(bestPerDay('heaviest', pts)).toEqual([
      { x: '2026-09-01', y: 130 },
      { x: '2026-10-04', y: 140 },
      { x: '2026-10-11', y: 661.4 },
    ]);
  });

  it('keeps the least help for an assisted lift (less is stronger)', () => {
    expect(bestPerDay('leastHelp', [{ x: '2026-10-11', y: 30 }, { x: '2026-10-11', y: 20 }, { x: '2026-10-11', y: 25 }])).toEqual([{ x: '2026-10-11', y: 20 }]);
  });

  it('leaves one-a-day points as they are, oldest first, and does not touch its input', () => {
    const pts = [
      { x: '2026-10-01', y: 5 },
      { x: '2026-10-02', y: 7 },
    ];
    const out = bestPerDay('totalReps', pts);
    expect(out).toEqual(pts);
    expect(out).not.toBe(pts);
    expect(bestPerDay('heaviest', [])).toEqual([]);
  });
});

describe('exercise chart: the grid covers every point', () => {
  it('puts a line under the lowest point and over the highest', () => {
    // 105 … 661.4 padded by 8 %: the old grid was 200 · 400 · 600, with 105 and 661 outside it.
    const { lo, hi, ticks } = coveringTicks(60.5, 705.9, niceStep, 105);
    expect(lo).toBeLessThanOrEqual(105);
    expect(hi).toBeGreaterThanOrEqual(661.4);
    expect(ticks[0]).toBe(lo);
    expect(ticks[ticks.length - 1]).toBe(hi);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });

  it('never goes below 0 when no value does', () => {
    const { lo, ticks } = coveringTicks(-3, 104, niceStep, 5);
    expect(lo).toBe(0);
    expect(ticks.every((t) => t >= 0)).toBe(true);
  });

  it('keeps negative values inside too, and a flat line gets a range', () => {
    const neg = coveringTicks(-12, 9, niceStep, -10);
    expect(neg.lo).toBeLessThanOrEqual(-10);
    expect(neg.hi).toBeGreaterThanOrEqual(9);
    const flat = coveringTicks(80, 80, niceStep, 80);
    expect(flat.hi).toBeGreaterThan(flat.lo);
    expect(flat.lo).toBeLessThanOrEqual(80);
    expect(flat.hi).toBeGreaterThanOrEqual(80);
  });

  it('a body-weight range keeps fine steps', () => {
    const { lo, hi, ticks } = coveringTicks(79.8, 82.2, niceStep, 80);
    expect(lo).toBeLessThanOrEqual(79.8);
    expect(hi).toBeGreaterThanOrEqual(82.2);
    expect(hi - lo).toBeLessThan(10);
    expect(ticks.length).toBeLessThanOrEqual(5);
  });
});

describe('exercise chart: the latest value’s label stays off the line', () => {
  const TOP = 16;
  const BOTTOM = 180;
  it('above a dot the line climbs to, below a dot the line falls onto', () => {
    // Screen y grows downwards: a previous point with a larger y is lower, so the line climbs.
    expect(lastLabelY(60, 150, TOP, BOTTOM)).toBeLessThan(60);
    expect(lastLabelY(150, 60, TOP, BOTTOM)).toBeGreaterThan(150);
  });

  it('never leaves the plot', () => {
    expect(lastLabelY(178, 20, TOP, BOTTOM)).toBeLessThanOrEqual(BOTTOM - 2);
    expect(lastLabelY(18, 150, TOP, BOTTOM)).toBeGreaterThanOrEqual(TOP + 10);
    expect(lastLabelY(100, null, TOP, BOTTOM)).toBe(90);
  });
});

describe('Dashboard tiles: a name is never broken inside its word', () => {
  const LABELS = ['Statistics', 'Exercises', 'Measures', 'Calendar'];

  it('reads close to the emulator’s measured widths at 1.0', () => {
    expect(tileLabelWidth('Statistics', 1)).toBeGreaterThan(68);
    expect(tileLabelWidth('Statistics', 1)).toBeLessThan(80);
    expect(tileLabelWidth('Measures', 1)).toBeGreaterThan(68);
    expect(tileLabelWidth('Measures', 1)).toBeLessThan(80);
  });

  it('icon beside the name at the normal size, on a normal and a small phone', () => {
    expect(dashboardTileStacked(411, 1, LABELS)).toBe(false);
    expect(dashboardTileStacked(360, 1, LABELS)).toBe(false);
  });

  it('icon above the name at the owner’s large font + large display size', () => {
    // A large display size makes a 1080 px phone ~343–360 dp wide.
    expect(dashboardTileStacked(360, 1.3, LABELS)).toBe(true);
    expect(dashboardTileStacked(343, 1.3, LABELS)).toBe(true);
    expect(dashboardTileStacked(411, 2, LABELS)).toBe(true);
  });

  it('stacked, even the longest name fits the tile’s whole width at 1.3', () => {
    const tileInner = (343 - 2 * 20 - 12) / 2 - 2 * 16 - 2;
    for (const l of LABELS) expect(tileLabelWidth(l, 1.3)).toBeLessThan(tileInner);
  });
});
