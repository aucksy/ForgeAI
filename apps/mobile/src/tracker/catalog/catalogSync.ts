/**
 * Bring a member's exercise library up to the bundled catalogue (Phase 2).
 *
 * Runs once per catalogue version on launch, and after anything that rewrites the library
 * wholesale (demo data, a Drive restore). Never deletes or renames a row; never changes a
 * row the member already logged in a way that would re-read their history differently:
 *
 *  1. LINK — an unlinked row whose exact name is a catalogue entry's name or one of its
 *     link names (ForgeAI's older names, Hevy's titles) becomes that entry. Its picture,
 *     steps and finer muscles appear; its name stays the member's.
 *  2. Its LOG TYPE is the entry's only when its history can be read that way: a row with
 *     weight × reps history never turns into a timed exercise; a "bodyweight reps" entry
 *     whose history carries added weight becomes "weighted" so that weight stays visible.
 *  3. Its COUNTING (dumbbells "kg each") follows the entry only when nobody has logged it
 *     yet — or on demo data, which is known to use one dumbbell's weight. A member's own
 *     history keeps "weight as typed": the owner's Hevy export shows Hammer Curl at 25 kg
 *     next to Cross Body Hammer Curl at 12.5 kg, i.e. both dumbbells typed as one number.
 *  4. INSERT every entry nothing links to.
 *  5. (Audit Phase 4, EX-15) Library facts reach existing phones: a library row's search
 *     words, muscles and gear are read from the bundle at run time (`resolveExercise`,
 *     `exerciseSearch`), so a library fix shows on the next launch without rewriting rows; the
 *     one stored fact that needs a write is the NAME — the library's own older spelling
 *     ("Pull-up", "Close Grip Bench Press") takes the new one. A row the member made or edited
 *     in the exercise form (it stores its own muscles) is theirs: never linked by name, never
 *     restyled.
 *
 * `planCatalogSync` is PURE (tests drive it); `syncExerciseCatalog` runs it in one
 * transaction.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { uuid } from '@/lib/uuid';

import { isLogType, type LogType } from '../engine/logTypes';
import { CATALOG, CATALOG_VERSION, catalogEntry, catalogEntryByName, normName } from './exerciseCatalog';
import { COARSE_OF, coarseSecondaryOf } from './muscles';
import type { CatalogEntry } from './types';

const META_KEY = 'exercise_catalog_version';

export interface SyncRow {
  id: string;
  name: string;
  catalogKey: string | null;
  logType: string | null;
  loadMode: string | null;
  /** Logged working or warm-up sets of this exercise, and the sign of their weights. */
  sets: { count: number; anyPositive: boolean; anyNegative: boolean };
  /** EX-15: made or edited by the member in the exercise form (it stores its own muscles). */
  own?: boolean;
}

export interface SyncPlan {
  links: { id: string; key: string; logType: LogType | null; freezeLoadMode: boolean }[];
  inserts: CatalogEntry[];
  /** EX-15: library rows (not the member's own); `name` set when the library's older spelling is restyled. */
  refresh: { id: string; key: string; name: string | null }[];
}

/**
 * EX-20: library names restyled in catalogue version 2 beyond their letter case. A row still
 * carrying one of them takes the new spelling; a name Hevy or the member gave never changes.
 */
const FORMER_LIBRARY_NAMES = new Set([
  'Close Grip Bench Press',
  'Wide Grip Bench Press',
  'Neutral Grip Dumbbell Press',
  'Incline Neutral Grip Dumbbell Press',
  'Close Grip Push-Up',
]);

