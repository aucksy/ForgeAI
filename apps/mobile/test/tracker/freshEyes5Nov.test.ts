/**
 * Fresh-eyes review of the release UAT pictures (5 Nov 2026): the word and count fixes that are
 * logic, not just new text.
 */
import { describe, expect, it } from 'vitest';

import { fromFolder, inFolder } from '@/tracker/lib/folderWords';
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
