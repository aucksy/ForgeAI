import { describe, expect, it } from 'vitest';

import {
  classifyEquipment,
  classifyMuscle,
  inferDayType,
  parseHevyDate,
} from '@/tracker/services/hevyImport';

describe('parseHevyDate', () => {
  it('parses "D Mon YYYY, HH:MM" on a TIMEZONE-STABLE UTC basis', () => {
    const ms = parseHevyDate('7 Jul 2026, 14:24')!;
    expect(ms).toBe(Date.UTC(2026, 6, 7, 14, 24, 0, 0));
    // The whole point of the fix: identity is UTC, not the runner's local zone.
    const d = new Date(ms);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCDate()).toBe(7);
    expect(d.getUTCHours()).toBe(14);
  });

  it('accepts 1-2 digit day/hour and a comma-optional format', () => {
    expect(parseHevyDate('1 Jan 2025 09:05')).toBe(Date.UTC(2025, 0, 1, 9, 5, 0, 0));
    expect(parseHevyDate('12 December 2024, 23:59')).toBe(Date.UTC(2024, 11, 12, 23, 59, 0, 0));
  });

  it('returns null for non-strings and unrecognizable input', () => {
    expect(parseHevyDate(null)).toBeNull();
    expect(parseHevyDate(42)).toBeNull();
    expect(parseHevyDate('not a date')).toBeNull();
    expect(parseHevyDate('7 Xyz 2026, 14:24')).toBeNull(); // bad month
  });
});

describe('classifyMuscle', () => {
  it('resolves the documented tricky collisions (order matters)', () => {
    expect(classifyMuscle('Romanian Deadlift (Barbell)')).toBe('hamstrings');
    expect(classifyMuscle('Deadlift (Barbell)')).toBe('back');
    expect(classifyMuscle('Seated Leg Curl (Machine)')).toBe('hamstrings');
    expect(classifyMuscle('Face Pull (Cable)')).toBe('shoulders');
    expect(classifyMuscle('Iso-Lateral Chest Press (Machine)')).toBe('chest');
    expect(classifyMuscle('Iso-Lateral Row (Machine)')).toBe('back');
    expect(classifyMuscle('Seated Incline Curl (Dumbbell)')).toBe('biceps');
  });

  it('classifies plain lifts', () => {
    expect(classifyMuscle('Bench Press (Barbell)')).toBe('chest');
    expect(classifyMuscle('Back Squat (Barbell)')).toBe('quads');
    expect(classifyMuscle('Calf Raise (Machine)')).toBe('calves');
    expect(classifyMuscle('Hip Thrust (Barbell)')).toBe('glutes');
  });

  it('falls back to chest for cryptic names', () => {
    expect(classifyMuscle('Incline BB Jr')).toBe('chest');
  });
});

describe('classifyEquipment', () => {
  it('reads the trailing "(...)" suffix first', () => {
    expect(classifyEquipment('Bench Press (Barbell)')).toBe('barbell');
    expect(classifyEquipment('Curl (Dumbbell)')).toBe('dumbbell');
    expect(classifyEquipment('Lat Pulldown (Cable)')).toBe('cable');
    expect(classifyEquipment('Leg Press (Machine)')).toBe('machine');
    expect(classifyEquipment('Bench Press (Smith Machine)')).toBe('machine');
    expect(classifyEquipment('Push Up (Bodyweight)')).toBe('bodyweight');
  });

  it('ignores non-equipment parens and infers from the name', () => {
    // "bench" is not an equipment keyword -> no suffix, no name hit -> 'other'.
    expect(classifyEquipment('Bench Press (Home)')).toBe('other');
    expect(classifyEquipment('Barbell Bench Press (Home)')).toBe('barbell'); // name heuristic
    expect(classifyEquipment('Pull Up (Weighted)')).toBe('bodyweight');
    expect(classifyEquipment('DB Shoulder Press (Gurgaon)')).toBe('dumbbell');
  });

  it('uses bodyweight for calisthenics and other as a last resort', () => {
    expect(classifyEquipment('Pull Up')).toBe('bodyweight');
    expect(classifyEquipment('Muscle Up')).toBe('bodyweight');
    expect(classifyEquipment('Farmer Carry')).toBe('other');
  });

  it('pins a known gap: the plural "Dips" misses the \\bdip\\b boundary -> other', () => {
    // Hevy names this exercise "Dips" (plural); the calisthenics rule matches only
    // the singular \bdip\b, so it currently classifies as 'other'. Documented here
    // as current behaviour (O1 is tests-only). Candidate fix for a later phase.
    expect(classifyEquipment('Dips')).toBe('other');
  });
});

describe('inferDayType', () => {
  it('matches push/pull before anything else', () => {
    expect(inferDayType('Push Day')).toBe('push');
    expect(inferDayType('Pull Day')).toBe('pull');
  });

  it('handles full/legs and muscle-word inference', () => {
    expect(inferDayType('Full Body')).toBe('full');
    expect(inferDayType('Leg Day')).toBe('legs');
    expect(inferDayType('Triceps, Upper Chest')).toBe('push');
    expect(inferDayType('Back & Biceps')).toBe('pull');
    expect(inferDayType('Lower Body & Core')).toBe('lower');
    expect(inferDayType('Upper')).toBe('upper');
  });

  it('defaults to full for an unrecognizable title', () => {
    expect(inferDayType('Morning Session')).toBe('full');
  });
});
