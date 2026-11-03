/**
 * R-311 (owner, 3 Nov 2026): the exercise chart's picked point stays after the finger lifts and its
 * label opens the workout behind the point; the finish screen's "last time" line opens that workout.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';
import { chartTap } from '@/tracker/lib/chartTime';
import { bestPerDay, metricSeries, workoutForPoint } from '@/tracker/services/exerciseChart';

const SRC = join(__dirname, '..', '..', 'src');
const read = (p: string): string => readFileSync(join(SRC, p), 'utf8');

let n = 0;
const entry = (sessionId: string, dateISO: string, sets: [number, number][], extra: Partial<ExerciseHistoryEntry> = {}): ExerciseHistoryEntry => ({
  sessionId,
  dateISO,
  volumeKg: sets.reduce((a, [w, r]) => a + w * r, 0),
  sets: sets.map(([weightKg, reps], i) => ({ id: `s${n++}`, sessionId, exerciseId: 'bench', setNumber: i + 1, weightKg, reps, isWarmup: false })),
  ...extra,
});

// Newest first, as the page holds it. Two workouts on 2023-03-12: a heavy morning and a light evening.
const HISTORY: ExerciseHistoryEntry[] = [
  entry('today', '2026-11-01', [[60, 8]]),
  entry('evening', '2023-03-12', [[50, 8], [40, 2]]),
  entry('morning', '2023-03-12', [[100, 5], [100, 5]]),
  entry('easy', '2024-01-02', [[40, 10]], { easyWeek: true }),
];

describe('R-311: the workout behind a chart point', () => {
  it('opens the workout whose own number is the point (the day keeps its best)', () => {
    for (const m of ['heaviest', 'workoutLifted', 'e1rm'] as const) {
      const p = bestPerDay(m, metricSeries(m, HISTORY, [], 'metric', 'km')).find((x) => x.x === '2023-03-12')!;
      expect(workoutForPoint(m, p, HISTORY, 'metric', 'km')).toBe('morning');
    }
    // Total reps: 10 each, a tie; either workout of that day made the point.
    const p = bestPerDay('totalReps', metricSeries('totalReps', HISTORY, [], 'metric', 'km')).find((x) => x.x === '2023-03-12')!;
    expect(['morning', 'evening']).toContain(workoutForPoint('totalReps', p, HISTORY, 'metric', 'km'));
  });
  it('the least help wins for an assisted lift', () => {
    const h = [entry('a', '2025-05-05', [[-30, 8]]), entry('b', '2025-05-05', [[-10, 8]])];
    expect(workoutForPoint('leastHelp', { x: '2025-05-05', y: 999 }, h, 'metric', 'km')).toBe('b');
  });
  it('"Best set": the day workout with the biggest weight x reps set', () => {
    expect(workoutForPoint('bestSet', { x: '2023-03-12', y: 123 }, HISTORY, 'metric', 'km')).toBe('morning');
  });
  it('a day with only an easy week still opens it; no workout that day = null', () => {
    expect(workoutForPoint('heaviest', { x: '2024-01-02', y: 40 }, HISTORY, 'metric', 'km')).toBe('easy');
    expect(workoutForPoint('heaviest', { x: '2020-01-01', y: 40 }, HISTORY, 'metric', 'km')).toBeNull();
  });
  it('works in pounds too (the point is in the shown unit)', () => {
    const p = bestPerDay('heaviest', metricSeries('heaviest', HISTORY, [], 'imperial', 'mi')).find((x) => x.x === '2023-03-12')!;
    expect(workoutForPoint('heaviest', p, HISTORY, 'imperial', 'mi')).toBe('morning');
  });
});

describe('R-311: a wobbly tap the page took but did not scroll keeps the point', () => {
  const t = (before: number | null, at: number | null, extra: Partial<Parameters<typeof chartTap>[0]> = {}) =>
    chartTap({ before, at, moved: false, outside: false, now: at, ...extra });
  it('taken, page did not move: the landed point stays', () => {
    expect(t(null, 4, { taken: true, scrolled: false, heldMs: 90 })).toBe(4);
    expect(t(2, 4, { taken: true, scrolled: false, heldMs: 90 })).toBe(4);
  });
  it('taken and the page scrolled: as before (B4)', () => {
    expect(t(null, 4, { taken: true, scrolled: true })).toBeNull();
    expect(t(2, 4, { taken: true, scrolled: true })).toBe(2);
  });
});

describe('R-311: the screens are wired', () => {
  it('the chart label is a button that opens the workout', () => {
    const chart = read('tracker/components/DateLineChart.tsx');
    expect(chart).toContain('onOpenPicked');
    expect(chart).toContain('minHeight: 44');
    expect(chart).toContain('measureInWindow');
    const ex = read('tracker/components/ExerciseMetricChart.tsx');
    expect(ex).toContain('workoutForPoint(metric, p, history, units, distUnit)');
    expect(ex).toContain('pickedDate={(x) => tinyDateWithYear(x)}');
    expect(read('app/exercise/[id].tsx').match(/onOpenWorkout=\{openSession\}/g)?.length).toBe(2);
  });
  it('the finish screen line opens last time', () => {
    expect(read('tracker/services/coachNote.ts')).toContain('againstId');
    const fin = read('app/session/finish.tsx');
    expect(fin).toContain('onOpenLast={openLast}');
    expect(fin).toContain("pathname: '/session/[id]', params: { id: lastId }");
    expect(read('tracker/components/KgHeroCard.tsx')).toContain('accessibilityRole="link"');
    expect(read('tracker/components/CompareNote.tsx')).toContain('See that workout');
  });
});
