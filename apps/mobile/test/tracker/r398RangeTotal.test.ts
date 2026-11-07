import { describe, expect, it } from 'vitest';

import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';
import { rangeTotal, rangeTotalText } from '@/tracker/services/exerciseChart';

// R-398 (owner, 7 Nov 2026): "No way to see All Time Total for the exercise".
const w = (sessionId: string, dateISO: string, sets: Array<{ weightKg: number; reps: number }>, easyWeek?: boolean): ExerciseHistoryEntry =>
  ({
    sessionId,
    dateISO,
    sets: sets.map((s) => ({ ...s })) as unknown as ExerciseHistoryEntry['sets'],
    volumeKg: sets.reduce((a, s) => a + Math.max(0, s.weightKg) * Math.max(0, s.reps), 0),
    easyWeek,
  });

// Newest first, as the page reads it.
const history: ExerciseHistoryEntry[] = [
  w('d', '2026-11-05', [{ weightKg: 20, reps: 15 }, { weightKg: 20, reps: 12 }]), // 540 kg, 27 reps
  w('c', '2026-10-01', [{ weightKg: 18, reps: 10 }], true), // easy week: 180 kg, 10 reps
  w('b', '2026-06-01', [{ weightKg: 16, reps: 10 }]), // 160 kg
  w('a', '2025-06-02', [{ weightKg: 10, reps: 10 }]), // 100 kg
];
const today = '2026-11-07';

describe('R-398 total over the chosen range', () => {
  it('all time adds up every workout, easy weeks too (happy path)', () => {
    expect(rangeTotal('workoutLifted', history, 'all', today, 'metric', 'km')).toEqual({ total: 980, workouts: 4 });
    expect(rangeTotalText('workoutLifted', { total: 980, workouts: 4 }, 'all', 'metric', 'km')).toBe('Total, all time: 980 kg in 4 workouts');
  });
  it('the range pills cut it: last 3 months, last 12 months', () => {
    expect(rangeTotal('workoutLifted', history, '3m', today, 'metric', 'km')).toEqual({ total: 720, workouts: 2 });
    expect(rangeTotal('workoutLifted', history, '1y', today, 'metric', 'km')).toEqual({ total: 880, workouts: 3 });
    expect(rangeTotalText('workoutLifted', { total: 720, workouts: 2 }, '3m', 'metric', 'km')).toBe('Total, last 3 months: 720 kg in 2 workouts');
  });
  it('reps add up for reps charts', () => {
    expect(rangeTotal('totalReps', history, 'all', today, 'metric', 'km')).toEqual({ total: 57, workouts: 4 });
    expect(rangeTotalText('totalReps', { total: 57, workouts: 4 }, 'all', 'metric', 'km')).toBe('Total, all time: 57 reps in 4 workouts');
  });
  it('big totals are grouped, pounds converted, one workout says "workout"', () => {
    const t = rangeTotalText('workoutLifted', { total: 52310, workouts: 1 }, 'all', 'metric', 'km');
    expect(t).toMatch(/^Total, all time: 52.310 kg in 1 workout$/);
    expect(Math.abs((rangeTotal('workoutLifted', [history[0]], 'all', today, 'imperial', 'km')?.total ?? 0) - 1190.5)).toBeLessThanOrEqual(1);
  });
  it('no total for charts that do not add up, or an empty range (negative)', () => {
    for (const m of ['heaviest', 'e1rm', 'bestSet', 'mostReps'] as const) {
      expect(rangeTotal(m, history, 'all', today, 'metric', 'km')).toBeNull();
    }
    expect(rangeTotal('workoutLifted', [], 'all', today, 'metric', 'km')).toBeNull();
    expect(rangeTotal('workoutLifted', [history[3]], '3m', today, 'metric', 'km')).toBeNull();
  });
});
