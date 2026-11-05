/**
 * Fresh-eyes review of the release UAT pictures (5 Nov 2026): the word and count fixes that are
 * logic, not just new text.
 */
import { describe, expect, it } from 'vitest';

import { fromFolder, inFolder } from '@/tracker/lib/folderWords';
import { inUseBeatLine } from '@/tracker/lib/inUse';
import { previousLeft } from '@/tracker/lib/kgTarget';
import { routineLine } from '@/tracker/lib/upNext';
import { FIRST_WORKOUT_LINE, withoutFirstWorkoutRecords } from '@/tracker/services/finishSummary';

describe('a folder named "From Hevy" inside a sentence', () => {
  it('is quoted and called a folder, never "from From Hevy" / "In From Hevy"', () => {
    expect(fromFolder('From Hevy')).toBe('from your “From Hevy” folder');
    expect(inFolder('From Strong')).toBe('In your “From Strong” folder');
    expect(routineLine({ folderName: 'From Hevy', nextCount: 4, nextFirst: 'Barbell Bench Press' })).toBe(
      'from your “From Hevy” folder · 4 exercises · Barbell Bench Press first',
    );
  });
  it('any other name reads as before', () => {
    expect(fromFolder('Push Pull Legs')).toBe('from Push Pull Legs');
    expect(inFolder('Fromage Split')).toBe('In Fromage Split');
  });
});

describe('a first own workout beats no best', () => {
  const data = { records: [{ exerciseId: 'b' }], prs: [{ exerciseName: 'Bench' }] } as never as Parameters<typeof withoutFirstWorkoutRecords>[0];
  it('the first workout shows no records; any other keeps them', () => {
    expect(withoutFirstWorkoutRecords(data, FIRST_WORKOUT_LINE)).toMatchObject({ records: [], prs: [] });
    expect(withoutFirstWorkoutRecords(data, 'Your 10th workout')).toBe(data);
    expect(withoutFirstWorkoutRecords(data, null)).toBe(data);
  });
  it('matches the milestone words', () => {
    expect(FIRST_WORKOUT_LINE).toBe('Your first workout');
  });
});

describe('In use: the gap to the PREVIOUS total (R-305 words, fresh-eyes numbers)', () => {
  const line = (left: number | null, reps = false, each = false) => inUseBeatLine(left == null ? null : { left, reps, unit: 'kg', each });
  it('rel-30 bench: last time 60x10, 60x8, 60x6 = 1,440 kg; set 1 done (600 kg) leaves 840, not 960', () => {
    const prev = [{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 8 }, { weightKg: 60, reps: 6 }];
    expect(previousLeft(prev, 600, false)).toBe(840);
    expect(line(previousLeft(prev, 600, false))).toBe('840 kg more to beat the previous total');
    expect(line(previousLeft(prev, 1560, false))).toBe('Previous total beaten ✓');
  });
  it('a machine lift: 40x10, 40x9, 40x8 = 1,080 kg; 280 done leaves 800', () => {
    expect(previousLeft([{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 9 }, { weightKg: 40, reps: 8 }], 280, false)).toBe(800);
  });
  it('dumbbells per hand: 8x12, 8x12 = 192 kg; 104 done leaves 88 per hand', () => {
    expect(line(previousLeft([{ weightKg: 8, reps: 12 }, { weightKg: 8, reps: 12 }], 104, false), false, true)).toBe('88 kg more per hand to beat the previous total');
  });
  it('reps only counts reps; no previous workout = no line', () => {
    expect(previousLeft([{ weightKg: 0, reps: 15 }, { weightKg: 0, reps: 12 }], 20, true)).toBe(7);
    expect(previousLeft([], 600, false)).toBeNull();
    expect(line(previousLeft([], 600, false))).toBeNull();
  });
});
