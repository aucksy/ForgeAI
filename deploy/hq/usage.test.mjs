// node --test deploy/hq  (CI: ci.yml "HQ Worker tests"). The weekly Cloudflare free-limit check (usage.js, R-519).
// Cloudflare and KV are stand-ins; nothing real is reached.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GRAPHQL_URL, KEY, judge, lastSevenDays, runUsageWeekly, usageAlert, usageQuery } from './usage.js';
import { needsLines, needsRose, needsTotal, usageLine } from '../../apps/hq/public/logic.js';

const MONDAY = new Date('2026-11-15T21:30:00Z'); // 03:00 on Monday 16 Nov, India
const TUESDAY = new Date('2026-11-16T21:30:00Z');
const ACCOUNT = '1dc428a67de48b96bf13fb430da7a9e8';
const TOKEN = 'cf_test_token_never_shown';

function fakeKv() {
  const data = new Map();
  const opts = new Map();
  return {
    data,
    opts,
    async get(key, type) {
      if (!data.has(key)) return null;
      return type === 'json' ? JSON.parse(data.get(key)) : data.get(key);
    },
    async put(key, value, o) {
      data.set(key, value);
      opts.set(key, o);
    },
  };
}

/** Cloudflare's GraphQL answer: one alias per day, the given requests per day. */
function cloudflare(perDay, { status = 200, errors = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (errors) return new Response(JSON.stringify({ data: null, errors }), { status });
    const acct = {};
    perDay.forEach((n, i) => { acct[`d${i}`] = [{ sum: { requests: n } }]; });
    return new Response(JSON.stringify({ data: { viewer: { accounts: [acct] } }, errors: null }), { status });
  };
  return { calls, fetchImpl };
}

const env = (extra = {}) => ({ CF_ANALYTICS_TOKEN: TOKEN, CF_ACCOUNT_ID: ACCOUNT, BACKUP: fakeKv(), ...extra });

/** Capture console output during fn. */
async function logs(fn) {
  const seen = [];
  const keep = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(keep)) console[k] = (...a) => seen.push([k, a.join(' ')]);
  try {
    return { out: await fn(), seen };
  } finally {
    Object.assign(console, keep);
  }
}

