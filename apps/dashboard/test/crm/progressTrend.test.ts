/**
 * R-535 / R-537: the trend maths on Training progress. The strength score is the member app's own estimated 1-rep
 * max (the same formula, the same 12-rep cap); the tags; the main exercises; workouts per week over everything shared.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { addDays } from '../../src/crm/logic/dates';
import { recentWorkoutsFrom, type RecentWorkout } from '../../src/crm/logic/memberProgress';
import {
  SCORE_MAX_REPS,
  TREND_WORDS,
  exerciseTrends,
  headlineExercise,
  mainExercises,
  monotonePath,
  overallTrend,
  placePoints,
  sharedRange,
  strengthScore,
  trendOf,
  weeklyWorkouts,
  yScale,
} from '../../src/crm/logic/progressTrend';
import type { TrainerSummary } from '../../src/crm/logic/trainerView';

// A Saturday; its week's Monday is 9 Nov.
const TODAY = '2026-11-14';

const empty: TrainerSummary = { weeks: [], best: [], records: [], last: null };

/** 3 months, 2 workouts a week: bench press climbs 2.5 kg every 2 weeks; squat stays at 80 x 5; pull-ups at 8. */
function threeMonths(): RecentWorkout[] {
  const out: RecentWorkout[] = [];
  for (let i = 0; i < 26; i++) {
    const d = addDays(TODAY, -3 - Math.floor(i / 2) * 7 - (i % 2) * 3);
    const step = Math.floor((25 - i) / 4);
    out.push({
      d,
      n: i % 2 ? 'Leg day' : 'Push day',
      x: [
        { n: 'Bench press', w: 50 + 2.5 * step, r: 8, s: 4 },
        { n: 'Squat', w: 80, r: 5, s: 5 },
        { n: 'Pull-up', w: 0, r: 8, s: 3 },
      ],
    });
  }
  return out;
}

describe('the strength score is the member app’s estimated 1-rep max', () => {
  it('Epley: kg x (1 + reps / 30); a single is itself', () => {
    expect(strengthScore(100, 1)).toBe(100);
    expect(strengthScore(100, 5)).toBeCloseTo(116.667, 3);
    expect(strengthScore(60, 10)).toBeCloseTo(80, 6);
  });

  it('heavier-for-fewer and lighter-for-more compare fairly', () => {
    // 80 x 5 and 70 x 10 are the same strength.
    expect(Math.abs(strengthScore(80, 5) - strengthScore(70, 10))).toBeLessThan(0.01);
    expect(strengthScore(100, 5)).toBeGreaterThan(strengthScore(80, 8));
  });

  it('reps above 12 count as 12, like the app (70 x 25 is not a 128 kg lift)', () => {
    expect(strengthScore(70, 25)).toBeCloseTo(98, 6);
    expect(strengthScore(70, 25)).toBe(strengthScore(70, 12));
  });

  it('no weight or no reps: no score', () => {
    expect(strengthScore(0, 12)).toBe(0);
    expect(strengthScore(50, 0)).toBe(0);
    expect(strengthScore(Number.NaN, 5)).toBe(0);
  });

  it('the 12-rep cap is the SAME number as in the member app', () => {
    const src = readFileSync(fileURLToPath(new URL('../../../mobile/src/lib/e1rm.ts', import.meta.url)), 'utf8');
    expect(src).toMatch(new RegExp(`export const E1RM_MAX_REPS = ${SCORE_MAX_REPS};`));
    const engine = readFileSync(fileURLToPath(new URL('../../../mobile/src/engine/overload.ts', import.meta.url)), 'utf8');
    expect(engine).toContain('if (reps === 1) return weightKg;');
    expect(engine).toContain('return weightKg * (1 + reps / 30);');
  });
});

