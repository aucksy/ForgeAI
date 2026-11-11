/**
 * R-436 + the 0.77.0 adversarial review (11 Nov 2026): the 'p' item 'empty' must never be read as rest lengths
 * by an older app. The cloud path refuses it (the leading 1 fails unpackPrefs); the backup "Add to what's
 * here" path of 0.76.0 (backupRestore planAdd) keeps every row whose first value is a string, so each row
 * must start with its number.
 */
import { describe, expect, it } from 'vitest';

import { packEmptyWorkout, unpackEmptyWorkout, unpackPrefs } from '@/cloud/pack';

/** 0.76.0's planAdd row filter for a 'p' item, word for word (git show v0.76.0:apps/mobile/src/backup/backupRestore.ts). */
const oldAddRows = (data: unknown[]) => data.filter((r) => Array.isArray(r) && typeof r[0] === 'string');

describe('R-436: older apps leave the last empty workout alone', () => {
  const items = [
    { ref: 'b:bench-press', sets: 3 },
    { ref: 'x:my-own-move', sets: 4 },
  ];
  const data = packEmptyWorkout(items);

  it('0.76.0 backup "Add" keeps no row of it (no 3-second rest times)', () => {
    expect(oldAddRows(JSON.parse(data) as unknown[])).toEqual([]);
  });

  it('the cloud path of an older app refuses it', () => {
    expect(unpackPrefs(data)).toBeNull();
  });

  it('reads back what was packed, in order', () => {
    expect(unpackEmptyWorkout(data)).toEqual(items);
  });

  it('still reads the first shape, [ref, sets]', () => {
    expect(unpackEmptyWorkout(JSON.stringify([1, ['b:bench-press', 3], ['x:my-own-move', 4]]))).toEqual(items);
  });

  it('refuses a row with no exercise', () => {
    expect(unpackEmptyWorkout(JSON.stringify([1, [3, '']]))).toBeNull();
    expect(unpackEmptyWorkout(JSON.stringify([1, [3, 4]]))).toBeNull();
    expect(unpackEmptyWorkout(JSON.stringify([2, [3, 'b:bench-press']]))).toBeNull();
  });
});