test('the 7 whole UTC days before the check, and one query with one alias a day', () => {
  const days = lastSevenDays(MONDAY);
  assert.deepEqual(days, ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
  const q = usageQuery(ACCOUNT, days);
  assert.match(q, /accountTag: "1dc428a67de48b96bf13fb430da7a9e8"/);
  assert.equal((q.match(/workersInvocationsAdaptive/g) || []).length, 7);
  assert.match(q, /d0: workersInvocationsAdaptive\(limit: 1, filter: \{ datetime_geq: "2026-11-08T00:00:00Z", datetime_leq: "2026-11-08T23:59:59Z" \}\) \{ sum \{ requests \} \}/);
  assert.deepEqual(judge([{ day: 'a', requests: 59_999 }, { day: 'b', requests: 10 }]), { busiest: { day: 'a', requests: 59_999 }, pct: 60, level: null });
});

test('under 60%: one call to Cloudflare, stored, no alert', async () => {
  const e = env();
  const cf = cloudflare([1000, 2000, 59_000, 300, 0, 10, 20]);
  const r = await runUsageWeekly(e, { fetchImpl: cf.fetchImpl, now: MONDAY });
  assert.equal(cf.calls.length, 1);
  assert.equal(cf.calls[0].url, GRAPHQL_URL);
  assert.equal(cf.calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(r, { week: '2026-11-16', level: null, pct: 59, requests: 59_000, day: '2026-11-10' });
  assert.equal(await usageAlert(e, MONDAY), null);
  assert.equal(e.BACKUP.opts.get(KEY).expirationTtl, 21 * 24 * 60 * 60);
});

test('60%: alerts once for the week, shows on Needs you, and a second run that Monday asks nobody', async () => {
  const e = env();
  const cf = cloudflare([1000, 64_000, 2000, 0, 0, 0, 0]);
  const r = await runUsageWeekly(e, { fetchImpl: cf.fetchImpl, now: MONDAY });
  assert.equal(r.level, 60);
  const alert = await usageAlert(e, MONDAY);
  assert.deepEqual(alert, { level: 60, pct: 64, requests: 64_000, day: '2026-11-09', limit: 100_000 });
  const again = await runUsageWeekly(e, { fetchImpl: cf.fetchImpl, now: new Date(MONDAY.getTime() + 60_000) });
  assert.deepEqual(again, { skipped: 'done-this-week' });
  assert.equal(cf.calls.length, 1);
  // The HQ page: one line, counted once in the red number, a sound only when it is new.
  const lines = needsLines({ leadsNew: 1, usageAlert: alert });
  assert.deepEqual(lines.map((l) => l.key), ['leads', 'usage']);
  assert.equal(lines[1].href, '#system');
  assert.match(lines[1].words, /^Cloudflare free limit: on 9 Nov our apps used 64,000 of the 1,00,000 requests allowed a day \(64%\)\./);
  assert.equal(needsTotal({ leadsNew: 1, usageAlert: alert }), 2);
  assert.deepEqual(needsRose({ leadsNew: 1 }, { leadsNew: 1, usageAlert: alert }).map((l) => l.key), ['usage']);
  assert.deepEqual(needsRose({ leadsNew: 1, usageAlert: alert }, { leadsNew: 1, usageAlert: alert }), []);
  // Older than 7 days: gone from Needs you.
  assert.equal(await usageAlert(e, new Date(MONDAY.getTime() + 8 * 24 * 60 * 60 * 1000)), null);
});

test('80% and over the limit', async () => {
  const e = env();
  const r = await runUsageWeekly(e, { fetchImpl: cloudflare([85_000, 0, 0, 0, 0, 0, 0]).fetchImpl, now: MONDAY });
  assert.equal(r.level, 80);
  assert.equal(r.pct, 85);
  const e2 = env();
  const over = await runUsageWeekly(e2, { fetchImpl: cloudflare([0, 0, 0, 0, 0, 0, 101_000]).fetchImpl, now: MONDAY });
  assert.equal(over.level, 80);
  assert.match(usageLine(await usageAlert(e2, MONDAY)).words, /\(101%\)\. Past the limit they stopped until 05:30 India time\./);
});

test('not Monday, or no token: nothing asked, one log line for the missing token', async () => {
  const cf = cloudflare([90_000, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(await runUsageWeekly(env(), { fetchImpl: cf.fetchImpl, now: TUESDAY }), { skipped: 'not-today' });
  const e = env({ CF_ANALYTICS_TOKEN: undefined });
  const { out, seen } = await logs(() => runUsageWeekly(e, { fetchImpl: cf.fetchImpl, now: MONDAY }));
  assert.deepEqual(out, { skipped: 'not-set-up' });
  assert.equal(seen.length, 1);
  assert.match(seen[0][1], /CF_ANALYTICS_TOKEN or CF_ACCOUNT_ID is not set/);
  assert.equal(cf.calls.length, 0);
  assert.equal(e.BACKUP.data.size, 0);
  assert.equal(await usageAlert(e, MONDAY), null);
});

test('Cloudflare errors: silent on HQ, logged, nothing stored, never throws', async () => {
  for (const cf of [
    cloudflare([], { status: 200, errors: [{ message: 'not authorized for that account' }] }),
    cloudflare([], { status: 403, errors: [{ message: 'Authentication error' }] }),
    { calls: [], fetchImpl: async () => { throw new Error('network down'); } },
    { calls: [], fetchImpl: async () => new Response('<html>oops</html>', { status: 502 }) },
    { calls: [], fetchImpl: async () => new Response(JSON.stringify({ data: { viewer: { accounts: [] } } }), { status: 200 }) },
  ]) {
    const e = env();
    const { out, seen } = await logs(() => runUsageWeekly(e, { fetchImpl: cf.fetchImpl, now: MONDAY }));
    assert.ok(out.error, JSON.stringify(out));
    assert.equal(seen.filter(([k]) => k === 'error').length, 1);
    assert.ok(!seen.some(([, m]) => m.includes(TOKEN)), 'the token is never logged');
    assert.equal(e.BACKUP.data.size, 0);
    assert.equal(await usageAlert(e, MONDAY), null);
  }
});
