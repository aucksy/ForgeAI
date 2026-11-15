// R-595 (16 Nov 2026, supabase 0097): the direct-read record. pgaudit writes an "AUDIT:" line into Supabase's
// Postgres log for every read or change made with the Supabase OWNER login (the role postgres: the dashboard's
// SQL editor and table editor, psql, the MCP). Supabase keeps that log about 1 day on the free plan. Every 10
// minutes (worker.js everyMinute) this asks Supabase's Management API for the AUDIT lines it has not seen yet,
// makes one item per statement, and hands them to the gym server (hq_db_reads_ingest), which keeps them 2 years
// and shows the gym owner the ones that touched the gym. This Worker reaches the gym server as service_role, which
// pgaudit does not log, so its own calls never come back as looks.
// Off, quietly: no SUPABASE_LOGS_TOKEN (a Supabase access token scoped to this one project with only the
// "analytics logs read" permission), no server key, or 0097 not on the gym server (NOT_READY, warned once).
// At most 4 outside calls a run: the cursor, the logs (twice if the first query form is refused), the hand-over.

import { rpc } from './db.js';

/** The minute of the hour this runs on (every 10 minutes: :03, :13, ...). PURE. */
export function readLogDue(nowMs) {
  return new Date(nowMs).getUTCMinutes() % 10 === 3;
}

/** How far back Supabase's free-plan log still reaches (a little under its 1 day). */
export const LOG_REACH_MS = (23 * 60 + 50) * 60 * 1000;
/** Lines can take a moment to reach the log store: a pull covers up to 2 minutes ago. */
export const SETTLE_MS = 2 * 60 * 1000;
export const LIMIT = 1000;
const TEXT_MAX = 2000;
/** The schemas that hold gym or member data. Reads of anything else (catalog, extensions) are not kept. */
const DATA_SCHEMAS = new Set(['public', 'auth', 'storage']);
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
let warnedNotReady = false;

/** Tests only. */
export function resetReadLog() {
  warnedNotReady = false;
}

/** "hdxzqbdiokjklnypfisq" from https://hdxzqbdiokjklnypfisq.supabase.co. PURE. */
export function projectRef(url) {
  const m = /^https:\/\/([a-z0-9]{10,40})\.supabase\.co\/?$/.exec(String(url || ''));
  return m ? m[1] : '';
}

/** A moment as the logs SQL may quote it: only digits, dashes, colons, T, dot, Z. PURE. */
function isoOf(ms) {
  const s = new Date(ms).toISOString();
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)) throw new Error('bad time');
  return s;
}

/**
 * The logs query: AUDIT lines after `sinceMs` up to `untilMs`, oldest first. Supabase's logs SQL is ClickHouse now
 * (docs, Nov 2026); older projects answered the BigQuery form, tried second. PURE.
 */
export function auditSql(sinceMs, untilMs, dialect = 'clickhouse') {
  const a = isoOf(sinceMs);
  const b = isoOf(untilMs);
  if (dialect === 'bigquery') {
    return (
      'select id, timestamp, event_message, parsed.user_name as user_name, parsed.session_id as session_id ' +
      'from postgres_logs cross join unnest(metadata) as m cross join unnest(m.parsed) as parsed ' +
      `where event_message like 'AUDIT:%' and timestamp > timestamp('${a}') and timestamp <= timestamp('${b}') ` +
      `order by timestamp asc limit ${LIMIT}`
    );
  }
  return (
    "select id, timestamp, event_message, log_attributes['parsed.user_name'] as user_name, " +
    "log_attributes['parsed.session_id'] as session_id from logs " +
    "where source = 'postgres_logs' and event_message like 'AUDIT:%' " +
    `and timestamp > parseDateTime64BestEffort('${a}', 6) and timestamp <= parseDateTime64BestEffort('${b}', 6) ` +
    `order by timestamp asc limit ${LIMIT}`
  );
}

