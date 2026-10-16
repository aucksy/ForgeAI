import { describe, expect, it } from 'vitest';

import { KG_PER_LB } from '@/lib/format';
import { MUSCLES } from '@/tracker/catalog/muscles';
import { totalsOf } from '@/tracker/engine/reports';
import {
  GROUP_OF,
  bucketLabel,
  bucketOf,
  bucketsBetween,
  distribution,
  groupShares,
  groupTotals,
  periodPair,
  rangeFrom,
  sessionGroupSets,
  setsSeries,
  timesText,
  totalsBetween,
  type StatSession,
} from '@/tracker/engine/statistics';
import type { VolumeSession } from '@/tracker/engine/volume';
import { calendarMonths, calendarYears, dayISO, dayTap, monthTotal, monthWeeks, workoutsLine, yearTotal } from '@/tracker/lib/calendarView';
import { MEASURE_CHIPS, chipLabel, entryPlan, openingChip } from '@/tracker/lib/measuresView';

const ex = (primary: string[], secondary: string[] = []) => ({
  id: primary.join('+'),
  logType: 'weight_reps' as const,
  loadMode: 'one' as const,
  bwShare: 0,
  muscles: { primary, secondary } as never,
});
const set = (warm = false) => ({ weightKg: 50, reps: 10, isWarmup: warm });

const stat = (dateISO: string, groups: StatSession['groups'], extra: Partial<StatSession> = {}): StatSession => ({
  sessionId: dateISO,
  dateISO,
  durationSec: 3600,
  volumeKg: 1000,
  sets: 10,
  exercises: [],
  groups,
  ...extra,
});

describe('Statistics: sets per muscle group', () => {
  it('maps every finer muscle but cardio to a group', () => {
    for (const m of MUSCLES) {
      if (m === 'cardio') expect(GROUP_OF[m]).toBeNull();
      else expect(GROUP_OF[m]).not.toBeNull();
    }
  });
  it('counts a set once per group, at its biggest share there', () => {
    // Lat pulldown: lats 1, upper back ½ → one back set; biceps ½ → half an arm set.
    const shares = groupShares({ primary: ['lats'], secondary: ['upper_back', 'biceps'] } as never);
    expect(shares.get('back')).toBe(1);
    expect(shares.get('arms')).toBe(0.5);
  });
  it('skips warm-ups and sums working sets per group', () => {
    const s: VolumeSession = {
      dateISO: '2026-10-01',
      exercises: [
        { exercise: ex(['chest'], ['triceps', 'front_delts']), sets: [set(true), set(), set(), set()] },
        { exercise: ex(['quads'], ['glutes']), sets: [set(), set()] },
        { exercise: ex(['cardio']), sets: [set()] },
      ],
    };
    expect(sessionGroupSets(s)).toEqual({ chest: 3, arms: 1.5, shoulders: 1.5, legs: 2 });
  });
  it('fills every week of the range, empty ones as 0, for the picked groups only', () => {
    const sessions = [stat('2026-09-29', { chest: 4, back: 3 }), stat('2026-10-02', { chest: 2 }), stat('2026-10-14', { back: 5 })];
    const out = setsSeries(sessions, '2026-09-29', '2026-10-15', 'week', ['chest']);
    expect(out).toEqual([
      { bucket: '2026-09-28', sets: 6 },
      { bucket: '2026-10-05', sets: 0 },
      { bucket: '2026-10-12', sets: 0 },
    ]);
    expect(setsSeries(sessions, '2026-09-01', '2026-10-31', 'month', ['chest', 'back']).map((p) => p.sets)).toEqual([7, 7]);
  });
  it('buckets by Monday or by the 1st and labels them', () => {
    expect(bucketOf('2026-10-11', 'week')).toBe('2026-10-05');
    expect(bucketOf('2026-10-11', 'month')).toBe('2026-10-01');
    expect(bucketsBetween('2025-11-15', '2026-02-02', 'month')).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
    expect(bucketLabel('2026-10-05', 'week')).toBe('5 Oct'); // C2-9: day first
    expect(bucketLabel('2025-12-01', 'month', true)).toBe("Dec '25");
  });
  it('starts each range on the right day', () => {
    expect(rangeFrom('30d', '2026-10-11', '2020-01-01')).toBe('2026-09-12');
    expect(rangeFrom('1y', '2026-10-11', null)).toBe('2025-10-12');
    expect(rangeFrom('all', '2026-10-11', '2022-05-03')).toBe('2022-05-03');
    expect(rangeFrom('all', '2026-10-11', null)).toBe('2026-10-11');
  });
});

