/**
 * Redesign R5: the names of some workouts, for the exercise page's History tab (each card is
 * headed by its workout: "Pull 1"). The name it was saved with, else its day type — the one
 * rule (`sessionTitle`). Read in pieces of 500 (SQLite's limit on ? marks).
 */
import { getDb } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

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

/** Longest workout name (the Finish sheet's limit). */
export const WORKOUT_NAME_MAX = 60;

/** A typed name made safe to save: trimmed, one space between words, at most 60 characters; '' = none. PURE. */
export function cleanWorkoutName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, WORKOUT_NAME_MAX).trim();
}

/**
 * Rename a saved workout (owner, 13 Oct 2026: Finish no longer asks for a routine workout's
 * name, so a name is changed here, from the workout's page). Its routine is untouched.
 * Queued (DS-04): never call it from inside an `enqueueWrite` job.
 */
export async function renameWorkout(sessionId: string, name: string): Promise<void> {
  const clean = cleanWorkoutName(name);
  if (!clean) return;
  await enqueueWrite(() => getDb().runAsync('UPDATE workout_sessions SET title = ? WHERE id = ?', [clean, sessionId]));
}
