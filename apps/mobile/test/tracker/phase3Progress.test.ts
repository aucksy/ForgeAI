/**
 * Phase 3 — the body map, measurements, progress photos, and the monthly report / year in
 * review. Pure rules only (the screens are photographed on the cloud phone).
 */
import { describe, expect, it } from 'vitest';

import { BODY_BACK, BODY_FRONT, BODY_MAP_LICENSE } from '@/tracker/catalog/bodyMapPaths';
import { MUSCLES } from '@/tracker/catalog/muscles';
import { levelFor, MAPPED_MUSCLES, muscleLevels, regionLevel, untrainedLine, untrainedMuscles } from '@/tracker/engine/bodyMap';
import { MEASURES, measurementsToSave, parseMeasure, seriesFor, summarize, type MeasurementEntry } from '@/tracker/engine/measurements';
import {
  biggestGain,
  bodyweightChange,
  buildMonthReport,
  buildYearReview,
  changeText,
  durationText,
  lagging,
  longestWeekStreak,
  topExercises,
  type ReportSession,
} from '@/tracker/engine/reports';
import { apartText, daysInMonth, firstWeekday, monthDays, monthTitle, shiftMonth } from '@/tracker/lib/months';
import { demoMeasurementPlan } from '@/tracker/db/demoBody';
import { isOwnPhotoPath, photoExtension } from '@/tracker/services/progressPhotos';
import { reportIndex, strengthPoints, toReportSessions } from '@/tracker/services/reportsService';
import type { SessionDetail } from '@/types/models';