describe('the tag', () => {
  const pts = (pairs: [number, number][]) => pairs.map(([ago, v]) => ({ d: addDays(TODAY, -ago), v }));

  it('3% or more up in the last 6 weeks vs the 6 before: Getting stronger', () => {
    expect(trendOf(pts([[70, 60], [50, 61], [30, 62], [10, 63]]), TODAY)).toEqual({ trend: 'up', before: 61, now: 63 });
  });

  it('within 3%: Steady', () => {
    expect(trendOf(pts([[70, 60], [30, 61], [10, 60.5]]), TODAY).trend).toBe('steady');
  });

  it('3% or more down: Dropping', () => {
    expect(trendOf(pts([[70, 80], [50, 80], [20, 76], [5, 75]]), TODAY)).toEqual({ trend: 'down', before: 80, now: 76 });
  });

  it('fewer than 3 points: Not enough data yet', () => {
    expect(trendOf(pts([[70, 60], [10, 70]]), TODAY).trend).toBe('unknown');
    expect(trendOf([], TODAY).trend).toBe('unknown');
  });

  it('nothing in one of the two halves: Not enough data yet (a new member, or back after a break)', () => {
    expect(trendOf(pts([[30, 60], [20, 62], [10, 64]]), TODAY).trend).toBe('unknown');
    expect(trendOf(pts([[80, 60], [70, 62], [60, 64]]), TODAY).trend).toBe('unknown');
  });

  it('workouts older than 12 weeks never move the tag', () => {
    expect(trendOf(pts([[300, 200], [70, 60], [30, 61], [10, 61]]), TODAY).trend).toBe('steady');
  });

  it('the words', () => {
    expect(Object.values(TREND_WORDS)).toEqual(['Getting stronger', 'Steady', 'Dropping', 'Not enough data yet']);
    for (const w of Object.values(TREND_WORDS)) expect(w).not.toMatch(/volume|\bPR\b|session/i);
  });
});

describe('a member who gets stronger on one lift and is stuck on another', () => {
  const recent = threeMonths();
  const trends = exerciseTrends(recent, TODAY);
  const by = new Map(trends.map((t) => [t.n, t]));

  it('one point per day, oldest first', () => {
    const bench = by.get('Bench press')!;
    expect(bench.points).toHaveLength(26);
    expect(bench.points[0]!.d < bench.points[25]!.d).toBe(true);
    expect(bench.kind).toBe('kg');
    expect(bench.best.w).toBe(65);
  });

  it('bench press: Getting stronger; squat: Steady; pull-up (no weight) is drawn as reps: Steady', () => {
    expect(by.get('Bench press')!.trend).toBe('up');
    expect(by.get('Squat')!.trend).toBe('steady');
    expect(by.get('Pull-up')!.kind).toBe('reps');
    expect(by.get('Pull-up')!.trend).toBe('steady');
  });

  it('overall: Getting stronger (1 up, 0 down)', () => {
    expect(overallTrend(mainExercises(trends))).toBe('up');
    expect(headlineExercise(mainExercises(trends))!.n).toBe('Bench press');
  });

  it('the most-done exercises come first, at most 6', () => {
    const many: RecentWorkout[] = [{ d: TODAY, n: 'A', x: 'abcdefgh'.split('').map((c, i) => ({ n: `Ex ${c}`, w: 10 + i, r: 5, s: 1 })) }];
    many.push({ d: addDays(TODAY, -1), n: 'B', x: [{ n: 'Ex h', w: 20, r: 5, s: 1 }] });
    const main = mainExercises(exerciseTrends(many, TODAY));
    expect(main).toHaveLength(6);
    expect(main[0]!.n).toBe('Ex h');
  });

  it('overall: more down than up is Dropping; even is Steady; none known is Not enough data yet', () => {
    expect(overallTrend([{ trend: 'down' }, { trend: 'down' }, { trend: 'up' }])).toBe('down');
    expect(overallTrend([{ trend: 'down' }, { trend: 'up' }, { trend: 'unknown' }])).toBe('steady');
    expect(overallTrend([{ trend: 'unknown' }])).toBe('unknown');
    expect(overallTrend([])).toBe('unknown');
  });
});

