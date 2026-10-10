/**
 * HI-01 — History that holds everything: an endless list, a month calendar and search, all
 * read in pages so a 509-workout import stays as quick as a 5-workout one.
 *
 *  - The list pages by a KEYSET (date_iso, started_at, id) — newest first, 30 at a time. Each
 *    page is 4 small queries (sessions, their sets, their exercises, their distance/time),
 *    never "skip the first 480 rows".
 *  - Month headings carry their own count ("October 2026 · 12 workouts") from one GROUP BY.
 *  - The calendar reads one month's days; a tapped day reads that day's workouts.
 *  - Search matches the workout's name (its own title, an imported Hevy name kept in notes,
 *    or its day type when it has no name) or any exercise in it, across ALL history.
 *
 * Volume on every card follows the one volume rule (`withVolume`).
 */
import { getDb } from '@/db';
import { todayISO } from '@/lib/date';
import { dataStamp } from '@/tracker/db/dataStamp';
import { detailsAndModesFor, type SessionRow } from '@/tracker/db/sessionDetails';
import { dayTypeLabel } from '@/tracker/services/finishSummary';
import { withVolume } from '@/tracker/services/volumeService';
import type { DayType, SessionDetail } from '@/types/models';

export const HISTORY_PAGE = 30;
/** The most one page read returns (`getHistoryPage`'s cap). */
const PAGE_CAP = 200;

/** Where the next page starts: the last workout of the page before. */
export interface HistoryCursor {
  dateISO: string;
  startedAt: number;
  id: string;
}

/** One History card's data: the workout plus what the card says besides kilos. */
export interface HistoryItem extends SessionDetail {
  /** HI-19: done in a plan's easy week (lighter on purpose). */
  easyWeek: boolean;
  /** HI-09: metres over its working sets (a run), 0 when none. */
  distanceM: number;
  /** HI-09: seconds over its timed working sets (a plank), 0 when none. */
  timedSec: number;
}

export interface HistoryPage {
  items: HistoryItem[];
  /** null = this was the last page. */
  next: HistoryCursor | null;
}

const DAY_TYPES: DayType[] = ['push', 'pull', 'legs', 'upper', 'lower', 'full', 'rest'];

