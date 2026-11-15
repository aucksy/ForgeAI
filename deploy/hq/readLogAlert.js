// R-601 (16 Nov 2026, owner's pick "alert plus 30-day reminder"): is the direct-read record (readLog.js) working?
// Supabase keeps its logs only about a day, so a read log that fails quietly loses looks for good.
//   - After every pull (worker.js everyMinute) noteReadLogRun keeps ONE small KV entry (binding BACKUP, key
//     readlog/health): since when the pulls fail, and why. Written only when that changes (first failure, a new
//     reason, the first good pull after), so a normal day writes nothing.
//   - readLogState says what HQ shows (/api/needs -> the red line, the reminder, the grey "off" line) and what the
//     public GET /readlog/status answers. The watch workflow (scripts/watch/outage.mjs) reads that every 10 minutes
//     and opens a GitHub issue when the record has failed for an hour (GitHub emails the owner), comments once and
//     closes it when it works again, and opens one reminder issue 30 days before the logs key ends.
//   - The key's end date is the var SUPABASE_LOGS_TOKEN_EXPIRES (wrangler.jsonc), never written into the code.
// Never throws. No member data, no key, no query text anywhere in here.

import { projectRef } from './readLog.js';

export const HEALTH_KEY = 'readlog/health';
/** The record must fail this long without a break before it counts as broken. */
export const ALERT_AFTER_MS = 60 * 60 * 1000;
/** The reminder starts this many days before the key ends. */
export const RENEW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_MS = 5.5 * 60 * 60 * 1000;
export const WHY = ['key', 'unreachable', 'logs', 'server', 'setup', 'error'];

/** Is the record switched on (a logs key saved and a gym server address)? PURE. */
export function readLogOn(env) {
  return Boolean(env && env.SUPABASE_LOGS_TOKEN && env.SUPABASE_HQ_KEY && projectRef(env.SUPABASE_URL));
}

/**
 * What one pull (runReadLog's answer) means: { ok: true } | { ok: false, why } | null when it says nothing
 * (switched off). why: 'key' (Supabase refused the key: ended, deleted, wrong), 'unreachable', 'logs' (another
 * refusal), 'server' (the gym server did not answer), 'setup' (0097 missing), 'error'. PURE.
 */
export function runOutcome(r) {
  if (!r || typeof r !== 'object') return { ok: false, why: 'error' };
  if (r.skipped === 'off') return null;
  if (r.skipped === 'nothing-new' || !r.skipped) return { ok: true };
  if (r.skipped === 'not-ready') return { ok: false, why: 'setup' };
  if (r.skipped === 'error') return { ok: false, why: 'server' };
  if (r.skipped === 'logs') {
    if (r.status === 401 || r.status === 403) return { ok: false, why: 'key' };
    if (/unreachable/.test(String(r.error || ''))) return { ok: false, why: 'unreachable' };
    return { ok: false, why: 'logs' };
  }
  return { ok: false, why: 'error' };
}

async function readHealth(env) {
  if (!env || !env.BACKUP) return null;
  try {
    return await env.BACKUP.get(HEALTH_KEY, 'json');
  } catch (e) {
    console.error('[read-log] health not readable', e instanceof Error ? e.message : 'error');
    return null;
  }
}

/** After a pull: note when the failures started, or that they ended. One KV read; a write only on a change. */
export async function noteReadLogRun(env, result, nowMs = Date.now()) {
  try {
    const out = runOutcome(result);
    if (!out || !env || !env.BACKUP) return { wrote: false };
    const before = (await readHealth(env)) || {};
    let next = null;
    if (out.ok && before.failingSince) next = { failingSince: null, why: null, okAgainAt: new Date(nowMs).toISOString() };
    if (!out.ok && !before.failingSince) next = { failingSince: new Date(nowMs).toISOString(), why: out.why };
    if (!out.ok && before.failingSince && before.why !== out.why) next = { failingSince: before.failingSince, why: out.why };
    if (!next) return { wrote: false };
    await env.BACKUP.put(HEALTH_KEY, JSON.stringify(next));
    if (!out.ok && !before.failingSince) console.warn('[read-log] pulls failing from now:', out.why);
    if (out.ok) console.log('[read-log] pulls work again');
    return { wrote: true };
  } catch (e) {
    console.error('[read-log] health not written', e instanceof Error ? e.message : 'error');
    return { wrote: false };
  }
}

/** The logs key's end date from the var SUPABASE_LOGS_TOKEN_EXPIRES ("2027-11-14"), or null. PURE. */
export function keyEnds(env) {
  const s = String((env && env.SUPABASE_LOGS_TOKEN_EXPIRES) || '').trim();
  if (!/^\d{4}-\d\d-\d\d$/.test(s) || !Number.isFinite(Date.parse(`${s}T00:00:00Z`))) return null;
  return s;
}

/** Time to make a new key: from 30 days before its end date (India days; 14 Nov 2027 -> from 15 Oct 2027). PURE. */
export function renewDue(ends, nowMs) {
  if (!ends) return false;
  const from = new Date(Date.parse(`${ends}T00:00:00Z`) - RENEW_DAYS * DAY_MS).toISOString().slice(0, 10);
  return new Date(nowMs + IST_MS).toISOString().slice(0, 10) >= from;
}

/**
 * What HQ shows and the watch reads:
 *   { on: false }                                   no logs key saved (grey line, never an email)
 *   { on: true, failing, failingSince, why, keyEnds, renewNow }
 * failing: the pulls have failed without a break for an hour or more. failingSince/why only while failing.
 */
export async function readLogState(env, now = new Date()) {
  if (!readLogOn(env)) return { on: false };
  const nowMs = now.getTime();
  const h = await readHealth(env);
  const since = h && h.failingSince ? Date.parse(h.failingSince) : NaN;
  const failing = Number.isFinite(since) && nowMs - since >= ALERT_AFTER_MS;
  const ends = keyEnds(env);
  return {
    on: true,
    failing,
    failingSince: failing ? new Date(since).toISOString() : null,
    why: failing ? (WHY.includes(h.why) ? h.why : 'error') : null,
    keyEnds: ends,
    renewNow: renewDue(ends, nowMs),
  };
}

/** GET /readlog/status, no sign-in (the watch workflow reads it). Only the state above: no reason text, no key. */
export async function readLogStatus(env, now = new Date()) {
  let body;
  try {
    body = await readLogState(env, now);
  } catch {
    body = { on: true, failing: false, failingSince: null, why: null, keyEnds: null, renewNow: false };
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
