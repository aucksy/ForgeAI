/**
 * v0.25.1 — the owner's three Phase 3 decisions (7 Oct 2026) and the share picture's recorded
 * wording slips. Every "before:" test here fails on v0.25.0 (afbe15a).
 *
 *  1. Runs get "Best pace" instead of "Longest time": a slow run is no record, and only sets of
 *     at least 1 km count, so a sprint can't set it.
 *  2. Report notes stay rule-written (no change, nothing to test).
 *  3. A male or female body figure, chosen in Profile, on the body map and the share picture.
 *  +  Share pictures: "1 days trained", "HOURS 0" on a short year, TIME on a month with untimed
 *     workouts, an empty MUSCLES WORKED and "KG LIFTED 0" on a cardio-only workout, "1 sets".
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BODY_BACK, BODY_FEMALE_BACK, BODY_FEMALE_FRONT, BODY_FRONT, BODY_VIEWS, type BodyRegion } from '@/tracker/catalog/bodyMapPaths';
import { MAPPED_MUSCLES, regionLevel } from '@/tracker/engine/bodyMap';
import { exerciseRecords, fmtPace, paceRuleText, recordKindsFor, type RecordHit, type RecordSession } from '@/tracker/engine/records';
import { buildMonthReport, buildYearReview, type ReportSession } from '@/tracker/engine/reports';
import { setsText, type VolumeRule } from '@/tracker/engine/volume';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import { orderSessionRecords } from '@/tracker/services/finishSummary';
import { liveRecordHits, recordLabel, toastHit } from '@/tracker/services/liveRecords';
import { recordDetailText, recordValueText } from '@/tracker/services/recordText';
import type { RecordEventRow } from '@/tracker/services/recordsService';
import { overviewFacts, tilesBesideRecords, typedOverview } from '@/tracker/services/exerciseStats';
import { liftedStat, monthShareScene, periodLine, yearShareScene, yearTimeStat } from '@/tracker/share/reportCard';
import { pictureTotals } from '@/tracker/services/reportsService';
import { finishHeadline } from '@/tracker/services/finishSummary';
import { ongoingText } from '@/tracker/services/workoutPresence';
import { fmtSetCompact } from '@/tracker/engine/logTypes';
import { countWord } from '@/lib/words';
import { bodyView, sceneTexts, sceneToSvg } from '@/tracker/share/scene';
import { workoutShareScene, type WorkoutShareInput } from '@/tracker/share/workoutCard';
import { liftedOnPicture, totalDistanceText, workoutShareInput } from '@/tracker/share/workoutInput';
import type { DraftSet } from '@/tracker/store/activeWorkoutStore';
import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js') as typeof import('@resvg/resvg-js');

const RUN: VolumeRule & { distUnit: 'km' } = { logType: 'time_distance', loadMode: 'one', bwShare: 0, distUnit: 'km' };
const ROW: VolumeRule & { distUnit: 'm' } = { logType: 'time_distance', loadMode: 'one', bwShare: 0, distUnit: 'm' };
const KM = { logType: 'time_distance', loadMode: 'one', distUnit: 'km' } as const;

let n = 0;
function session(dateISO: string, sets: Partial<RecordSession['sets'][number]>[]): RecordSession {
  n += 1;
  return { sessionId: `s${n}`, dateISO, startedAt: n, sets: sets.map((s) => ({ weightKg: 0, reps: 0, ...s })) };
}
function draft(over: Partial<DraftSet>): DraftSet {
  n += 1;
  return { key: `k${n}`, weightKg: null, reps: null, isWarmup: false, done: true, ...over };
}

// ------------------------------------------------------------------ 1. best pace
describe('runs keep their best pace, not their longest time', () => {
  it('before: a slower 5 km run was a new "Longest time" — now it is no record at all', () => {
    const r = exerciseRecords([session('2026-09-01', [{ distanceM: 5000, durationSec: 1500 }]), session('2026-09-04', [{ distanceM: 5000, durationSec: 2100 }])], RUN, []);
    expect(r.events).toEqual([]);
    expect(recordKindsFor('time_distance')).not.toContain('duration');
    // A plank keeps its longest time.
    expect(recordKindsFor('time')).toEqual(['duration']);
  });

  it('before: no pace record existed — now the fastest set of 1 km or more is the best pace', () => {
    const r = exerciseRecords(
      [session('2026-09-01', [{ distanceM: 5000, durationSec: 1650 }]), session('2026-09-04', [{ distanceM: 5000, durationSec: 1500 }])],
      RUN,
      [],
    );
    const pace = r.bests.find((b) => b.kind === 'pace');
    expect(pace?.value).toBeCloseTo(5000 / 1500, 9);
    expect(r.events.map((e) => e.kind)).toEqual(['pace']);
  });

  it('a short sprint can\'t set it: 400 m at 3:20 /km after a 5 km at 5:00 /km is no record', () => {
    const r = exerciseRecords(
      [session('2026-09-01', [{ distanceM: 5000, durationSec: 1500 }]), session('2026-09-04', [{ distanceM: 400, durationSec: 80 }, { distanceM: 999, durationSec: 200 }])],
      RUN,
      [],
    );
    expect(r.events).toEqual([]);
    expect(r.bests.find((b) => b.kind === 'pace')?.set?.distanceM).toBe(5000);
    // Exactly 1 km counts.
    const one = exerciseRecords([session('2026-09-01', [{ distanceM: 1000, durationSec: 240 }])], RUN, []);
    expect(one.bests.map((b) => b.kind)).toEqual(['pace', 'distance']);
  });

  it('review: a "new" best pace never reads the same as the old one (5:00 /km twice is no record)', () => {
    // 10 km in 49:58 is 4:59.8 /km — shown as 5:00, like the 5 km in 25:00 before it.
    const r = exerciseRecords([session('2026-09-01', [{ distanceM: 5000, durationSec: 1500 }]), session('2026-09-04', [{ distanceM: 10000, durationSec: 2998 }])], RUN, []);
    expect(r.events.map((e) => e.kind)).toEqual(['distance']);
  });

  it('review: a loaded carry is not a run — it keeps its longest time and gets no pace', () => {
    const carry = { logType: 'time_distance' as const, loadMode: 'one' as const, bwShare: 0, distUnit: 'm' as const, muscles: { primary: ['forearms', 'traps'] } };
    const r = exerciseRecords([session('2026-09-01', [{ distanceM: 40, durationSec: 45 }]), session('2026-09-04', [{ distanceM: 40, durationSec: 60 }])], carry, []);
    expect(r.kinds).toEqual(['distance', 'duration']);
    expect(r.events.map((e) => [e.kind, e.value])).toEqual([['duration', 60]]);
    // A run's own muscles keep the pace.
    expect(exerciseRecords([], { ...RUN, muscles: { primary: ['cardio'] } }, []).kinds).toEqual(['pace', 'distance']);
  });

  it('review: a set that set the longest distance is announced even when a faster 1 km took the pace', () => {
    const fast = draft({ distanceM: 1000, durationSec: 270 }); // 4:30 /km
    const long = draft({ distanceM: 10000, durationSec: 3000 }); // 5:00 /km, 10 km
    // The 10 km is set 1, the fast 1 km set 2 (ticked first): set 1 beat pace AND distance.
    const ex = { key: 'c1', exerciseId: 'tr', bests: { weightKg: 0, e1rm: 0, by: { distance: 8000, pace: 1000 / 330 } }, sets: [long, fast], logType: 'time_distance' as const, distUnit: 'km' as const };
    expect(toastHit([ex], 'c1', long.key)?.kind).toBe('distance');
    expect(toastHit([ex], 'c1', fast.key)?.kind).toBe('pace');
  });

  it('review: the coach quotes the records too, not only the tiles', () => {
    const records = exerciseRecords([session('2026-09-01', [{ distanceM: 5000, durationSec: 1500 }])], RUN, []);
    const facts = overviewFacts({ exercise: { logType: 'time_distance', loadMode: 'one', distUnit: 'km' } as never, records, tiles: [{ label: 'All time', value: '5 km' }] });
    expect(facts).toEqual([
      { label: 'Best pace', value: '5:00 /km' },
      { label: 'Longest distance', value: '5 km' },
      { label: 'All time', value: '5 km' },
    ]);
  });

  it('rowing and swimming (logged in metres) read per km too, and need 1,000 m', () => {
    const r = exerciseRecords([session('2026-09-01', [{ distanceM: 500, durationSec: 100 }, { distanceM: 2000, durationSec: 440 }])], ROW, []);
    const pace = r.bests.find((b) => b.kind === 'pace')!;
    expect(pace.set?.distanceM).toBe(2000);
    expect(fmtPace(pace.value, 'm')).toBe('3:40 /km');
  });

  it('reads as minutes per km with the set it came from (before: "3.3")', () => {
    const hit: RecordHit = { kind: 'pace', value: 5000 / 1560, sessionId: 'a', dateISO: '2026-10-07', set: { weightKg: 0, reps: 0, distanceM: 5000, durationSec: 1560 } };
    expect(recordValueText(hit, KM)).toBe('5:12 /km');
    expect(recordDetailText(hit, KM)).toBe('5 km in 26:00');
  });

  it('the live pop-up: a sprint says nothing, the faster 2 km says "Best pace · 5:00 /km"', () => {
    const sprint = draft({ distanceM: 400, durationSec: 60 });
    const run = draft({ distanceM: 2000, durationSec: 600 });
    const ex = { bests: { weightKg: 0, e1rm: 0, by: { distance: 5000, pace: 3 } }, sets: [sprint, run], logType: 'time_distance' as const, distUnit: 'km' as const };
    const hits = liveRecordHits(ex);
    expect(hits.has(sprint.key)).toBe(false);
    expect(hits.get(run.key)?.kind).toBe('pace');
    expect(recordLabel(hits.get(run.key)!, KM)).toBe('Best pace · 5:00 /km');
    expect(toastHit([{ ...ex, key: 'c1', exerciseId: 'tr' }], 'c1', run.key)?.kind).toBe('pace');
  });

  it('the finish screen lists pace before distance; the exercise page drops the old pace tile', () => {
    const row = (kind: RecordEventRow['kind']): RecordEventRow => ({ kind, value: 1, previous: 0, sessionId: 'w', dateISO: '2026-10-07', set: null, exerciseId: 'tr', exerciseName: 'Treadmill Run', info: KM });
    expect(orderSessionRecords([row('distance'), row('pace')], ['tr']).records.map((r) => r.kind)).toEqual(['pace', 'distance']);
    const h: ExerciseHistoryEntry = { sessionId: 'a', dateISO: '2026-10-01', volumeKg: 0, sets: [{ id: 'x', sessionId: 'a', exerciseId: 'tr', setNumber: 1, weightKg: 0, reps: 0, isWarmup: false, distanceM: 400, durationSec: 60 }] };
    const tiles = tilesBesideRecords(typedOverview('time_distance', [h], 'km').tiles, 'time_distance');
    expect(tiles.map((t) => t.label)).toEqual(['All time', 'Workouts']);
  });

  // [source-text check] Partly reads source text (the rest is behavioural): passes on dead code, fails on a harmless rename (audit QA-12).
  it('[source-text check] the screen says which sets count', () => {
    expect(paceRuleText('km')).toBe("Best pace counts only sets of 1 km or more, so a short sprint can't set it.");
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'tracker', 'components', 'ExercisePrRows.tsx'), 'utf8');
    // Behind the i beside "Records" (opened on the phone in device QA part F), and a "—" row
    // until a set of 1 km or more is logged — also on a bike logged by time only (review).
    expect(src).toMatch(/<InfoHeading title="Records" info=\{paceRuleText\(ctx\.distUnit\)\} \/>/);
    expect(src).toMatch(/No set of \$\{PACE_BASIS\.km\.words\} or more yet/);
    expect(src).toMatch(/if \(bests\.length === 0 && ladder\.length === 0 && !keepsPace\) return null;/);
  });

  it('the share picture prints it', () => {
    const rec: RecordEventRow = {
      kind: 'pace',
      value: 5000 / 1500,
      previous: 3,
      sessionId: 'w1',
      dateISO: '2026-10-07',
      set: { weightKg: 0, reps: 0, distanceM: 5000, durationSec: 1500 },
      exerciseId: 'tr',
      exerciseName: 'Treadmill Run',
      info: KM,
    };
    const t = sceneTexts(workoutShareScene(workoutShareInput(cardioSummary([rec]))));
    expect(t).toContain('Best pace 5:00 /km');
  });
});

// ------------------------------------------------------------------ 3. body figure
const SRC = join(__dirname, '..', '..', 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('a male or female body figure', () => {
  const regions = (views: { front: { parts: readonly { region: BodyRegion }[] }; back: { parts: readonly { region: BodyRegion }[] } }) =>
    new Set([...views.front.parts, ...views.back.parts].map((p) => p.region));

  it('before: one figure — now a female drawing that shows every muscle the male one does', () => {
    const female = regions(BODY_VIEWS.female);
    // Every muscle lights some part of her drawing (side shoulders light the shoulder caps).
    for (const m of MAPPED_MUSCLES) {
      expect([...female].some((r) => regionLevel(r, new Map([[m, 4]])) > 0), m).toBe(true);
    }
    expect([...female].sort()).toEqual([...regions(BODY_VIEWS.male)].sort());
    // The male figure is today's, unchanged.
    expect(BODY_VIEWS.male.front).toBe(BODY_FRONT);
    expect(BODY_VIEWS.male.back).toBe(BODY_BACK);
  });

  it('each female view is framed 1 wide : 2 high, like the male, so every screen draws it in the same box', () => {
    for (const v of [BODY_FEMALE_FRONT, BODY_FEMALE_BACK]) expect(Math.abs(v.viewBox.width * 2 - v.viewBox.height)).toBeLessThan(0.5);
    expect(BODY_FEMALE_FRONT.viewBox.y).toBe(BODY_FEMALE_BACK.viewBox.y);
  });

  it('the share picture draws the chosen figure (before: always the male one)', () => {
    const scene = workoutShareScene({ ...BASE, figure: 'female' });
    const bodies = scene.nodes.filter((x) => x.t === 'body');
    expect(bodies).toHaveLength(2);
    for (const b of bodies) if (b.t === 'body') expect(b.figure).toBe('female');
    expect(bodyView({ t: 'body', x: 0, y: 0, height: 10, view: 'front', levels: [], figure: 'female' })).toBe(BODY_FEMALE_FRONT);
    expect(bodyView({ t: 'body', x: 0, y: 0, height: 10, view: 'back', levels: [] })).toBe(BODY_BACK);
    const png = new Resvg(sceneToSvg(scene)).render();
    expect([png.width, png.height]).toEqual([1080, 1350]);
  }, 20_000); // renders a full PNG; slow when every test file runs at once

  // [source-text check] Reads source text, not behaviour: passes on dead code, fails on a harmless rename (audit QA-12).
  it('[source-text check] Profile offers the choice; Progress, the finish screen and a saved workout follow it', () => {
    expect(read('tracker/store/trackerPrefsStore.ts')).toMatch(/bodyFigure: 'male',/);
    expect(read('app/(tabs)/settings.tsx')).toMatch(/label="Body figure"/);
    expect(read('components/analytics/BodyMapSection.tsx')).toMatch(/<BodyMap levels=\{levels\} figure=\{figure\}/);
    for (const screen of ['app/session/finish.tsx', 'app/session/[id].tsx']) {
      expect(read(screen), screen).toMatch(/workoutShareScene\(\{ \.\.\.workoutShareInput\(data\), figure \}\)/);
    }
  });
});

// ------------------------------------------------------------------ share picture wording
const BASE: WorkoutShareInput = {
  title: 'Leg Day',
  dateText: 'Wed, 7 Oct 2026',
  durationText: '45m 00s',
  volumeText: '6,200',
  sets: 12,
  exercises: [{ name: 'Barbell Back Squat', sets: 4, best: '100 kg × 5' }],
  records: [],
  muscles: [{ muscle: 'quads', sets: 4 }, { muscle: 'glutes', sets: 1 }],
};

function cardioSummary(records: RecordEventRow[] = [], logged: { distanceM?: number; durationSec?: number } = { distanceM: 5000, durationSec: 1500 }): SessionSummaryData {
  return {
    session: {
      id: 'w1',
      dateISO: '2026-10-07',
      startedAt: 0,
      endedAt: 1_800_000,
      dayType: 'full',
      notes: null,
      source: 'manual',
      exercises: [
        {
          exercise: { id: 'tr', name: 'Treadmill Run', aliases: [], muscleGroup: 'cardio' as never, secondaryMuscles: [], equipment: 'bodyweight', isCompound: true, incrementKg: 1 },
          sets: [{ id: 'a1', sessionId: 'w1', exerciseId: 'tr', setNumber: 1, weightKg: 0, reps: 0, isWarmup: false }],
          volumeKg: 0,
        },
      ],
      totalVolumeKg: 0,
    },
    durationSec: 1800,
    totalVolumeKg: 0,
    workingSetCount: 1,
    exerciseCount: 1,
    prs: [],
    records,
    muscles: [{ muscle: 'cardio', sets: 1 }],
    setMeta: { a1: { rpe: null, setType: 'normal', note: null, supersetGroup: null, durationSec: logged.durationSec ?? null, distanceM: logged.distanceM ?? null } },
    kinds: { tr: { logType: logged.distanceM ? 'time_distance' : 'time', loadMode: 'one', distUnit: 'km', catalogKey: null, bwShare: 0 } },
    needsBodyweight: false,
  };
}

describe('the share pictures say it right', () => {
  const s = (dateISO: string, durationSec = 3600): ReportSession => ({ sessionId: dateISO, dateISO, durationSec, volumeKg: 2000, sets: 10, exercises: [{ exerciseId: 'b', name: 'Bench Press', sets: 1 }] });
  const year = (sessions: ReportSession[]) => buildYearReview({ year: 2026, complete: false, lastMonth: '2026-10', sessions, recordCount: 0, strength: [], muscles: [], bodyweight: [] });
  const month = (sessions: ReportSession[]) =>
    buildMonthReport({ month: '2026-10', complete: false, sessions, previous: [], records: [], muscles: [], bodyweight: [], from: '2026-10-01', to: '2026-10-31' });

  it('before: "1 days trained" — now "1 day trained"', () => {
    expect(sceneTexts(yearShareScene(year([s('2026-10-02')])))).toContain('1 workout · 1 day trained');
    expect(periodLine({ workouts: 3, days: 2, timed: 3 })).toBe('3 workouts · 2 days trained');
  });

  it('before: a short year read "HOURS 0" — now its minutes', () => {
    const t = sceneTexts(yearShareScene(year([s('2026-10-02', 1500)])));
    expect(t).not.toContain('HOURS');
    expect(t[t.indexOf('TIME') + 1]).toBe('25 min');
    expect(yearTimeStat(1500)).toEqual(['TIME', '25 min']);
    expect(yearTimeStat(3 * 3600 + 600)).toEqual(['HOURS', '3']);
    expect(yearTimeStat(0)).toEqual(['HOURS', '—']);
  });

  it('before: a month with untimed workouts showed its time as the whole month\'s — now it says how many were timed', () => {
    const r = month([s('2026-10-01'), s('2026-10-03'), s('2026-10-05', 0)]);
    expect(sceneTexts(monthShareScene(r, 0))).toContain('3 workouts, 2 timed · 3 days trained');
    // All timed: as before.
    expect(sceneTexts(monthShareScene(month([s('2026-10-01')]), 0))).toContain('1 workout · 1 day trained');
  });

  it('before: a cardio-only workout showed an empty MUSCLES WORKED — now it lists the work it did', () => {
    const t = sceneTexts(workoutShareScene(workoutShareInput(cardioSummary())));
    const at = t.indexOf('MUSCLES WORKED');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(t[at + 1]).toBe('Cardio');
    expect(t[at + 2]).toBe('1 set');
    // Nothing at all to list: no heading.
    expect(sceneTexts(workoutShareScene({ ...BASE, muscles: [] }))).not.toContain('MUSCLES WORKED');
  });

  it('before: "KG LIFTED 0" on a run — now its distance, or (audit PG-04) the time of timed work', () => {
    expect(liftedOnPicture(cardioSummary())).toEqual({ label: 'DISTANCE', value: '5 km' });
    expect(liftedOnPicture(cardioSummary([], { durationSec: 600 }))).toEqual({ label: 'TIME', value: '10:00' });
    expect(totalDistanceText(800)).toBe('800 m');
    expect(totalDistanceText(10_550)).toBe('10.6 km');
  });

  it('before: "1 sets" — now "1 set"', () => {
    expect(setsText(1)).toBe('1 set');
    expect(setsText(4.5)).toBe('4.5 sets');
    expect(setsText(1314)).toBe('1,314 sets');
    expect(sceneTexts(workoutShareScene(BASE))).toContain('1 set');
  });

  it('review: the month and year pictures never count body weight, and never say "KG LIFTED 0"', () => {
    // A month of only pull-ups: 4 × 10 at body weight. The report's volume counts body weight;
    // the picture counts what was on the bar (nothing), so it shows the reps.
    const pull = { id: 'pu', logType: 'reps' as const, loadMode: 'one' as const, bwShare: 1 };
    const detail = {
      id: 'w', dateISO: '2026-09-02', startedAt: 0, endedAt: 3_600_000, dayType: 'pull' as const, notes: null, source: 'manual' as const, totalVolumeKg: 3104,
      exercises: [{ exercise: { id: 'pu', name: 'Pull Up' } as never, volumeKg: 3104, sets: [10, 10, 10, 10].map((reps, i) => ({ id: `s${i}`, sessionId: 'w', exerciseId: 'pu', setNumber: i + 1, weightKg: 0, reps, isWarmup: false })) }],
    };
    const p = pictureTotals([detail], { exercises: new Map([['pu', pull as never]]) }, 0);
    expect(p).toEqual({ kg: 0, reps: 40, distanceM: 0 });
    const month = buildMonthReport({ month: '2026-09', complete: true, sessions: [s('2026-09-02')], previous: [], records: [], muscles: [], bodyweight: [], from: '2026-09-01', to: '2026-09-30', picture: p });
    const t = sceneTexts(monthShareScene(month, 0));
    expect(t).not.toContain('KG LIFTED');
    expect(t[t.indexOf('REPS') + 1]).toBe('40');
    // A month of runs: the distance. Nothing at all: the workouts.
    expect(liftedStat({ volumeKg: 0, workouts: 3 }, { kg: 0, reps: 0, distanceM: 15400 })).toEqual(['DISTANCE', '15.4 km']);
    expect(liftedStat({ volumeKg: 0, workouts: 3 }, { kg: 0, reps: 0, distanceM: 0 })).toEqual(['WORKOUTS', '3']);
    expect(liftedStat({ volumeKg: 900, workouts: 1 }, { kg: 600, reps: 30, distanceM: 0 })).toEqual(['KG LIFTED', '600']);
  });

  it('review: "Busiest month" says how many workouts, not a bare number', () => {
    const t = sceneTexts(yearShareScene(year([s('2026-10-02')])));
    expect(t).toContain('Busiest month · 1 workout');
    expect(t).toContain('October');
  });

  it('review: the finish screen says the distance after a run, not "0 kg lifted"', () => {
    const run = cardioSummary();
    expect(finishHeadline(run)).toBe('5 km · 1 set');
    expect(finishHeadline({ ...run, totalVolumeKg: 12480, workingSetCount: 18 })).toBe('12,480 kg lifted · 18 sets');
    expect(finishHeadline(cardioSummary([], { durationSec: 600 }))).toBe('1 set');
  });

  it('review: one set, one rep, one workout read in the singular everywhere they are counted', () => {
    expect(fmtSetCompact({ weightKg: 0, reps: 1 }, 'reps')).toBe('1 rep');
    expect(recordValueText({ kind: 'reps', value: 1, sessionId: 'a', dateISO: '2026-10-07', set: { weightKg: 0, reps: 1 } }, { logType: 'reps', loadMode: 'one', distUnit: 'km' })).toBe('1 rep');
    expect(ongoingText([{ sets: [{ done: true, isWarmup: false }] }], null)).toBe('1 of 1 set done');
    expect(countWord(1, 'workout')).toBe('1 workout');
    expect(countWord(2, 'muscle')).toBe('2 muscles');
    const yearNoteOneSet = buildYearReview({
      year: 2026, complete: false, lastMonth: '2026-10', recordCount: 0, strength: [], muscles: [], bodyweight: [],
      sessions: [{ sessionId: 'a', dateISO: '2026-10-02', durationSec: 600, volumeKg: 100, sets: 1, exercises: [{ exerciseId: 'b', name: 'Bench Press', sets: 1 }] }],
    }).note;
    expect(yearNoteOneSet).toContain('Bench Press was your favourite — 1 set.');
  });
});
