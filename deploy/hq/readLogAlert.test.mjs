// node --test deploy/hq  (CI: ci.yml "HQ Worker tests"). R-601: the read log's alert (readLogAlert.js) and the
// email it ends in (scripts/watch/outage.mjs opens a GitHub issue that @mentions the owner). KV, Supabase and
// GitHub are stand-ins; nothing real is reached.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ALERT_AFTER_MS, HEALTH_KEY, keyEnds, noteReadLogRun, readLogState, readLogStatus, renewDue, runOutcome } from './readLogAlert.js';
import worker, { everyMinute } from './worker.js';
import { needsLines, needsRose, needsTotal, readLogLines } from '../../apps/hq/public/logic.js';
import { main as watchMain, readLogOk, reminderPlan, reminderTitle } from '../../scripts/watch/outage.mjs';

const ON = {
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_HQ_KEY: 'hq-key',
  SUPABASE_LOGS_TOKEN: 'logs-token',
  SUPABASE_LOGS_TOKEN_EXPIRES: '2027-11-14',
};
const T0 = Date.parse('2026-11-16T08:43:00.000Z'); // 2:13 pm India time
const MIN = 60 * 1000;
const REFUSED = { calls: 2, skipped: 'logs', status: 401, error: 'logs API answered 401' };
const PULLED = { calls: 3, lines: 0, added: 0, auditOn: true };

function fakeKv() {
  const data = new Map();
  const kv = {
    data,
    writes: 0,
    async get(key, type) {
      if (!data.has(key)) return null;
      return type === 'json' ? JSON.parse(data.get(key)) : data.get(key);
    },
    async put(key, value) {
      kv.writes += 1;
      data.set(key, value);
    },
  };
  return kv;
}

const quietly = async (fn) => {
  const keep = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    [console.log, console.warn, console.error] = keep;
  }
};

/** GitHub's issues in memory, and every other part of MettleUp answering fine; /readlog/status from `status()`. */
function watchWorld(status) {
  const state = { issues: [], next: 1, labels: new Set(), posts: 0 };
  const json = (s, body) => new Response(JSON.stringify(body), { status: s });
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    if (url === 'https://hq.mettleup.fit/readlog/status') return status();
    if (url.startsWith('https://api.github.com/repos/o/r')) {
      const path = url.slice('https://api.github.com/repos/o/r'.length);
      const body = init.body ? JSON.parse(init.body) : null;
      if (method === 'POST') state.posts += 1;
      if (path.startsWith('/issues?')) {
        const q = new URL(`https://x${path}`).searchParams;
        return json(200, state.issues.filter((i) => i.labels.includes(q.get('labels')) && (q.get('state') === 'all' || i.state === q.get('state'))));
      }
      if (path.startsWith('/labels/')) return state.labels.has(decodeURIComponent(path.slice(8))) ? json(200, {}) : json(404, {});
      if (path === '/labels') return state.labels.add(body.name), json(201, body);
      if (path === '/issues' && method === 'POST') {
        const issue = { number: state.next++, state: 'open', title: body.title, body: body.body, labels: body.labels, comments: [] };
        state.issues.push(issue);
        return json(201, issue);
      }
      const m = /^\/issues\/(\d+)(\/comments)?$/.exec(path);
      const issue = m && state.issues.find((i) => i.number === Number(m[1]));
      if (issue && m[2]) return issue.comments.push(body.body), json(201, {});
      if (issue && method === 'PATCH') return Object.assign(issue, body), json(200, issue);
      return json(404, {});
    }
    if (url.includes('/rest/v1/')) return new Response('[]', { status: 200 });
    return new Response('<html><div id="root"></div></html>', { status: 200 });
  };
  return { fetchImpl, state };
}
const GH = { GITHUB_TOKEN: 'gh-token', GITHUB_REPOSITORY: 'o/r' };
const fast = { tries: 1, gapMs: 0, timeoutMs: 1000, wait: async () => undefined };
const watch = (w, nowMs) => quietly(() => watchMain({ env: GH, fetchImpl: w.fetchImpl, now: () => new Date(nowMs), checkOpts: fast }));

