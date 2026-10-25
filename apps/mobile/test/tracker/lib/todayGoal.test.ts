import { describe, expect, it } from 'vitest';

import { barValue, chartBars, chartMetricLabel, chartValueText, isChartMetric } from '@/tracker/engine/historyChart';
import { goalText, goalTitle, plannedSets, type TodayGoal } from '@/tracker/lib/todayGoal';

const target = (o: Partial<Parameters<typeof plannedSets>[0]> = {}): Parameters<typeof plannedSets>[0] => ({
  targetWeightKg: 60,
  targetRepsMin: 8,
  targetSets: 3,
  repGoal: 10,
  setGoals: [],
  last: { weightKg: 57.5, topReps: 10, sets: 3, dateISO: '2026-10-20' },
  bodyweightOnly: false,
  logType: 'weight_reps',
  free: false,
  ...o,
});

const goal = (o: Partial<TodayGoal> = {}): TodayGoal => ({
  routineName: 'Push A',
  volumeKg: 5400,
  sets: 18,
  newExercises: 0,
  easy: false,
  last: { volumeKg: 5100, sets: 17, durationSec: 3480, dateISO: '2026-10-20' },
  ...o,
});

describe('planned sets from a Target (R-132)', () => {
  it('uses each set its own rep goal when they differ', () => {
    expect(plannedSets(target({ setGoals: [11, 9, 8] })).sets).toEqual([
      { weightKg: 60, reps: 11 },
      { weightKg: 60, reps: 9 },
      { weightKg: 60, reps: 8 },
    ]);
  });
  it('falls back to the rep goal, then the low end of the range', () => {
    expect(plannedSets(target()).sets.map((s) => s.reps)).toEqual([10, 10, 10]);
    expect(plannedSets(target({ repGoal: null })).sets.map((s) => s.reps)).toEqual([8, 8, 8]);
  });
  it('leaves a first-time weighted lift out of the kilos but keeps its sets', () => {
    const p = plannedSets(target({ targetWeightKg: 0, last: null, repGoal: null }));
    expect(p.kgKnown).toBe(false);
    expect(p.sets).toHaveLength(3);
  });
  it('a body-weight move carries no added weight (the volume rule adds the body where it should)', () => {
    const p = plannedSets(target({ bodyweightOnly: true, logType: 'reps', targetWeightKg: 0 }));
    expect(p.kgKnown).toBe(true);
    expect(p.sets.every((s) => s.weightKg === 0)).toBe(true);
  });
  it('timed or distance work counts as sets only', () => {
    const p = plannedSets(target({ free: true, logType: 'time', targetSets: 2 }));
    expect(p.sets).toEqual([
      { weightKg: 0, reps: 0 },
      { weightKg: 0, reps: 0 },
    ]);
  });
});

describe('what the Today card says (R-132)', () => {
  it('kilos: the goal and how much more than last time', () => {
    const t = goalText(goal(), 'volume', 'metric');
    expect(goalTitle(goal())).toBe('Today: Push A');
    expect(t.big).toBe('5,400 kg');
    expect(t.label).toBe('to lift today');
    expect(t.line).toBe('300 kg more than last time (5,100 kg).');
    expect(t.trend).toBe('up');
  });
  it('kilos: an easy week is lower and says why', () => {
    const t = goalText(goal({ volumeKg: 2700, easy: true }), 'volume', 'metric');
    expect(t.trend).toBe('down');
    expect(t.line).toContain('less than last time');
    expect(t.note).toBe('This is an easy week, so the goal is lower.');
  });
  it('kilos: new exercises are named as not counted', () => {
    expect(goalText(goal({ newExercises: 1 }), 'volume', 'metric').note).toBe('1 new exercise is not in your goal yet. It joins after you do it once.');
    expect(goalText(goal({ newExercises: 2 }), 'volume', 'metric').note).toContain('2 new exercises are not in your goal yet');
  });
  it('kilos: nothing known yet, or a first time', () => {
    expect(goalText(goal({ volumeKg: 0 }), 'volume', 'metric').big).toBe('—');
    expect(goalText(goal({ last: null }), 'volume', 'metric').line).toBe('Your first time doing this workout.');
  });
  it('sets: planned against last time', () => {
    const t = goalText(goal(), 'sets', 'metric');
    expect(t.big).toBe('18 sets');
    expect(t.line).toBe('1 set more than last time (17 sets).');
    expect(goalText(goal({ sets: 17 }), 'sets', 'metric').line).toBe('Same as last time (17 sets).');
  });
  it('duration: last time, or nothing yet', () => {
    expect(goalText(goal(), 'duration', 'metric').label).toBe('took last time');
    expect(goalText(goal({ last: null }), 'duration', 'metric').big).toBe('—');
  });
  it('never uses member-banned words', () => {
    const all = (['volume', 'sets', 'duration'] as const)
      .flatMap((m) => [goal(), goal({ easy: true, newExercises: 2 }), goal({ last: null })].map((g) => goalText(g, m, 'metric')))
      .map((t) => `${t.big} ${t.label} ${t.line} ${t.note ?? ''}`)
      .join(' ');
    expect(all).not.toMatch(/\b(volume|session|PR)\b/i);
  });
});

describe('history chart: Sets mode (R-132)', () => {
  it('adds up working sets per bar and names them', () => {
    const bars = chartBars(
      [
        { dateISO: '2026-10-20', durationSec: 3000, volumeKg: 5000, reps: 100, sets: 18 },
        { dateISO: '2026-10-22', durationSec: 3000, volumeKg: 5000, reps: 100, sets: 15 },
        { dateISO: '2026-10-22', durationSec: 0, volumeKg: 0, reps: 0 },
      ],
      'weeks',
      '2026-10-25',
    );
    expect(barValue(bars[bars.length - 1], 'sets')).toBe(33);
    expect(isChartMetric('sets')).toBe(true);
    expect(chartMetricLabel('sets', 'metric')).toBe('Sets');
    expect(chartValueText(1, 'sets', 'metric')).toBe('1 set');
  });
});
