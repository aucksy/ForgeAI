/**
 * Phase 3, packet B — one truth per number (audit HI-06, HI-10, HI-21, PG-02, PG-10, PG-11,
 * PG-12, PG-13, PG-22, SH-05, SH-07, SH-08; owner decisions D9 = weeks in a row, D10 = count
 * the LIFTS that beat a best). PURE rules here; the real-database "two ways" test is
 * test/db/twoWaysReal.test.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildInsight } from '@/engine/insights';
import { fmtInt } from '@/lib/format';
import { groupIntAs, groupingForLocale, phoneLocale } from '@/lib/numberFormat';
import { scoreTiles } from '@/lib/features';
import { streakText, weekStreak } from '@/lib/streak';
import { liftsBeatingBest, liftsUpShort, liftsUpText, weightChange, weightChangeText, weightChangeTone } from '@/tracker/engine/headline';
import { exerciseRecords, paceRuleText, setRecordValue, type RecordSession } from '@/tracker/engine/records';
import { biggestGain, monthNote, yearNote } from '@/tracker/engine/reports';
import { finishAnswer } from '@/tracker/services/finishSummary';

describe('D9 one streak: weeks in a row with at least one workout', () => {
  // Wed 2026-07-22; that week's Monday is 2026-07-20.
  const today = '2026-07-22';
  it('Mon/Wed/Fri for three weeks: a weekend never breaks it', () => {
    const dates = ['2026-07-06', '2026-07-08', '2026-07-10', '2026-07-13', '2026-07-15', '2026-07-17', '2026-07-20'];
    expect(weekStreak(dates, today)).toBe(3);
  });
  it('this week with no workout yet is still alive when last week had one', () => {
    expect(weekStreak(['2026-07-06', '2026-07-13'], today)).toBe(2);
  });
  it('a missed full week ends it', () => {
    expect(weekStreak(['2026-06-29', '2026-07-21'], today)).toBe(1);
    expect(weekStreak(['2026-07-06'], today)).toBe(0);
  });
  it('order does not matter and no workouts is 0', () => {
    expect(weekStreak(['2026-07-21', '2026-07-14'], today)).toBe(2);
    expect(weekStreak([], today)).toBe(0);
  });
  it('reads "N-week streak"', () => {
    expect(streakText(1)).toBe('1-week streak');
    expect(streakText(12)).toBe('12-week streak');
  });
  it('Home\'s insight line speaks weeks, never days', () => {
    const line = buildInsight({ streakWeeks: 5, proteinGapG: 0, liftsUp: 0, plateauedExercise: null, weeklyVolumeDeltaPct: 0, todayTrained: false });
    expect(line).toContain('5-week streak');
    expect(line).not.toMatch(/day streak/);
  });
});

describe('D10 record totals count the LIFTS that beat a best', () => {
  const ev = (exerciseId: string, dateISO: string) => ({ exerciseId, dateISO });
  const events = [ev('bench', '2026-10-06'), ev('bench', '2026-10-06'), ev('bench', '2026-10-08'), ev('squat', '2026-10-07'), ev('row', '2026-09-30')];
  it('three records on bench + one on squat = 2 lifts', () => {
    expect(liftsBeatingBest(events, '2026-10-05', '2026-10-11')).toBe(2);
    expect(liftsBeatingBest(events)).toBe(3);
  });
  it('wording', () => {
    expect(liftsUpText(4, 'this week')).toBe('4 lifts beat their best this week');
    expect(liftsUpText(1, 'this month')).toBe('1 lift beat its best this month');
    expect(liftsUpShort(4)).toBe('4 lifts up');
    expect(liftsUpShort(1)).toBe('1 lift up');
  });
  it('Home\'s insight says lifts, not "new PRs"', () => {
    const line = buildInsight({ streakWeeks: 0, proteinGapG: 0, liftsUp: 4, plateauedExercise: null, weeklyVolumeDeltaPct: 0, todayTrained: false });
    expect(line).toMatch(/^4 lifts beat their best this week/);
    expect(line).not.toMatch(/PR/);
  });
  it('a member\'s very first sets of an exercise are never a record (no event, so 0 lifts)', () => {
    const first: RecordSession = { sessionId: 's1', dateISO: '2026-10-06', startedAt: 1, sets: [{ weightKg: 60, reps: 8 }] };
    const r = exerciseRecords([first], { logType: 'weight_reps', loadMode: 'one', bwShare: 0 }, []);
    expect(r.events).toEqual([]);
    expect(liftsBeatingBest(r.events.map((e) => ({ exerciseId: 'bench', dateISO: e.dateISO })))).toBe(0);
  });
  it('the finish line counts lifts', () => {
    const base = { session: { exercises: [] } as never, setMeta: {}, totalVolumeKg: 12480, workingSetCount: 18, durationSec: 52 * 60 };
    const rec = (exerciseId: string) => ({ exerciseId }) as never;
    expect(finishAnswer({ ...base, records: [rec('a'), rec('a'), rec('b')] })).toBe('52 min · 18 sets · 12,480 kg lifted · 2 lifts beat their best');
    expect(finishAnswer({ ...base, records: [rec('a')] })).toBe('52 min · 18 sets · 12,480 kg lifted · 1 lift beat its best');
  });
  it('the month note counts lifts', () => {
    const r = {
      month: '2026-09',
      complete: false,
      totals: { workouts: 2, days: 2, durationSec: 0, timed: 0, volumeKg: 0, sets: 10 },
      previous: null,
      trainedDays: [],
      records: [
        { exerciseId: 'b', exerciseName: 'Bench Press', kind: 'weight' as const, dateISO: '2026-09-02' },
        { exerciseId: 'b', exerciseName: 'Bench Press', kind: 'e1rm' as const, dateISO: '2026-09-02' },
        { exerciseId: 's', exerciseName: 'Squat', kind: 'weight' as const, dateISO: '2026-09-03' },
      ],
      muscles: [],
      topExercises: [],
      bodyweight: null,
    };
    expect(monthNote(r)).toContain('2 lifts beat their best, led by Bench Press.');
    expect(monthNote({ ...r, records: r.records.slice(0, 2) })).toContain('Bench Press beat its best.');
  });
  it('the year note counts lifts', () => {
    const y = {
      year: 2026, complete: true, totals: { workouts: 3, days: 3, durationSec: 0, timed: 0, volumeKg: 0, sets: 9 },
      byMonth: [], busiest: null, topExercises: [], recordCount: 4, gain: null, longestStreakWeeks: 2, muscles: [], bodyweight: null,
    };
    expect(yearNote(y)).toContain('4 lifts beat their best.');
  });
});

describe('HI-10 a true single is its own 1-rep max', () => {
  it('100 kg × 1 → 100, 100 kg × 5 still estimates', () => {
    const rule = { logType: 'weight_reps', loadMode: 'one', bwShare: 0 } as const;
    expect(setRecordValue('e1rm', { weightKg: 100, reps: 1 }, rule, null)).toBe(100);
    expect(setRecordValue('e1rm', { weightKg: 100, reps: 5 }, rule, null)).toBeCloseTo(116.67, 2);
  });
});

describe('HI-21 best pace in the member\'s unit, and an impossible run is never a record', () => {
  const RUN = { logType: 'time_distance' as const, loadMode: 'one' as const, bwShare: 0, distUnit: 'km' as const, muscles: { primary: ['cardio'] } };
  const s = (id: string, dateISO: string, distanceM: number, durationSec: number): RecordSession => ({ sessionId: id, dateISO, startedAt: Number(id.slice(1)), sets: [{ weightKg: 0, reps: 0, distanceM, durationSec }] });
  it('2 km in 0:30 (0:15 /km) sets no pace', () => {
    expect(setRecordValue('pace', { weightKg: 0, reps: 0, distanceM: 2000, durationSec: 30 }, RUN, null)).toBeNull();
    const r = exerciseRecords([s('s1', '2026-09-01', 5000, 1500), s('s2', '2026-09-04', 2000, 30)], RUN, []);
    expect(r.events.filter((e) => e.kind === 'pace')).toEqual([]);
  });
  it('a real fast run still counts (3:00 /km)', () => {
    expect(setRecordValue('pace', { weightKg: 0, reps: 0, distanceM: 5000, durationSec: 900 }, RUN, null)).toBeCloseTo(5000 / 900, 6);
  });
  it('a bike may go faster than 2:30 /km (30 km/h = 2:00 /km)', () => {
    const BIKE = { ...RUN, name: 'Stationary Bike' };
    expect(setRecordValue('pace', { weightKg: 0, reps: 0, distanceM: 10000, durationSec: 1200 }, BIKE, null)).not.toBeNull();
  });
  it('the rule speaks the member unit under miles (the 1 km floor itself does not move)', async () => {
    const units = await import('@/lib/units');
    const prev = units.displayUnits();
    units.setDisplayUnits('imperial');
    try {
      expect(paceRuleText('km')).toBe("Best pace counts only sets of 1 km (0.6 mi) or more, so a short sprint can't set it.");
    } finally {
      units.setDisplayUnits(prev);
    }
    expect(paceRuleText('km')).toBe("Best pace counts only sets of 1 km or more, so a short sprint can't set it.");
  });
});

describe('PG-02 the year\'s biggest gain ignores one typo', () => {
  const pts = (e1: number[]) => e1.map((v, i) => ({ exerciseId: 'bench', name: 'Bench', dateISO: `2026-${String(1 + Math.floor(i / 2)).padStart(2, '0')}-${i % 2 ? '20' : '05'}`, e1rm: v }));
  it('79 → 85 with a 350 typo near the end: single-digit gain', () => {
    const g = biggestGain(pts([79, 80, 80, 81, 82, 83, 350, 84, 85]));
    expect(g).not.toBeNull();
    expect(g!.pct).toBeGreaterThanOrEqual(5);
    expect(g!.pct).toBeLessThanOrEqual(10);
    expect(g!.toKg).toBeLessThan(100);
  });
  it('a typo at the start cannot hide a real gain either', () => {
    const g = biggestGain(pts([10, 80, 80, 81, 82, 83, 84, 85, 86]));
    expect(g!.pct).toBeLessThanOrEqual(10);
  });
});

describe('PG-10 / PG-11 body-weight change: one computation, says its span, colour follows the goal', () => {
  const pts = [
    { dateISO: '2026-09-10', weightKg: 80 },
    { dateISO: '2026-09-25', weightKg: 80.6 },
    { dateISO: '2026-10-10', weightKg: 81.2 },
  ];
  it('first and last weigh-in in the window', () => {
    const c = weightChange(pts);
    expect(c).toEqual({ changeKg: 1.2, fromISO: '2026-09-10', toISO: '2026-10-10', days: 30, fromKg: 80, toKg: 81.2 });
    expect(weightChange(pts, '2026-09-20')?.changeKg).toBe(0.6);
    expect(weightChange(pts.slice(0, 1))).toBeNull();
  });
  it('"+1.2 kg in 30 days"; lb under lb', () => {
    expect(weightChangeText(weightChange(pts)!, 'metric')).toBe('+1.2 kg in 30 days');
    expect(weightChangeText({ changeKg: -0.5, fromISO: '2026-10-01', toISO: '2026-10-02', days: 1 }, 'metric')).toBe('−0.5 kg in 1 day');
    expect(weightChangeText({ changeKg: 1, fromISO: '2026-09-10', toISO: '2026-10-10', days: 30 }, 'imperial')).toBe('+2.2 lb in 30 days');
    expect(weightChangeText({ changeKg: 0, fromISO: '2026-09-10', toISO: '2026-10-10', days: 30 }, 'metric')).toBe('No change in 30 days');
  });
  it('a long span says since when', () => {
    expect(weightChangeText({ changeKg: 5, fromISO: '2025-07-13', toISO: '2026-10-10', days: 454 }, 'metric')).toMatch(/^\+5 kg since 13 Jul 2025$/);
  });
  it('colour by goal', () => {
    expect(weightChangeTone(-1, 'fat_loss')).toBe('good');
    expect(weightChangeTone(1, 'fat_loss')).toBe('bad');
    expect(weightChangeTone(1, 'muscle')).toBe('good');
    expect(weightChangeTone(-1, 'muscle')).toBe('bad');
    expect(weightChangeTone(1, 'general')).toBe('neutral');
    expect(weightChangeTone(-1, 'strength')).toBe('neutral');
    expect(weightChangeTone(0, 'fat_loss')).toBe('neutral');
    expect(weightChangeTone(1, null)).toBe('neutral');
  });
});

describe('SH-08 scores show only when they can be worked out', () => {
  it('no strength score without body weight or a key lift; no recovery before any workout', () => {
    const none = { strength: { score: 0, label: 'Building the base', keyLifts: [] }, lastWorkout: null };
    expect(scoreTiles(none as never)).toEqual({ strength: false, recovery: false });
    const some = { strength: { score: 61, label: 'Strong', keyLifts: [{ exerciseName: 'Bench', e1rmKg: 100, ratio: 1.25 }] }, lastWorkout: { dateISO: '2026-10-01' } };
    expect(scoreTiles(some as never)).toEqual({ strength: true, recovery: true });
  });
});

describe('PG-22 one number format: the phone\'s own grouping', () => {
  it('fmtInt groups by the phone locale, never a fixed Indian grouping', () => {
    const style = groupingForLocale(phoneLocale());
    expect(fmtInt(228288)).toBe(groupIntAs(228288, style));
    expect(fmtInt(12480.4)).toBe(groupIntAs(12480, style));
    // No screen formatter pins a locale (a member in lb read "5,03,276 lb").
    for (const f of ['lib/format.ts', 'lib/units.ts']) {
      expect(readFileSync(join(__dirname, '..', '..', 'src', f), 'utf8')).not.toMatch(/'en-IN'/);
    }
  });
});

describe('PG-22 review: Latin digits and "," always; only the grouping STYLE is the phone’s', () => {
  const as = (locale: string, n: number) => groupIntAs(n, groupingForLocale(locale));
  it.each([
    ['en-IN', '2,28,288'],
    ['hi-IN', '2,28,288'],
    ['mr-IN', '2,28,288'], // never Devanagari digits
    ['mr-IN-u-nu-deva', '2,28,288'],
    ['bn-IN', '2,28,288'], // never Bengali digits
    ['de-DE', '228,288'], // never "228.288" (reads like a decimal beside "102.5 kg")
    ['en-US', '228,288'],
  ])('%s → %s', (locale, want) => {
    expect(as(locale, 228288)).toBe(want);
  });
  it('small, negative, crore and fractional numbers', () => {
    expect(as('de-DE', 1250)).toBe('1,250');
    expect(as('en-IN', 999)).toBe('999');
    expect(as('en-IN', 1000)).toBe('1,000');
    expect(as('en-IN', 12345678)).toBe('1,23,45,678');
    expect(as('en-US', -1234567.4)).toBe('-1,234,567');
    expect(as('en-IN', 0)).toBe('0');
  });
  it('no screen formats a count with toLocaleString (native digits on a Marathi phone)', () => {
    for (const f of ['app/(tabs)/history.tsx', 'components/ui/foldSummary.ts']) {
      expect(readFileSync(join(__dirname, '..', '..', 'src', f), 'utf8')).not.toMatch(/toLocaleString\(/);
    }
  });
});

describe('review: the report\'s start and end weights are the two weigh-ins the change compares', () => {
  it('two weigh-ins on one day: end − start always equals the change', async () => {
    const { bodyweightChange } = await import('@/tracker/engine/reports');
    const points = [
      { dateISO: '2026-09-01', weightKg: 80 },
      { dateISO: '2026-09-30', weightKg: 79 }, // morning
      { dateISO: '2026-09-30', weightKg: 78.5 }, // evening — the last weigh-in
    ];
    const c = bodyweightChange(points, '2026-09-01', '2026-09-30')!;
    expect(c.change).toBe(-1.5);
    expect(c.start).toBe(80);
    expect(c.end).toBe(78.5);
    expect(Math.round((c.end - c.start) * 10) / 10).toBe(c.change);
  });
});
