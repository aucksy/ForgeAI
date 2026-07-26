/**
 * The exercise catalog a REAL member starts with — Phase O2 (W1).
 *
 * The ~40-movement catalog in `src/db/seed/exercises.ts` is REFERENCE data (names,
 * aliases, muscle groups, load increments), not fake history, so a genuinely empty
 * start still ships it: without a library there is nothing to log on day one.
 * Everything else the demo seed invents — Arjun's profile, 13 weeks of sessions,
 * PRs, meals, chat — is NOT written here. That distinction is the whole of W1.
 *
 * Import-only against the seed module: nothing in `src/db/seed/*` is edited.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { EXERCISES } from '@/db/seed/exercises';
import { uuid } from '@/lib/uuid';

type SqlValue = string | number | null;
type TxLike = Pick<SQLiteDatabase, 'runAsync'>;

export const EXERCISE_COLUMNS = [
  'id',
  'name',
  'aliases',
  'muscle_group',
  'secondary_muscles',
  'equipment',
  'is_compound',
  'increment_kg',
] as const;

/** Flatten the catalog to INSERT rows (fresh ids each call). */
export function catalogRows(): SqlValue[][] {
  return EXERCISES.map((ex) => [
    uuid(),
    ex.name,
    JSON.stringify(ex.aliases),
    ex.muscleGroup,
    JSON.stringify(ex.secondaryMuscles),
    ex.equipment,
    ex.isCompound ? 1 : 0,
    ex.incrementKg,
  ]);
}

/**
 * Insert the catalog inside the caller's transaction. Chunked to stay under
 * SQLite's bind-variable limit, mirroring the seed's batchInsert.
 */
export async function insertExerciseCatalog(tx: TxLike): Promise<number> {
  const rows = catalogRows();
  const cols = EXERCISE_COLUMNS;
  const perChunk = Math.max(1, Math.floor(800 / cols.length));
  const tuple = `(${cols.map(() => '?').join(', ')})`;
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk);
    await tx.runAsync(
      `INSERT INTO exercises (${cols.join(', ')}) VALUES ${chunk.map(() => tuple).join(', ')}`,
      chunk.flat(),
    );
  }
  return rows.length;
}