describe('workouts per week', () => {
  it('the summary’s 12 weeks, this week last; empty weeks are 0', () => {
    const s: TrainerSummary = { ...empty, weeks: [{ w: '2026-11-09', n: 2, kg: 0 }, { w: '2026-10-26', n: 4, kg: 0 }] };
    const weeks = weeklyWorkouts(s, [], TODAY);
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toEqual({ w: '2026-11-09', n: 2 });
    expect(weeks[9]).toEqual({ w: '2026-10-26', n: 4 });
    expect(weeks[10]!.n).toBe(0);
    expect(weeks[0]!.w).toBe('2026-08-24');
  });

  it('back to the oldest shared workout, counted from the workouts before the summary’s weeks', () => {
    const s: TrainerSummary = { ...empty, weeks: [{ w: '2026-11-09', n: 3, kg: 0 }] };
    const recent: RecentWorkout[] = [
      { d: '2026-11-10', n: 'A', x: [] },
      { d: '2026-05-05', n: 'A', x: [] },
      { d: '2026-05-07', n: 'A', x: [] },
    ];
    const weeks = weeklyWorkouts(s, recent, TODAY);
    expect(weeks[0]).toEqual({ w: '2026-05-04', n: 2 });
    expect(weeks[weeks.length - 1]).toEqual({ w: '2026-11-09', n: 3 });
    // Inside the summary's weeks its own count wins (it counts every workout, the list may be cut).
    expect(weeks.filter((w) => w.w >= '2026-08-24' && w.w < '2026-11-09').every((w) => w.n === 0)).toBe(true);
  });

  it('no summary weeks (should not happen): counted from the workouts', () => {
    const weeks = weeklyWorkouts(empty, [{ d: '2026-11-10', n: 'A', x: [] }, { d: '2026-11-12', n: 'B', x: [] }], TODAY);
    expect(weeks[weeks.length - 1]).toEqual({ w: '2026-11-09', n: 2 });
  });

  it('never more than a year of weeks', () => {
    const weeks = weeklyWorkouts(empty, [{ d: '2024-01-01', n: 'A', x: [] }], TODAY);
    expect(weeks).toHaveLength(53);
  });
});

describe('the range shown', () => {
  it('first and last day, and how many', () => {
    expect(sharedRange(threeMonths(), TODAY)).toEqual({ n: 26, from: '2026-08-16', to: '2026-11-11', capped: false });
    expect(sharedRange([], TODAY)).toBeNull();
  });

  it('30 workouts that do not reach back 3 months: the app’s 30-workout limit cut older ones', () => {
    const thirty: RecentWorkout[] = Array.from({ length: 30 }, (_, i) => ({ d: addDays(TODAY, -i * 2), n: 'A', x: [] }));
    expect(sharedRange(thirty, TODAY)!.capped).toBe(true);
  });

  it('the panel reads a year of workouts when a newer app shares them (no 30 cut)', () => {
    const year = Array.from({ length: 200 }, (_, i) => ({ d: addDays(TODAY, -i), n: 'A', x: [{ n: 'Squat', w: 80, r: 5, s: 3 }] }));
    const read = recentWorkoutsFrom(year);
    expect(read).toHaveLength(200);
    // R-551: the range line reads the whole span ("200 workouts, <first day> to <last day>").
    expect(sharedRange(read, TODAY)).toEqual({ n: 200, from: addDays(TODAY, -199), to: TODAY, capped: false });
  });
});

describe('the line chart', () => {
  it('a smooth line through every point, with no overshoot between equal points', () => {
    expect(monotonePath([])).toBe('');
    expect(monotonePath([{ x: 1, y: 2 }])).toBe('M1 2');
    const d = monotonePath([{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 0 }]);
    expect(d.startsWith('M0 10 C')).toBe(true);
    // The flat part stays flat: its control points sit on y = 10.
    expect(d.split(' C')[1]).toMatch(/^3\.33 10 6\.67 10 10 10$/);
  });

  it('points sit at their real days', () => {
    const pts = placePoints([{ x: '2026-11-01', y: 0 }, { x: '2026-11-11', y: 10 }, { x: '2026-11-21', y: 5 }], { left: 0, right: 100, top: 0, bottom: 50 }, '2026-11-01', '2026-11-21', 0, 10);
    expect(pts).toEqual([{ x: 0, y: 50 }, { x: 50, y: 0 }, { x: 100, y: 25 }]);
  });

  it('a tidy scale: counts from 0; strength scores around the values', () => {
    const c = yScale([0, 2, 3], true);
    expect(c.lo).toBe(0);
    expect(c.hi).toBeGreaterThanOrEqual(3);
    const s = yScale([60, 75], false);
    expect(s.lo).toBeLessThanOrEqual(60);
    expect(s.lo).toBeGreaterThan(0);
    expect(s.hi).toBeGreaterThanOrEqual(75);
    expect(s.ticks.length).toBeGreaterThanOrEqual(2);
    expect(yScale([], true).ticks).toEqual([0, 2, 4]);
  });
});