/** `%text%` for LIKE, with the member's own % and _ taken literally. PURE. */
export function likePattern(q: string): string {
  return `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** The search text, tidied: blank → null (no search). PURE. */
export function cleanQuery(q: string | null | undefined): string | null {
  const t = (q ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t.slice(0, 60) : null;
}

/**
 * SQL that keeps only workouts matching `q` (on `ws`), with its parameters. A workout's name is
 * its title, else an imported name kept in its notes, else its day type ("Push Day").
 */
function searchFilter(q: string | null): { sql: string; params: (string | number)[] } {
  if (!q) return { sql: '', params: [] };
  const like = likePattern(q);
  const lower = q.toLowerCase();
  const types = DAY_TYPES.filter((t) => dayTypeLabel(t).toLowerCase().includes(lower));
  const typeSql =
    types.length > 0
      ? ` OR ((ws.title IS NULL OR TRIM(ws.title) = '') AND ws.day_type IN (${types.map(() => '?').join(', ')}))`
      : '';
  return {
    sql: ` AND (LOWER(COALESCE(ws.title, '')) LIKE ? ESCAPE '\\'
           OR LOWER(COALESCE(ws.notes, '')) LIKE ? ESCAPE '\\'${typeSql}
           OR ws.id IN (SELECT se.session_id FROM set_entries se JOIN exercises e ON e.id = se.exercise_id
                         WHERE LOWER(e.name) LIKE ? ESCAPE '\\'))`,
    params: [like, like, ...types, like],
  };
}

/** Distance, time and the easy-week mark for a page's workouts (one query). */
async function extrasFor(ids: string[]): Promise<Map<string, { easy: boolean; dist: number; sec: number }>> {
  const out = new Map<string, { easy: boolean; dist: number; sec: number }>();
  if (ids.length === 0) return out;
  const rows = await getDb().getAllAsync<{ id: string; easy_week: number | null; dist: number | null; sec: number | null }>(
    `SELECT ws.id, ws.easy_week,
            SUM(CASE WHEN se.is_warmup = 0 THEN COALESCE(se.distance_m, 0) ELSE 0 END) AS dist,
            SUM(CASE WHEN se.is_warmup = 0 THEN COALESCE(se.duration_sec, 0) ELSE 0 END) AS sec
       FROM workout_sessions ws
       LEFT JOIN set_entries se ON se.session_id = ws.id
      WHERE ws.id IN (${ids.map(() => '?').join(', ')})
      GROUP BY ws.id`,
    ids,
  );
  for (const r of rows) out.set(r.id, { easy: r.easy_week === 1, dist: Number(r.dist ?? 0), sec: Number(r.sec ?? 0) });
  return out;
}

/** Session rows → History cards (details, the one volume rule, the extras), in the same order. */
async function itemsFor(rows: SessionRow[]): Promise<HistoryItem[]> {
  if (rows.length === 0) return [];
  const [details, extras] = await Promise.all([
    // Audit Phase 8: each set's own counting comes with the set rows (no second walk).
    detailsAndModesFor(rows).then(({ details: d, setModes }) => withVolume(d, setModes).catch(() => d)),
    extrasFor(rows.map((r) => r.id)),
  ]);
  return details.map((d) => {
    const x = extras.get(d.id);
    return { ...d, easyWeek: x?.easy ?? false, distanceM: x?.dist ?? 0, timedSec: x?.sec ?? 0 };
  });
}

/**
 * One page of History, newest first: the workouts after `after` (or the newest), optionally
 * only those matching `query`.
 */
export async function getHistoryPage(
  opts: { after?: HistoryCursor | null; limit?: number; query?: string | null } = {},
): Promise<HistoryPage> {
  const limit = Math.max(1, Math.min(PAGE_CAP, opts.limit ?? HISTORY_PAGE));
  const q = cleanQuery(opts.query);
  const search = searchFilter(q);
  const a = opts.after ?? null;
  const keyset = a
    ? ` AND (ws.date_iso < ? OR (ws.date_iso = ? AND (ws.started_at < ? OR (ws.started_at = ? AND ws.id < ?))))`
    : '';
  const keyParams = a ? [a.dateISO, a.dateISO, a.startedAt, a.startedAt, a.id] : [];
  // One row more than asked tells whether another page exists.
  const rows = await getDb().getAllAsync<SessionRow>(
    `SELECT ws.* FROM workout_sessions ws
      WHERE 1 = 1${keyset}${search.sql}
      ORDER BY ws.date_iso DESC, ws.started_at DESC, ws.id DESC
      LIMIT ?`,
    [...keyParams, ...search.params, limit + 1],
  );
  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  const items = await itemsFor(page);
  const last = page[page.length - 1];
  return {
    items,
    next: more && last ? { dateISO: last.date_iso, startedAt: last.started_at, id: last.id } : null,
  };
}

/**
 * The newest `keep` workouts again (at least a page), read in pages of up to 200 — for coming
 * back to History: everything already on screen is read again, so the list never shrinks under
 * the member's thumb (a single read stops at 200; workout #450 would vanish and the list jump).
 */
export async function getHistoryUpTo(opts: { keep: number; query?: string | null }): Promise<HistoryPage> {
  const want = Math.max(HISTORY_PAGE, Math.floor(opts.keep));
  const items: HistoryItem[] = [];
  let next: HistoryCursor | null = null;
  do {
    const page = await getHistoryPage({ query: opts.query, after: next, limit: Math.min(PAGE_CAP, want - items.length) });
    items.push(...page.items);
    next = page.next;
  } while (next && items.length < want);
  return { items, next };
}

/**
 * Audit Phase 8 (packet C): what History's list was read at — anything saved since, or a new day
 * (the streak and the 13-week squares move at midnight), changes it. Coming back to the tab with
 * the same stamp keeps the list as it is instead of reading every workout on screen again.
 * null = can't tell (read again).
 */
export async function historyStamp(): Promise<string | null> {
  const s = await dataStamp();
  return s == null ? null : `${s}|${todayISO()}`;
}

/** Workouts per month ("2026-10" → 12), for the month headings — matching `query` if given. */
export async function getMonthCounts(query?: string | null): Promise<Record<string, number>> {
  const search = searchFilter(cleanQuery(query));
  const rows = await getDb().getAllAsync<{ ym: string; n: number }>(
    `SELECT substr(ws.date_iso, 1, 7) AS ym, COUNT(*) AS n FROM workout_sessions ws
      WHERE 1 = 1${search.sql}
      GROUP BY ym`,
    search.params,
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.ym] = Number(r.n);
  return out;
}

/** Workouts per day in one month ("2026-10-09" → 1), for the calendar's dots. `ym` = "2026-10". */
export async function getWorkoutDays(ym: string): Promise<Record<string, number>> {
  // ISO days compare as text: "-01" to "-31" covers every day of any month.
  const from = `${ym}-01`;
  const to = `${ym}-31`;
  const rows = await getDb().getAllAsync<{ d: string; n: number }>(
    'SELECT date_iso AS d, COUNT(*) AS n FROM workout_sessions WHERE date_iso BETWEEN ? AND ? GROUP BY date_iso',
    [from, to],
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.d] = Number(r.n);
  return out;
}

/** Every workout on one day, newest first (the calendar's tapped day). */
export async function getHistoryOnDay(dateISO: string): Promise<HistoryItem[]> {
  const rows = await getDb().getAllAsync<SessionRow>(
    'SELECT * FROM workout_sessions WHERE date_iso = ? ORDER BY started_at DESC, id DESC',
    [dateISO],
  );
  return itemsFor(rows);
}

/** The day of the first workout ever logged (how far back the calendar goes), or null. */
export async function getFirstWorkoutDate(): Promise<string | null> {
  const r = await getDb().getFirstAsync<{ d: string | null }>('SELECT MIN(date_iso) AS d FROM workout_sessions');
  return r?.d ?? null;
}

/** A list row: a month heading or a workout card. */
export type HistoryRow =
  | { kind: 'month'; key: string; ym: string; count: number }
  | { kind: 'workout'; key: string; item: HistoryItem };

/**
 * The list's rows: a heading before the first workout of each month, carrying that month's
 * count (from `counts`; the loaded number when a count is missing). PURE.
 */
export function historyRows(items: readonly HistoryItem[], counts: Record<string, number>): HistoryRow[] {
  const out: HistoryRow[] = [];
  let ym = '';
  for (const it of items) {
    const m = it.dateISO.slice(0, 7);
    if (m !== ym) {
      ym = m;
      const loaded = items.filter((x) => x.dateISO.startsWith(m)).length;
      out.push({ kind: 'month', key: `m-${m}`, ym: m, count: counts[m] ?? loaded });
    }
    out.push({ kind: 'workout', key: it.id, item: it });
  }
  return out;
}

/** Indexes of the month headings in `rows` (for sticky headings). PURE. */
export function monthHeadingIndexes(rows: readonly HistoryRow[]): number[] {
  const out: number[] = [];
  rows.forEach((r, i) => {
    if (r.kind === 'month') out.push(i);
  });
  return out;
}
