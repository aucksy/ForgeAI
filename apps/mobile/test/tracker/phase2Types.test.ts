/**
 * Phase 2 — exercise types, the one volume rule, finer muscles, timed holds and the
 * easier / harder versions. Each "fix" test names what the code BEFORE Phase 2 did, and
 * asserts the new answer (so it fails on the old code).
 */
import { describe, expect, it } from 'vitest';

import { finerFromCoarse, musclesOf, setShares } from '@/tracker/catalog/muscles';
import {
  columnHeads,
  durationDigits,
  fmtDuration,
  fmtSetCompact,
  isLoggable,
  loadMultiplier,
  parseDuration,
  storedWeight,
  typedWeight,
} from '@/tracker/engine/logTypes';
import { computeProgressionTarget, targetFill, targetLine, type ProgSession } from '@/tracker/engine/progression';
import { bodyweightOn, missesBodyweight, muscleSets, sessionVolumeKg, setVolumeKg } from '@/tracker/engine/volume';
import { draftToRichSets } from '@/tracker/services/draftSets';
import type { DraftExercise } from '@/tracker/store/activeWorkoutStore';
import { fillForSet } from '@/tracker/store/activeWorkoutStore';
import type { Exercise } from '@/types/models';

const TODAY = '2026-10-06';

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'e1',
    name: 'Bench Press',
    aliases: [],
    muscleGroup: 'chest',
    secondaryMuscles: [],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 2.5,
    ...over,
  };
}
const range = (min: number, max: number, sets = 3) => ({ targetSets: sets, repRangeMin: min, repRangeMax: max });
const holds = (dateISO: string, secs: number[]): ProgSession => ({
  dateISO,
  sets: secs.map((s) => ({ weightKg: 0, reps: 0, rpe: null, setType: 'normal' as const, durationSec: s })),
});
const reps = (dateISO: string, sets: [number, number][]): ProgSession => ({
  dateISO,
  sets: sets.map(([weightKg, r]) => ({ weightKg, reps: r, rpe: null, setType: 'normal' as const })),
});

describe('time input (a number pad has no colon)', () => {
  it('reads digits like a microwave', () => {
    expect(parseDuration('45')).toBe(45);
    expect(parseDuration('130')).toBe(90);
    expect(parseDuration('3000')).toBe(1800);
    expect(parseDuration('10000')).toBe(3600);
    expect(parseDuration('90')).toBe(90); // 0:90 = 1:30
  });
  it('reads typed colons as written, and refuses junk', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1:05:00')).toBe(3900);
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('0')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
  });
  it('formats and round-trips', () => {
    expect(fmtDuration(45)).toBe('0:45');
    expect(fmtDuration(90)).toBe('1:30');
    expect(fmtDuration(3900)).toBe('1:05:00');
    for (const s of [5, 45, 90, 615, 3900]) expect(parseDuration(durationDigits(s))).toBe(s);
  });
});

describe('what a set row needs, per type', () => {
  it('a timed set is loggable with only a time (before Phase 2 it needed reps and was dropped)', () => {
    expect(isLoggable('time', { weightKg: null, reps: null, durationSec: 45 })).toBe(true);
    expect(isLoggable('weight_reps', { weightKg: null, reps: null, durationSec: 45 })).toBe(false);
  });
  it('a bodyweight set needs no weight', () => {
    expect(isLoggable('reps', { weightKg: null, reps: 12 })).toBe(true);
    expect(isLoggable('weight_reps', { weightKg: null, reps: 12 })).toBe(false);
  });
  it('help is typed positive and stored negative', () => {
    expect(storedWeight('assisted', 20)).toBe(-20);
    expect(storedWeight('assisted', -20)).toBe(-20);
    expect(typedWeight('assisted', -20)).toBe(20);
    expect(storedWeight('weighted', 10)).toBe(10);
    expect(storedWeight('time', 10)).toBe(0);
  });
  it('column words say what to type', () => {
    expect(columnHeads('weight_reps', 'both', 'km')).toEqual({ weight: 'KG EACH', reps: 'REPS', time: null, distance: null });
    expect(columnHeads('weight_reps', 'side', 'km').reps).toBe('REPS/SIDE');
    expect(columnHeads('reps', 'one', 'km').weight).toBeNull();
    expect(columnHeads('time_distance', 'one', 'km')).toEqual({ weight: null, reps: null, time: 'TIME', distance: 'KM' });
  });
  it('compact labels never print "0×0" for a timed row', () => {
    expect(fmtSetCompact({ weightKg: 0, reps: 0, durationSec: 45 }, 'time')).toBe('0:45');
    expect(fmtSetCompact({ weightKg: 0, reps: 0, distanceM: 2400, durationSec: 720 }, 'time_distance')).toBe('2.4 km · 12:00');
    expect(fmtSetCompact({ weightKg: 0, reps: 0, durationSec: 45 }, 'weight_reps')).toBe('0:45');
    expect(fmtSetCompact({ weightKg: -20, reps: 8 }, 'assisted')).toBe('assist 20×8');
    expect(fmtSetCompact({ weightKg: 0, reps: 12 }, 'reps')).toBe('12 reps');
  });
});

