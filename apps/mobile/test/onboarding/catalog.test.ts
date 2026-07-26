/**
 * Phase O2 (W1) — the exercise catalog a REAL member now starts with.
 *
 * Before O2 this catalog only ever appeared alongside the demo seed, so a broken
 * entry would have shown up in fake data. It is now the day-one library of every
 * genuine user, and `exercises.name` is UNIQUE in the frozen schema, so a duplicate
 * would make onboarding itself fail.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it, vi } from 'vitest';

import { EXERCISES } from '@/db/seed/exercises';
import type { MuscleGroup } from '@/types/models';

vi.mock('@/lib/uuid', () => {
  let n = 0;
  return { uuid: () => `id-${++n}` };
});

const { EXERCISE_COLUMNS, catalogRows, insertExerciseCatalog } = await import(
  '@/onboarding/db/catalog'
);

const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'forearms',
];

describe('catalog data', () => {
  it('is not empty', () => {
    expect(EXERCISES.length).toBeGreaterThan(20);
  });

  it('has unique names, case-insensitively (UNIQUE(exercises.name) would reject a clash)', () => {
    const seen = new Map<string, string>();
    for (const ex of EXERCISES) {
      const key = ex.name.trim().toLowerCase();
      expect(seen.has(key), `duplicate exercise name: ${ex.name} / ${seen.get(key)}`).toBe(false);
      seen.set(key, ex.name);
    }
  });

  it('uses only real muscle groups, primary and secondary', () => {
    for (const ex of EXERCISES) {
      expect(MUSCLE_GROUPS).toContain(ex.muscleGroup);
      for (const m of ex.secondaryMuscles) expect(MUSCLE_GROUPS).toContain(m);
    }
  });

  it('never lists a primary muscle again as a secondary (double-counts muscle volume)', () => {
    for (const ex of EXERCISES) {
      expect(ex.secondaryMuscles, ex.name).not.toContain(ex.muscleGroup);
    }
  });

  it('gives every movement a positive load increment — progressive overload divides by it', () => {
    for (const ex of EXERCISES) {
      expect(ex.incrementKg, ex.name).toBeGreaterThan(0);
      expect(ex.incrementKg, ex.name).toBeLessThanOrEqual(10);
    }
  });

  it('keeps aliases lower-case so name matching finds them', () => {
    for (const ex of EXERCISES) {
      for (const alias of ex.aliases) {
        expect(alias, `${ex.name}: "${alias}"`).toBe(alias.toLowerCase());
        expect(alias.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('catalogRows', () => {
  it('emits one row per exercise, in the declared column order', () => {
    const rows = catalogRows();
    expect(rows).toHaveLength(EXERCISES.length);
    for (const row of rows) expect(row).toHaveLength(EXERCISE_COLUMNS.length);

    const first = rows[0];
    const source = EXERCISES[0];
    expect(first[1]).toBe(source.name);
    expect(first[2]).toBe(JSON.stringify(source.aliases));
    expect(first[3]).toBe(source.muscleGroup);
    expect(first[6]).toBe(source.isCompound ? 1 : 0); // SQLite booleans are 0/1
    expect(first[7]).toBe(source.incrementKg);
  });

  it('gives every row a distinct id', () => {
    const ids = catalogRows().map((r) => r[0]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('insertExerciseCatalog', () => {
  it('inserts every exercise, chunked under the SQLite bind-variable limit', async () => {
    const statements: { sql: string; params: unknown[] }[] = [];
    // Type-only import of the real expo-sqlite signature; the runtime module is
    // the O1 throwing stub, which this fake never touches.
    const runAsync = (async (sql: string, params: unknown[]) => {
      statements.push({ sql, params });
      return { lastInsertRowId: 0, changes: 0 };
    }) as unknown as SQLiteDatabase['runAsync'];

    const inserted = await insertExerciseCatalog({ runAsync });

    expect(inserted).toBe(EXERCISES.length);
    const tuples = statements.reduce((n, s) => n + (s.sql.match(/\(\?/g)?.length ?? 0), 0);
    expect(tuples).toBe(EXERCISES.length);
    for (const s of statements) {
      expect(s.params.length).toBeLessThanOrEqual(900); // SQLite default limit is 999
      expect(s.params.length % EXERCISE_COLUMNS.length).toBe(0);
    }
  });
});