describe('the body map', () => {
  it('shades by working sets: under 3, 3–5, 6–9, 10 or more', () => {
    expect([0, 0.5, 2.5, 3, 5.5, 6, 9.5, 10, 25].map((s) => levelFor(s))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('side shoulders light the shoulder cap on both views', () => {
    const levels = muscleLevels([{ muscle: 'side_delts', sets: 6 }, { muscle: 'front_delts', sets: 1 }]);
    expect(regionLevel('front_delts', levels)).toBe(3);
    expect(regionLevel('rear_delts', levels)).toBe(3);
    expect(regionLevel('body', levels)).toBe(0);
  });

  it('names the muscles that got nothing, top to bottom, and never cardio', () => {
    const levels = muscleLevels([{ muscle: 'chest', sets: 9 }]);
    const skipped = untrainedMuscles(levels);
    expect(skipped).not.toContain('chest');
    expect(skipped).not.toContain('cardio');
    expect(skipped[0]).toBe('front_delts');
    expect(untrainedLine(['Calves'])).toBe('Calves');
    expect(untrainedLine(['Calves', 'Hamstrings'])).toBe('Calves and Hamstrings');
    expect(untrainedLine(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more');
  });

  it('the drawing has a region for every muscle the map names, and carries its licence', () => {
    const drawn = new Set([...BODY_FRONT.parts, ...BODY_BACK.parts].map((p) => p.region));
    for (const m of MAPPED_MUSCLES) {
      // Side shoulders show through the front and rear shoulder caps.
      if (m === 'side_delts') continue;
      expect(drawn.has(m), m).toBe(true);
    }
    expect(MAPPED_MUSCLES).toHaveLength(MUSCLES.length - 1);
    expect(BODY_MAP_LICENSE).toContain('MIT License');
    expect(BODY_MAP_LICENSE).toContain('ELABBASSI Hicham');
  });
});

describe('measurements', () => {
  it('reads what was typed: comma decimals, blanks skipped, words refused, no upper limit', () => {
    expect(parseMeasure(' 82,5 ')).toBe(82.5);
    expect(parseMeasure('')).toBeNull();
    expect(parseMeasure('abc')).toBeNaN();
    expect(parseMeasure('0')).toBeNaN();
    expect(parseMeasure('-3')).toBeNaN();
    expect(parseMeasure('250')).toBe(250);
    const { values, bad } = measurementsToSave({ waist: '81.04', chest: '', arm: 'big' });
    expect(values).toEqual({ waist: 81 });
    expect(bad).toEqual(['arm']);
  });

  it('latest value and change since the first, in the form order', () => {
    const e = (dateISO: string, kind: MeasurementEntry['kind'], value: number): MeasurementEntry => ({ id: `${kind}${dateISO}`, dateISO, kind, value });
    const entries = [e('2026-09-01', 'waist', 82), e('2026-10-01', 'waist', 80.6), e('2026-09-15', 'arm', 35), e('2026-09-01', 'body_fat', 16)];
    expect(summarize(entries).map((s) => [s.kind, s.latest, s.change])).toEqual([
      ['body_fat', 16, null],
      ['arm', 35, null],
      ['waist', 80.6, -1.4],
    ]);
    expect(seriesFor(entries, 'waist')).toEqual([
      { x: '2026-09-01', y: 82 },
      { x: '2026-10-01', y: 80.6 },
    ]);
    expect(MEASURES[0]).toBe('body_fat');
  });

  it('the demo adds seven entries two weeks apart, ending today', () => {
    const plan = demoMeasurementPlan('2026-10-07');
    expect(plan).toHaveLength(7);
    expect(plan[0].dateISO).toBe('2026-07-15');
    expect(plan[6].dateISO).toBe('2026-10-07');
    expect(plan[6].values.chest).toBe(100.6);
  });
});

describe('progress photos stay in their own folder', () => {
  const dir = 'file:///data/user/0/com.forgeai.app/files/progress-photos/';
  it('only ever deletes files the app put there', () => {
    expect(isOwnPhotoPath(`${dir}abc.jpg`, dir)).toBe(true);
    expect(isOwnPhotoPath('file:///sdcard/DCIM/me.jpg', dir)).toBe(false);
    expect(isOwnPhotoPath(`${dir}../secret.jpg`.replace('progress-photos/../', 'progress-photos/x/'), dir)).toBe(false);
    expect(isOwnPhotoPath(null, dir)).toBe(false);
    expect(isOwnPhotoPath('progress-photos/a.jpg', 'progress-photos/')).toBe(false);
  });
  it('keeps a picture extension', () => {
    expect(photoExtension('file:///cache/ImagePicker/1.jpeg')).toBe('jpeg');
    expect(photoExtension('content://media/123')).toBe('jpg');
    expect(photoExtension('file:///x/clip.mp4')).toBe('jpg');
  });
  it('two photos are so far apart', () => {
    expect(apartText('2026-10-01', '2026-10-01')).toBe('Same day');
    expect(apartText('2026-10-02', '2026-10-01')).toBe('1 day apart');
    expect(apartText('2026-08-20', '2026-10-01')).toBe('6 weeks apart');
    expect(apartText('2026-09-01', '2026-10-01')).toBe('30 days apart');
  });
});

describe('months', () => {
  it('step, span and lay out a month', () => {
    expect(monthTitle('2026-09')).toBe('September 2026');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthDays('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(daysInMonth('2026-09')).toBe(30);
    expect(firstWeekday('2026-09')).toBe(1); // 1 Sep 2026 is a Tuesday (Monday = 0)
  });
});

// ------------------------------------------------------------------ reports
let k = 0;
function rs(dateISO: string, over: Partial<ReportSession> = {}): ReportSession {
  k += 1;
  return {
    sessionId: `r${k}`,
    dateISO,
    durationSec: 3600,
    volumeKg: 5000,
    sets: 15,
    exercises: [
      { exerciseId: 'bench', name: 'Bench Press', sets: 5 },
      { exerciseId: 'row', name: 'Barbell Row', sets: 4 },
    ],
    ...over,
  };
}

describe('the monthly report', () => {
  const sep = ['2026-09-02', '2026-09-04', '2026-09-09', '2026-09-16', '2026-09-16'].map((d) => rs(d));
  const aug = ['2026-08-05', '2026-08-12', '2026-08-19'].map((d) => rs(d));

  it('adds up the month and compares it with the month before', () => {
    const r = buildMonthReport({
      month: '2026-09',
      complete: true,
      sessions: sep,
      previous: aug,
      records: [
        { exerciseId: 'bench', exerciseName: 'Bench Press', kind: 'weight', dateISO: '2026-09-16' },
        { exerciseId: 'bench', exerciseName: 'Bench Press', kind: 'best_set', dateISO: '2026-09-16' },
        { exerciseId: 'row', exerciseName: 'Barbell Row', kind: 'best_session', dateISO: '2026-09-09' },
      ],
      muscles: [{ muscle: 'chest', sets: 25 }],
      bodyweight: [
        { dateISO: '2026-08-30', weightKg: 75 },
        { dateISO: '2026-09-03', weightKg: 76 },
        { dateISO: '2026-09-28', weightKg: 76.8 },
      ],
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(r.totals).toEqual({ workouts: 5, days: 4, durationSec: 18000, timed: 5, volumeKg: 25000, sets: 75 });
    expect(r.previous?.workouts).toBe(3);
    expect(r.trainedDays).toEqual(['2026-09-02', '2026-09-04', '2026-09-09', '2026-09-16']);
    expect(r.bodyweight).toMatchObject({ start: 76, end: 76.8, change: 0.8 });
    expect(r.topExercises.map((e) => [e.name, e.sets, e.workouts])).toEqual([
      ['Bench Press', 25, 5],
      ['Barbell Row', 20, 5],
    ]);
    expect(r.note).toBe(
      // D10: three records on two lifts = "2 lifts beat their best".
      'You trained 5 times in September — 2 more than August. 2 lifts beat their best, led by Bench Press. Lats got no work — try pull-ups or lat pulldowns next month.',
    );
  });

  it('a month still running says "so far" and makes no comparison yet', () => {
    const r = buildMonthReport({ month: '2026-10', complete: false, sessions: [rs('2026-10-02')], previous: aug, records: [], muscles: [], bodyweight: [], from: '2026-10-01', to: '2026-10-31' });
    expect(r.note).toBe('You trained once in October so far. No new records this time — steady work still counts.');
  });

  it('only points at a lagging muscle in a month of real training', () => {
    expect(lagging([{ muscle: 'calves', sets: 2 }], 30)).toBeNull();
    const all = [
      { muscle: 'chest' as const, sets: 20 },
      { muscle: 'lats' as const, sets: 20 },
      { muscle: 'upper_back' as const, sets: 20 },
      { muscle: 'front_delts' as const, sets: 10 },
      { muscle: 'side_delts' as const, sets: 10 },
      { muscle: 'rear_delts' as const, sets: 6 },
      { muscle: 'quads' as const, sets: 20 },
      { muscle: 'hamstrings' as const, sets: 2.5 },
      { muscle: 'glutes' as const, sets: 10 },
      { muscle: 'calves' as const, sets: 8 },
      { muscle: 'abs' as const, sets: 6 },
    ];
    expect(lagging(all, 140)).toEqual({ muscle: 'hamstrings', sets: 2.5, move: 'Romanian deadlifts or leg curls' });
    expect(lagging(all.map((m) => ({ ...m, sets: Math.max(m.sets, 4) })), 140)).toBeNull();
  });

  it('tile changes and durations read plainly', () => {
    expect(changeText(14, 11, 'count')).toEqual({ value: '+3', good: true });
    expect(changeText(9, 11, 'count')).toEqual({ value: '−2', good: false });
    expect(changeText(11200, 10000, 'pct')).toEqual({ value: '+12%', good: true });
    expect(changeText(5, 5, 'count')).toEqual({ value: 'Same', good: true });
    expect(changeText(5, 0, 'count')).toBeNull();
    expect(durationText(0)).toBe('—');
    expect(durationText(45 * 60)).toBe('45 min');
    expect(durationText(11 * 3600 + 20 * 60)).toBe('11h 20m');
    expect(durationText(7199)).toBe('2h');
  });
});

describe('the year in review', () => {
  it('finds the busiest month, the longest streak and the biggest gain', () => {
    const sessions = [
      rs('2026-01-05'),
      rs('2026-01-12'),
      rs('2026-03-02'),
      rs('2026-03-04'),
      rs('2026-03-09'),
      rs('2026-03-16'),
      rs('2026-06-01'),
    ];
    const y = buildYearReview({
      year: 2026,
      complete: false,
      lastMonth: '2026-06',
      sessions,
      recordCount: 4,
      strength: [
        // PG-02: six workouts, the median of the first two against the last two.
        { exerciseId: 's', name: 'Squat', dateISO: '2026-01-05', e1rm: 100 },
        { exerciseId: 's', name: 'Squat', dateISO: '2026-01-12', e1rm: 100 },
        { exerciseId: 's', name: 'Squat', dateISO: '2026-03-02', e1rm: 104 },
        { exerciseId: 's', name: 'Squat', dateISO: '2026-03-09', e1rm: 108 },
        { exerciseId: 's', name: 'Squat', dateISO: '2026-03-16', e1rm: 112 },
        { exerciseId: 's', name: 'Squat', dateISO: '2026-06-01', e1rm: 118 },
        // too few workouts to count
        { exerciseId: 'd', name: 'Deadlift', dateISO: '2026-01-05', e1rm: 100 },
        { exerciseId: 'd', name: 'Deadlift', dateISO: '2026-06-01', e1rm: 200 },
      ],
      muscles: [],
      bodyweight: [],
    });
    expect(y.byMonth.map((m) => m.workouts)).toEqual([2, 0, 4, 0, 0, 1]);
    expect(y.busiest).toEqual({ month: '2026-03', workouts: 4 });
    expect(y.longestStreakWeeks).toBe(3); // 2, 9 and 16 March
    expect(y.gain).toEqual({ exerciseId: 's', name: 'Squat', fromKg: 100, toKg: 115, pct: 15 });
    expect(y.note).toBe(
      '2026 so far: 7 workouts, 7 hours and 35,000 kg lifted. Your busiest month was March, and Bench Press was your favourite — 35 sets. Biggest gain: Squat, up 15% (about 100 → 115 kg for one rep).',
    );
  });

  it('back-to-back weeks across a new year still count as a streak', () => {
    expect(longestWeekStreak(['2025-12-29', '2026-01-05', '2026-01-12', '2026-02-02'])).toBe(3);
    expect(longestWeekStreak([])).toBe(0);
  });

  it('a gain needs six workouts four weeks apart, and must be a gain', () => {
    const p = (d: string, e1rm: number) => ({ exerciseId: 'x', name: 'X', dateISO: d, e1rm });
    expect(biggestGain([p('2026-01-01', 100), p('2026-01-03', 110), p('2026-01-05', 120), p('2026-01-07', 130)])).toBeNull();
    expect(biggestGain([p('2026-01-01', 130), p('2026-02-03', 110), p('2026-03-05', 120), p('2026-04-07', 100)])).toBeNull();
  });

  it('body weight change needs two weigh-ins inside the period', () => {
    expect(bodyweightChange([{ dateISO: '2026-01-02', weightKg: 80 }], '2026-01-01', '2026-12-31')).toBeNull();
  });

  it('favourites rank by sets, then workouts, then name', () => {
    const s = [rs('2026-01-01', { exercises: [{ exerciseId: 'a', name: 'A', sets: 3 }, { exerciseId: 'b', name: 'B', sets: 3 }] })];
    expect(topExercises(s).map((e) => e.name)).toEqual(['A', 'B']);
  });
});

describe('the report reads', () => {
  const detail = (over: Partial<SessionDetail>): SessionDetail =>
    ({
      id: 's1',
      dateISO: '2026-09-02',
      startedAt: 1_000_000,
      endedAt: 1_000_000 + 3_600_000,
      dayType: 'push',
      notes: null,
      source: 'manual',
      totalVolumeKg: 4000,
      exercises: [
        {
          exercise: { id: 'bench', name: 'Bench Press' },
          volumeKg: 4000,
          sets: [
            { id: 'w', sessionId: 's1', exerciseId: 'bench', setNumber: 1, weightKg: 40, reps: 10, isWarmup: true },
            { id: 'a', sessionId: 's1', exerciseId: 'bench', setNumber: 2, weightKg: 80, reps: 8, isWarmup: false },
            { id: 'b', sessionId: 's1', exerciseId: 'bench', setNumber: 3, weightKg: 90, reps: 3, isWarmup: false },
          ],
        },
      ],
      ...over,
    }) as unknown as SessionDetail;

  it('count working sets and the workout\'s length (none when it has no end time)', () => {
    expect(toReportSessions([detail({})])[0]).toMatchObject({ durationSec: 3600, sets: 2, volumeKg: 4000 });
    expect(toReportSessions([detail({ endedAt: null })])[0].durationSec).toBe(0);
  });

  it('take each workout\'s best 1-rep max for weight exercises only', () => {
    expect(strengthPoints([detail({})], new Set(['bench']))).toEqual([{ exerciseId: 'bench', name: 'Bench Press', dateISO: '2026-09-02', e1rm: 80 * (1 + 8 / 30) }]);
    expect(strengthPoints([detail({})], new Set())).toEqual([]);
  });

  it('Progress offers last month\'s report and this year so far', () => {
    expect(reportIndex(['2026-10', '2026-09', '2026-07'], '2026-10-07')).toEqual({ month: '2026-09', year: 2026, lastYear: null });
    // A new member with only this month: this month so far.
    expect(reportIndex(['2026-10'], '2026-10-07')).toEqual({ month: '2026-10', year: 2026, lastYear: null });
    // January with nothing logged yet: last year's review.
    expect(reportIndex(['2025-12', '2025-11'], '2026-01-03')).toEqual({ month: '2025-12', year: 2025, lastYear: null });
    expect(reportIndex([], '2026-01-03')).toEqual({ month: null, year: null, lastYear: null });
  });
});