describe('the one volume rule', () => {
  const pull = { logType: 'reps' as const, loadMode: 'one' as const, bwShare: 1 };
  it('a pull-up counts body weight (before Phase 2: 0 kg × reps = 0)', () => {
    expect(0 * 10).toBe(0); // the old rule
    expect(setVolumeKg({ weightKg: 0, reps: 10, isWarmup: false }, pull, 80)).toBe(800);
  });
  it('weighted and assisted pull-ups add or take away from body weight', () => {
    expect(setVolumeKg({ weightKg: 10, reps: 8, isWarmup: false }, { ...pull, logType: 'weighted' }, 80)).toBe(720);
    expect(setVolumeKg({ weightKg: -20, reps: 8, isWarmup: false }, { ...pull, logType: 'assisted' }, 80)).toBe(480);
    expect(setVolumeKg({ weightKg: -90, reps: 8, isWarmup: false }, { ...pull, logType: 'assisted' }, 80)).toBe(0);
  });
  it('push-ups do not count body weight (only pull-ups and dips do)', () => {
    expect(setVolumeKg({ weightKg: 0, reps: 20, isWarmup: false }, { ...pull, bwShare: 0 }, 80)).toBe(0);
  });
  it('without a body weight, pull-ups add nothing — and the summary says so', () => {
    expect(setVolumeKg({ weightKg: 0, reps: 10, isWarmup: false }, pull, null)).toBe(0);
    const s = { dateISO: TODAY, exercises: [{ exercise: { id: 'p', ...pull, muscles: { primary: ['lats' as const], secondary: [] } }, sets: [{ weightKg: 0, reps: 10, isWarmup: false }] }] };
    expect(missesBodyweight(s, [])).toBe(true);
    expect(missesBodyweight(s, [{ dateISO: '2026-01-01', weightKg: 80 }])).toBe(false);
  });
  it('"kg each" dumbbells count both; per-side reps count both sides', () => {
    expect(loadMultiplier('both')).toBe(2);
    expect(loadMultiplier('side')).toBe(2);
    expect(loadMultiplier('both_side')).toBe(4);
    expect(setVolumeKg({ weightKg: 25, reps: 10, isWarmup: false }, { logType: 'weight_reps', loadMode: 'both', bwShare: 0 }, 80)).toBe(500);
    expect(setVolumeKg({ weightKg: 25, reps: 10, isWarmup: false }, { logType: 'weight_reps', loadMode: 'one', bwShare: 0 }, 80)).toBe(250);
  });
  it('time, distance and warm-ups are never volume', () => {
    expect(setVolumeKg({ weightKg: 0, reps: 0, isWarmup: false }, { logType: 'time', loadMode: 'one', bwShare: 0 }, 80)).toBe(0);
    expect(setVolumeKg({ weightKg: 100, reps: 5, isWarmup: true }, { logType: 'weight_reps', loadMode: 'one', bwShare: 0 }, 80)).toBe(0);
  });
  it('body weight is taken from the day of the workout', () => {
    const bw = [
      { dateISO: '2026-08-01', weightKg: 78 },
      { dateISO: '2026-09-01', weightKg: 80 },
    ];
    expect(bodyweightOn(bw, '2026-08-20')).toBe(78);
    expect(bodyweightOn(bw, '2026-09-02')).toBe(80);
    expect(bodyweightOn(bw, '2026-07-01')).toBe(78); // before the first entry: the earliest
    const session = {
      dateISO: '2026-08-20',
      exercises: [{ exercise: { id: 'p', ...pull, muscles: { primary: ['lats' as const], secondary: [] } }, sets: [{ weightKg: 0, reps: 10, isWarmup: false }] }],
    };
    expect(sessionVolumeKg(session, bw)).toBe(780);
  });
});

