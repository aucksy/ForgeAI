/**
 * Audit IM-15 — names in a Hevy / Strong file (or link) that ForgeAI does not know. Instead of
 * silently making each one a new exercise (whose muscle was guessed, "chest" when nothing
 * matched), the member is shown "N names are new to ForgeAI" with, for each, ForgeAI's closest
 * exercise ("Same as ForgeAI's Seated Cable Row?" — Yes / Keep as new). A "Yes" logs the file's
 * sets on ForgeAI's exercise, so one history and one set of records.
 *
 * The closest exercise comes from the library search (`exerciseSearch.filterExercises`, the same
 * matcher the exercise lists use): the whole name first, then without its "(Cable)" part, then
 * without what follows " - " ("Seated Cable Row - V Grip (Cable)" → "Seated Cable Row").
 */
import { getDb } from '@/db';
import type { Exercise } from '@/types/models';

import { isLogType, type LogType } from '../engine/logTypes';

import { filterExercises, normalize, type SearchableExercise } from './exerciseSearch';

export interface NameSuggestion {
  /** The name as the file has it. */
  title: string;
  /** ForgeAI's closest exercise, or null (nothing close: it is added as the member's own). */
  match: { id: string; name: string } | null;
}

type Candidate = SearchableExercise & { id: string; logType?: LogType | null };

/**
 * Review fix: how a set is logged, in three kinds that never match each other — weight × reps
 * (and reps only, added weight, assisted), time, and distance (with or without time). A file's
 * timed "Plank" is never offered as "Same as" a weight × reps exercise. PURE.
 */
export function logKind(t: LogType | null | undefined): 'reps' | 'time' | 'distance' {
  if (t === 'time') return 'time';
  if (t === 'distance' || t === 'time_distance') return 'distance';
  return 'reps';
}

/** The searches tried for a file name, most exact first. PURE. */
export function searchVariants(title: string): string[] {
  const t = title.replace(/\s+/g, ' ').trim();
  const noParens = t.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const beforeDash = noParens.split(/\s[-–—]\s/)[0].trim();
  return [...new Set([t, noParens, beforeDash].filter((q) => q.length >= 3))];
}

/**
 * ForgeAI's closest exercise to a file name, from `library`; null when nothing is close. With the
 * file's own log type (`logType`), only an exercise logged the same kind of way is offered (a
 * candidate with no type counts as weight × reps). PURE.
 */
export function suggestFor(title: string, library: readonly Candidate[], logType?: LogType | null): { id: string; name: string } | null {
  const want = logType ? logKind(logType) : null;
  for (const q of searchVariants(title)) {
    const hits = filterExercises(library, { query: q, muscle: null, equipment: null });
    const top = want ? hits.find((h) => logKind(h.logType) === want) : hits[0];
    if (top && normalize(top.name) !== normalize(title)) return { id: top.id, name: top.name };
  }
  return null;
}

function jsonList(raw: string | null): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** The member's exercises as the search reads them (hidden library ones left out). */
async function candidates(): Promise<Candidate[]> {
  const rows = await getDb().getAllAsync<{ id: string; name: string; aliases: string | null; equipment: string; catalog_key: string | null; log_type: string | null }>(
    'SELECT id, name, aliases, equipment, catalog_key, log_type FROM exercises',
  );
  let hidden = new Set<string>();
  try {
    const { getHiddenExerciseIds } = await import('../db/exerciseManage');
    hidden = await getHiddenExerciseIds();
  } catch {
    // no hidden list: every exercise is a candidate
  }
  return rows
    .filter((r) => !hidden.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      aliases: jsonList(r.aliases),
      equipment: r.equipment as Exercise['equipment'],
      muscles: { primary: [], secondary: [] },
      catalogKey: r.catalog_key,
      logType: isLogType(r.log_type) ? r.log_type : 'weight_reps',
    }));
}

/**
 * For each name new to ForgeAI, its closest exercise (or none) — logged the same kind of way when
 * the name's log type is given (`{ title, logType }`). Reads only.
 */
export async function suggestMatches(items: readonly (string | { title: string; logType?: LogType | null })[]): Promise<NameSuggestion[]> {
  if (items.length === 0) return [];
  const lib = await candidates();
  return items.map((it) => {
    const { title, logType } = typeof it === 'string' ? { title: it, logType: null } : it;
    return { title, match: suggestFor(title, lib, logType) };
  });
}

/** The member's answers as the importer takes them: file name → exercise id (only the "Yes" ones). PURE. */
export function matchesFrom(suggestions: readonly NameSuggestion[], yes: ReadonlySet<string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of suggestions) if (s.match && yes.has(s.title)) out.set(s.title, s.match.id);
  return out;
}
