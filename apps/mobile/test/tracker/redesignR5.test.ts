/**
 * Redesign R5/R6 — the rules behind Profile → Exercises (Hevy's order), the exercise page's
 * Summary chart (chips by how the exercise is logged, the range it opens on), a saved workout's
 * page (stats, set marks, records on their sets), the Settings rows' grey lines and where old
 * links land. All PURE.
 */
import { describe, expect, it } from 'vitest';

import { healthLine, notificationsLine, SETTINGS_PAGES, unitsLine, versionLine, widgetsLine, workoutsLine } from '@/components/settings/settingsLines';
import { historyTarget } from '@/lib/oldRoutes';
import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';
import { bandOf, exercisesRows, lastDoneText, type LastDone } from '@/tracker/lib/exercisesView';
import { chartMetrics, metricLabel, metricSeries, metricValueText, openingRange, pointsInRange } from '@/tracker/services/exerciseChart';
import { bestSetVolumeSeries } from '@/tracker/services/exerciseAnalytics';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import { detailSetRows, detailStats, detailWhen, recordSets, summarySetText } from '@/tracker/services/workoutDetail';

const TODAY = '2026-10-11';

// ---------------------------------------------------------------- Exercises

describe('Profile → Exercises: done first, then yours, then the library', () => {
  const ex = (id: string, own = false) => ({ id, name: id, catalogKey: own ? null : `k-${id}` });
  const list = [ex('Bench'), ex('Curl'), ex('My Row', true), ex('Squat'), ex('Zercher', true)];
  const last = new Map<string, LastDone>([
    ['Squat', { dateISO: '2026-10-10', startedAt: 10 }],
    ['Bench', { dateISO: '2026-10-08', startedAt: 5 }],
    ['Zercher', { dateISO: '2026-10-10', startedAt: 20 }],
  ]);

  it('nothing typed: Recent (newest first), Made by you, All exercises — each under its heading', () => {
    const rows = exercisesRows(list, last, false);
    expect(rows.map((r) => (r.kind === 'band' ? `#${r.band}` : r.ex.id))).toEqual([
      '#recent',
      'Zercher', // the later workout of the same day first
      'Squat',
      'Bench',
      '#yours',
      'My Row',
      '#library',
      'Curl',
    ]);
  });

  it('a band with nothing in it has no heading', () => {
    const rows = exercisesRows([ex('Curl')], new Map(), false);
    expect(rows.map((r) => r.key)).toEqual(['band-library', 'Curl']);
  });

  it('typed: the search order stays (the best match first), no headings', () => {
    const rows = exercisesRows([ex('Curl'), ex('Squat')], last, true);
    expect(rows.map((r) => r.key)).toEqual(['Curl', 'Squat']);
  });

  it('a done custom exercise sits with Recent; "Last: 12 Oct", with the year only when not this year', () => {
    expect(bandOf(ex('Zercher', true), last)).toBe('recent');
    expect(lastDoneText({ dateISO: '2026-10-12', startedAt: 0 }, TODAY)).toBe('Last: 12 Oct');
    expect(lastDoneText({ dateISO: '2025-03-02', startedAt: 0 }, TODAY)).toBe('Last: 2 Mar 2025');
    expect(lastDoneText(undefined, TODAY)).toBeNull();
  });
});

// ---------------------------------------------------------------- exercise chart

const set = (weightKg: number, reps: number, extra: Partial<ExerciseHistoryEntry['sets'][number]> = {}) => ({
  id: `s${Math.random()}`,
  sessionId: 'x',
  exerciseId: 'e',
  setNumber: 1,
  weightKg,
  reps,
  isWarmup: false,
  ...extra,
});
const h = (dateISO: string, sets: ExerciseHistoryEntry['sets'], extra: Partial<ExerciseHistoryEntry> = {}): ExerciseHistoryEntry => ({
  sessionId: `w-${dateISO}`,
  dateISO,
  sets,
  volumeKg: sets.reduce((n, s) => n + s.weightKg * s.reps, 0),
  ...extra,
});