describe('finer muscles', () => {
  it('a bench set counts fully for chest and half for triceps and front shoulders', () => {
    const shares = setShares({ primary: ['chest'], secondary: ['triceps', 'front_delts'] });
    expect(shares.get('chest')).toBe(1);
    expect(shares.get('triceps')).toBe(0.5);
    expect(shares.get('front_delts')).toBe(0.5);
  });
  it('sets per muscle add up across exercises (time sets count as sets)', () => {
    const s = {
      dateISO: TODAY,
      exercises: [
        { exercise: { id: 'b', logType: 'weight_reps' as const, loadMode: 'one' as const, bwShare: 0, muscles: { primary: ['chest' as const], secondary: ['triceps' as const] } }, sets: [1, 2, 3].map(() => ({ weightKg: 60, reps: 8, isWarmup: false })) },
        { exercise: { id: 'p', logType: 'time' as const, loadMode: 'one' as const, bwShare: 0, muscles: { primary: ['abs' as const], secondary: [] } }, sets: [{ weightKg: 0, reps: 0, isWarmup: false }, { weightKg: 0, reps: 0, isWarmup: true }] },
      ],
    };
    expect(muscleSets([s])).toEqual([
      { muscle: 'chest', sets: 3 },
      { muscle: 'triceps', sets: 1.5 },
      { muscle: 'abs', sets: 1 },
    ]);
  });
  it('older rows are split by name: lateral → side, face pull → rear, press → front', () => {
    expect(finerFromCoarse('Lateral Raise (Dumbbell)', 'shoulders')).toBe('side_delts');
    expect(finerFromCoarse('Face Pull', 'shoulders')).toBe('rear_delts');
    expect(finerFromCoarse('Overhead Press', 'shoulders')).toBe('front_delts');
    expect(finerFromCoarse('Lat Pulldown', 'back')).toBe('lats');
    expect(finerFromCoarse('Shrug (Dumbbell)', 'back')).toBe('traps');
    expect(finerFromCoarse('Russian Twist', 'core')).toBe('obliques');
    expect(musclesOf(ex({ name: 'Bench', muscleGroup: 'chest', secondaryMuscles: ['triceps', 'shoulders'] }))).toEqual({
      primary: ['chest'],
      secondary: ['triceps', 'front_delts'],
    });
  });
});

