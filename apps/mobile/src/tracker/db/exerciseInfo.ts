/**
 * Exercise rows WITH their Phase 2 settings — how each one is logged, how its weight
 * counts, the body-weight share, finer muscles, the catalogue entry and custom media.
 *
 * The frozen `exerciseRepo` maps only the base columns (and must stay that way), so this
 * module reads the same rows with the additive columns and resolves each setting in one
 * place: the row's own value → its catalogue entry → a safe default. Every tracker screen
 * and service that needs to know "is this a timed exercise?" or "does it count body
 * weight?" asks here, never the raw columns.
 */
import { getDb } from '@/db';
import type { Exercise, MuscleGroup } from '@/types/models';

import { catalogEntry } from '../catalog/exerciseCatalog';
import { musclesOf, parseMuscleMap, type MuscleMap } from '../catalog/muscles';
import type { CatalogEntry } from '../catalog/types';
import { isLoadMode, isLogType, type DistUnit, type LoadMode, type LogType } from '../engine/logTypes';

export interface TrackerExercise extends Exercise {
  catalogKey: string | null;
  logType: LogType;
  loadMode: LoadMode;
  bwShare: number;
  muscles: MuscleMap;
  distUnit: DistUnit;
  /** The member's own photo or video (custom exercises). */
  mediaUri: string | null;
  mediaType: 'image' | 'video' | null;
}

export interface ExerciseInfoRow {
  id: string;
  name: string;
  aliases: string;
  muscle_group: string;
  secondary_muscles: string;
  equipment: string;
  is_compound: number;
  increment_kg: number;
  catalog_key: string | null;
  log_type: string | null;
  load_mode: string | null;
  bw_share: number | null;
  muscles: string | null;
  media_uri: string | null;
  media_type: string | null;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Resolve one row (PURE — exported for tests). */
export function resolveExercise(r: ExerciseInfoRow, entry: CatalogEntry | null = catalogEntry(r.catalog_key)): TrackerExercise {
  const base: Exercise = {
    id: r.id,
    name: r.name,
    aliases: parseJsonArray(r.aliases),
    muscleGroup: r.muscle_group as MuscleGroup,
    secondaryMuscles: parseJsonArray(r.secondary_muscles) as MuscleGroup[],
    equipment: r.equipment as Exercise['equipment'],
    isCompound: r.is_compound === 1,
    incrementKg: r.increment_kg,
  };
  const stored = parseMuscleMap(r.muscles);
  const muscles =
    stored ??
    (entry ? { primary: [...entry.primary], secondary: [...entry.secondary] } : musclesOf(base));
  return {
    ...base,
    catalogKey: entry ? entry.key : null,
    logType: isLogType(r.log_type) ? r.log_type : 'weight_reps',
    loadMode: isLoadMode(r.load_mode) ? r.load_mode : entry?.loadMode ?? 'one',
    bwShare: r.bw_share != null && Number.isFinite(r.bw_share) ? Math.max(0, r.bw_share) : entry?.bwShare ?? 0,
    muscles,
    distUnit: entry?.distUnit ?? 'km',
    mediaUri: r.media_uri && r.media_uri.length > 0 ? r.media_uri : null,
    mediaType: r.media_type === 'video' ? 'video' : r.media_type === 'image' ? 'image' : null,
  };
}

const COLS = `id, name, aliases, muscle_group, secondary_muscles, equipment, is_compound, increment_kg,
  catalog_key, log_type, load_mode, bw_share, muscles, media_uri, media_type`;

export async function getTrackerExercise(id: string): Promise<TrackerExercise | null> {
  const row = await getDb().getFirstAsync<ExerciseInfoRow>(`SELECT ${COLS} FROM exercises WHERE id = ?`, [id]);
  return row ? resolveExercise(row) : null;
}

/** Every exercise, name A→Z (the frozen repo's order). */
export async function getAllTrackerExercises(): Promise<TrackerExercise[]> {
  const rows = await getDb().getAllAsync<ExerciseInfoRow>(
    `SELECT ${COLS} FROM exercises ORDER BY name COLLATE NOCASE ASC`,
  );
  return rows.map((r) => resolveExercise(r));
}

/** The given exercises by id (missing ids are skipped). Chunked under SQLite's bind cap. */
export async function getTrackerExercisesByIds(ids: readonly string[]): Promise<Map<string, TrackerExercise>> {
  const out = new Map<string, TrackerExercise>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    const rows = await getDb().getAllAsync<ExerciseInfoRow>(
      `SELECT ${COLS} FROM exercises WHERE id IN (${chunk.map(() => '?').join(', ')})`,
      chunk,
    );
    for (const r of rows) out.set(r.id, resolveExercise(r));
  }
  return out;
}

/** Library rows of the given catalogue keys, for "easier / harder version" links. */
export async function getExerciseIdsByCatalogKey(keys: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return out;
  const rows = await getDb().getAllAsync<{ id: string; catalog_key: string }>(
    `SELECT id, catalog_key FROM exercises WHERE catalog_key IN (${unique.map(() => '?').join(', ')})`,
    unique,
  );
  for (const r of rows) if (!out.has(r.catalog_key)) out.set(r.catalog_key, r.id);
  return out;
}

/**
 * The member changes how an exercise's weight counts (exercise menu → Counting). Sets
 * already logged keep the counting they were logged with — they are stamped with the OLD
 * way first — so switching "weight as typed" to "two dumbbells" never doubles last month.
 */
export async function setExerciseLoadMode(exerciseId: string, mode: LoadMode): Promise<void> {
  const db = getDb();
  const current = await getTrackerExercise(exerciseId);
  if (current && current.loadMode !== mode) {
    await db.runAsync('UPDATE set_entries SET load_mode = ? WHERE exercise_id = ? AND load_mode IS NULL', [
      current.loadMode,
      exerciseId,
    ]);
  }
  await db.runAsync('UPDATE exercises SET load_mode = ? WHERE id = ?', [mode, exerciseId]);
}

/** Does this exercise have any logged set? (Its log type is then fixed.) */
export async function exerciseHasSets(exerciseId: string): Promise<boolean> {
  const row = await getDb().getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM (SELECT 1 FROM set_entries WHERE exercise_id = ? LIMIT 1)',
    [exerciseId],
  );
  return (row?.n ?? 0) > 0;
}
