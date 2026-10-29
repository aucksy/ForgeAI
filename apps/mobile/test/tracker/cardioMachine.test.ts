/**
 * F64 — treadmill and cycle details (speed, incline, level per set). PURE parts.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));

import {
  cleanMachine,
  fieldLabel,
  machineBoxText,
  machineFieldsOf,
  machineFromRow,
  machineKindOf,
  machineText,
  parseMachineValue,
  speedFromShown,
  speedToShown,
  withMachineField,
} from '@/tracker/engine/cardioMachine';
import { draftToRichSets } from '@/tracker/services/draftSets';
import { currentWorkoutSets } from '@/tracker/services/currentInHistory';
import { machineChartMetrics, metricLabel, metricSeries, metricValueText } from '@/tracker/services/exerciseChart';
import { packWorkout, unpackWorkout, type SetRow, type WorkoutRow } from '@/cloud/pack';
import { hevyColumns, hevyCsvFromRows, type HistorySetRow } from '@/tracker/services/historyExport';
import type { DraftExercise } from '@/tracker/store/activeWorkoutStore';
import type { ExerciseHistoryEntry } from '@/tracker/db/exerciseHistory';

describe('which exercises are machines', () => {
  it('library machines by key; the air bike and lifts are not', () => {
    expect(machineKindOf({ catalogKey: 'treadmill_run' })).toBe('treadmill');
    expect(machineKindOf({ catalogKey: 'incline_treadmill_walk' })).toBe('treadmill');
    expect(machineKindOf({ catalogKey: 'stationary_bike' })).toBe('bike');
    expect(machineKindOf({ catalogKey: 'elliptical' })).toBe('elliptical');
    expect(machineKindOf({ catalogKey: 'stair_climber' })).toBe('stair');
    expect(machineKindOf({ catalogKey: 'rowing_machine' })).toBe('rower');
    expect(machineKindOf({ catalogKey: 'air_bike' })).toBeNull();
    expect(machineKindOf({ catalogKey: 'barbell_bench_press', name: 'Treadmill', logType: 'time' })).toBeNull();
  });

  it("the member's own: by name, only when logged by time or distance", () => {
    expect(machineKindOf({ name: 'Gym treadmill', logType: 'time_distance' })).toBe('treadmill');
    expect(machineKindOf({ name: 'Spin bike', logType: 'time' })).toBe('bike');
    expect(machineKindOf({ name: 'Concept2 erg', logType: 'distance' })).toBe('rower');
    expect(machineKindOf({ name: 'Assault bike', logType: 'time' })).toBeNull();
    expect(machineKindOf({ name: 'Treadmill lunge', logType: 'weight_reps' })).toBeNull();
    expect(machineKindOf({ name: 'Plank', logType: 'time' })).toBeNull();
  });

  it('the fields that fit each machine', () => {
    expect(machineFieldsOf('treadmill')).toEqual(['speed', 'incline']);
    for (const k of ['bike', 'elliptical', 'stair', 'rower'] as const) expect(machineFieldsOf(k)).toEqual(['level']);
    expect(machineFieldsOf(null)).toEqual([]);
  });
});

describe('typing and units', () => {
  it('parses what a box takes', () => {
    expect(parseMachineValue('8.5', 'speed')).toBe(8.5);
    expect(parseMachineValue('8,5', 'speed')).toBe(8.5);
    expect(parseMachineValue('', 'speed')).toBeNull();
    expect(parseMachineValue('.', 'incline')).toBeNull();
    expect(parseMachineValue('abc', 'level')).toBeNull();
    expect(parseMachineValue('41', 'incline')).toBeNull();
    expect(parseMachineValue('0', 'incline')).toBe(0);
  });

  it('speed is stored in km/h and shown in mph under imperial, and 6 mph comes back as 6', () => {
    expect(speedToShown(10, 'metric')).toBe(10);
    expect(speedToShown(16.0934, 'imperial')).toBe(10);
    const kmh = speedFromShown(6, 'imperial');
    expect(speedToShown(kmh, 'imperial')).toBe(6);
    expect(fieldLabel('speed', 'imperial')).toBe('mph');
    expect(fieldLabel('speed', 'metric')).toBe('km/h');
  });

  it('a box edit writes one field and clears to null when nothing is left', () => {
    const m = withMachineField(null, 'speed', 8.5, 'metric');
    expect(m).toEqual({ speedKmh: 8.5 });
    const m2 = withMachineField(m, 'incline', 6, 'metric');
    expect(m2).toEqual({ speedKmh: 8.5, inclinePct: 6 });
    expect(machineBoxText(m2, 'incline', 'metric')).toBe('6');
    expect(withMachineField({ level: 8 }, 'level', null, 'metric')).toBeNull();
  });

  it('cleans out junk and keeps nothing for an empty set', () => {
    expect(cleanMachine({})).toBeNull();
    expect(cleanMachine({ speedKmh: 0 })).toBeNull();
    expect(cleanMachine({ speedKmh: Number.NaN, level: 500 })).toBeNull();
    expect(machineFromRow({ speed_kmh: null, incline_pct: null, machine_level: null })).toBeNull();
    expect(machineFromRow({ speed_kmh: 9, incline_pct: 0, machine_level: null })).toEqual({ speedKmh: 9, inclinePct: 0 });
  });

  it('reads as History shows it', () => {
    expect(machineText({ speedKmh: 8.5, inclinePct: 6 }, 'metric')).toBe('8.5 km/h · incline 6%');
    expect(machineText({ level: 8 }, 'metric')).toBe('Level 8');
    expect(machineText({ inclinePct: 12 }, 'metric')).toBe('Incline 12%');
    expect(machineText(null, 'metric')).toBe('');
    // Words members never see on this screen.
    expect(machineText({ speedKmh: 8, inclinePct: 2, level: 3 }, 'metric')).not.toMatch(/volume|\bPR\b|session/i);
  });
});

const treadmill = (sets: DraftExercise['sets']): DraftExercise => ({
  key: 'c1',
  exerciseId: 'tm',
  name: 'Treadmill Run',
  muscleGroup: 'cardio' as DraftExercise['muscleGroup'],
  equipment: 'machine' as DraftExercise['equipment'],
  incrementKg: 0,
  supersetGroup: null,
  previousSets: [],
  logType: 'time_distance',
  catalogKey: 'treadmill_run',
  sets,
});

describe('saving a workout', () => {
  it('a set with details carries them; a set without keeps its exact shape', () => {
    const rows = draftToRichSets([
      treadmill([
        { key: 'a', weightKg: null, reps: null, durationSec: 300, distanceM: 500, isWarmup: false, done: true, machine: { speedKmh: 6 } },
        { key: 'b', weightKg: null, reps: null, durationSec: 60, distanceM: 200, isWarmup: false, done: true, machine: { speedKmh: 12, inclinePct: 2 } },
        { key: 'c', weightKg: null, reps: null, durationSec: 300, distanceM: 500, isWarmup: false, done: true },
      ]),
    ]);
    expect(rows[0].machine).toEqual({ speedKmh: 6 });
    expect(rows[1].machine).toEqual({ speedKmh: 12, inclinePct: 2 });
    expect('machine' in rows[2]).toBe(false);
  });

  it('the open workout shows its ticked details on History', () => {
    const sets = currentWorkoutSets(true, [
      treadmill([{ key: 'a', weightKg: null, reps: null, durationSec: 300, distanceM: 500, isWarmup: false, done: true, machine: { speedKmh: 6, inclinePct: 1 } }]),
    ], 'tm');
    expect(sets?.[0].machine).toEqual({ speedKmh: 6, inclinePct: 1 });
  });
});

describe('charts', () => {
  const entry = (dateISO: string, machines: ({ speedKmh?: number; inclinePct?: number; level?: number } | undefined)[]): ExerciseHistoryEntry => ({
    sessionId: dateISO,
    dateISO,
    volumeKg: 0,
    sets: machines.map((m, i) => ({ id: `${dateISO}-${i}`, sessionId: dateISO, exerciseId: 'tm', setNumber: i + 1, weightKg: 0, reps: 0, isWarmup: false, durationSec: 60, ...(m ? { machine: m } : {}) })),
  });

  it('offers a chip only for a detail some set carries', () => {
    expect(machineChartMetrics([entry('2026-10-01', [undefined])])).toEqual([]);
    expect(machineChartMetrics([entry('2026-10-01', [{ speedKmh: 8 }, { inclinePct: 3 }])])).toEqual(['topSpeed', 'topIncline']);
    expect(machineChartMetrics([entry('2026-10-01', [{ level: 8 }])])).toEqual(['topLevel']);
  });

  it('draws the best of each workout, in the member units', () => {
    const history = [entry('2026-10-02', [{ speedKmh: 10 }, { speedKmh: 12 }]), entry('2026-10-01', [{ speedKmh: 8 }, undefined])];
    expect(metricSeries('topSpeed', history, [], 'metric', 'km')).toEqual([
      { x: '2026-10-01', y: 8 },
      { x: '2026-10-02', y: 12 },
    ]);
    expect(metricSeries('topSpeed', history, [], 'imperial', 'mi')[1].y).toBe(7.5);
    expect(metricSeries('topIncline', history, [], 'metric', 'km')).toEqual([]);
    expect(metricLabel('topSpeed', 'metric')).toBe('Fastest speed');
    expect(metricLabel('topLevel', 'metric')).toBe('Highest level');
    expect(metricValueText('topSpeed', 12, 'metric', 'km')).toBe('12 km/h');
    expect(metricValueText('topIncline', 6, 'metric', 'km')).toBe('incline 6%');
    expect(metricValueText('topLevel', 8, 'metric', 'km')).toBe('level 8');
  });
});

describe('cloud copy (packed workouts)', () => {
  const w: WorkoutRow = { id: 'w', date_iso: '2026-10-01', started_at: 1, ended_at: 2, day_type: 'cardio', notes: null, source: 'manual', easy_week: null, title: null, routine_id: null };
  const base: SetRow = { exercise_id: 'tm', set_number: 1, weight_kg: 0, reps: 0, is_warmup: 0, rpe: null, set_type: null, note: null, superset_group: null, duration_sec: 300, distance_m: 500, load_mode: null, card_index: null };

  it('an older set packs to the very same text (nothing is copied again)', () => {
    expect(packWorkout(w, [base], (id) => `x:${id}`)).toBe(packWorkout(w, [{ ...base, speed_kmh: null, incline_pct: null, machine_level: null }], (id) => `x:${id}`));
    const back = unpackWorkout(packWorkout(w, [base], (id) => `x:${id}`))!;
    expect('speed_kmh' in back.sets[0]).toBe(false);
  });

  it('the details come back', () => {
    const back = unpackWorkout(packWorkout(w, [{ ...base, speed_kmh: 8.5, incline_pct: 6 }, { ...base, set_number: 2, machine_level: 9 }], (id) => `x:${id}`))!;
    expect(back.sets[0]).toMatchObject({ speed_kmh: 8.5, incline_pct: 6 });
    expect(back.sets[1]).toMatchObject({ machine_level: 9 });
  });
});

describe('"Save my history" file', () => {
  it('adds speed, incline and level columns after Hevy’s, in the member units', () => {
    expect(hevyColumns('metric').slice(-3)).toEqual(['speed_kmh', 'incline_percent', 'level']);
    expect(hevyColumns('imperial').slice(-3)).toEqual(['speed_mph', 'incline_percent', 'level']);
    const row: HistorySetRow = {
      session_id: 's', date_iso: '2026-10-01', started_at: new Date(2026, 9, 1, 7, 0).getTime(), ended_at: null, day_type: 'cardio', notes: null,
      exercise_id: 'tm', exercise_name: 'Treadmill Run', log_type: 'time_distance', weight_kg: 0, reps: 0, is_warmup: 0, rpe: null, set_type: null,
      note: null, superset_group: null, duration_sec: 300, distance_m: 500, speed_kmh: 8.5, incline_pct: 6, machine_level: null,
    };
    const line = hevyCsvFromRows([row], 'metric').split('\n')[1];
    expect(line.endsWith('"8.5","6",""')).toBe(true);
    const plain = hevyCsvFromRows([{ ...row, speed_kmh: null, incline_pct: null }], 'metric').split('\n')[1];
    expect(plain.endsWith('"","",""')).toBe(true);
  });
});