describe('timed holds: add 5 s when every set reached the target (research §4.5)', () => {
  const plank = ex({ name: 'Plank', equipment: 'bodyweight', muscleGroup: 'core' });
  const run = (h: ProgSession[], cap?: number, harder?: { id: string | null; name: string }) =>
    computeProgressionTarget({ exercise: plank, target: range(8, 12), history: h, todayISO: TODAY, logType: 'time', holdCapSec: cap, harder });

  it('first time: no time to beat', () => {
    const t = run([]);
    expect(t.rule).toBe('T0');
    expect(targetLine(t)).toBe('First time · find a time you can hold');
    expect(targetFill(t)).toBeNull();
  });
  it('hit → +5 s on every set, filled into the rows', () => {
    const t = run([holds('2026-10-03', [45, 45, 45]), holds('2026-09-30', [40, 40, 40])]);
    expect(t.rule).toBe('T2');
    expect(t.holdSec).toBe(50);
    expect(t.change).toBe('up');
    expect(targetLine(t)).toBe('Hold 50 s');
    expect(targetFill(t)).toEqual({ weightKg: 0, reps: 0, durationSec: 50 });
  });
  it('missed → keep the same target', () => {
    const t = run([holds('2026-10-03', [45, 40, 35]), holds('2026-09-30', [40, 40, 40])]);
    expect(t.rule).toBe('T3');
    expect(t.holdSec).toBe(45);
    expect(t.change).toBeNull();
  });
  it('at the cap → "try a harder version", naming it', () => {
    const t = run([holds('2026-10-03', [60, 60, 60]), holds('2026-09-30', [55, 55, 55])], 60, { id: 'x', name: 'Long-Lever Plank' });
    expect(t.rule).toBe('Tcap');
    expect(t.holdSec).toBe(60);
    expect(t.version?.name).toBe('Long-Lever Plank');
    expect(targetLine(t)).toBe('Hold 1 min · try a harder version');
    expect(targetFill(t)).toBeNull();
  });
  it('review: never targets less than last time — a custom wall sit (no cap) at 2 min goes UP, not down to 1 min', () => {
    const t = run([holds('2026-10-03', [120, 120, 120])]);
    expect(t.rule).toBe('T2');
    expect(t.holdSec).toBe(125);
    expect(targetFill(t)).toEqual({ weightKg: 0, reps: 0, durationSec: 125 });
  });
  it('review: past the cap with no harder version linked, the fill is what was held, not the cap', () => {
    const t = run([holds('2026-10-03', [70, 65, 65])], 60);
    expect(t.rule).toBe('Tcap');
    expect(t.holdSec).toBe(65);
    expect(targetFill(t)).toEqual({ weightKg: 0, reps: 0, durationSec: 65 });
  });
  it('review: "try a harder version" stays up while the member keeps holding the cap', () => {
    const h = [holds('2026-10-06', [60, 60, 60]), holds('2026-10-03', [60, 60, 60]), holds('2026-09-30', [55, 55, 55])];
    const t = run(h, 60, { id: 'x', name: 'Long-Lever Plank' });
    expect(t.rule).toBe('Tcap');
    expect(targetLine(t)).toBe('Hold 1 min · try a harder version');
  });
  it('review: one set at the target is not a hit when three were planned', () => {
    const t = run([holds('2026-10-03', [45]), holds('2026-09-30', [40, 40, 40])]);
    expect(t.rule).toBe('T3');
    expect(t.holdSec).toBe(45);
    expect(t.change).toBeNull();
  });
  it('before Phase 2 a plank with history looked like a first time (no reps → no history)', () => {
    const h = [holds('2026-10-03', [45, 45, 45])];
    const old = computeProgressionTarget({ exercise: plank, target: range(8, 12), history: h, todayISO: TODAY });
    expect(old.rule).toBe('R0'); // the weight × reps engine sees nothing
    expect(run(h).rule).toBe('T2');
  });
});

describe('bodyweight reps: cap → harder version; stuck → easier version (§4.4)', () => {
  const pushUp = ex({ name: 'Push-up', equipment: 'bodyweight' });
  const harder = { id: 'h', name: 'Decline Push-up' };
  const easier = { id: 'e', name: 'Incline Push-up' };
  it('at the cap the line names the switch', () => {
    const t = computeProgressionTarget({ exercise: pushUp, target: range(8, 12), history: [reps('2026-10-03', [[0, 25], [0, 25], [0, 25]])], todayISO: TODAY, logType: 'reps', repCap: 25, harder });
    expect(t.rule).toBe('B2cap');
    expect(t.version).toEqual({ kind: 'harder', id: 'h', name: 'Decline Push-up' });
    expect(targetLine(t)).toBe('Bodyweight · try a harder version');
    expect(t.reason).toContain('Decline Push-up');
  });
  it('review: at the cap with no harder version, the rows keep what was done (20 reps, not the cap of 15)', () => {
    const pull = ex({ name: 'Pull-up', equipment: 'bodyweight' });
    const t = computeProgressionTarget({ exercise: pull, target: range(8, 12), history: [reps('2026-10-03', [[0, 20], [0, 20], [0, 20]])], todayISO: TODAY, logType: 'reps', repCap: 15 });
    expect(t.rule).toBe('B2cap');
    expect(targetFill(t)).toEqual({ weightKg: 0, reps: 20 });
  });
  it('four workouts under the range → try the easier version', () => {
    const low = (d: string) => reps(d, [[0, 4], [0, 3], [0, 3]]);
    const h = [low('2026-10-03'), low('2026-09-30'), low('2026-09-27'), low('2026-09-24')];
    const t = computeProgressionTarget({ exercise: pushUp, target: range(8, 12), history: h, todayISO: TODAY, logType: 'reps', easier });
    expect(t.rule).toBe('B1easy');
    expect(targetLine(t)).toBe('Bodyweight · try an easier version');
    // Three workouts are not enough, and with no easier version linked it keeps "one more rep".
    expect(computeProgressionTarget({ exercise: pushUp, target: range(8, 12), history: h.slice(0, 3), todayISO: TODAY, logType: 'reps', easier }).rule).toBe('B1');
    expect(computeProgressionTarget({ exercise: pushUp, target: range(8, 12), history: h, todayISO: TODAY, logType: 'reps' }).rule).toBe('B1');
  });
});

