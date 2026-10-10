/**
 * Audit Phase 4 (EX-08): the New exercise form guesses the main muscle, the gear and how it
 * is logged from the typed name, so most members only check and save. PURE.
 *
 *  1. The library first: the closest library exercise by the same forgiving search (EX-01),
 *     else a word of the name that is a library exercise — "Wall Plank Hold" → Plank's abs and
 *     bodyweight, logged by time.
 *  2. Else the importer's word rules ("… (Cable)", "db", "curl" → biceps).
 * Nothing is guessed for fewer than 3 letters. The member can change every guess.
 */
import type { Exercise } from '@/types/models';

import { CATALOG } from '../catalog/exerciseCatalog';
import { finerFromCoarse, type Muscle } from '../catalog/muscles';
import type { LogType } from '../engine/logTypes';
import { filterExercises, matchRank } from './exerciseSearch';
import { classifyEquipment, classifyMuscle } from './hevyImport';

export interface ExerciseGuess {
  muscle: Muscle | null;
  equipment: Exercise['equipment'] | null;
  logType: LogType | null;
  /** The library exercise the guess came from, when one did. */
  from: string | null;
}

const LIBRARY = CATALOG.map((e) => ({
  key: e.key,
  name: e.name,
  aliases: [...e.aliases],
  equipment: e.equipment,
  muscles: { primary: [...e.primary], secondary: [...e.secondary] },
  catalogKey: e.key,
  type: e.type,
}));

export function guessFromName(name: string): ExerciseGuess {
  const typed = name.trim();
  if (typed.replace(/\s/g, '').length < 3) return { muscle: null, equipment: null, logType: null, from: null };
  const top = filterExercises(LIBRARY, { query: typed, muscle: null, equipment: null })[0];
  // A typo-only match (band 7) is too loose to set a muscle from.
  const rank = top ? matchRank(top, typed) : null;
  const words = classifyEquipment(typed);
  if (top && rank != null && rank <= 6) {
    return {
      muscle: top.muscles.primary[0] ?? null,
      // Gear the member named wins over the library's ("Cable Hammer Curl" is a cable move).
      equipment: words !== 'other' ? words : top.equipment,
      logType: top.type,
      from: top.name,
    };
  }
  // One word of the name that IS a library exercise ("Wall Plank Hold" → Plank).
  for (const w of typed.split(/[\s()/-]+/).filter((x) => x.length >= 4)) {
    const one = filterExercises(LIBRARY, { query: w, muscle: null, equipment: null })[0];
    if (one && one.name.toLowerCase() === w.toLowerCase()) {
      return { muscle: one.muscles.primary[0] ?? null, equipment: words !== 'other' ? words : one.equipment, logType: one.type, from: one.name };
    }
  }
  const coarse = classifyMuscle(typed);
  // The importer falls back to chest for names it cannot read; that is no guess.
  const known = coarse !== 'chest' || /bench|chest|fly|flye|pec|push ?up|dip/i.test(typed);
  return {
    muscle: known ? finerFromCoarse(typed, coarse) : null,
    equipment: words !== 'other' ? words : null,
    logType: null,
    from: null,
  };
}

/** What still stops Save, in plain words ("Pick a main muscle"), or null when it can save. PURE. */
export function missingForSave(f: { name: string; muscle: Muscle | null; equipment: Exercise['equipment'] | null }): string | null {
  if (f.name.trim().length === 0) return 'Type a name';
  if (f.muscle == null && f.equipment == null) return 'Pick a main muscle and the equipment';
  if (f.muscle == null) return 'Pick a main muscle';
  if (f.equipment == null) return 'Pick the equipment';
  return null;
}
