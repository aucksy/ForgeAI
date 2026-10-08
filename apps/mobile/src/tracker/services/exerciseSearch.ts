/**
 * Search and filter for the exercise lists (library and picker). PURE.
 *
 * Phase 2 grows the library from 38 to 400+, so a plain "contains" filter in A→Z order
 * buries the obvious match ("press" → 60 rows). Results are ranked: name starts with the
 * query, then a word in the name starts with it, then the name contains it, then an alias
 * matches; A→Z inside each band. Muscle filters use the FINER muscles (front / side / rear
 * shoulders…), matching an exercise's main muscles only — "Side shoulders" lists lateral
 * raises, not every press that touches them.
 */
import type { Exercise } from '@/types/models';

import type { Muscle, MuscleMap } from '../catalog/muscles';

export interface SearchableExercise {
  name: string;
  aliases: string[];
  equipment: Exercise['equipment'];
  muscles: MuscleMap;
}

export function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Rank 0 (best) … 3, or null when the query doesn't match. */
export function matchRank(ex: Pick<SearchableExercise, 'name' | 'aliases'>, query: string): number | null {
  const q = normalize(query);
  if (!q) return 0;
  const name = normalize(ex.name);
  if (name.startsWith(q)) return 0;
  if (name.split(/[\s(/-]+/).some((w) => w.startsWith(q))) return 1;
  if (name.includes(q)) return 2;
  if (ex.aliases.some((a) => normalize(a).includes(q))) return 3;
  return null;
}

export function filterExercises<T extends SearchableExercise>(
  all: readonly T[],
  opts: { query: string; muscle: Muscle | null; equipment: Exercise['equipment'] | null },
): T[] {
  const ranked: { ex: T; rank: number }[] = [];
  for (const ex of all) {
    if (opts.muscle && !ex.muscles.primary.includes(opts.muscle)) continue;
    if (opts.equipment && ex.equipment !== opts.equipment) continue;
    const rank = matchRank(ex, opts.query);
    if (rank == null) continue;
    ranked.push({ ex, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.ex.name.localeCompare(b.ex.name, undefined, { sensitivity: 'base' }));
  return ranked.map((r) => r.ex);
}

/**
 * v0.28.0: the name to offer as "Create “…”" at the end of the search (inside a workout): what
 * the member typed (2+ letters), unless an exercise already has exactly that name. PURE.
 */
export function createOffer(query: string, all: readonly Pick<SearchableExercise, 'name'>[]): string | null {
  const typed = query.trim().replace(/\s+/g, ' ');
  if (typed.length < 2) return null;
  const q = normalize(typed);
  return all.some((e) => normalize(e.name) === q) ? null : typed;
}