describe('assisted: the help goes DOWN (§4.4, Phase 2)', () => {
  const assisted = ex({ name: 'Assisted Pull-up', equipment: 'machine', incrementKg: 5, muscleGroup: 'back' });
  const run = (h: ProgSession[], harder?: { id: string | null; name: string }) =>
    computeProgressionTarget({ exercise: assisted, target: range(8, 12), history: h, todayISO: TODAY, logType: 'assisted', harder });

  it('top of the range → one step less help ("Up")', () => {
    const t = run([reps('2026-10-03', [[-20, 12], [-20, 12], [-20, 12]])]);
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(-15);
    expect(t.change).toBe('up');
    expect(targetLine(t)).toBe('Assist 15 kg · aim for 8');
    expect(targetFill(t)).toEqual({ weightKg: 15, reps: 8 }); // typed form: positive help
    expect(t.reason).toContain('20 kg of help');
  });
  it('under the range twice → a little more help ("Lighter")', () => {
    const t = run([reps('2026-10-03', [[-20, 5], [-20, 5], [-20, 4]]), reps('2026-09-30', [[-20, 6], [-20, 5], [-20, 5]])]);
    expect(t.rule).toBe('R3');
    expect(t.targetWeightKg).toBe(-25);
    expect(t.change).toBe('down');
  });
  it('no help left → try the unassisted version', () => {
    const t = run([reps('2026-10-03', [[-5, 12], [-5, 12], [-5, 12]])], { id: 'p', name: 'Pull-up' });
    expect(t.rule).toBe('A2zero');
    expect(targetLine(t)).toBe('Try it without help');
    expect(t.reason).toContain('Pull-up');
  });
  it('review: no help left and no harder version linked reads "No help", never "Assist 0 kg"', () => {
    const t = run([reps('2026-10-03', [[-5, 12], [-5, 12], [-5, 12]])]);
    expect(t.rule).toBe('A2zero');
    expect(targetLine(t)).toBe('No help · aim for 8');
    const low = run([reps('2026-10-03', [[0, 5], [0, 5], [0, 4]]), reps('2026-09-30', [[0, 6], [0, 5], [0, 5]])]);
    expect(low.rule).toBe('R3');
    expect(low.reason).toContain('with no help');
    expect(low.reason).not.toContain('0 kg of help');
  });
  it('before Phase 2 an assisted pull-up read help as kilos to ADD (a −20 kg main weight became "bodyweight")', () => {
    const h = [reps('2026-10-03', [[-20, 12], [-20, 12], [-20, 12]])];
    const old = computeProgressionTarget({ exercise: assisted, target: range(8, 12), history: h, todayISO: TODAY });
    // Was `true` (nonsense: help is not body weight). Since TG-07 a machine lift is never
    // "Bodyweight" even when read as weight × reps: its ≤ 0 kg workouts are "no weight logged".
    expect(old.bodyweightOnly).toBe(false);
    expect(run(h).bodyweightOnly).toBe(false);
  });
});

