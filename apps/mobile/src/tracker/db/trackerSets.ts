/**
 * Rich-set write/read path — the columns the FROZEN `addSets` can't touch.
 *
 * `addSets`'s signature is frozen (it writes only the 7 base columns and, crucially,
 * auto-numbers sets AND runs PR detection). To attach rpe / set_type / note we can't
 * change it — so `addSetsWithMeta` REUSES it (keeping set# + PRs) and then UPDATEs the
 * additive columns on the rows it returned. `addSets` preserves input order and
 * returns one SetEntry per input, so `created[i]` maps 1:1 to `sets[i]`.
 *
 * `is_warmup` stays authoritative (all frozen "working set" queries filter it); the
 * derived `set_type` is 'warmup' exactly when `isWarmup`, else the caller's type
 * ('normal' | 'drop' | 'failure') — drop/failure are WORKING sets and count normally.
 */
import { getDb } from '@/db';
import { addSets } from '@/db/repos/workoutRepo';
import type { SetEntry } from '@/types/models';

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface RichSet {
  exerciseId: string;
  weightKg: number;
  reps: number;
  isWarmup?: boolean;
  /** null = not recorded. Rate of Perceived Exertion, typically 6–10. */
  rpe?: number | null;
  /** Working-set variant. Ignored when isWarmup (persisted as 'warmup'). */
  setType?: 'normal' | 'drop' | 'failure';
  note?: string | null;
  /** Per-workout superset group (same int = same superset). null = ungrouped. */
  supersetGroup?: number | null;
}

export interface SetMeta {
  rpe: number | null;
  setType: SetType;
  note: string | null;
  supersetGroup: number | null;
}

/** Append sets (frozen set-numbering + PR detection), then persist their rpe/type/note. */
export async function addSetsWithMeta(sessionId: string, sets: RichSet[]): Promise<SetEntry[]> {
  const base = sets.map((s) => ({
    exerciseId: s.exerciseId,
    weightKg: s.weightKg,
    reps: s.reps,
    isWarmup: s.isWarmup,
  }));
  const created = await addSets(sessionId, base); // frozen: set# + PRs, order-preserving
  const db = getDb();
  for (let i = 0; i < created.length; i++) {
    const s = sets[i];
    const setType: SetType = s.isWarmup ? 'warmup' : s.setType ?? 'normal';
    // A plain working set has nothing to write: `addSets` INSERTs leave all four
    // additive columns NULL, and that IS the no-metadata state — `getSessionSetMeta`
    // (their only reader) maps NULL → 'normal'/null, exactly as it already does for
    // every seed row. So the UPDATE would rewrite the row to its own semantics.
    // Skipping it drops ~8.8k redundant statements from a Hevy import. `setType`
    // covers warm-ups too: isWarmup ⇒ 'warmup' ⇒ never 'normal'.
    const hasMeta =
      (s.rpe ?? null) !== null ||
      (s.note ?? null) !== null ||
      (s.supersetGroup ?? null) !== null ||
      setType !== 'normal';
    if (!hasMeta) continue;
    await db.runAsync(
      'UPDATE set_entries SET rpe = ?, set_type = ?, note = ?, superset_group = ? WHERE id = ?',
      [s.rpe ?? null, setType, s.note ?? null, s.supersetGroup ?? null, created[i].id],
    );
  }
  return created;
}

/** rpe/set_type/note keyed by set id, for a session. Older rows default to 'normal'/null. */
export async function getSessionSetMeta(sessionId: string): Promise<Record<string, SetMeta>> {
  const rows = await getDb().getAllAsync<{
    id: string;
    rpe: number | null;
    set_type: string | null;
    note: string | null;
    superset_group: number | null;
  }>('SELECT id, rpe, set_type, note, superset_group FROM set_entries WHERE session_id = ?', [
    sessionId,
  ]);
  const out: Record<string, SetMeta> = {};
  for (const r of rows) {
    out[r.id] = {
      rpe: r.rpe,
      setType: (r.set_type as SetType | null) ?? 'normal',
      note: r.note,
      supersetGroup: r.superset_group,
    };
  }
  return out;
}
