/**
 * Redesign R5 — the order of Profile → Exercises, as Hevy's (PLAN §4.2). PURE.
 *
 * With nothing typed:
 *   Recent          the exercises the member has done, the most recent first ("Last: 12 Oct")
 *   Made by you     their own exercises not done yet
 *   All exercises   the rest of the library, A→Z
 * The muscle and equipment filters only narrow these bands. Once something is typed, the
 * search's own best-match order wins (the bands would bury the best match); done exercises still
 * say when they were last done.
 */
import { tinyDateWithYear } from '@/lib/date';

export interface LastDone {
  dateISO: string;
  /** When that workout started: orders two workouts on one day. */
  startedAt: number;
}

export type ExerciseBand = 'recent' | 'yours' | 'library';

export const BAND_TITLE: Record<ExerciseBand, string> = {
  recent: 'Recent',
  yours: 'Made by you',
  library: 'All exercises',
};

export type ExercisesRow<T> = { kind: 'band'; key: string; band: ExerciseBand } | { kind: 'exercise'; key: string; ex: T };

/** "Last: 12 Oct" ("Last: 12 Oct 2025" in another year). PURE. */
export function lastDoneText(last: LastDone | undefined, today?: string): string | null {
  return last ? `Last: ${tinyDateWithYear(last.dateISO, today)}` : null;
}

/** The band an exercise sits in. PURE. */
export function bandOf(ex: { id: string; catalogKey: string | null }, lastDone: ReadonlyMap<string, LastDone>): ExerciseBand {
  if (lastDone.has(ex.id)) return 'recent';
  return ex.catalogKey ? 'library' : 'yours';
}

/**
 * The rows of the list. `list` arrives in the search's order (A→Z when nothing is typed). With
 * nothing typed: the three bands, each under its heading (an empty band has none); typed: the
 * search's order, no headings. PURE.
 */
export function exercisesRows<T extends { id: string; catalogKey: string | null }>(
  list: readonly T[],
  lastDone: ReadonlyMap<string, LastDone>,
  searching: boolean,
): ExercisesRow<T>[] {
  if (searching) return list.map((ex) => ({ kind: 'exercise', key: ex.id, ex }));
  const bands: Record<ExerciseBand, T[]> = { recent: [], yours: [], library: [] };
  for (const ex of list) bands[bandOf(ex, lastDone)].push(ex);
  // Newest workout first; the same workout keeps the A→Z it arrived in (a stable sort).
  bands.recent.sort((a, b) => {
    const x = lastDone.get(a.id)!;
    const y = lastDone.get(b.id)!;
    return x.dateISO === y.dateISO ? y.startedAt - x.startedAt : x.dateISO < y.dateISO ? 1 : -1;
  });
  const out: ExercisesRow<T>[] = [];
  for (const band of ['recent', 'yours', 'library'] as const) {
    if (bands[band].length === 0) continue;
    out.push({ kind: 'band', key: `band-${band}`, band });
    for (const ex of bands[band]) out.push({ kind: 'exercise', key: ex.id, ex });
  }
  return out;
}
