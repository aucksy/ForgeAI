/**
 * v0.27.0 — import from Strong. Both layouts Strong has shipped: the older comma file (units not
 * in the file) and Strong 6's semicolon file ("Weight (kg)" / "Weight (lbs)", "Duration (sec)",
 * "Distance (meters)", rest-timer rows, comma decimals).
 */
import { describe, expect, it } from 'vitest';

import {
  looksLikeStrong,
  parseCsv,
  parseStrongDuration,
  parseStrongText,
  strongFileInfo,
} from '@/tracker/services/strongImport';

const OLD = [
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
  '2026-09-01 18:30:12,"Push, heavy",1h 5m,Bench Press (Barbell),W,40,10,0,0,,,',
  '2026-09-01 18:30:12,"Push, heavy",1h 5m,Bench Press (Barbell),1,80,5,0,0,"felt ""good""",,8',
  '2026-09-01 18:30:12,"Push, heavy",1h 5m,Bench Press (Barbell),2,80,5,0,0,,,',
  '2026-09-01 18:30:12,"Push, heavy",1h 5m,Bench Press (Barbell),D,60,8,0,0,,,',
  '2026-09-01 18:30:12,"Push, heavy",1h 5m,Running,1,0,0,5,1500,,,',
  '2026-09-03 07:05:00,Pull,45m,Pull Up,1,0,0,0,0,,,',
  '2026-09-03 07:05:00,Pull,45m,Pull Up,2,0,8,0,0,,,',
].join('\n');

const NEW = [
  '"Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (lbs)";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"',
  '"12";"2026-09-05 17:00:00";"Legs";"3600";"Squat (Barbell)";"1";"225";"5";"";"";"";"";""',
  '"12";"2026-09-05 17:00:00";"Legs";"3600";"Squat (Barbell)";"Rest Timer";"";"";"";"";"120";"";""',
  '"12";"2026-09-05 17:00:00";"Legs";"3600";"Squat (Barbell)";"2";"227,5";"5";"9";"";"";"";""',
  '"12";"2026-09-05 17:00:00";"Legs";"3600";"Rowing (Machine)";"1";"";"";"";"2000";"480";"";""',
].join('\r\n');

describe('Strong export', () => {
  it('reads quoted fields, doubled quotes and both line endings', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3', ',')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('knows a Strong file from its header, and what it says about units', () => {
    expect(looksLikeStrong(OLD)).toBe(true);
    expect(looksLikeStrong(NEW)).toBe(true);
    expect(looksLikeStrong('title,start_time,exercise_title,set_type')).toBe(false);
    expect(strongFileInfo(OLD)).toEqual({ unitsKnown: false, fileUnits: null });
    expect(strongFileInfo(NEW)).toEqual({ unitsKnown: true, fileUnits: 'imperial' });
  });

  it('reads Strong durations', () => {
    expect(parseStrongDuration('1h 5m')).toBe(3900);
    expect(parseStrongDuration('45m')).toBe(2700);
    expect(parseStrongDuration('3600')).toBe(3600);
    expect(parseStrongDuration('1:02:03')).toBe(3723);
    expect(parseStrongDuration('')).toBeNull();
  });

  it('turns the older file into workouts, sets and set types (kg + km chosen)', () => {
    const p = parseStrongText(OLD, 'metric');
    expect(p.workouts).toHaveLength(2);
    const push = p.workouts[0];
    expect(push.title).toBe('Push, heavy');
    expect(push.dayType).toBe('push');
    expect(push.dateISO).toBe('2026-09-01');
    expect(push.endedAt! - push.startedAt).toBe(3900 * 1000);
    const bench = push.exercises[0];
    expect(bench.sets.map((s) => [s.weightKg, s.reps, s.isWarmup, s.setType])).toEqual([
      [40, 10, true, 'normal'],
      [80, 5, false, 'normal'],
      [80, 5, false, 'normal'],
      [60, 8, false, 'drop'],
    ]);
    expect(bench.sets[1].rpe).toBe(8);
    expect(bench.note).toBe('felt "good"');
    const run = push.exercises[1].sets[0];
    expect(run.distanceM).toBe(5000);
    expect(run.durationSec).toBe(1500);
    expect(p.timedRows).toBe(1);
    expect(p.skippedRows).toBe(1); // the pull-up row with 0 reps
  });

  it('reads the same older file as pounds and miles when the member says so', () => {
    const p = parseStrongText(OLD, 'imperial');
    expect(p.workouts[0].exercises[0].sets[1].weightKg).toBeCloseTo(36.29, 2);
    expect(p.workouts[0].exercises[1].sets[0].distanceM).toBeCloseTo(8046.7, 1);
  });

  it('reads Strong 6: pounds from the header, comma decimals, metres, no rest-timer sets', () => {
    const p = parseStrongText(NEW, 'metric'); // the header wins over the choice
    const legs = p.workouts[0];
    const squat = legs.exercises[0].sets;
    expect(squat).toHaveLength(2);
    expect(squat[0].weightKg).toBeCloseTo(102.06, 2);
    expect(squat[1].weightKg).toBeCloseTo(103.19, 2);
    expect(squat[1].rpe).toBe(9);
    expect(legs.exercises[1].sets[0].distanceM).toBe(2000);
    expect(legs.endedAt! - legs.startedAt).toBe(3600 * 1000);
    expect(p.totalSetRows).toBe(3);
  });

  it('refuses a file that is not Strong’s in plain words', () => {
    expect(() => parseStrongText('a,b\n1,2', 'metric')).toThrow(/Strong export/);
  });
});