test('what a pull means: a refused key, no answer, the gym server, nothing new; off says nothing', () => {
  assert.deepEqual(runOutcome(REFUSED), { ok: false, why: 'key' });
  assert.deepEqual(runOutcome({ ...REFUSED, status: 403 }), { ok: false, why: 'key' });
  assert.deepEqual(runOutcome({ calls: 3, skipped: 'logs', status: 0, error: 'logs API unreachable / logs API unreachable' }), { ok: false, why: 'unreachable' });
  assert.deepEqual(runOutcome({ calls: 3, skipped: 'logs', status: 0, error: 'logs query refused: x' }), { ok: false, why: 'logs' });
  assert.deepEqual(runOutcome({ calls: 1, skipped: 'error' }), { ok: false, why: 'server' });
  assert.deepEqual(runOutcome({ calls: 1, skipped: 'not-ready' }), { ok: false, why: 'setup' });
  assert.deepEqual(runOutcome(null), { ok: false, why: 'error' });
  assert.deepEqual(runOutcome({ calls: 1, skipped: 'nothing-new' }), { ok: true });
  assert.deepEqual(runOutcome(PULLED), { ok: true });
  assert.equal(runOutcome({ calls: 0, skipped: 'off' }), null);
});

test('failing 59 minutes: no alert; 61 minutes: one email; still failing: no more; working again: one email', async () => {
  const kv = fakeKv();
  const env = { ...ON, BACKUP: kv };
  let nowMs = T0;
  const w = watchWorld(() => readLogStatus(env, new Date(nowMs)));
  // Every 10 minutes the key is refused: the first failure is written down once, nothing after.
  for (let m = 0; m <= 50; m += 10) await quietly(() => noteReadLogRun(env, REFUSED, T0 + m * MIN));
  assert.equal(kv.writes, 1);
  assert.equal(JSON.parse(kv.data.get(HEALTH_KEY)).failingSince, new Date(T0).toISOString());

  nowMs = T0 + 59 * MIN;
  assert.equal((await readLogState(env, new Date(nowMs))).failing, false);
  assert.deepEqual(readLogLines(await readLogState(env, new Date(nowMs))), [], 'nothing on HQ before the hour');
  await watch(w, nowMs);
  assert.equal(w.state.issues.length, 0, 'no email at 59 minutes');

  nowMs = T0 + 61 * MIN;
  const s = await readLogState(env, new Date(nowMs));
  assert.deepEqual(s, { on: true, failing: true, failingSince: '2026-11-16T08:43:00.000Z', why: 'key', keyEnds: '2027-11-14', renewNow: false });
  assert.equal(readLogOk(200, JSON.stringify(s)), false);
  await watch(w, nowMs);
  assert.equal(w.state.issues.length, 1, 'one email at 61 minutes');
  const [issue] = w.state.issues;
  assert.equal(issue.title, 'Outage: Read log not working');
  assert.deepEqual(issue.labels, ['outage']);
  assert.match(issue.body, /\*\*Read log \(hq\.mettleup\.fit\/readlog\/status\)\*\*: the record of direct looks at gym data has not worked since 16 Nov 2026, 2:13 pm \(India time\): Supabase refused the logs key \(it may have ended or been deleted\)\. Supabase keeps its logs only about a day, so fix it today\./);
  assert.match(issue.body, /Members and gyms are not affected\./);
  assert.match(issue.body, /@aucksy/);
  assert.ok(!/logs-token|hq-key/.test(issue.body), 'no key in the email');

  // HQ: one red line on top of every page and on Needs you, counted, and it rings once.
  const lines = readLogLines(s);
  assert.deepEqual(lines.map((l) => [l.key, l.tone, l.n]), [['readlog', 'bad', 1]]);
  assert.equal(lines[0].words, 'Read log is not working since 16 Nov 2026, 14:13: Supabase refused the logs key (it may have ended or been deleted). '
    + 'Supabase keeps its logs only about a day, so direct looks at gym data are not being recorded. Fix it today.');
  assert.equal(needsTotal({ leadsNew: 1, readLog: s }), 2);
  assert.deepEqual(needsLines({ readLog: s }).map((l) => l.key), ['readlog']);
  assert.deepEqual(needsRose({ readLog: { ...s, failing: false } }, { readLog: s }).map((l) => l.key), ['readlog']);
  assert.deepEqual(needsRose({ readLog: s }, { readLog: s }), []);

  nowMs = T0 + 71 * MIN;
  await quietly(() => noteReadLogRun(env, REFUSED, nowMs));
  await watch(w, nowMs);
  assert.equal(w.state.issues.length, 1);
  assert.equal(issue.comments.length, 0, 'still failing: no second email');

  nowMs = T0 + 80 * MIN;
  await quietly(() => noteReadLogRun(env, PULLED, nowMs));
  assert.equal(kv.writes, 2);
  assert.equal((await readLogState(env, new Date(nowMs))).failing, false);
  await watch(w, nowMs);
  assert.equal(issue.state, 'closed');
  assert.equal(issue.comments.length, 1, 'one "works again" email');
  assert.match(issue.comments[0], /Everything answers again/);
  const posts = w.state.posts;
  await quietly(() => noteReadLogRun(env, PULLED, nowMs + 10 * MIN));
  await watch(w, nowMs + 10 * MIN);
  assert.equal(w.state.posts, posts, 'fine again: nothing more is sent');
  assert.equal(kv.writes, 2, 'a normal day writes nothing');
});

