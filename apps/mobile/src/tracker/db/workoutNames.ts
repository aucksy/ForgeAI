/**
 * Redesign R5: the names of some workouts, for the exercise page's History tab (each card is
 * headed by its workout: "Pull 1"). The name it was saved with, else its day type — the one
 * rule (`sessionTitle`). Read in pieces of 500 (SQLite's limit on ? marks).
 */
import { getDb } from '@/db';

import { sessionTitle } from '../services/finishSummary';

export async function getWorkoutNames(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const rows = await getDb().getAllAsync<{ id: string; day_type: string; title: string | null }>(
      `SELECT id, day_type, title FROM workout_sessions WHERE id IN (${chunk.map(() => '?').join(', ')})`,
      chunk,
    );
    for (const r of rows) out.set(r.id, sessionTitle({ dayType: r.day_type, title: r.title }));
  }
  return out;
}
