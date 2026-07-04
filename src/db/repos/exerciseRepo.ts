import { getDb } from '@/db';
import { uuid } from '@/lib/uuid';
import type { Exercise, MuscleGroup } from '@/types/models';

// ---------------------------------------------------------------- rows

interface ExerciseRow {
  id: string;
  name: string;
  aliases: string;
  muscle_group: string;
  secondary_muscles: string;
  equipment: string;
  is_compound: number;
  increment_kg: number;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function mapExercise(r: ExerciseRow): Exercise {
  return {
    id: r.id,
    name: r.name,
    aliases: parseJsonArray(r.aliases),
    muscleGroup: r.muscle_group as MuscleGroup,
    secondaryMuscles: parseJsonArray(r.secondary_muscles) as MuscleGroup[],
    equipment: r.equipment as Exercise['equipment'],
    isCompound: r.is_compound === 1,
    incrementKg: r.increment_kg,
  };
}

/** lowercase, trim, collapse internal whitespace. */
function normalise(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------- api

export async function getAllExercises(): Promise<Exercise[]> {
  const rows = await getDb().getAllAsync<ExerciseRow>(
    'SELECT * FROM exercises ORDER BY name COLLATE NOCASE ASC',
  );
  return rows.map(mapExercise);
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  const row = await getDb().getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = ?', [
    id,
  ]);
  return row ? mapExercise(row) : null;
}

/**
 * NL-friendly lookup. Match order: exact name (ci) -> alias exact ->
 * name/alias contains query -> query contains name.
 */
export async function findExerciseByName(query: string): Promise<Exercise | null> {
  const q = normalise(query);
  if (!q) return null;
  const all = await getAllExercises();
  const indexed = all.map((ex) => ({
    ex,
    name: normalise(ex.name),
    aliases: ex.aliases.map(normalise),
  }));

  const exactName = indexed.find((e) => e.name === q);
  if (exactName) return exactName.ex;

  const exactAlias = indexed.find((e) => e.aliases.includes(q));
  if (exactAlias) return exactAlias.ex;

  const contains = indexed.find(
    (e) => e.name.includes(q) || e.aliases.some((a) => a.includes(q)),
  );
  if (contains) return contains.ex;

  const contained = indexed.find((e) => q.includes(e.name));
  return contained ? contained.ex : null;
}

export async function createExercise(input: Omit<Exercise, 'id'>): Promise<Exercise> {
  const id = uuid();
  await getDb().runAsync(
    `INSERT INTO exercises(id, name, aliases, muscle_group, secondary_muscles, equipment, is_compound, increment_kg)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      JSON.stringify(input.aliases),
      input.muscleGroup,
      JSON.stringify(input.secondaryMuscles),
      input.equipment,
      input.isCompound ? 1 : 0,
      input.incrementKg,
    ],
  );
  return { id, ...input };
}
