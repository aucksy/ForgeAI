/**
 * Create and edit the member's own exercises (Phase 2): log type, finer muscles, body
 * weight in volume, and their own photo or video.
 *
 * Creation goes through the FROZEN `createExercise` (base columns), then one UPDATE adds
 * the Phase 2 columns — same pattern as `addSetsWithMeta`. Library (catalogue) exercises
 * keep their name, muscles and type; only the member's photo/video can be set on them.
 */
import { getDb } from '@/db';
import { createExercise } from '@/db/repos/exerciseRepo';
import type { Exercise } from '@/types/models';

import { coarseOf, coarseSecondaryOf, type MuscleMap } from '../catalog/muscles';
import type { LogType } from '../engine/logTypes';

export interface CustomExerciseInput {
  name: string;
  logType: LogType;
  muscles: MuscleMap;
  equipment: Exercise['equipment'];
  isCompound: boolean;
  incrementKg: number;
  /** Body weight counts in volume (pull-up / dip style moves). */
  countsBodyweight: boolean;
}

/** The frozen base row for a custom exercise. PURE. */
export function baseRowOf(input: CustomExerciseInput): Omit<Exercise, 'id'> {
  return {
    name: input.name.trim(),
    aliases: [],
    muscleGroup: coarseOf(input.muscles),
    secondaryMuscles: coarseSecondaryOf(input.muscles),
    equipment: input.equipment,
    isCompound: input.isCompound,
    incrementKg: input.incrementKg,
  };
}

/** Body-weight share stored for a custom exercise: 1 when it counts, else 0 (never NULL → never borrows a default). */
export function bwShareOf(input: Pick<CustomExerciseInput, 'logType' | 'countsBodyweight'>): number {
  const bodyweightType = input.logType === 'reps' || input.logType === 'weighted' || input.logType === 'assisted';
  return bodyweightType && input.countsBodyweight ? 1 : 0;
}

export async function createCustomExercise(
  input: CustomExerciseInput,
  media: { uri: string | null; type: 'image' | 'video' | null },
): Promise<string> {
  let id = '';
  await getDb().withTransactionAsync(async () => {
    const created = await createExercise(baseRowOf(input));
    id = created.id;
    await getDb().runAsync(
      `UPDATE exercises SET log_type = ?, muscles = ?, bw_share = ?, media_uri = ?, media_type = ? WHERE id = ?`,
      [input.logType, JSON.stringify(input.muscles), bwShareOf(input), media.uri, media.type, id],
    );
  });
  return id;
}

/** Edit a custom exercise. `logType` is ignored once the exercise has logged sets. */
export async function updateCustomExercise(
  id: string,
  input: CustomExerciseInput,
  media: { uri: string | null; type: 'image' | 'video' | null },
  lockLogType: boolean,
): Promise<void> {
  const base = baseRowOf(input);
  await getDb().runAsync(
    `UPDATE exercises
        SET name = ?, muscle_group = ?, secondary_muscles = ?, equipment = ?, is_compound = ?, increment_kg = ?,
            log_type = CASE WHEN ? = 1 THEN log_type ELSE ? END,
            muscles = ?, bw_share = ?, media_uri = ?, media_type = ?
      WHERE id = ?`,
    [
      base.name,
      base.muscleGroup,
      JSON.stringify(base.secondaryMuscles),
      base.equipment,
      base.isCompound ? 1 : 0,
      base.incrementKg,
      lockLogType ? 1 : 0,
      input.logType,
      JSON.stringify(input.muscles),
      bwShareOf(input),
      media.uri,
      media.type,
      id,
    ],
  );
}

/** Set or clear the member's own photo/video on ANY exercise (library ones too). */
export async function setExerciseMedia(id: string, media: { uri: string | null; type: 'image' | 'video' | null }): Promise<void> {
  await getDb().runAsync('UPDATE exercises SET media_uri = ?, media_type = ? WHERE id = ?', [media.uri, media.type, id]);
}