/** A log row's time in ms: BigQuery gives microseconds, ClickHouse "2026-11-16 10:00:00.123456" (UTC). PURE. */
export function logTime(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e15 ? Math.floor(v / 1000) : v > 1e12 ? v : v * 1000;
  let s = String(v || '').trim();
  if (/^\d+$/.test(s)) return logTime(Number(s));
  if (/^\d{4}-\d\d-\d\d \d/.test(s)) s = s.replace(' ', 'T');
  if (s && !/(Z|[+-]\d\d:?\d\d)$/.test(s)) s += 'Z';
  s = s.replace(/(\.\d{3})\d+/, '$1');
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

/** The fields of one CSV record (pgaudit's line after "AUDIT: "). Quotes as "", an unclosed quote runs to the end. PURE. */
export function csvFields(s) {
  const out = [];
  let i = 0;
  const n = s.length;
  while (i <= n) {
    if (s[i] === '"') {
      let v = '';
      i += 1;
      for (;;) {
        if (i >= n) break;
        if (s[i] === '"') {
          if (s[i + 1] === '"') {
            v += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        v += s[i];
        i += 1;
      }
      out.push(v);
      if (s[i] === ',') i += 1;
      else break;
    } else {
      const j = s.indexOf(',', i);
      if (j < 0) {
        out.push(s.slice(i));
        break;
      }
      out.push(s.slice(i, j));
      i = j + 1;
    }
  }
  return out;
}

/**
 * One pgaudit line: "AUDIT: SESSION,<statement>,<substatement>,<class>,<command>,<object type>,<object name>,
 * <statement text>,<parameter>". null when it is not one. PURE.
 */
export function parseAuditLine(msg) {
  const m = /^AUDIT: (SESSION|OBJECT),(.*)$/s.exec(String(msg || ''));
  if (!m) return null;
  const f = csvFields(m[2]);
  if (f.length < 7 || !/^\d+$/.test(f[0])) return null;
  return {
    statementId: f[0],
    cls: String(f[2] || '').toUpperCase(),
    command: String(f[3] || '').toUpperCase(),
    objectName: String(f[5] || ''),
    text: String(f[6] || ''),
  };
}

/** The schema-qualified table when it holds gym or member data, else ''. PURE. */
function dataObject(name) {
  const m = /^"?([A-Za-z_][A-Za-z0-9_$]*)"?\.(.+)$/.exec(name);
  if (!m || !DATA_SCHEMAS.has(m[1])) return '';
  return `${m[1]}.${m[2].replace(/"/g, '')}`.slice(0, 130);
}

/**
 * The items for hq_db_reads_ingest from log rows: one per statement (a session's statement number), with its
 * tables. Reads and changes that touched no gym data (catalog lookups, "select 1") are left out; a SET that
 * touches pgaudit is kept as 'audit_change'. PURE.
 */
export function looksFromRows(rows) {
  const byId = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const a = parseAuditLine(r && r.event_message);
    if (!a) continue;
    const at = logTime(r.timestamp);
    if (!Number.isFinite(at)) continue;
    const session = String((r && r.session_id) || '').replace(/[^A-Za-z0-9.]/g, '').slice(0, 60);
    const id = session ? `${session}:${a.statementId}` : `log-${String(r.id || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 60)}`;
    let kind = '';
    if (a.cls === 'READ') kind = 'read';
    else if (a.cls === 'WRITE') kind = 'change';
    else if (a.cls === 'MISC' && a.command === 'SET' && /pgaudit/i.test(a.text)) kind = 'audit_change';
    if (!kind) continue;
    let it = byId.get(id);
    if (!it) {
      const role = String((r && r.user_name) || 'postgres').toLowerCase();
      it = {
        id,
        at,
        role: /^[a-z_][a-z0-9_]{0,62}$/.test(role) ? role : 'postgres',
        kind,
        objects: new Set(),
        uuids: [...new Set((a.text.match(UUID_RE) || []).map((u) => u.toLowerCase()))].slice(0, 50),
        text: a.text.slice(0, TEXT_MAX),
        source: /--\s*source:\s*dashboard/i.test(a.text) ? 'dashboard' : 'direct',
        who: (/--\s*user:\s*([0-9a-f-]{36})/i.exec(a.text) || [])[1] || '',
      };
      byId.set(id, it);
    }
    if (at < it.at) it.at = at;
    if (kind === 'change' && it.kind === 'read') it.kind = 'change';
    if (kind === 'audit_change') it.kind = 'audit_change';
    const o = dataObject(a.objectName);
    if (o) it.objects.add(o);
  }
  const out = [];
  for (const it of byId.values()) {
    if (it.kind !== 'audit_change' && it.objects.size === 0) continue;
    out.push({ ...it, at: new Date(it.at).toISOString(), objects: [...it.objects].sort().slice(0, 50) });
  }
  return out.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
}

/** GET the Management API's logs. -> { rows } | { error } (never the token). */
async function fetchLogs(env, ref, sql, startMs, endMs, fetchImpl) {
  const q = new URLSearchParams({ sql, iso_timestamp_start: isoOf(startMs), iso_timestamp_end: isoOf(endMs) });
  let res;
  try {
    res = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs?${q}`, {
      headers: { Authorization: `Bearer ${env.SUPABASE_LOGS_TOKEN}`, Accept: 'application/json' },
    });
  } catch {
    return { error: 'logs API unreachable' };
  }
  const text = await res.text();
  if (!res.ok) return { error: `logs API answered ${res.status}`, status: res.status };
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: 'logs API answer was not JSON' };
  }
  if (body && body.error) {
    const e = typeof body.error === 'string' ? body.error : String((body.error && body.error.message) || 'error');
    return { error: `logs query refused: ${e.slice(0, 200)}` };
  }
  return { rows: Array.isArray(body && body.result) ? body.result : [] };
}

/**
 * One pull. Never throws. -> { calls, skipped } | { calls, added, ... }
 */
export async function runReadLog(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!env || !env.SUPABASE_LOGS_TOKEN || !env.SUPABASE_HQ_KEY || !env.SUPABASE_URL) return { calls: 0, skipped: 'off' };
  const ref = projectRef(env.SUPABASE_URL);
  if (!ref) return { calls: 0, skipped: 'off' };
  let calls = 0;
  let cursor;
  try {
    calls += 1;
    cursor = await rpc(env, 'hq_db_reads_cursor', {}, { fetchImpl });
  } catch (e) {
    if (e && e.code === 'NOT_READY') {
      if (!warnedNotReady) console.warn('[read-log] the gym server has no hq_db_reads_cursor yet (migration 0097 not applied)');
      warnedNotReady = true;
      return { calls, skipped: 'not-ready' };
    }
    console.error('[read-log] cursor failed', e instanceof Error ? e.message : 'error');
    return { calls, skipped: 'error' };
  }
  const covered = Date.parse(String((cursor && cursor.coveredTo) || ''));
  const until = Math.floor((now - SETTLE_MS) / 60000) * 60000;
  const since = Math.max(Number.isFinite(covered) ? covered : now - LOG_REACH_MS, now - LOG_REACH_MS);
  if (until <= since) return { calls, skipped: 'nothing-new' };
  const start = Math.floor((since - 60000) / 60000) * 60000;

  let got = await fetchLogs(env, ref, auditSql(since, until, 'clickhouse'), start, until, fetchImpl);
  calls += 1;
  if (got.error && !got.status) {
    const first = got.error;
    got = await fetchLogs(env, ref, auditSql(since, until, 'bigquery'), start, until, fetchImpl);
    calls += 1;
    if (got.error) got.error = `${first} / ${got.error}`.slice(0, 300);
  }
  const from = new Date(since).toISOString();
  if (got.error) {
    console.error('[read-log] pull failed:', got.error);
    try {
      calls += 1;
      await rpc(env, 'hq_db_reads_ingest', { p_items: [], p_from: from, p_covered_to: from, p_error: got.error }, { fetchImpl });
    } catch (e) {
      console.error('[read-log] could not note the failure', e instanceof Error ? e.message : 'error');
    }
    // The answer's status and the plain reason (never the token) let readLogAlert.js tell a refused key apart.
    return { calls, skipped: 'logs', status: got.status || 0, error: got.error };
  }
  const items = looksFromRows(got.rows);
  // A full answer stops at its last line (the rest comes next run); otherwise everything up to `until` is seen.
  let coveredTo = until;
  if (got.rows.length >= LIMIT) {
    const last = logTime(got.rows[got.rows.length - 1].timestamp);
    coveredTo = Number.isFinite(last) ? Math.max(since, last - 1) : since;
  }
  try {
    calls += 1;
    const r = await rpc(
      env,
      'hq_db_reads_ingest',
      { p_items: items, p_from: from, p_covered_to: new Date(coveredTo).toISOString(), p_error: null },
      { fetchImpl },
    );
    if (items.length || (r && r.auditOn === false)) console.log('[read-log] pulled', got.rows.length, 'lines', JSON.stringify(r));
    return { calls, lines: got.rows.length, added: Number(r && r.added) || 0, auditOn: r ? r.auditOn : null };
  } catch (e) {
    console.error('[read-log] hand-over failed', e instanceof Error ? e.message : 'error');
    return { calls, skipped: 'error' };
  }
}