describe('the exercise Summary chart', () => {
  it('chips follow how the exercise is logged (Hevy’s sets, our words)', () => {
    const words = (lt: Parameters<typeof chartMetrics>[0], cardio = false) => chartMetrics(lt).map((m) => metricLabel(m, 'metric', { shownAs: lt, cardio }));
    // 13 Oct 2026: the app's own words ("Kg lifted", "Estimated 1-rep max", "Total …").
    expect(words('weight_reps')).toEqual(['Heaviest weight', 'Estimated 1-rep max', 'Kg lifted in best set', 'Kg lifted', 'Total reps']);
    expect(words('reps')).toEqual(['Most reps', 'Total reps']);
    expect(words('assisted')).toEqual(['Least help', 'Most reps', 'Total reps']);
    expect(words('time')).toEqual(['Best time', 'Total time']);
    expect(words('time', true)).toEqual(['Longest time', 'Total time']);
    expect(words('distance')).toEqual(['Longest distance', 'Total distance']);
    expect(words('time_distance')).toEqual(['Longest distance', 'Longest time', 'Total distance']);
    expect(metricLabel('workoutLifted', 'imperial')).toBe('Lb lifted');
  });

  // Newest first, as the page reads it.
  const history = [
    h('2026-10-10', [set(100, 5), set(90, 8)]),
    h('2026-09-01', [set(80, 10)], { easyWeek: true }),
    h('2026-08-01', [set(95, 3), set(60, 12)]),
  ];

  it('one point per workout, oldest first; easy weeks stay out', () => {
    expect(metricSeries('heaviest', history, [], 'metric', 'km')).toEqual([
      { x: '2026-08-01', y: 95 },
      { x: '2026-10-10', y: 100 },
    ]);
    expect(metricSeries('totalReps', history, [], 'metric', 'km').map((p) => p.y)).toEqual([15, 13]);
    expect(metricSeries('mostReps', history, [], 'metric', 'km').map((p) => p.y)).toEqual([12, 8]);
    // Epley, the best set of each workout: 95 × (1 + 3/30) = 104.5; 100 × (1 + 5/30) = 116.7.
    expect(metricSeries('e1rm', history, [], 'metric', 'km').map((p) => p.y)).toEqual([104.5, 116.7]);
    expect(metricSeries('workoutLifted', history, [], 'metric', 'km').map((p) => p.y)).toEqual([1005, 1220]);
  });

  it('best set kg lifted is the page’s best-set series (the one volume rule), not worked out again', () => {
    const best = bestSetVolumeSeries(history.filter((x) => !x.easyWeek));
    expect(metricSeries('bestSet', history, best, 'metric', 'km')).toEqual([
      { x: '2026-08-01', y: 720 },
      { x: '2026-10-10', y: 720 },
    ]);
  });

  it('pounds when the member reads pounds', () => {
    expect(metricSeries('heaviest', [h('2026-10-10', [set(100, 5)])], [], 'imperial', 'km')[0].y).toBe(220.5);
    expect(metricValueText('heaviest', 220.5, 'imperial', 'km')).toBe('220.5 lb');
  });

  it('assisted reads the help (less is stronger); timed and distance work read their own numbers', () => {
    const assisted = [h('2026-10-10', [set(-20, 8), set(-15, 6)])];
    expect(metricSeries('leastHelp', assisted, [], 'metric', 'km')).toEqual([{ x: '2026-10-10', y: 15 }]);
    const plank = [h('2026-10-10', [set(0, 0, { durationSec: 60 }), set(0, 0, { durationSec: 45 })])];
    expect(metricSeries('bestTime', plank, [], 'metric', 'km')[0].y).toBe(60);
    expect(metricSeries('workoutTime', plank, [], 'metric', 'km')[0].y).toBe(105);
    expect(metricValueText('bestTime', 60, 'metric', 'km')).toBe('1:00');
    const run = [h('2026-10-10', [set(0, 0, { distanceM: 5000, durationSec: 1500 })]), h('2026-10-01', [set(0, 0, { distanceM: 2500 })])];
    expect(metricSeries('longestDistance', run, [], 'metric', 'km')).toEqual([
      { x: '2026-10-01', y: 2.5 },
      { x: '2026-10-10', y: 5 },
    ]);
    // A workout that says nothing for the chip is left out (no time on the older run).
    expect(metricSeries('bestTime', run, [], 'metric', 'km')).toEqual([{ x: '2026-10-10', y: 1500 }]);
    expect(metricValueText('longestDistance', 5, 'metric', 'km')).toBe('5 km');
  });

  it('opens on 3 months; with nothing in them, the smallest range that shows something', () => {
    expect(openingRange(['2026-09-30'], TODAY)).toBe('3m');
    expect(openingRange(['2026-03-01'], TODAY)).toBe('1y');
    expect(openingRange(['2024-03-01'], TODAY)).toBe('all');
    expect(openingRange([], TODAY)).toBe('all');
    const pts = [{ x: '2024-01-01' }, { x: '2026-03-01' }, { x: '2026-10-01' }];
    expect(pointsInRange(pts, '3m', TODAY)).toEqual([{ x: '2026-10-01' }]);
    expect(pointsInRange(pts, '1y', TODAY)).toHaveLength(2);
    expect(pointsInRange(pts, 'all', TODAY)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------- workout detail

describe('a saved workout’s page', () => {
  const sets = [
    { id: 'a', sessionId: 'w', exerciseId: 'b', setNumber: 1, weightKg: 40, reps: 10, isWarmup: true },
    { id: 'b', sessionId: 'w', exerciseId: 'b', setNumber: 2, weightKg: 100, reps: 5, isWarmup: false },
    { id: 'c', sessionId: 'w', exerciseId: 'b', setNumber: 3, weightKg: 80, reps: 8, isWarmup: false },
    { id: 'd', sessionId: 'w', exerciseId: 'b', setNumber: 4, weightKg: 60, reps: 12, isWarmup: false },
  ];
  const meta = {
    a: { rpe: null, setType: 'normal', note: null, supersetGroup: null },
    b: { rpe: 8.5, setType: 'normal', note: null, supersetGroup: null },
    c: { rpe: null, setType: 'normal', note: null, supersetGroup: null },
    d: { rpe: 10, setType: 'drop', note: null, supersetGroup: null },
  } as const;
  const kind = { logType: 'weight_reps', loadMode: 'one', distUnit: 'km' } as const;

  it('W, then 1, 2 for normal sets, D / F for drop and failure; RPE on working sets only', () => {
    const rows = detailSetRows(sets, meta as never, kind, 'metric');
    expect(rows.map((r) => r.mark)).toEqual(['W', '1', '2', 'D']);
    expect(rows.map((r) => r.text)).toEqual(['40 kg × 10', '100 kg × 5', '80 kg × 8', '60 kg × 12']);
    expect(rows.map((r) => r.rpe)).toEqual([null, '@8.5', null, '@10']);
  });

  it('a record is marked on the working set that holds it; best workout (no set) on none', () => {
    const held = recordSets(sets, meta as never, [
      { kind: 'weight', set: { weightKg: 100, reps: 5 } },
      { kind: 'e1rm', set: { weightKg: 100, reps: 5 } },
      { kind: 'best_session', set: null },
      // A warm-up with the same numbers never takes the mark.
      { kind: 'reps', set: { weightKg: 40, reps: 10 } },
    ]);
    expect([...held.entries()]).toEqual([['b', ['weight', 'e1rm']]]);
    const rows = detailSetRows(sets, meta as never, kind, 'metric', held);
    expect(rows.filter((r) => r.records.length > 0).map((r) => r.id)).toEqual(['b']);
  });

  it('assisted reads its help; a run its distance and time', () => {
    expect(summarySetText({ weightKg: -20, reps: 8 }, undefined, { logType: 'assisted', loadMode: 'one', distUnit: 'km' }, 'metric')).toBe('20 kg × 8');
    expect(summarySetText({ weightKg: 0, reps: 0 }, { durationSec: 1500, distanceM: 5000 }, { logType: 'time_distance', loadMode: 'one', distUnit: 'km' }, 'metric')).toBe('5 km · 25:00');
  });

  const data = (over: Partial<SessionSummaryData> = {}): SessionSummaryData =>
    ({
      session: { id: 'w', dateISO: '2026-10-10', startedAt: 0, endedAt: 0, dayType: 'pull', notes: null, source: 'manual', exercises: [{ exercise: { id: 'b' }, sets, volumeKg: 0 }], totalVolumeKg: 0 },
      durationSec: 53 * 60,
      totalVolumeKg: 3611.4,
      workingSetCount: 3,
      exerciseCount: 1,
      prs: [],
      records: [{}, {}],
      muscles: [],
      setMeta: meta,
      kinds: {},
      needsBodyweight: false,
      ...over,
    }) as unknown as SessionSummaryData;

  it('Time · Kg lifted · Sets · Records, as the Profile feed counts them', () => {
    expect(detailStats(data(), 'metric')).toEqual([
      { label: 'Time', value: '53 min' },
      { label: 'Kg lifted', value: '3,611' },
      { label: 'Sets', value: '3' },
      { label: 'Records', value: '2' },
    ]);
  });

  it('nothing lifted → Reps; no records → no Records; no length → no Time', () => {
    expect(detailStats(data({ totalVolumeKg: 0, records: [], durationSec: 0 }), 'metric')).toEqual([
      { label: 'Reps', value: '25' },
      { label: 'Sets', value: '3' },
    ]);
  });

  it('the day and the time it started', () => {
    const start = new Date(2026, 9, 10, 7, 2).getTime();
    expect(detailWhen('2026-10-10', start)).toBe('Saturday, 10 Oct 2026 · 07:02');
  });
});

// ---------------------------------------------------------------- Settings and old links

describe('Settings — Hevy’s list of pages', () => {
  it('the pages, in order', () => {
    expect(SETTINGS_PAGES.map((p) => p.title)).toEqual([
      'Your details',
      'Workouts',
      'Units',
      'Notifications',
      'Health Connect',
      'Widgets',
      'Your gym',
      'Backup',
      'Export & import',
      'Your data',
      'Send feedback',
      'About',
    ]);
  });

  it('one short grey line where it helps', () => {
    expect(unitsLine('metric')).toBe('kg, km');
    expect(unitsLine('imperial')).toBe('lb, miles');
    expect(notificationsLine(true, '7:00 am')).toBe('Reminders on, 7:00 am');
    expect(notificationsLine(false, '7:00 am')).toBe('Reminders off');
    expect(healthLine('on')).toBe('On');
    expect(healthLine('allowed')).toBe('Off');
    expect(healthLine('none')).toBeNull();
    expect(widgetsLine(0)).toBeNull();
    expect(widgetsLine(2)).toBe('2 on your home screen');
    expect(workoutsLine('2:00')).toBe('Rest 2:00');
    expect(workoutsLine('Off')).toBe('Rest timer off');
    expect(versionLine('0.35.0')).toBe('Version 0.35.0');
    expect(versionLine(undefined)).toBeNull();
  });
});

describe('old links land somewhere sensible', () => {
  it('/history → the Profile; ?view=calendar → Calendar', () => {
    expect(historyTarget(undefined)).toBe('/profile');
    expect(historyTarget('list')).toBe('/profile');
    expect(historyTarget('calendar')).toBe('/calendar');
    expect(historyTarget(['calendar'])).toBe('/calendar');
  });
});
