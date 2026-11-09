// node --test deploy/hq  (CI: ci.yml "HQ Worker tests"). The nightly backup (backup.js), 3 Nov 2026.
// Supabase and KV are stand-ins; nothing real is reached.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FRESH_HOURS, KEEP_SECONDS, backupStatus, indiaDay, readParts, runBackup } from './backup.js';
import worker from './worker.js';

const HQ_KEY = 'sb_secret_test_hq_key_never_shown';
const NIGHT = new Date('2026-11-03T21:30:00Z'); // 03:00 on 4 Nov, India

/** A KV namespace in memory, with the options each put was given. */
function fakeKv({ failPut = false } = {}) {
  const data = new Map();
  const opts = new Map();
  return {
    data,
    opts,
    async get(key, type) {
      if (!data.has(key)) return null;
      const v = data.get(key);
      return type === 'json' ? JSON.parse(typeof v === 'string' ? v : new TextDecoder().decode(v)) : v;
    },
    async put(key, value, o) {
      if (failPut) throw new Error('KV down');
      data.set(key, value);
      opts.set(key, o);
    },
  };
}

/** The gym server, answering hq_backup_snapshot with `body` (a string), in chunks of `chunk` bytes. */
function fakeDb(body, { status = 200, chunk = 7, calls = [] } = {}) {
  return async (url, init) => {
    calls.push({ url, init });
    if (status !== 200) return new Response(body, { status });
    const bytes = new TextEncoder().encode(body);
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += chunk) c.enqueue(bytes.slice(i, i + chunk));
        c.close();
      },
    });
    return new Response(stream, { status: 200 });
  };
}

const env = (extra = {}) => ({ SUPABASE_URL: 'https://db.example', SUPABASE_HQ_KEY: HQ_KEY, ...extra });
const quiet = async (fn) => {
  const was = [console.warn, console.error, console.log];
  console.warn = console.error = console.log = () => {};
  try {
    return await fn();
  } finally {
    [console.warn, console.error, console.log] = was;
  }
};
const join = (kv, day, n) => {
  const chunks = [];
  for (let i = 0; i < n; i++) chunks.push(...kv.data.get(`snap/${day}/part/${i}`));
  return new TextDecoder().decode(new Uint8Array(chunks));
};

