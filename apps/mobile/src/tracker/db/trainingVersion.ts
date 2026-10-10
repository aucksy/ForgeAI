/**
 * Audit Phase 8: the training data's version — `training_changes.#version` (tracker schema v13,
 * kept by triggers; see trackerSchema.ts). It moves with every change that can alter a record
 * or a Target (a set, a workout's day or time, an exercise, a body weight) and never with a
 * draft save, a note or a settings row. Results worked out from the training data can be kept
 * in memory while it stays the same.
 */
import { getDb } from '@/db';

/** null when it cannot be read (a database before v13, a test double): keep nothing then. */
export async function trainingVersion(): Promise<number | null> {
  try {
    const row = await getDb().getFirstAsync<{ seq: number }>("SELECT seq FROM training_changes WHERE id = '#version'");
    const n = row != null ? Number(row.seq) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Exercise ids changed after `version` ('#all' when every exercise is affected). */
export async function trainingChangesSince(version: number): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ id: string }>(
    "SELECT id FROM training_changes WHERE seq > ? AND id <> '#version'",
    [version],
  );
  return rows.map((r) => r.id);
}
