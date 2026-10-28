/**
 * R-141 (owner, 27 Oct 2026): each workout on an exercise's History tab shows THIS exercise's
 * numbers in the profile feed's stats row — Kg lifted (warm-ups out), Sets, Best set; reps, time or
 * distance for moves with no weight; the workout in progress too. Opened from a live workout, the
 * chart starts on the per-workout total.
 */
import { describe, expect, it } from 'vitest';

import type { TrackedSetEntry } from '@/tracker/db/exerciseHistory';
import { workoutChartMetric, chartMetrics } from '@/tracker/services/exerciseChart';
import { exerciseWorkoutStats, liftedKg } from '@/tracker/services/exerciseWorkoutStats';
import { usesBannedWord } from '@/lib/words';

let n = 0;
const set = (weightKg: number, reps: number, extra: Partial<TrackedSetEntry> = {}): TrackedSetEntry => ({
  id: `s${++n}`,
  sessionId: 'w',
  exerciseId: 'e',
  setNumber: n,
  weightKg,
  reps,
  isWarmup: false,
  ...extra,
});

describe('R-141: the History card stats row', () => {
  it('weight × reps: his Triceps Pushdown (warm-up out) — 1,925 kg, 3 sets, best 45 kg × 13', () => {
    const sets = [set(30, 20, { isWarmup: true }), set(40, 20), set(45, 13), set(45, 12)];
    const stats = exerciseWorkoutStats(sets, 'weight_reps', 'metric');
    expect(stats).toEqual([
      { label: 'Kg lifted', value: '1,925' },
      { label: 'Sets', value: '3' },
      { label: 'Best set', value: '45 kg × 13' },
    ]);
  });

  it('two dumbbells count both, as the "Kg lifted per workout" chart does', () => {
    expect(liftedKg([set(20, 10)], 'both')).toBe(400);
    expect(liftedKg([set(20, 10)], 'one')).toBe(200);
    expect(exerciseWorkoutStats([set(20, 10)], 'weight_reps', 'metric', 'km', 'both')[0]).toEqual({ label: 'Kg lifted', value: '400' });
  });

  it('pounds for a member on lb', () => {
    expect(exerciseWorkoutStats([set(100, 5)], 'weight_reps', 'imperial')[0].label).toBe('Lb lifted');
  });

  it('a body-weight move shows reps', () => {
    const stats = exerciseWorkoutStats([set(0, 10), set(0, 8)], 'reps', 'metric');
    expect(stats[0]).toEqual({ label: 'Reps', value: '18' });
    expect(stats[1]).toEqual({ label: 'Sets', value: '2' });
    expect(stats[2].label).toBe('Best set');
  });

  it('a hold shows its time; distance work its distance', () => {
    expect(exerciseWorkoutStats([set(0, 0, { durationSec: 60 }), set(0, 0, { durationSec: 45 })], 'time', 'metric')[0]).toEqual({ label: 'Time', value: '1:45' });
    expect(exerciseWorkoutStats([set(0, 0, { distanceM: 2500 })], 'distance', 'metric')[0]).toEqual({ label: 'Distance', value: '2.5 km' });
  });

  it('no working sets (the in-progress card before a tick): no row', () => {
    expect(exerciseWorkoutStats([], 'weight_reps', 'metric')).toEqual([]);
    expect(exerciseWorkoutStats([set(20, 10, { isWarmup: true })], 'weight_reps', 'metric')).toEqual([]);
  });

  it('member words only: never "volume", "PR" or "session"', () => {
    const labels = [
      ...exerciseWorkoutStats([set(50, 5)], 'weight_reps', 'metric'),
      ...exerciseWorkoutStats([set(0, 5)], 'reps', 'metric'),
    ].map((s) => s.label);
    for (const l of labels) expect(usesBannedWord(l)).toBe(false);
  });
});

describe('R-141: from a live workout the chart starts on the per-workout total', () => {
  it('kg lifted for weight lifts, total reps / time / distance for the rest — always one of its chips', () => {
    expect(workoutChartMetric('weight_reps')).toBe('workoutLifted');
    expect(workoutChartMetric('reps')).toBe('workoutReps');
    expect(workoutChartMetric('time')).toBe('workoutTime');
    for (const lt of ['weight_reps', 'reps', 'weighted', 'assisted', 'time', 'distance', 'time_distance'] as const) {
      expect(chartMetrics(lt)).toContain(workoutChartMetric(lt));
    }
  });
});