/** A name with case, spaces and punctuation ignored ("Pull-up" = "Pull Up" = "pull-UP"). PURE. */
export function nameShape(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The log type a linked row should take, or null to keep reading it as weight × reps. */
export function linkLogType(entry: CatalogEntry, sets: SyncRow['sets']): LogType | null {
  if (sets.count === 0) return entry.type;
  switch (entry.type) {
    case 'weight_reps':
      return 'weight_reps';
    case 'reps':
      if (sets.anyPositive) return 'weighted';
      if (sets.anyNegative) return 'assisted';
      return 'reps';
    case 'weighted':
      return sets.anyNegative && !sets.anyPositive ? 'assisted' : 'weighted';
    case 'assisted':
      return sets.anyPositive ? null : 'assisted';
    default:
      // Time and distance entries: history logged as weight × reps can't be re-read.
      return null;
  }
}

export function planCatalogSync(rows: readonly SyncRow[], opts: { demo: boolean }, catalog: readonly CatalogEntry[] = CATALOG): SyncPlan {
  const linked = new Set<string>();
  for (const r of rows) if (r.catalogKey && catalogEntry(r.catalogKey)) linked.add(r.catalogKey);

  const links: SyncPlan['links'] = [];
  // Rows with history first, so the row the member actually used wins a shared name.
  const unlinked = rows
    .filter((r) => !r.catalogKey || !catalogEntry(r.catalogKey))
    .sort((a, b) => b.sets.count - a.sets.count);
  for (const r of unlinked) {
    // EX-15: the member's own exercise stays theirs, even when it shares a library name.
    if (r.own) continue;
    const entry = catalogEntryByName(r.name);
    if (!entry || linked.has(entry.key)) continue;
    linked.add(entry.key);
    const logType = isLogType(r.logType) ? null : linkLogType(entry, r.sets);
    const freezeLoadMode =
      r.loadMode == null && r.sets.count > 0 && !opts.demo && (entry.loadMode ?? 'one') !== 'one';
    links.push({ id: r.id, key: entry.key, logType, freezeLoadMode });
  }

  // Every other entry is inserted — unless a row already holds its exact name (a custom
  // exercise that happens to share it is the member's; leave it alone).
  const names = new Set(rows.map((r) => normName(r.name)));
  const inserts = catalog.filter((e) => !linked.has(e.key) && !names.has(normName(e.name)));

  // EX-15: every library row that is not the member's own takes the bundle's facts.
  const keyOf = new Map<string, string>();
  for (const r of rows) if (r.catalogKey && catalogEntry(r.catalogKey) && !r.own) keyOf.set(r.id, r.catalogKey);
  for (const l of links) keyOf.set(l.id, l.key);
  // How many rows share each name shape: a restyle never makes "Pull-up" and "Pull-Up" twins.
  const shapes = new Map<string, number>();
  for (const r of rows) shapes.set(nameShape(r.name), (shapes.get(nameShape(r.name)) ?? 0) + 1);
  const refresh: SyncPlan['refresh'] = [];
  for (const r of rows) {
    const key = keyOf.get(r.id);
    const entry = key ? catalogEntry(key) : null;
    if (!entry) continue;
    // Only the library's own older spelling ("Pull-up", "Close Grip Bench Press"); a name the
    // member or Hevy gave ("Pull Up") stays as it is.
    const olderSpelling = normName(r.name) === normName(entry.name) || FORMER_LIBRARY_NAMES.has(r.name);
    const restyle =
      r.name !== entry.name && olderSpelling && nameShape(r.name) === nameShape(entry.name) && shapes.get(nameShape(r.name)) === 1;
    refresh.push({ id: r.id, key: entry.key, name: restyle ? entry.name : null });
  }
  return { links, inserts, refresh };
}

type Tx = Pick<SQLiteDatabase, 'runAsync' | 'getAllAsync'>;

export const CATALOG_COLUMNS = [
  'id',
  'name',
  'aliases',
  'muscle_group',
  'secondary_muscles',
  'equipment',
  'is_compound',
  'increment_kg',
  'catalog_key',
  'log_type',
] as const;

/** One INSERT row for an entry (fresh id). */
export function catalogRow(e: CatalogEntry): (string | number)[] {
  const muscles = { primary: [...e.primary], secondary: [...e.secondary] };
  return [
    uuid(),
    e.name,
    JSON.stringify(e.aliases),
    COARSE_OF[e.primary[0]],
    JSON.stringify(coarseSecondaryOf(muscles)),
    e.equipment,
    e.compound ? 1 : 0,
    e.incrementKg,
    e.key,
    e.type,
  ];
}

/** Insert entries inside the caller's transaction, chunked under SQLite's bind cap. */
export async function insertCatalogEntries(tx: Pick<SQLiteDatabase, 'runAsync'>, entries: readonly CatalogEntry[]): Promise<number> {
  const cols = CATALOG_COLUMNS;
  const perChunk = Math.max(1, Math.floor(800 / cols.length));
  const tuple = `(${cols.map(() => '?').join(', ')})`;
  for (let i = 0; i < entries.length; i += perChunk) {
    const chunk = entries.slice(i, i + perChunk);
    await tx.runAsync(
      `INSERT OR IGNORE INTO exercises (${cols.join(', ')}) VALUES ${chunk.map(() => tuple).join(', ')}`,
      chunk.flatMap(catalogRow),
    );
  }
  return entries.length;
}

async function readRows(tx: Tx): Promise<SyncRow[]> {
  const rows = await tx.getAllAsync<{
    id: string;
    name: string;
    catalog_key: string | null;
    log_type: string | null;
    load_mode: string | null;
    own: number;
    n: number;
    pos: number;
    neg: number;
  }>(
    `SELECT e.id, e.name, e.catalog_key, e.log_type, e.load_mode,
            CASE WHEN e.muscles IS NULL THEN 0 ELSE 1 END AS own,
            COUNT(s.id) AS n,
            COALESCE(MAX(CASE WHEN s.weight_kg > 0 THEN 1 ELSE 0 END), 0) AS pos,
            COALESCE(MAX(CASE WHEN s.weight_kg < 0 THEN 1 ELSE 0 END), 0) AS neg
       FROM exercises e
       LEFT JOIN set_entries s ON s.exercise_id = e.id
      GROUP BY e.id`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    catalogKey: r.catalog_key,
    logType: r.log_type,
    loadMode: r.load_mode,
    sets: { count: r.n, anyPositive: r.pos === 1, anyNegative: r.neg === 1 },
    own: r.own === 1,
  }));
}

