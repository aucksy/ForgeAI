// R-519 (14 Nov 2026): the free-limit alert, "just keep it to minimum". Once a WEEK (Monday, inside the nightly
// 03:00 India-time Cron Trigger; no cron of its own) HQ asks Cloudflare how many requests ALL our Workers served on
// each of the last 7 days. The free plan stops at 100,000 a day for the whole account (resets 00:00 UTC = 05:30
// India time; past it every Worker answers error 1027). If the busiest day passed 60% (or 80%), ONE line appears on
// HQ's "Needs you" for that week. Silent otherwise. Supabase is not checked: it emails the billing address itself.
//   - the read: ONE call to Cloudflare's GraphQL Analytics API, dataset workersInvocationsAdaptive (account level,
//     every Worker together), one alias per UTC day, only sum { requests } with a datetime_geq / datetime_leq filter
//     (the fields Cloudflare's "Querying Workers Metrics with GraphQL" tutorial documents).
//   - the token: secret CF_ANALYTICS_TOKEN (Account > Account Analytics > Read, this account only); var
//     CF_ACCOUNT_ID. Either missing: one log line, nothing else.
//   - the store: KV binding BACKUP (already there), key usage/week, 21 days' expiry. No database change.
// Never throws.

export const DAILY_LIMIT = 100_000;
export const LEVELS = [80, 60]; // highest first
export const CHECK_WEEKDAY = 1; // Monday, India time
export const KEY = 'usage/week';
export const KEEP_SECONDS = 21 * 24 * 60 * 60;
export const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_MS = 5.5 * 60 * 60 * 1000;

/** The India calendar day of a moment, YYYY-MM-DD. PURE. */
export function indiaDay(now) {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** Is it the check day (Monday in India)? PURE. */
export function isCheckDay(now) {
  return new Date(now.getTime() + IST_MS).getUTCDay() === CHECK_WEEKDAY;
}

/**
 * The 7 whole UTC days before the current UTC day, oldest first (the limit counts UTC days). Checked every Monday
 * 03:00 India (Sunday 21:30 UTC), so each week covers Sunday to Saturday with no gap and no overlap. PURE.
 */
export function lastSevenDays(now) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: 7 }, (_, i) => new Date(today - (7 - i) * DAY_MS).toISOString().slice(0, 10));
}

/** The one GraphQL query: one alias per day, all Workers of the account together. PURE. */
export function usageQuery(accountId, days) {
  const parts = days.map((d, i) =>
    `d${i}: workersInvocationsAdaptive(limit: 1, filter: { datetime_geq: "${d}T00:00:00Z", datetime_leq: "${d}T23:59:59Z" }) { sum { requests } }`);
  return `query { viewer { accounts(filter: { accountTag: "${accountId}" }) { ${parts.join(' ')} } } }`;
}

/** Cloudflare's answer -> [{ day, requests }] or null when it is not the expected shape. PURE. */
export function readDays(body, days) {
  const acct = body && body.data && body.data.viewer && Array.isArray(body.data.viewer.accounts) ? body.data.viewer.accounts[0] : null;
  if (!acct) return null;
  return days.map((day, i) => {
    const rows = Array.isArray(acct[`d${i}`]) ? acct[`d${i}`] : [];
    const requests = rows.reduce((a, r) => a + (Number(r && r.sum && r.sum.requests) || 0), 0);
    return { day, requests };
  });
}

/** The busiest day and the alert level it reached (80, 60 or null). PURE. */
export function judge(daysUsed, limit = DAILY_LIMIT) {
  const busiest = daysUsed.reduce((a, d) => (d.requests > a.requests ? d : a), daysUsed[0] || { day: null, requests: 0 });
  const pct = Math.round((busiest.requests / limit) * 100);
  const level = LEVELS.find((l) => busiest.requests >= (limit * l) / 100) ?? null;
  return { busiest, pct, level };
}

/** What /api/needs shows: the alert of the last check, while it is less than 7 days old. Else null. */
export async function usageAlert(env, now = new Date()) {
  const last = await lastCheck(env);
  if (!last || !last.level) return null;
  if (now.getTime() - Date.parse(last.at || '') > 7 * DAY_MS) return null;
  return { level: last.level, pct: last.pct, requests: last.requests, day: last.day, limit: last.limit || DAILY_LIMIT };
}

/** The last weekly check as stored (for the System page), or null. */
export async function lastCheck(env) {
  if (!env.BACKUP) return null;
  try {
    return await env.BACKUP.get(KEY, 'json');
  } catch (e) {
    console.error('[usage] last check not readable', e instanceof Error ? e.message : 'error');
    return null;
  }
}

/**
 * The weekly check. -> { skipped } | { error } | { week, level, pct, requests, day }. Never throws.
 * deps: { fetchImpl, now }.
 */
export async function runUsageWeekly(env, { fetchImpl = fetch, now = new Date() } = {}) {
  try {
    if (!isCheckDay(now)) return { skipped: 'not-today' };
    const week = indiaDay(now);
    const token = String(env.CF_ANALYTICS_TOKEN || '').trim();
    const account = String(env.CF_ACCOUNT_ID || '').trim().toLowerCase();
    if (!token || !/^[0-9a-f]{32}$/.test(account)) {
      console.log('[usage] free-limit check skipped: CF_ANALYTICS_TOKEN or CF_ACCOUNT_ID is not set');
      return { skipped: 'not-set-up' };
    }
    const before = await lastCheck(env);
    if (before && before.week === week) return { skipped: 'done-this-week' };

    const days = lastSevenDays(now);
    let res;
    try {
      res = await fetchImpl(GRAPHQL_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: usageQuery(account, days) }),
      });
    } catch (e) {
      console.error('[usage] Cloudflare analytics not reachable', e instanceof Error ? e.message : 'error');
      return { error: 'unreachable' };
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok || !body || (Array.isArray(body.errors) && body.errors.length)) {
      const why = body && Array.isArray(body.errors) && body.errors[0] ? String(body.errors[0].message || '').slice(0, 200) : '';
      console.error('[usage] Cloudflare analytics refused', res.status, why);
      return { error: `status ${res.status}` };
    }
    const used = readDays(body, days);
    if (!used) {
      console.error('[usage] Cloudflare analytics answer not understood (no account in it)');
      return { error: 'shape' };
    }
    const { busiest, pct, level } = judge(used);
    const out = { week, at: now.toISOString(), level, pct, requests: busiest.requests, day: busiest.day, limit: DAILY_LIMIT, days: used };
    if (env.BACKUP) {
      try {
        await env.BACKUP.put(KEY, JSON.stringify(out), { expirationTtl: KEEP_SECONDS });
      } catch (e) {
        console.error('[usage] check not stored', e instanceof Error ? e.message : 'error');
      }
    }
    if (level) console.warn('[usage] free limit: busiest day', busiest.day, busiest.requests, `(${pct}%) passed ${level}%`);
    else console.log('[usage] free limit fine: busiest day', busiest.day, busiest.requests, `(${pct}%)`);
    return { week, level, pct, requests: busiest.requests, day: busiest.day };
  } catch (e) {
    console.error('[usage] free-limit check failed', e instanceof Error ? e.message : 'error');
    return { error: 'failed' };
  }
}
