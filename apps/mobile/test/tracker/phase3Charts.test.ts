/**
 * Phase 3 — charts space points by the real date (Hevy complaint #10, 113 upvotes).
 *
 * Before: the frozen LineChart / Sparkline put every point at an equal step by its INDEX,
 * so workouts on 1, 2 and 31 January were drawn evenly — the one-day gap and the 29-day gap
 * looked the same. These tests fail on that code: the date geometry did not exist, and the
 * screens imported the index-spaced charts.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dateXs, nearestIndex } from '@/tracker/lib/chartTime';

describe('points sit at their real date', () => {
  it('a workout one day after the first sits near the left, not in the middle', () => {
    const xs = dateXs(['2026-01-01', '2026-01-02', '2026-01-31'], 40, 300);
    expect(xs[0]).toBe(40);
    expect(xs[2]).toBe(340);
    // 1 day of a 30-day span = 10 px. Index spacing put it at 190 (the middle).
    expect(xs[1]).toBeCloseTo(50, 5);
  });

  it('equal gaps in time are equal gaps on screen', () => {
    const xs = dateXs(['2026-03-01', '2026-03-08', '2026-03-15', '2026-04-12'], 0, 600);
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1], 5);
    expect(xs[3] - xs[2]).toBeCloseTo(4 * (xs[1] - xs[0]), 5);
  });

  it('crosses a daylight-saving change without drifting off whole days', () => {
    const xs = dateXs(['2026-03-28', '2026-03-29', '2026-03-30'], 0, 200);
    expect(xs[1]).toBeCloseTo(100, 5);
  });

  it('one point sits in the middle; several on one day spread out instead of stacking', () => {
    expect(dateXs(['2026-05-05'], 10, 100)).toEqual([60]);
    expect(dateXs(['2026-05-05', '2026-05-05', '2026-05-05'], 0, 100)).toEqual([0, 50, 100]);
  });

  it('two workouts on one day sit side by side inside that day, in order', () => {
    const xs = dateXs(['2026-06-01', '2026-06-02', '2026-06-02', '2026-06-11'], 0, 1000);
    expect(xs[1]).toBeCloseTo(100, 5);
    expect(xs[2]).toBeGreaterThan(xs[1]);
    expect(xs[2]).toBeLessThan(200);
    expect(xs[3]).toBe(1000);
  });

  it('labels that are not dates keep the even spacing', () => {
    expect(dateXs(['Mon', 'Tue', 'Wed'], 0, 100)).toEqual([0, 50, 100]);
  });

  it('the finger picks the point nearest in time', () => {
    const xs = dateXs(['2026-01-01', '2026-01-02', '2026-01-31'], 0, 300);
    expect(nearestIndex(xs, 0)).toBe(0);
    expect(nearestIndex(xs, 12)).toBe(1);
    // xs = [0, 10, 300]: the halfway mark between day 2 and day 31 is x = 155.
    expect(nearestIndex(xs, 150)).toBe(1);
    expect(nearestIndex(xs, 160)).toBe(2);
    expect(nearestIndex([], 5)).toBe(-1);
  });
});

/** Every .ts/.tsx file under a folder. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('every line chart of dated points uses the date-spaced chart', () => {
  // [source-text check] Architecture lint over source text — kept on purpose as lint, not a behaviour test (audit QA-12).
  it('[source-text check] no screen draws a line with the index-spaced LineChart or Sparkline', () => {
    const src = join(__dirname, '..', '..', 'src');
    const offenders = walk(src)
      .filter((f) => !relative(src, f).replace(/\\/g, '/').startsWith('components/charts/'))
      .filter((f) => {
        const text = readFileSync(f, 'utf8');
        const m = /import\s*\{([^}]*)\}\s*from\s*'@\/components\/charts'/.exec(text);
        return m != null && /\b(LineChart|Sparkline)\b/.test(m[1]);
      })
      .map((f) => relative(src, f).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });
});
