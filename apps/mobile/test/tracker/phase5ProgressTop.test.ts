/**
 * Audit Phase 5, packet A — "Progress leads with the answer". Pure rules behind the new top of
 * Progress and the honest numbers below it (PG-05, PG-06, PG-08, PG-09, PG-15, PG-21, PG-24,
 * PG-25, PG-27, PG-28). Each test failed before the change.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { addDays } from '@/lib/date';
import { setDisplayUnits } from '@/lib/units';
import { lowSetsHint, muscleBreakdown } from '@/tracker/engine/bodyMap';
import {
  bodyWeightSub,
  filterRecords,
  liftLastText,
  liftPoints,
  musclesForList,
  progressMode,
  rangeView,
  recordsLink,
  strengthEmpty,
  topLiftText,
  topLifts,
  weekVsUsual,
  type ProgressSession,
  type ProgressSet,
} from '@/tracker/engine/progressTop';
import { heroLine, type PeriodTotals } from '@/tracker/engine/reports';
import { earlierReports, reportIndex } from '@/tracker/services/reportsService';

afterEach(() => setDisplayUnits('metric'));

const TODAY = '2026-10-14'; // a Wednesday; the week began Monday 12 Oct
const BENCH = { id: 'bench', name: 'Barbell Bench Press', logType: 'weight_reps' as const };
const PUSHUP = { id: 'pushup', name: 'Push Up', logType: 'reps' as const };
const RUN = { id: 'run', name: 'Running', logType: 'distance' as const };
const infos = new Map([BENCH, PUSHUP, RUN].map((e) => [e.id, e]));

let n = 0;
function workout(dateISO: string, sets: [string, number, number, boolean?][], easy = false): { s: ProgressSession; sets: ProgressSet[] } {
  const id = `w${++n}`;
  return {
    s: { id, dateISO, easy },
    sets: sets.map(([exerciseId, weightKg, reps, isWarmup]) => ({ sessionId: id, dateISO, easy, exerciseId, weightKg, reps, isWarmup: isWarmup ?? false })),
  };
}
function build(ws: { s: ProgressSession; sets: ProgressSet[] }[]) {
  return { sessions: ws.map((w) => w.s), sets: ws.flatMap((w) => w.sets) };
}

describe('this week vs your usual', () => {
  // Eight weeks of Monday bench at 80 kg × 5 (4 working sets + a warm-up) and Thursday push-ups
  // (2 sets of 20), then this week 85 kg × 5.
  const weeks: { s: ProgressSession; sets: ProgressSet[] }[] = [];
  const mondays = ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'];
  for (const m of mondays) {
    weeks.push(workout(m, [['bench', 40, 10, true], ['bench', 80, 5], ['bench', 80, 5], ['bench', 80, 5], ['bench', 80, 5]]));
    weeks.push(workout(addDays(m, 3), [['pushup', 0, 20], ['pushup', 0, 20]]));
  }
  const thisWeek = workout('2026-10-12', [['bench', 85, 5], ['bench', 85, 5], ['pushup', 0, 21]]);
  const all = build([...weeks, thisWeek]);
  const events = [
    { exerciseId: 'bench', dateISO: '2026-10-12' },
    { exerciseId: 'bench', dateISO: '2026-10-12' }, // a second kind of record: still one lift (D10)
    { exerciseId: 'pushup', dateISO: '2026-10-05' }, // last week: not this week's
  ];

  it('counts this week, the usual week, lifts that beat a best (D10) and the lift that went up most', () => {
    const w = weekVsUsual({ ...all, infos, events, today: TODAY, firstWorkoutISO: '2026-08-17' });
    expect(w.weekFrom).toBe('2026-10-12');
    expect(w.week).toEqual({ workouts: 1, sets: 3, liftsUp: 1 });
    // 8 full weeks before this one, 2 workouts and 4 + 2 working sets in each (warm-ups never count).
    expect(w.usual).toEqual({ workouts: 2, sets: 6, weeks: 8 });
    expect(w.topLift?.exerciseId).toBe('bench');
    expect(w.topLift?.unit).toBe('kg');
    expect(w.topLift?.pct).toBe(6); // 85 × 5 vs a typical 80 × 5 (estimated 1-rep max)
    expect(topLiftText(w.topLift!, 'metric')).toBe('Estimated 1-rep max 99 kg · up 6% on your usual');
  });

  it('a member who started three weeks ago is compared with three weeks, not eight', () => {
    const recent = build([workout('2026-09-21', [['bench', 80, 5]]), workout('2026-09-28', [['bench', 80, 5]]), workout('2026-10-05', [['bench', 80, 5]]), workout('2026-10-13', [['bench', 80, 5]])]);
    const w = weekVsUsual({ ...recent, infos, events: [], today: TODAY, firstWorkoutISO: '2026-09-21' });
    expect(w.usual).toEqual({ workouts: 1, sets: 1, weeks: 3 });
  });

  it('a first week has no "usual" yet, and no lift "went up"', () => {
    const first = build([workout('2026-10-12', [['bench', 60, 5]])]);
    const w = weekVsUsual({ ...first, infos, events: [], today: TODAY, firstWorkoutISO: '2026-10-12' });
    expect(w.usual).toBeNull();
    expect(w.topLift).toBeNull();
  });

  it('an easy week and one odd set never make "the lift that went up most"', () => {
    const odd = build([
      workout('2026-09-28', [['bench', 80, 5]]),
      workout('2026-10-01', [['bench', 300, 5]]), // a typo inside the usual: the median ignores it
      workout('2026-10-05', [['bench', 80, 5]]),
      workout('2026-10-12', [['bench', 70, 5]], true), // easy week: left out
      workout('2026-10-13', [['bench', 80, 5]]),
    ]);
    const w = weekVsUsual({ ...odd, infos, events: [], today: TODAY, firstWorkoutISO: '2026-09-28' });
    expect(w.topLift).toBeNull(); // 80 vs a typical 80: not up
    expect(w.week.workouts).toBe(2); // the easy workout still counts as a workout
  });

  it('reps-only lifts compare their best set of reps', () => {
    const reps = build([workout('2026-09-28', [['pushup', 0, 20]]), workout('2026-10-05', [['pushup', 0, 20]]), workout('2026-10-13', [['pushup', 0, 25]])]);
    const w = weekVsUsual({ ...reps, infos, events: [], today: TODAY, firstWorkoutISO: '2026-09-28' });
    expect(w.topLift).toMatchObject({ exerciseId: 'pushup', unit: 'reps', now: 25, typical: 20, pct: 25 });
    expect(topLiftText(w.topLift!, 'metric')).toBe('Best set 25 reps · up 25% on your usual');
  });
});

describe('your lifts', () => {
  it('the most-trained lifts first, each with a trend and its last best set; runs and walks stay out', () => {
    const data = build([
      workout('2026-09-01', [['bench', 80, 5], ['pushup', 0, 20], ['run', 0, 0]]),
      workout('2026-09-08', [['bench', 82.5, 5], ['bench', 85, 3], ['run', 0, 0]]),
      workout('2026-09-15', [['bench', 82.5, 6]]),
    ]);
    const lifts = topLifts(liftPoints(data.sets, infos), 4);
    expect(lifts.map((l) => l.exerciseId)).toEqual(['bench', 'pushup']);
    expect(lifts[0].points).toHaveLength(3);
    expect(liftLastText(lifts[0], 'metric', TODAY)).toBe('82.5 kg × 6 · 15 Sep');
    setDisplayUnits('imperial');
    expect(liftLastText(lifts[0], 'imperial', TODAY)).toBe('181.9 lb × 6 · 15 Sep');
    expect(liftLastText(lifts[1], 'metric', TODAY)).toBe('20 reps · 1 Sep');
  });

  it('a weight lift logged without weight reads as reps, never "0 kg"', () => {
    const data = build([workout('2026-09-01', [['bench', 0, 12]]), workout('2026-09-03', [['bench', 0, 15]])]);
    const [l] = topLifts(liftPoints(data.sets, infos), 4);
    expect(l.unit).toBe('reps');
    expect(l.points.map((p) => p.value)).toEqual([12, 15]);
  });
});

describe('PG-27: a lift not done in the chosen range says so', () => {
  const pts = [{ x: '2026-07-01', y: 80 }, { x: '2026-08-02', y: 82 }];
  it('in range: only the range', () => {
    expect(rangeView([...pts, { x: '2026-10-01', y: 85 }], 30, TODAY)).toEqual({ points: [{ x: '2026-10-01', y: 85 }], note: null });
  });
  it('not in range: the last workouts, with a note — never all history in silence', () => {
    const v = rangeView(pts, 30, TODAY);
    expect(v.note).toBe('Not done in the last 30 days · last on 2 Aug');
    expect(v.points).toEqual(pts);
    const many = Array.from({ length: 30 }, (_, i) => ({ x: `2025-0${1 + Math.floor(i / 10)}-${String(1 + (i % 10)).padStart(2, '0')}`, y: i }));
    const capped = rangeView(many, 30, TODAY);
    expect(capped.points).toHaveLength(20);
    expect(capped.note).toBe('Not done in the last 30 days · last on 10 Mar 2025');
  });
  it('never done: nothing and no note', () => {
    expect(rangeView([], 90, TODAY)).toEqual({ points: [], note: null });
  });
});

describe('PG-05 / PG-06: records are always reachable, and "See all N" opens N', () => {
  it('none in range but older ones exist → "See all records" (every record)', () => {
    expect(recordsLink(0, 212, 6)).toEqual({ label: 'See all records', scope: 'all' });
  });
  it('more in range than shown → "See all 14" opens the range', () => {
    expect(recordsLink(14, 212, 6)).toEqual({ label: 'See all 14', scope: 'range' });
  });
  it('a few in range, more overall → still a way to every record', () => {
    expect(recordsLink(3, 212, 6)).toEqual({ label: 'See all records', scope: 'all' });
    expect(recordsLink(3, 3, 6)).toBeNull();
    expect(recordsLink(0, 0, 6)).toBeNull();
  });
  it('the records screen shows exactly the range it was opened for', () => {
    const rows = [{ dateISO: '2026-10-10' }, { dateISO: '2026-09-20' }, { dateISO: '2026-08-01' }];
    expect(filterRecords(rows, '2026-09-15')).toHaveLength(2);
    expect(filterRecords(rows, '2026-09-01', '2026-09-30')).toEqual([{ dateISO: '2026-09-20' }]);
    expect(filterRecords(rows)).toHaveLength(3);
  });
});

describe('PG-08: the strength empty state names the real gap', () => {
  it('no body weight → "Add your body weight"', () => {
    expect(strengthEmpty(false)).toMatchObject({ title: 'Add your body weight', action: 'weight' });
  });
  it('body weight logged → the lifts', () => {
    expect(strengthEmpty(true).title).not.toMatch(/body weight/i);
    expect(strengthEmpty(true).action).toBeUndefined();
  });
});

describe('PG-25: "Log it" only when there are truly no weigh-ins', () => {
  it('weigh-ins in range → the chart (no line)', () => {
    expect(bodyWeightSub(3, { dateISO: '2026-10-01', weightKg: 77.6 }, 'metric', TODAY)).toBeNull();
  });
  it('older weigh-ins only → the last one', () => {
    expect(bodyWeightSub(0, { dateISO: '2026-08-02', weightKg: 77.6 }, 'metric', TODAY)).toBe('Last: 77.6 kg · 2 Aug');
    setDisplayUnits('imperial');
    expect(bodyWeightSub(0, { dateISO: '2025-08-02', weightKg: 77.6 }, 'imperial', TODAY)).toBe('Last: 171.1 lb · 2 Aug 2025');
  });
  it('never weighed in → "Log it"', () => {
    expect(bodyWeightSub(0, null, 'metric', TODAY)).toBe('Log it');
  });
});

describe('PG-28: cardio is not a muscle in the muscle list', () => {
  it('drops cardio and empty rows', () => {
    expect(musclesForList([{ muscle: 'chest', sets: 12 }, { muscle: 'cardio', sets: 9 }, { muscle: 'quads', sets: 0 }]).map((m) => m.muscle)).toEqual(['chest']);
  });
});

describe('a new member sees one card, not nine empty boxes', () => {
  it('no workouts → welcome; any workout → the full screen; unknown → loading', () => {
    expect(progressMode(0)).toBe('welcome');
    expect(progressMode(1)).toBe('full');
    expect(progressMode(null)).toBe('loading');
  });
});

describe('the tappable body map', () => {
  const groups = [
    { exerciseId: 'bench', name: 'Barbell Bench Press', muscles: { primary: ['chest'], secondary: ['triceps', 'front_delts'] }, working: 4 },
    { exerciseId: 'fly', name: 'Pec Deck Fly', muscles: { primary: ['chest'], secondary: [] }, working: 3 },
    { exerciseId: 'pushdown', name: 'Triceps Pushdown', muscles: { primary: ['triceps'], secondary: [] }, working: 3 },
  ] as const;
  it('a muscle: its sets in the last 7 days and the exercises that trained it, most first', () => {
    const chest = muscleBreakdown(groups as never, 'chest');
    expect(chest.sets).toBe(7);
    expect(chest.exercises.map((e) => [e.name, e.sets])).toEqual([
      ['Barbell Bench Press', 4],
      ['Pec Deck Fly', 3],
    ]);
    const triceps = muscleBreakdown(groups as never, 'triceps');
    expect(triceps.sets).toBe(5); // 3 + half of 4
    expect(triceps.exercises.map((e) => e.sets)).toEqual([3, 2]);
    expect(muscleBreakdown(groups as never, 'calves')).toEqual({ sets: 0, exercises: [] });
  });
  it('a gentle hint when a muscle got under 10 sets', () => {
    expect(lowSetsHint(7)).toBe('Under 10 sets in the last 7 days — a good one to train next.');
    expect(lowSetsHint(0)).toBe('No sets in the last 7 days — a good one to train next.');
    expect(lowSetsHint(10)).toBeNull();
  });
});

describe('PG-15: last year\'s review stays through January, and every report stays reachable', () => {
  it('January with a workout: this year so far AND last year in review', () => {
    expect(reportIndex(['2027-01', '2026-12', '2026-11'], '2027-01-05')).toEqual({ month: '2026-12', year: 2027, lastYear: 2026 });
    expect(reportIndex(['2026-10', '2026-09'], '2026-10-07')).toEqual({ month: '2026-09', year: 2026, lastYear: null });
    expect(reportIndex(['2027-02', '2026-12'], '2027-02-05').lastYear).toBeNull();
  });
  it('"Earlier reports" lists every other trained month and past year, newest first', () => {
    const months = ['2027-01', '2026-12', '2026-11', '2025-06'];
    const idx = reportIndex(months, '2027-01-05');
    expect(earlierReports(months, '2027-01-05', idx)).toEqual([
      { period: '2027-01', title: 'January 2027 so far' },
      { period: '2026-11', title: 'November 2026' },
      { period: '2025-06', title: 'June 2025' },
      { period: '2025', title: '2025 in review' },
    ]);
  });
});

describe('PG-21: the report hero says what applies', () => {
  const base: PeriodTotals = { workouts: 12, days: 12, durationSec: 0, timed: 0, volumeKg: 0, sets: 24 };
  it('a month of runs: distance, never "0 kg"; no time → no leading "—"', () => {
    const line = heroLine(base, { kg: 0, reps: 0, distanceM: 42_500 }, 'metric');
    expect(line).toBe('42.5 km · 24 sets');
    expect(line).not.toMatch(/0 kg|^—/);
  });
  it('a month of pull-ups without body weight: reps', () => {
    expect(heroLine({ ...base, durationSec: 3600 * 5 + 600, timed: 12 }, { kg: 0, reps: 480, distanceM: 0 }, 'metric')).toBe('5 h 10 min · 480 reps · 24 sets');
  });
  it('lifting: time, kg lifted, sets', () => {
    expect(heroLine({ ...base, durationSec: 3600, timed: 12, volumeKg: 12_480 }, { kg: 12_000, reps: 100, distanceM: 0 }, 'metric')).toBe('1 h · 12,480 kg · 24 sets');
  });
});