/** Apply a plan inside the caller's transaction. */
export async function applyCatalogSync(tx: Tx, opts: { demo: boolean }): Promise<SyncPlan> {
  const plan = planCatalogSync(await readRows(tx), opts);
  for (const l of plan.links) {
    await tx.runAsync(
      `UPDATE exercises
          SET catalog_key = ?,
              log_type = COALESCE(log_type, ?),
              load_mode = CASE WHEN ? = 1 AND load_mode IS NULL THEN 'one' ELSE load_mode END
        WHERE id = ?`,
      [l.key, l.logType, l.freezeLoadMode ? 1 : 0, l.id],
    );
  }
  for (const f of plan.refresh) {
    if (f.name == null) continue;
    await tx.runAsync('UPDATE exercises SET name = ? WHERE id = ? AND muscles IS NULL', [f.name, f.id]);
  }
  await insertCatalogEntries(tx, plan.inserts);
  return plan;
}

/**
 * Sync now (one transaction) and stamp the catalogue version. `force` skips the version
 * check — after demo data or a restore replaced the library.
 */
export async function syncExerciseCatalog(opts: { force?: boolean; demo?: boolean } = {}): Promise<boolean> {
  const db = getDb();
  if (!opts.force) {
    const stored = Number((await getMeta(META_KEY)) ?? '0');
    if (stored >= CATALOG_VERSION) return false;
  }
  const demo = opts.demo ?? (await getMeta('demo_data')) === '1';
  // The one app-wide write queue (DS-04). Callers must not hold a queued job while calling this.
  await enqueueWrite(() =>
    db.withTransactionAsync(async () => {
      await applyCatalogSync(db, { demo });
    }),
  );
  await setMeta(META_KEY, String(CATALOG_VERSION));
  return true;
}

/** Stamp the version after a fresh install inserted the whole catalogue itself. */
export async function markCatalogSynced(): Promise<void> {
  await setMeta(META_KEY, String(CATALOG_VERSION));
}

/**
 * About to replace the library wholesale (demo data, a restore): forget the stamp BEFORE
 * the replace commits, so an app killed between the replace and the sync still re-syncs
 * on the next launch instead of keeping an unlinked library for good.
 */
export async function forgetCatalogSync(): Promise<void> {
  await setMeta(META_KEY, '0');
}

/**
 * The library was replaced wholesale (demo data, a restore): forget the stamp first, so a
 * sync that fails now is retried on the next launch instead of being skipped for good.
 */
export async function resyncExerciseCatalog(demo: boolean): Promise<void> {
  await forgetCatalogSync();
  await syncExerciseCatalog({ force: true, demo });
}