test('a night: one call with the HQ key, the copy stored byte for byte, kept 7 days, status written last', async () => {
  const snap = JSON.stringify({ format: 'mettleup-backup-1', counts: { gyms: 1 }, tables: { gyms: [{ name: 'Iron "Temple" ₹' }] } });
  const calls = [];
  const kv = fakeKv();
  const out = await quiet(() => runBackup(env({ BACKUP: kv }), { fetchImpl: fakeDb(snap, { calls }), now: NIGHT }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://db.example/rest/v1/rpc/hq_backup_snapshot');
  assert.equal(calls[0].init.headers.apikey, HQ_KEY);
  assert.equal(out.ok, true);
  assert.equal(out.day, '2026-11-04');
  assert.equal(join(kv, '2026-11-04', out.parts), snap);
  const meta = JSON.parse(kv.data.get('snap/2026-11-04/meta'));
  assert.equal(meta.bytes, new TextEncoder().encode(snap).length);
  assert.equal(kv.opts.get('snap/2026-11-04/part/0').expirationTtl, KEEP_SECONDS);
  assert.equal(kv.opts.get('snap/2026-11-04/meta').expirationTtl, KEEP_SECONDS);
  assert.equal(KEEP_SECONDS, 7 * 86400); // never past the 7 days the privacy page promises
  assert.deepEqual([...kv.data.keys()].at(-1), 'status');
  const status = JSON.parse(kv.data.get('status'));
  assert.equal(status.ok, true);
  assert.equal(status.lastGoodDay, '2026-11-04');
  assert.equal(JSON.stringify(status).includes(HQ_KEY), false);
});

test('a big copy is split into parts that join back exactly', async () => {
  const body = new TextEncoder().encode(`{"x":"${'a'.repeat(95)}"}`);
  const stream = new ReadableStream({ start(c) { c.enqueue(body.slice(0, 33)); c.enqueue(body.slice(33)); c.close(); } });
  const { parts, total } = await readParts(stream, 40);
  assert.equal(total, body.length);
  assert.deepEqual(parts.map((p) => p.length), [40, 40, body.length - 80]);
  assert.deepEqual(new Uint8Array(parts.flatMap((p) => [...p])), body);
  // An empty answer is one empty part (and is then refused as incomplete).
  assert.equal((await readParts(new Response('').body, 40)).parts.length, 1);
});

test('failures: never throw, keep the last good copy, say why in status', async () => {
  const kv = fakeKv();
  await quiet(() => runBackup(env({ BACKUP: kv }), { fetchImpl: fakeDb('{"format":"mettleup-backup-1","tables":{}}'), now: NIGHT }));
  const good = JSON.parse(kv.data.get('status')).lastGoodAt;
  const cases = [
    [fakeDb('{"code":"PGRST202","message":"not found"}', { status: 404 }), /NOT_READY/],
    [fakeDb('oops', { status: 500 }), /answered 500/],
    [fakeDb('{"format":"mettleup-backup-1","tables":{"gyms":[{'), /incomplete/],
    [async () => { throw new Error('network'); }, /unreachable/],
  ];
  for (const [fetchImpl, why] of cases) {
    const out = await quiet(() => runBackup(env({ BACKUP: kv }), { fetchImpl, now: new Date(NIGHT.getTime() + 86400000) }));
    assert.equal(out.ok, false);
    assert.match(out.error, why);
    const s = JSON.parse(kv.data.get('status'));
    assert.equal(s.ok, false);
    assert.equal(s.lastGoodAt, good);
  }
  assert.equal(kv.data.has('snap/2026-11-05/meta'), false, 'no meta for a failed night');
  // KV itself down: still no throw.
  const down = await quiet(() => runBackup(env({ BACKUP: fakeKv({ failPut: true }) }), { fetchImpl: fakeDb('{"a":1,"b":"cdefghijklmnop"}'), now: NIGHT }));
  assert.equal(down.ok, false);
  // Not set up (no KV namespace yet): nothing is called.
  const calls = [];
  assert.deepEqual(await quiet(() => runBackup(env(), { fetchImpl: fakeDb('{}', { calls }), now: NIGHT })), { ok: false, error: 'NOT_SET_UP' });
  assert.equal(calls.length, 0);
});

test('/backup/status: public, only fresh or not and when; waits 30 h for the first night, then alarms', async () => {
  assert.deepEqual(await (await backupStatus(env(), NIGHT)).json(), { setUp: false, fresh: false });
  const kv = fakeKv();
  const first = await (await backupStatus(env({ BACKUP: kv }), NIGHT)).json();
  assert.equal(first.fresh, true, 'just deployed: no alarm yet');
  const later = new Date(NIGHT.getTime() + (FRESH_HOURS + 1) * 3600000);
  assert.equal((await (await backupStatus(env({ BACKUP: kv }), later)).json()).fresh, false, 'no night ever ran');
  await quiet(() => runBackup(env({ BACKUP: kv }), { fetchImpl: fakeDb('{"format":"mettleup-backup-1","tables":{}}'), now: later }));
  const after = await (await backupStatus(env({ BACKUP: kv }), new Date(later.getTime() + 3600000))).json();
  assert.deepEqual(Object.keys(after).sort(), ['fresh', 'lastGoodAt', 'lastRunOk', 'setUp']);
  assert.equal(after.fresh, true);
  assert.equal(after.lastRunOk, true);
  // Through the Worker, signed out, with the strict headers.
  const res = await worker.fetch(new Request('https://hq.mettleup.fit/backup/status'), env({ BACKUP: kv }), {});
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Security-Policy'), /default-src 'self'/);
  assert.equal(typeof (await res.json()).fresh, 'boolean');
});

test('the Cron Trigger at 03:00 runs the backup first, then the clean-up', async () => {
  const order = [];
  const fetchImpl = async (url) => {
    order.push(url.split('/rpc/')[1]);
    if (url.endsWith('hq_backup_snapshot')) return new Response('{"format":"mettleup-backup-1","tables":{}}');
    return new Response('{"ok":true}');
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const waits = [];
    await worker.scheduled({ cron: '30 21 * * *' }, env({ BACKUP: fakeKv(), HQ_ALLOWED_EMAIL: 'o@example.com' }), { waitUntil: (p) => waits.push(p) });
    await quiet(() => Promise.all(waits));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(order, ['hq_backup_snapshot', 'hq_nightly_cleanup', 'hq_purge_qa_gyms']); // the test-gym purge last (R-423)
  assert.equal(indiaDay(new Date('2026-11-03T18:29:00Z')), '2026-11-03');
  assert.equal(indiaDay(new Date('2026-11-03T18:31:00Z')), '2026-11-04');
});
