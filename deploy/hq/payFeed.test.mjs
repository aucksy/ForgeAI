// node --test deploy/hq  (CI: ci.yml "HQ Worker tests"). R-507: the desk's fee requests become member notes
// (payFeed.js). D1 is a real SQLite database built from the real migrations; the gym server is a stand-in.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { sqliteD1 } from '../panel/sqliteD1.mjs';
import { FEED_WINDOW_MS, feedFeeRequests, feeItems, resetPayFeed } from './payFeed.js';
import { everyMinute } from './worker.js';

const GYM = '11111111-2222-3333-4444-555555555555';
const NOW = Date.parse('2026-11-14T06:00:00.000Z');

beforeEach(() => resetPayFeed());

function addRequest(db, { id, kind = 'fee', member = 'r-asha', status = 'open', label = 'Monthly plan', at = NOW - 60_000 }) {
  db.sqlite
    .prepare('INSERT INTO pay_requests (id, gym_id, kind, member_id, amount_p, label, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, GYM, kind, member, 150000, label, status, new Date(at).toISOString());
}

function server(answer = () => ({ ok: true, notes: 1 })) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    if (u === 'https://db.test/rest/v1/rpc/hq_fee_request_notes') {
      assert.equal(init.headers.apikey, 'hq-key');
      const body = JSON.parse(init.body);
      calls.push(body.p_items);
      const a = answer(body.p_items);
      return new Response(JSON.stringify(a.body ?? a), { status: a.status ?? 200 });
    }
    throw new Error(`unexpected call ${u}`);
  };
  return { fetchImpl, calls };
}

test('only open fee requests of the last minutes go, with the list id and the label, never the amount', async () => {
  const db = sqliteD1();
  addRequest(db, { id: 'pr_aaaaaaaa01' });
  addRequest(db, { id: 'pr_aaaaaaaa02', status: 'paid' });
  addRequest(db, { id: 'pr_aaaaaaaa03', kind: 'shop', member: '' });
  addRequest(db, { id: 'pr_aaaaaaaa04', at: NOW - FEED_WINDOW_MS - 60_000 });
  const { fetchImpl, calls } = server();
  const env = { WEB: db, SUPABASE_URL: 'https://db.test', SUPABASE_HQ_KEY: 'hq-key' };
  assert.deepEqual(await feedFeeRequests(env, { fetchImpl, now: NOW }), { fees: 1, notes: 1 });
  assert.deepEqual(calls, [[{ id: 'pr_aaaaaaaa01', gymId: GYM, rosterId: 'r-asha', label: 'Monthly plan' }]]);
  assert.ok(!JSON.stringify(calls).includes('150000'));
});

test('a request handed once is not handed again by this copy; a new one is', async () => {
  const db = sqliteD1();
  addRequest(db, { id: 'pr_bbbbbbbb01' });
  const { fetchImpl, calls } = server();
  const env = { WEB: db, SUPABASE_URL: 'https://db.test', SUPABASE_HQ_KEY: 'hq-key' };
  await feedFeeRequests(env, { fetchImpl, now: NOW });
  assert.deepEqual(await feedFeeRequests(env, { fetchImpl, now: NOW + 60_000 }), { fees: 0, notes: 0 });
  addRequest(db, { id: 'pr_bbbbbbbb02', at: NOW + 30_000 });
  await feedFeeRequests(env, { fetchImpl, now: NOW + 120_000 });
  assert.deepEqual(calls.map((c) => c.map((x) => x.id)), [['pr_bbbbbbbb01'], ['pr_bbbbbbbb02']]);
});

test('a failed hand is tried again by the next run; the server not ready yet is quiet', async () => {
  const db = sqliteD1();
  addRequest(db, { id: 'pr_cccccccc01' });
  const env = { WEB: db, SUPABASE_URL: 'https://db.test', SUPABASE_HQ_KEY: 'hq-key' };
  const down = server(() => ({ status: 503, body: { message: 'down' } }));
  assert.deepEqual(await feedFeeRequests(env, { fetchImpl: down.fetchImpl, now: NOW }), { skipped: 'error' });
  const notReady = server(() => ({ status: 404, body: { code: 'PGRST202', message: 'no function' } }));
  assert.deepEqual(await feedFeeRequests(env, { fetchImpl: notReady.fetchImpl, now: NOW }), { skipped: 'not-ready' });
  const up = server();
  assert.deepEqual(await feedFeeRequests(env, { fetchImpl: up.fetchImpl, now: NOW + 60_000 }), { fees: 1, notes: 1 });
});

test('off without D1 or the server key; a broken D1 never throws', async () => {
  assert.deepEqual(await feedFeeRequests({ SUPABASE_URL: 'x', SUPABASE_HQ_KEY: 'y' }), { skipped: 'off' });
  assert.deepEqual(await feedFeeRequests({ WEB: sqliteD1() }), { skipped: 'off' });
  const broken = { prepare: () => { throw new Error('no such table'); } };
  assert.deepEqual(await feedFeeRequests({ WEB: broken, SUPABASE_URL: 'x', SUPABASE_HQ_KEY: 'y' }), { skipped: 'd1' });
});

test('feeItems drops rows that are not a request of a gym member', () => {
  assert.deepEqual(
    feeItems([
      { id: 'pr_dddddddd01', gym_id: GYM, member_id: 'r1', label: 'Monthly' },
      { id: 'x', gym_id: GYM, member_id: 'r1' },
      { id: 'pr_dddddddd02', gym_id: 'not-a-gym', member_id: 'r1' },
      { id: 'pr_dddddddd03', gym_id: GYM, member_id: '' },
      null,
    ]),
    [{ id: 'pr_dddddddd01', gymId: GYM, rosterId: 'r1', label: 'Monthly' }],
  );
});

test('the every-minute run feeds the fee requests, then still sends the phone pop-ups', async () => {
  const db = sqliteD1();
  addRequest(db, { id: 'pr_eeeeeeee01', at: Date.now() - 60_000 });
  const { fetchImpl, calls } = server();
  // No FCM key: the pop-up part stops at once, as it does live without the secret.
  const out = await everyMinute({ WEB: db, SUPABASE_URL: 'https://db.test', SUPABASE_HQ_KEY: 'hq-key' }, { fetchImpl });
  assert.deepEqual(out, { skipped: 'no-secret' });
  assert.equal(calls.length, 1);
});