describe('a weighted bodyweight move shows "+kg"', () => {
  it('+10 kg line, no big-jump guard on a belt', () => {
    const t = computeProgressionTarget({
      exercise: ex({ name: 'Weighted Pull-up', equipment: 'bodyweight' }),
      target: range(5, 8),
      history: [reps('2026-10-03', [[10, 8], [10, 8], [10, 8]])],
      todayISO: TODAY,
      logType: 'weighted',
    });
    expect(targetLine(t)).toBe('+12.5 kg · aim for 5');
  });
  it('"kg each" on dumbbells, "per side" on one-arm moves', () => {
    const t = computeProgressionTarget({
      exercise: ex({ name: 'Dumbbell Bench', equipment: 'dumbbell' }),
      target: range(8, 12),
      history: [reps('2026-10-03', [[25, 10], [25, 9], [25, 9]])],
      todayISO: TODAY,
    });
    expect(targetLine({ ...t, each: true })).toBe('25 kg each · aim for 10');
    expect(targetLine({ ...t, perSide: true })).toBe('25 kg · aim for 10 per side');
  });
});

describe('the workout card: timed rows and assisted rows', () => {
  const draft = (over: Partial<DraftExercise>): DraftExercise => ({
    key: 'x',
    exerciseId: 'e',
    name: 'Plank',
    muscleGroup: 'core',
    equipment: 'bodyweight',
    previousSets: [],
    sets: [
      { key: 's1', weightKg: null, reps: null, isWarmup: false, done: false },
      { key: 's2', weightKg: null, reps: null, isWarmup: false, done: false },
    ],
    ...over,
  });
  it('a timed row hints last time, and the next row the one above', () => {
    const d = draft({ logType: 'time', previousSets: [{ weightKg: 0, reps: 0, durationSec: 40 }] });
    expect(fillForSet(d, 's1')).toEqual({ weightKg: 0, reps: 0, durationSec: 40 });
    const typed = { ...d, sets: [{ ...d.sets[0], durationSec: 50 }, d.sets[1]] };
    expect(fillForSet(typed, 's2')).toEqual({ weightKg: 0, reps: 0, durationSec: 50 });
  });
  it('the hold Target fills every timed row', () => {
    const d = draft({ logType: 'time' });
    expect(fillForSet(d, 's2', { weightKg: 0, reps: 0, durationSec: 55 })).toEqual({ weightKg: 0, reps: 0, durationSec: 55 });
  });
  it('saving: time rows store 0 kg × 0 with the time; help is stored negative', () => {
    const plank = draft({ logType: 'time', sets: [{ key: 's1', weightKg: null, reps: null, durationSec: 45, isWarmup: false, done: true }] });
    const ap = draft({
      exerciseId: 'ap',
      name: 'Assisted Pull-up',
      logType: 'assisted',
      sets: [{ key: 'a1', weightKg: 20, reps: 8, isWarmup: false, done: true }],
    });
    const rows = draftToRichSets([plank, ap]);
    expect(rows[0]).toMatchObject({ weightKg: 0, reps: 0, durationSec: 45 });
    expect(rows[1]).toMatchObject({ weightKg: -20, reps: 8 });
    expect(rows[1]).not.toHaveProperty('durationSec');
  });
  it('before Phase 2 a plank set with only a time was silently dropped at finish', () => {
    const plank = draft({ sets: [{ key: 's1', weightKg: null, reps: null, durationSec: 45, isWarmup: false, done: true }] });
    expect(draftToRichSets([plank])).toHaveLength(0); // no logType = weight × reps: not loggable
    expect(draftToRichSets([{ ...plank, logType: 'time' }])).toHaveLength(1);
  });
});

describe('the distance box keeps what was typed (review finding)', () => {
  it('"100.5" m matches its stored 100.5 m (was rewritten to "101" mid-typing); km round-trips', async () => {
    const { typedDistanceMatches, distanceToUnit } = await import('@/tracker/engine/logTypes');
    expect(typedDistanceMatches(100.5, 100.5, 'm')).toBe(true);
    expect(distanceToUnit(100.5, 'm')).toBe(101); // the old comparison: 100.5 !== 101 → rewrite
    expect(typedDistanceMatches(2.4, 2400, 'km')).toBe(true);
    expect(typedDistanceMatches(null, null, 'km')).toBe(true);
    expect(typedDistanceMatches(2.4, 5000, 'km')).toBe(false); // a fill from elsewhere still shows
  });
});
