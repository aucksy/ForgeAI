/**
 * v0.28.0 — make an exercise from "Add exercise" inside a workout (owner, 8 Oct 2026: Hevy has
 * Create there), and a distance exercise of the member's own in km or metres.
 */
import { describe, expect, it } from 'vitest';

import { distUnitOf } from '@/tracker/db/customExercise';
import { resolveExercise, type ExerciseInfoRow } from '@/tracker/db/exerciseInfo';
import { createOffer } from '@/tracker/services/exerciseSearch';

describe('"Create “…”" at the end of the search', () => {
  const all = [{ name: 'Barbell Bench Press' }, { name: 'Sled Push' }];

  it('offers what was typed when no exercise has exactly that name', () => {
    expect(createOffer('  sled   drag ', all)).toBe('sled drag');
    expect(createOffer('Bench', all)).toBe('Bench');
  });

  it('not for an exact name already there, nor for one letter', () => {
    expect(createOffer('sled push', all)).toBeNull();
    expect(createOffer('s', all)).toBeNull();
    expect(createOffer('', all)).toBeNull();
  });
});

describe("the member's own distance exercise in km or metres", () => {
  it('only a distance type keeps a unit (km unless metres was chosen)', () => {
    expect(distUnitOf({ logType: 'distance', distUnit: 'm' })).toBe('m');
    expect(distUnitOf({ logType: 'time_distance' })).toBe('km');
    expect(distUnitOf({ logType: 'weight_reps', distUnit: 'm' })).toBeNull();
  });

  const row = (dist_unit: string | null): ExerciseInfoRow => ({
    id: 'x',
    name: 'Sled Drag',
    aliases: '[]',
    muscle_group: 'core',
    secondary_muscles: '[]',
    equipment: 'other',
    is_compound: 0,
    increment_kg: 2.5,
    catalog_key: null,
    log_type: 'distance',
    load_mode: null,
    bw_share: 0,
    muscles: null,
    media_uri: null,
    media_type: null,
    dist_unit,
  });

  it('a stored unit is read back; none (older rows) stays km', () => {
    expect(resolveExercise(row('m'), null).distUnit).toBe('m');
    expect(resolveExercise(row(null), null).distUnit).toBe('km');
    expect(resolveExercise(row('furlong'), null).distUnit).toBe('km');
  });
});

describe('an export shared to ForgeAI from the share menu', () => {
  it('a spreadsheet is read as bytes, a .csv as text', async () => {
    const { sharedFileKind } = await import('@/tracker/phone/sharedImport');
    expect(sharedFileKind({ name: 'workout_data.xlsx', type: '' })).toBe('sheet');
    expect(sharedFileKind({ name: 'shared-export', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBe('sheet');
    expect(sharedFileKind({ name: 'workout_data.csv', type: 'text/csv' })).toBe('text');
    expect(sharedFileKind({ name: 'strong.csv', type: 'text/comma-separated-values' })).toBe('text');
  });
});