test('a good pull in between starts the hour again', async () => {
  const kv = fakeKv();
  const env = { ...ON, BACKUP: kv };
  await quietly(() => noteReadLogRun(env, REFUSED, T0));
  await quietly(() => noteReadLogRun(env, PULLED, T0 + 30 * MIN));
  await quietly(() => noteReadLogRun(env, { calls: 1, skipped: 'error' }, T0 + 40 * MIN));
  assert.equal((await readLogState(env, new Date(T0 + 90 * MIN))).failing, false, 'failing only 50 minutes');
  const s = await readLogState(env, new Date(T0 + 101 * MIN));
  assert.equal(s.failing, true);
  assert.equal(s.why, 'server');
});

test('the key reminder: from 15 Oct 2027 for a key ending 14 Nov 2027, one email, closed by a new end date', async () => {
  assert.equal(keyEnds(ON), '2027-11-14');
  assert.equal(keyEnds({ SUPABASE_LOGS_TOKEN_EXPIRES: '14 Nov 2027' }), null);
  const lastQuiet = Date.parse('2027-10-14T18:29:00Z'); // 14 Oct 2027, 11:59 pm India time
  const first = Date.parse('2027-10-14T18:31:00Z'); // 15 Oct 2027, 12:01 am India time
  assert.equal(renewDue('2027-11-14', lastQuiet), false);
  assert.equal(renewDue('2027-11-14', first), true);
  assert.equal(renewDue(null, first), false);

  const kv = fakeKv();
  let env = { ...ON, BACKUP: kv };
  assert.equal((await readLogState(env, new Date(lastQuiet))).renewNow, false);
  const s = await readLogState(env, new Date(first));
  assert.equal(s.renewNow, true);
  assert.equal(s.failing, false);
  const lines = readLogLines(s, first);
  assert.deepEqual(lines.map((l) => [l.key, l.tone, l.n]), [['readlog-key', 'warn', 1]]);
  assert.equal(lines[0].words, 'The logs key ends on 14 Nov 2027. In Supabase, make a new “Logs read” token for the MettleUp project '
    + 'and paste it into Add a key as SUPABASE_LOGS_TOKEN. Then tell Claude its end date.');
  assert.match(readLogLines(s, Date.parse('2027-11-15T06:00:00Z'))[0].words, /^The logs key ended on 14 Nov 2027\./);
  assert.equal(readLogOk(200, JSON.stringify(s)), true, 'a reminder is not an outage');

  let nowMs = first;
  const w = watchWorld(() => readLogStatus(env, new Date(nowMs)));
  await watch(w, nowMs);
  assert.equal(w.state.issues.length, 1);
  const [r] = w.state.issues;
  assert.equal(r.title, 'Reminder: the Supabase logs key ends on 14 Nov 2027');
  assert.deepEqual(r.labels, ['key-reminder']);
  assert.match(r.body, /make a new "Logs read" token for the MettleUp project\.\n- Paste it into Add a key as SUPABASE_LOGS_TOKEN\./);
  assert.match(r.body, /@aucksy/);
  nowMs += 24 * 60 * MIN;
  await watch(w, nowMs);
  assert.equal(w.state.issues.length, 1, 'once, not every day');
  r.state = 'closed';
  await watch(w, nowMs + 10 * MIN);
  assert.equal(w.state.issues.length, 1, 'closed by the owner: not opened again for the same date');
  // A new key: its end date in wrangler.jsonc, HQ deployed. An open reminder closes itself.
  r.state = 'open';
  env = { ...env, SUPABASE_LOGS_TOKEN_EXPIRES: '2028-11-13' };
  await watch(w, nowMs + 20 * MIN);
  assert.equal(r.state, 'closed');
  assert.match(r.comments[0], /A new end date is saved for the logs key \(2028-11-13/);
  assert.deepEqual(reminderPlan({ on: false }, [r]), { open: null, close: [] });
  assert.equal(reminderTitle('2028-11-13'), 'Reminder: the Supabase logs key ends on 13 Nov 2028');
});

test('no logs key saved: a calm grey line on HQ, never an email, nothing written', async () => {
  const kv = fakeKv();
  const env = { ...ON, SUPABASE_LOGS_TOKEN: '', BACKUP: kv };
  assert.deepEqual(await readLogState(env, new Date(T0)), { on: false });
  await quietly(() => noteReadLogRun(env, { calls: 0, skipped: 'off' }, T0));
  assert.equal(kv.writes, 0);
  const lines = readLogLines({ on: false });
  assert.deepEqual(lines.map((l) => [l.key, l.tone, l.n, l.words]), [['readlog-off', 'muted', 0, 'Read log is off: no logs key saved.']]);
  assert.equal(needsTotal({ readLog: { on: false } }), 0, 'not counted');
  assert.deepEqual(needsLines({ readLog: { on: false } }), [], 'not on Needs you');
  const w = watchWorld(() => readLogStatus(env, new Date(T0 + 5 * 60 * MIN)));
  await watch(w, T0 + 5 * 60 * MIN);
  assert.equal(w.state.posts, 0);
  assert.equal(readLogOk(200, '<html>sign in</html>'), true, 'HQ not deployed yet: no alarm');
});

test('/readlog/status: public, only the state, with the strict headers; an alert older than an hour is real time', async () => {
  const kv = fakeKv();
  kv.data.set(HEALTH_KEY, JSON.stringify({ failingSince: new Date(Date.now() - ALERT_AFTER_MS - MIN).toISOString(), why: 'unreachable' }));
  const res = await worker.fetch(new Request('https://hq.mettleup.fit/readlog/status'), { ...ON, BACKUP: kv }, {});
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Security-Policy'), /default-src 'self'/);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['failing', 'failingSince', 'keyEnds', 'on', 'renewNow', 'why']);
  assert.equal(body.failing, true);
  assert.equal(body.why, 'unreachable');
  const off = await (await worker.fetch(new Request('https://hq.mettleup.fit/readlog/status'), { ...ON, SUPABASE_LOGS_TOKEN: '' }, {})).json();
  assert.deepEqual(off, { on: false });
});

test('the every-minute run notes a failed pull at :03 (and only then)', async () => {
  const kv = fakeKv();
  const env = { ...ON, BACKUP: kv };
  const fetchImpl = async (url) => {
    const u = new URL(String(url));
    if (u.hostname === 'api.supabase.com') return new Response('{"message":"Unauthorized"}', { status: 401 });
    if (u.pathname === '/rest/v1/rpc/hq_db_reads_cursor') return new Response(JSON.stringify({ coveredTo: '2026-11-16T08:30:00.000Z' }), { status: 200 });
    if (u.pathname === '/rest/v1/rpc/hq_db_reads_ingest') return new Response('{"added":0,"dropped":0,"auditOn":true}', { status: 200 });
    return new Response('[]', { status: 200 });
  };
  await quietly(() => everyMinute(env, { fetchImpl, now: () => T0 + MIN }));
  assert.equal(kv.writes, 0, ':44 is not a read-log minute');
  await quietly(() => everyMinute(env, { fetchImpl, now: () => T0 }));
  assert.deepEqual(JSON.parse(kv.data.get(HEALTH_KEY)), { failingSince: '2026-11-16T08:43:00.000Z', why: 'key' });
});
