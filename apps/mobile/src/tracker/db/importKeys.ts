/**
 * HI-03 — a moved imported workout keeps its import key.
 *
 * A Hevy / Strong re-import recognises a workout it brought in before by its exact start time
 * (`hevyImport.isAlreadyHere`, `runImport`'s seen starts). Editing a workout's date or start
 * time moves `started_at`, so the next re-import used to see a "new" workout and bring it back
 * as a duplicate. Now the FIRST start a workout ever had is remembered when an edit moves it,
 * and the importer treats that original start as the workout's own too.
 *
 * Stored as JSON in `meta` (no schema change): { [sessionId]: { startedAt, dateISO } }. Only
 * entries whose workout still exists count (a deleted workout may be imported again, as before).
 */
import { getDb, getMeta, setMeta } from '@/db';

const KEY = 'importOriginalStarts';

export interface OriginalStart {
  startedAt: number;
  dateISO: string;
}

type Stored = Record<string, OriginalStart>;

function parse(raw: string | null): Stored {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object') return {};
    const out: Stored = {};
    for (const [id, o] of Object.entries(v as Record<string, unknown>)) {
      const r = o as Partial<OriginalStart>;
      if (typeof r?.startedAt === 'number' && typeof r?.dateISO === 'string') out[id] = { startedAt: r.startedAt, dateISO: r.dateISO };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Remember `original` as this workout's first start — only if none is remembered yet (moving
 * it twice keeps the very first). Call inside the edit's own transaction.
 */
export async function rememberOriginalStart(sessionId: string, original: OriginalStart): Promise<void> {
  const all = parse(await getMeta(KEY));
  if (all[sessionId]) return;
  all[sessionId] = original;
  await setMeta(KEY, JSON.stringify(all));
}

/**
 * The original starts of workouts that still exist and were moved since: the importer's
 * extra "already here" keys, each with the workout's id.
 */
export async function originalStarts(): Promise<(OriginalStart & { id: string })[]> {
  const all = parse(await getMeta(KEY).catch(() => null));
  const ids = Object.keys(all);
  if (ids.length === 0) return [];
  const alive = new Set<string>();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const rows = await getDb().getAllAsync<{ id: string }>(
      `SELECT id FROM workout_sessions WHERE id IN (${chunk.map(() => '?').join(', ')})`,
      chunk,
    );
    for (const r of rows) alive.add(r.id);
  }
  return ids.filter((id) => alive.has(id)).map((id) => ({ id, ...all[id] }));
}