describe('Statistics: this period against the one before', () => {
  it('compares two periods of the same length that never overlap', () => {
    const p = periodPair('30d', '2026-10-11');
    expect(p.cur).toEqual({ from: '2026-09-12', to: '2026-10-11' });
    expect(p.prev).toEqual({ from: '2026-08-13', to: '2026-09-11' });
  });
  it('splits sets by group for each period', () => {
    const sessions = [stat('2026-09-01', { chest: 4 }), stat('2026-10-01', { chest: 2.5, legs: 6 })];
    const d = distribution(sessions, periodPair('30d', '2026-10-11'));
    expect(d.find((x) => x.group === 'chest')).toMatchObject({ cur: 2.5, prev: 4 });
    expect(d.find((x) => x.group === 'legs')).toMatchObject({ cur: 6, prev: 0 });
    expect(d.map((x) => x.label)).toEqual(['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core']);
    expect(groupTotals(sessions, '2026-01-01', '2026-12-31').chest).toBe(6.5);
  });
  it('totals are exactly the reports rule (one volume rule, same sets)', () => {
    const sessions = [stat('2026-10-01', {}, { volumeKg: 1234.5, durationSec: 100, sets: 7 }), stat('2026-10-03', {}, { volumeKg: 66, durationSec: 0, sets: 3 }), stat('2026-08-01', {}, { volumeKg: 999 })];
    expect(totalsBetween(sessions, '2026-09-12', '2026-10-11')).toEqual(totalsOf(sessions.slice(0, 2)));
    expect(totalsBetween(sessions, '2026-09-12', '2026-10-11')).toMatchObject({ workouts: 2, volumeKg: 1300.5, sets: 10, durationSec: 100 });
  });
  it('says how often an exercise was done', () => {
    expect(timesText(24)).toBe('24 times');
    expect(timesText(1)).toBe('1 time');
  });
});

describe('Calendar', () => {
  it('lists every month from now back to the first workout', () => {
    expect(calendarMonths('2025-11-20', '2026-02-03')).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
    expect(calendarMonths(null, '2026-02-03')).toEqual(['2026-02']);
    expect(calendarYears('2024-06-01', '2026-02-03')).toEqual([2026, 2025, 2024]);
  });
  it('lays a month out Monday first', () => {
    const weeks = monthWeeks('2026-10'); // 1 Oct 2026 is a Thursday
    expect(weeks[0]).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter((d) => d != null)).toHaveLength(31);
    expect(dayISO('2026-10', 4)).toBe('2026-10-04');
  });
  it('counts workouts per month and year', () => {
    const days = { '2026-10-01': 1, '2026-10-09': 2, '2026-09-30': 1, '2025-10-01': 1 };
    expect(monthTotal(days, '2026-10')).toBe(3);
    expect(yearTotal(days, 2026)).toBe(4);
    expect(workoutsLine(0)).toBe('No workouts');
    expect(workoutsLine(1)).toBe('1 workout');
  });
  it('opens one workout straight away and lists several', () => {
    expect(dayTap(0)).toBe('none');
    expect(dayTap(1)).toBe('open');
    expect(dayTap(3)).toBe('list');
  });
});

describe('Measures', () => {
  it('puts body weight first, then waist and body fat, and every measurement once', () => {
    expect(MEASURE_CHIPS.slice(0, 3)).toEqual(['bodyweight', 'waist', 'body_fat']);
    expect(new Set(MEASURE_CHIPS).size).toBe(MEASURE_CHIPS.length);
    expect(MEASURE_CHIPS).toHaveLength(11);
    expect(chipLabel('bodyweight')).toBe('Body weight');
  });
  it('opens on the asked chip, else body weight', () => {
    expect(openingChip('bodyweight')).toBe('bodyweight');
    expect(openingChip('waist')).toBe('waist');
    expect(openingChip(['chest'])).toBe('chest');
    expect(openingChip('nonsense')).toBe('bodyweight');
    expect(openingChip(undefined)).toBe('bodyweight');
  });
  it('turns the + form into what to save, in stored units', () => {
    const metric = entryPlan('76,5', { waist: '82', body_fat: '' }, 'metric');
    expect(metric).toEqual({ weightKg: 76.5, measures: { waist: 82 }, bad: [], empty: false });
    const imperial = entryPlan('170', { waist: '32' }, 'imperial');
    expect(imperial.weightKg).toBeCloseTo(170 * KG_PER_LB, 6);
    expect(imperial.measures.waist).toBeCloseTo(32 * 2.54, 6);
  });
  it('names the boxes that are not numbers and knows an empty form', () => {
    expect(entryPlan('abc', { chest: 'x' }, 'metric').bad).toEqual(['Body weight', 'Chest']);
    expect(entryPlan('', {}, 'metric').empty).toBe(true);
  });
});
