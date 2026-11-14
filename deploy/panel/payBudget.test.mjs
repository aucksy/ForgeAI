// node --test deploy/panel (CI: ci.yml "Panel Worker tests"). Payment review round 4 (R-554, 14 Nov 2026): the owner
// keeps the panel Worker on Cloudflare's FREE plan, so every invocation (each HTTP request, each cron run) must stay
// under 50 D1 queries ("a db.batch() call counts as a single query") and 50 outside calls; we aim for 40 of each. Each
// test name starts with its TEST-MATRIX.md row (R4-n). No real payment company or gym server is called: all faked here.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { attachJoinPay, handleJoinPay } from './joinPay.js';
import { d1Meter, handlePay, notThisAccount, scheduledPay } from './pay.js';
import { seal, unseal } from './payCrypto.js';
import { PayError } from './payProviders.js';
import { sqliteD1 } from './sqliteD1.mjs';

const MASTER = Buffer.alloc(32, 7).toString('base64');
const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const OWNER_KEY = 'owner-key-0123456789abcdef';
const DESK_KEY = 'desk-key-0123456789abcdef';
const MEMBER_KEY = 'member-key-0123456789abcdef';
const RZP_ID = 'rzp_test_AbCdEf123456';
const RZP_SECRET = 'SeCrEtVaLuE9876543210xyz';
const RZP_NEW = 'rzp_test_OtherAcct99999';
const PHONE = '9000081001';
const PROOF = `v1.join.${PHONE}.1999999999.${'a'.repeat(32)}.${'b'.repeat(64)}`;
const T0 = Date.parse('2026-11-14T06:00:00Z');
const DAY = 86400000;
const BUDGET = 40;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const iso = (ms) => new Date(ms).toISOString();
const rid = (n) => `pr_${String(n).padStart(20, '0')}`;

/** Runs fn with the console silenced (the Worker logs every step). */
const quiet = (fn) => async () => {
  const keep = { warn: console.warn, error: console.error, log: console.log };
  console.warn = console.error = console.log = () => {};
  try {
    await fn();
  } finally {
    Object.assign(console, keep);
  }
};

function env(extra = {}) {
  return { WEB: sqliteD1(), PAYMENTS_MASTER_KEY: MASTER, PHONE_CODE_SECRET: SECRET, ...extra };
}

/**
 * Every company (Razorpay, Cashfree, PhonePe) and the gym server, over ONE fake fetch. `co.calls` counts every outside
 * call. Razorpay: each Key ID is its own account and sees only its links (co.rzp[id] = { acct, status, payments }).
 * Cashfree: each App ID (or OAuth token) sees only its links. PhonePe: each Client ID sees only its orders.
 */
function world(co = {}) {
  co.rzp = co.rzp || {};
  co.cf = co.cf || {};
  co.pp = co.pp || {};
  co.cancelled = [];
  co.cancelledWith = [];
  co.calls = 0;
  co.urls = [];
  let made = 0;
  const f = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    const h = init.headers || {};
    co.calls += 1;
    co.urls.push(`${method} ${u}`);
    if (u.endsWith('/rpc/staff_me')) {
      const { p_key } = JSON.parse(init.body);
      if (p_key === OWNER_KEY) return json({ gymId: 'gym-1', name: 'Shakti Gym', person: { role: 'owner' } });
      if (p_key === DESK_KEY) return json({ gymId: 'gym-1', name: 'Shakti Gym', person: { role: 'staff' } });
      return json({ message: 'BAD_KEY' }, 400);
    }
    if (u.endsWith('/rpc/member_pay_me')) {
      return JSON.parse(init.body).p_key === MEMBER_KEY ? json({ gymId: 'gym-1', memberId: 'app-1', rosterId: 'm-1', name: 'Asha' }) : json({ message: 'BAD_KEY' }, 400);
    }
    let m;
    if (/api\.razorpay\.com/.test(u)) {
      const keyId = Buffer.from(String(h.Authorization || '').replace(/^Basic /, ''), 'base64').toString().split(':')[0];
      if (/\/payment_links\?count=1$/.test(u)) return json({ items: [] });
      if (/\/payment_links$/.test(u) && method === 'POST') {
        made += 1;
        const id = `plink_n${made}`;
        co.rzp[id] = { acct: keyId, status: 'created', payments: [] };
        return json({ id, short_url: `https://rzp.io/i/${id}`, status: 'created' });
      }
      if ((m = /\/payment_links\/([^/]+)\/cancel$/.exec(u))) {
        const l = co.rzp[m[1]];
        if (!l || l.acct !== keyId) return json({ error: { description: 'The id provided does not exist' } }, 400);
        l.status = 'cancelled';
        co.cancelled.push(m[1]);
        co.cancelledWith.push(keyId);
        return json({ id: m[1], status: 'cancelled' });
      }
      if ((m = /\/payment_links\/([^/?]+)$/.exec(u))) {
        if (co.rzpGetFails && co.rzpGetFails.keyId === keyId) return json({ error: { description: 'try later' } }, co.rzpGetFails.status);
        const l = co.rzp[m[1]];
        if (!l || l.acct !== keyId) return json({ error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } }, 400);
        return json({ id: m[1], status: l.status, amount: 200000, amount_paid: l.status === 'paid' ? 200000 : 0, payments: l.payments });
      }
      if (/\/payments\/pay_/.test(u)) return json({ error: { description: 'The id provided does not exist' } }, 400);
    }
    if (/cashfree\.com/.test(u)) {
      if (/\/partners\/oauth\/token$/.test(u)) {
        const b = JSON.parse(init.body);
        co.cfRefreshed = (co.cfRefreshed || []).concat(b.refresh_token);
        return json({ access_token: `${b.refresh_token}_fresh`, refresh_token: b.refresh_token, expires_in: 86400 });
      }
      const app = h['x-client-id'] || (co.cfTokens || {})[String(h.Authorization || '').replace(/^Bearer /, '')];
      if (/\/pg\/links$/.test(u) && method === 'POST') {
        const b = JSON.parse(init.body);
        co.cf[b.link_id] = { app, status: 'ACTIVE', amount: b.link_amount };
        return json({ link_id: b.link_id, link_url: `https://payments-test.cashfree.com/links/${b.link_id}` });
      }
      if ((m = /\/pg\/links\/([^/]+)\/cancel$/.exec(u))) {
        const l = co.cf[m[1]];
        if (!l || l.app !== app) return json({ message: 'link does not exist' }, 404);
        l.status = 'CANCELLED';
        co.cancelled.push(m[1]);
        return json({ link_id: m[1], link_status: 'CANCELLED' });
      }
      if ((m = /\/pg\/links\/([^/]+)\/orders/.exec(u))) return json([{ order_id: `o_${m[1]}`, order_status: 'PAID' }]);
      if ((m = /\/pg\/orders\/o_([^/]+)\/payments$/.exec(u))) return json([{ cf_payment_id: `cfp_${m[1]}`, payment_status: 'SUCCESS', payment_amount: 2000, payment_group: 'upi' }]);
      if (/\/refunds$/.test(u)) return json([]);
      if ((m = /\/pg\/links\/([^/?]+)$/.exec(u))) {
        const l = co.cf[m[1]];
        if (!l || l.app !== app) return json({ message: 'link does not exist' }, 404);
        return json({ link_id: m[1], link_status: l.status, link_amount: l.amount, link_amount_paid: l.status === 'PAID' ? l.amount : 0 });
      }
    }
    if (/phonepe\.com/.test(u)) {
      if (/\/v1\/oauth\/token$/.test(u)) return json({ access_token: `tok_${new URLSearchParams(init.body).get('client_id')}` });
      const client = String(h.Authorization || '').replace(/^O-Bearer tok_/, '');
      if (/\/checkout\/v2\/pay$/.test(u)) {
        const b = JSON.parse(init.body);
        co.pp[b.merchantOrderId] = { client, state: 'PENDING', amount: b.amount };
        return json({ redirectUrl: `https://mercury.phonepe.com/pay/${b.merchantOrderId}`, expireAt: T0 + 3600000 });
      }
      if ((m = /\/checkout\/v2\/order\/([^/]+)\/status$/.exec(u))) {
        const o = co.pp[decodeURIComponent(m[1])];
        if (!o || o.client !== client) return json({ code: 'NOT_FOUND', message: 'order not found' }, 404);
        return json({ orderId: `OMO_${m[1]}`, state: o.state, amount: o.amount, paymentDetails: o.state === 'COMPLETED' ? [{ transactionId: `T_${m[1]}`, state: 'COMPLETED', amount: o.amount, paymentMode: 'UPI_QR' }] : [] });
      }
    }
    return json({ error: 'no route ' + u }, 599);
  };
  return { f, co };
}

const req = (path, body, headers = {}) => new Request(`https://app.mettleup.fit${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });

/** One HTTP request = one invocation: its answer, and how many D1 queries and outside calls it made. */
async function desk(e, w, path, body, now = T0 + 60000, headers = {}) {
  e.WEB.countFrom();
  const before = w.co.calls;
  const r = req(path, body, headers);
  const res = await handlePay(r, e, new URL(r.url), { fetch: w.f, now });
  return { status: res.status, body: await res.json(), d1: e.WEB.queries, calls: w.co.calls - before };
}

/** One cron run = one invocation. */
async function cron(e, w, now) {
  e.WEB.countFrom();
  const before = w.co.calls;
  const paid = await scheduledPay(e, { f: w.f, now });
  return { paid, d1: e.WEB.queries, calls: w.co.calls - before };
}

function within(r, what) {
  assert.ok(r.d1 <= BUDGET, `${what}: ${r.d1} D1 queries (most ${BUDGET})`);
  assert.ok(r.calls <= BUDGET, `${what}: ${r.calls} outside calls (most ${BUDGET})`);
}

async function addConn(e, o = {}) {
  await e.WEB.prepare(
    `INSERT INTO pay_connections (gym_id, provider, mode, via, creds, hint, account, hook, status, off_reason, connected_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '3456', ?, ?, ?, ?, '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z')`,
  )
    .bind(o.gymId || 'gym-1', o.provider || 'razorpay', o.mode || 'test', o.via || 'keys', await seal(e, o.creds || { keyId: RZP_ID, keySecret: RZP_SECRET }), o.account || '', o.hook || `hook-${o.gymId || 'gym-1'}-${o.provider || 'razorpay'}-0123`, o.status || 'on', o.offReason || '')
    .run();
}

async function addRow(e, o) {
  await e.WEB.prepare(
    `INSERT INTO pay_requests (id, gym_id, kind, member_id, ref, amount_p, upi, provider, mode, link_id, link_url, status, paid_p, paid_at, checked_at, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      o.id,
      o.gymId || 'gym-1',
      o.kind || 'fee',
      o.kind === 'join' ? '' : 'm-1',
      o.ref || `ms-${o.id}`,
      o.amountP || 200000,
      o.upi || '',
      o.provider ?? 'razorpay',
      o.provider === '' ? '' : o.mode || 'test',
      o.linkId ?? o.id,
      o.provider === '' ? '' : `https://pay.example/${o.linkId ?? o.id}`,
      o.status || 'open',
      o.paidP || 0,
      o.paidAt || '',
      o.checkedAt ?? '',
      o.createdAt || iso(T0),
      o.expiresAt || iso(T0 + 7 * DAY),
    )
    .run();
  return o.id;
}
const rowOf = (e, id) => e.WEB.prepare('SELECT * FROM pay_requests WHERE id = ?').bind(id).first();
const count = async (e, where) => (await e.WEB.prepare(`SELECT COUNT(*) AS n FROM pay_requests WHERE ${where}`).first()).n;

/** `n` open Razorpay links of the account `acct` (default: the gym's keys), rows pr_..1 to pr_..n. */
async function openLinks(e, w, n, acct = RZP_ID, o = {}) {
  for (let i = 1; i <= n; i += 1) {
    w.co.rzp[`plink_${i}`] = { acct, status: o.linkStatus || 'created', payments: [] };
    await addRow(e, { id: rid(i), linkId: `plink_${i}`, createdAt: iso(T0 - i * 1000), ...o.row });
  }
}

// ================================================================== 1. a staff key cannot point a payment at their own UPI ID

test('R4-1 a staff key cannot make a member pay its own UPI ID: the request uses the gym saved UPI ID and payee', quiet(async () => {
  const e = env();
  const w = world();
  const ask = (key, ref, extra = {}) => desk(e, w, '/api/pay/request', { key, kind: 'fee', memberId: 'm-1', ref, amountP: 150000, label: 'Monthly', note: 'R-1', online: false, ...extra });
  // No UPI ID saved by the owner yet: a staff request carries none at all (never the one it sent).
  const none = await ask(DESK_KEY, 'ms-1', { upiId: 'thief@okaxis', payee: 'Thief' });
  assert.deepEqual([none.status, none.body.request.upiId, none.body.request.payee], [200, null, 'Shakti Gym']);
  await e.WEB.prepare("INSERT INTO pay_gyms (gym_id, upi, payee, updated_at) VALUES ('gym-1', 'shaktigym@okhdfc', 'Shakti Gym', ?)").bind(iso(T0)).run();
  const staff = await ask(DESK_KEY, 'ms-2', { upiId: 'thief@okaxis', payee: 'Thief' });
  assert.deepEqual([staff.body.request.upiId, staff.body.request.payee], ['shaktigym@okhdfc', 'Shakti Gym'], "the staff key's UPI ID and payee are ignored");
  assert.equal((await rowOf(e, staff.body.request.id)).upi, 'shaktigym@okhdfc');
  // The member's app shows the same, never the staff's.
  const mine = await desk(e, w, '/api/pay/mine', { memberKey: MEMBER_KEY });
  assert.ok(mine.body.requests.every((r) => r.upiId !== 'thief@okaxis' && r.payee !== 'Thief'));
  // The owner's own request still uses what the owner's app sends.
  const owner = await ask(OWNER_KEY, 'ms-3', { upiId: 'owner.new@okicici', payee: 'Shakti Gym Main' });
  assert.deepEqual([owner.body.request.upiId, owner.body.request.payee], ['owner.new@okicici', 'Shakti Gym Main']);
}));

// ================================================================== 2. every path within 40 D1 queries and 40 outside calls

test('R4-2 the test helper counts D1 queries the way Cloudflare does: one batch is one query', async () => {
  const e = env();
  e.WEB.countFrom();
  await e.WEB.prepare('SELECT 1').all();
  await e.WEB.batch([e.WEB.prepare('SELECT 1'), e.WEB.prepare('SELECT 2'), e.WEB.prepare('SELECT 3')]);
  assert.equal(e.WEB.queries, 2);
  const m = d1Meter(e.WEB, 40);
  await m.prepare('SELECT 1').bind().first();
  await m.batch([m.prepare('SELECT 1'), m.prepare('SELECT 2')]);
  assert.deepEqual([m.d1Used(), m.d1Left(), e.WEB.queries], [2, 38, 4]);
  assert.equal(d1Meter(m), m, 'a counted database is not counted twice');
});

test('R4-3 the 10-minute check: 60 paid Cashfree links (4 calls each) of 3 gyms -> each run within 40/40; every one found in the end; kept keys still wiped every run', quiet(async () => {
  const e = env();
  const w = world();
  for (const g of ['gym-1', 'gym-2', 'gym-3']) {
    // Each gym's keys carry an old account's keys whose links are past watching: dropped (one write) on first use.
    await addConn(e, { gymId: g, provider: 'cashfree', creds: { appId: `CFAPP_${g}_1234`, secretKey: 'cfsk_ma_test_secret_0001', older: [{ keys: { appId: 'OLD' }, ids: [], until: iso(T0 - DAY) }] } });
  }
  for (let i = 1; i <= 60; i += 1) {
    const g = `gym-${(i % 3) + 1}`;
    w.co.cf[rid(i)] = { app: `CFAPP_${g}_1234`, status: 'PAID', amount: 2000 };
    await addRow(e, { id: rid(i), gymId: g, provider: 'cashfree', createdAt: iso(T0 - i * 1000) });
  }
  // A disconnected gym whose kept keys nothing needs any more: wiped on the FIRST run, however busy it is.
  await addConn(e, { gymId: 'gym-9', status: 'off', offReason: 'disconnected' });
  let found = 0;
  for (let run = 1; run <= 8 && found < 60; run += 1) {
    const r = await cron(e, w, T0 + run * 10 * 60000);
    within(r, `cron run ${run}`);
    found += r.paid;
    if (run === 1) assert.equal((await e.WEB.prepare("SELECT creds FROM pay_connections WHERE gym_id = 'gym-9'").first()).creds, '', 'wiped on the first run');
  }
  assert.equal(found, 60);
  assert.equal(await count(e, "status = 'paid'"), 60);
}));

test('R4-4 the 10-minute check, worst case for D1: 40 paid links of 40 different gyms (a re-seal each) -> within 40 queries; the rest wait their turn', quiet(async () => {
  const e = env();
  const w = world();
  for (let i = 1; i <= 50; i += 1) {
    const g = `gym-${i}`;
    await addConn(e, { gymId: g, hook: `hook-${i}-0123456789`, creds: { keyId: RZP_ID, keySecret: RZP_SECRET, older: [{ keys: { keyId: 'x' }, ids: [], until: iso(T0 - DAY) }] } });
    w.co.rzp[`plink_${i}`] = { acct: RZP_ID, status: 'paid', payments: [{ payment_id: `pay_${i}`, status: 'captured', amount: 200000, method: 'upi' }] };
    await addRow(e, { id: rid(i), gymId: g, linkId: `plink_${i}`, createdAt: iso(T0 - i * 1000) });
  }
  let found = 0;
  for (let run = 1; run <= 10 && found < 50; run += 1) {
    const r = await cron(e, w, T0 + run * 10 * 60000);
    within(r, `cron run ${run}`);
    found += r.paid;
  }
  assert.equal(found, 50, 'every one is found in the end');
}));

test("R4-5 Today's \"Joined online\": 10 paid Cashfree joins and 100 join payments (some said \"I have paid\") -> one look within 40/40", quiet(async () => {
  const e = env();
  const w = world();
  await addConn(e, { provider: 'cashfree', creds: { appId: 'CFAPP_A_12345678', secretKey: 'cfsk_ma_test_secret_A_0001' } });
  for (let i = 1; i <= 100; i += 1) {
    const company = i <= 10;
    if (company) w.co.cf[rid(i)] = { app: 'CFAPP_A_12345678', status: 'PAID', amount: 2000 };
    await addRow(e, { id: rid(i), kind: 'join', ref: `join-${i}`, provider: company ? 'cashfree' : '', upi: company ? '' : 'shaktigym@okhdfc', createdAt: iso(T0 - i * 1000) });
    if (!company && i % 2 === 0) await e.WEB.prepare('INSERT INTO pay_said (request_id, at) VALUES (?, ?)').bind(rid(i), iso(T0)).run();
  }
  const r = await desk(e, w, '/api/pay/joins', { key: DESK_KEY });
  within(r, "Today's Joined online");
  assert.equal(r.body.joins.length, 100);
  // A paid Cashfree link costs 4 calls to ask: 8 or more in one look, the rest on the next look.
  assert.ok(r.body.joins.filter((j) => j.status === 'paid').length >= 8, 'most found in one look');
  assert.equal(r.body.joins.filter((j) => j.said).length, 45, '"I have paid" read for every UPI payment, in the same query');
  const again = await desk(e, w, '/api/pay/joins', { key: DESK_KEY }, T0 + 120000);
  within(again, "Today's Joined online, second look");
  assert.equal(again.body.joins.filter((j) => j.status === 'paid').length, 10, 'all ten by the next look');
}));

test('R4-6 new keys of ANOTHER account with 60 open links: saved (never "FAILED"), within 40/40; the rest closed here and cancelled at the company with the old keys by the 10-minute check', quiet(async () => {
  const e = env();
  const w = world();
  await addConn(e);
  await openLinks(e, w, 60);
  const c = await desk(e, w, '/api/pay/connect', { key: OWNER_KEY, provider: 'razorpay', fields: { keyId: RZP_NEW, keySecret: 'AnotherSecretValue12345' } }, T0 + 60000);
  within(c, 'connect');
  assert.deepEqual([c.status, c.body.connection && c.body.connection.on], [200, true]);
  const creds = await unseal(e, (await e.WEB.prepare('SELECT creds FROM pay_connections').first()).creds);
  assert.equal(creds.keyId, RZP_NEW, 'the new keys are saved');
  assert.equal(creds.older[0].ids.length, 60, 'the old keys are kept for all 60 old links');
  assert.equal(await count(e, "status = 'open'"), 0, 'every old link is closed here');
  for (let run = 1; run <= 8; run += 1) within(await cron(e, w, T0 + run * 40 * 60000), `cron run ${run}`);
  assert.equal(new Set(w.co.cancelled).size, 60, 'every old link is cancelled at Razorpay');
  assert.ok(w.co.cancelledWith.every((k) => k === RZP_ID), 'always with the old keys');
}));

test('R4-7 disconnect with 60 open links: within 40/40, never "FAILED"; the rest are cancelled at the company by the 10-minute check, then the keys are wiped', quiet(async () => {
  const e = env();
  const w = world();
  await addConn(e);
  await openLinks(e, w, 60);
  const d = await desk(e, w, '/api/pay/disconnect', { key: OWNER_KEY, provider: 'razorpay' }, T0 + 60000);
  within(d, 'disconnect');
  assert.deepEqual([d.status, d.body.connection.on], [200, false]);
  for (let run = 1; run <= 10; run += 1) within(await cron(e, w, T0 + run * 40 * 60000), `cron run ${run}`);
  assert.equal(new Set(w.co.cancelled).size, 60);
  assert.equal((await e.WEB.prepare('SELECT creds FROM pay_connections').first()).creds, '', 'all settled: the kept keys are wiped');
}));

test('R4-8 every other payment path stays within 40/40 at its worst: check, request (5 open at other amounts), settle (10 open), cancel, webhook, Approve, member check', quiet(async () => {
  const e = env();
  const w = world();
  await addConn(e);
  // A new amount for a due with 5 open links at other amounts (a staff key).
  for (let i = 1; i <= 5; i += 1) {
    w.co.rzp[`plink_${i}`] = { acct: RZP_ID, status: 'created', payments: [] };
    await addRow(e, { id: rid(i), linkId: `plink_${i}`, ref: 'ms-1', amountP: 100000 + i, createdAt: iso(T0 - i * 1000) });
  }
  const r = await desk(e, w, '/api/pay/request', { key: DESK_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-1', amountP: 150000, label: 'Monthly', note: 'R-1', phone: PHONE });
  within(r, 'request');
  assert.equal(r.status, 200);
  assert.ok(r.body.request.url, 'the new link is made');
  assert.equal(await count(e, "ref = 'ms-1' AND status = 'open'"), 1, 'only the new one is open');
  // The desk takes cash for a due with 10 open links.
  for (let i = 11; i <= 20; i += 1) {
    w.co.rzp[`plink_${i}`] = { acct: RZP_ID, status: 'created', payments: [] };
    await addRow(e, { id: rid(i), linkId: `plink_${i}`, ref: 'ms-2', amountP: 100000 + i, createdAt: iso(T0 - i * 1000) });
  }
  const s = await desk(e, w, '/api/pay/settle', { key: DESK_KEY, kind: 'fee', ref: 'ms-2' });
  within(s, 'settle');
  assert.deepEqual([s.status, s.body.paidOnline, s.body.closed], [200, null, 10]);
  assert.equal(await count(e, "ref = 'ms-2' AND status = 'open'"), 0);
  // The desk's check, a cancel, the member's check.
  const id = r.body.request.id;
  within(await desk(e, w, '/api/pay/check', { key: DESK_KEY, id }), 'check');
  within(await desk(e, w, '/api/pay/member-check', { memberKey: MEMBER_KEY, id }), 'member check');
  // Paid, then Approve's three steps (the check just before Approve, claim, recorded) and a webhook.
  w.co.rzp[(await rowOf(e, id)).link_id].status = 'paid';
  w.co.rzp[(await rowOf(e, id)).link_id].payments = [{ payment_id: 'pay_x', status: 'captured', amount: 150000, method: 'upi' }];
  within(await desk(e, w, '/api/pay/check', { key: DESK_KEY, id, beforeApprove: true }), 'check before Approve (open)');
  within(await desk(e, w, '/api/pay/check', { key: DESK_KEY, id, beforeApprove: true }), 'check before Approve (paid)');
  const cl = await desk(e, w, '/api/pay/claim', { key: DESK_KEY, id });
  within(cl, 'claim');
  within(await desk(e, w, '/api/pay/recorded', { key: DESK_KEY, id, token: cl.body.token, receiptNo: 'R-9' }), 'recorded');
  const other = await desk(e, w, '/api/pay/request', { key: DESK_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-3', amountP: 90000, label: 'Monthly', note: 'R-2' });
  within(await desk(e, w, '/api/pay/cancel', { key: DESK_KEY, id: other.body.request.id }), 'cancel');
  const raw = JSON.stringify({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: 'plink_n9', reference_id: rid(1) } }, payment: { entity: { id: 'pay_y', amount: 100001 } } } });
  within(await desk(e, w, '/api/pay/hook/razorpay/hook-gym-1-razorpay-0123', raw, T0 + 60000, { 'x-razorpay-signature': 'bad' }), 'webhook');
}));

test('R4-9 the join page send with 5 older open payments for the request: within 40/40 together with the send itself', quiet(async () => {
  // R-555: join payments need JOIN_PAY "live", and a company link needs payments live (never a test link for the public).
  const e = env({ JOIN_PAY: 'live', PAY_LIVE: 'on' });
  const w = world();
  await addConn(e, { mode: 'live' });
  const EID = 'join-0a1b2c3d4e5f60718293a4b5c6d7e8f9';
  for (let i = 1; i <= 5; i += 1) {
    w.co.rzp[`plink_${i}`] = { acct: RZP_ID, status: 'created', payments: [] };
    await addRow(e, { id: rid(i), kind: 'join', ref: EID, linkId: `plink_${i}`, amountP: 100000 + i, createdAt: iso(T0 - i * 1000), mode: 'live' });
  }
  const rpc = async (fn) => (fn === 'self_join_pay_gym' ? { status: 200, data: { ok: true, gymId: 'gym-1' } } : { status: 404, data: null });
  e.WEB.countFrom();
  const out = await attachJoinPay(e, rpc, { code: 'QA0002', enquiryId: EID, totalP: 200000, planName: 'Monthly', gymName: 'Shakti Gym', name: 'Ravi', proof: PROOF }, { f: w.f, now: new Date(T0 + 60000) });
  assert.ok(out.pay && out.pay.url, 'the payment link is made');
  // The send itself (selfJoin.js) uses 2 D1 queries and about 3 outside calls before this.
  assert.ok(e.WEB.queries + 2 <= BUDGET, `${e.WEB.queries} D1 queries`);
  assert.ok(w.co.calls + 3 <= BUDGET, `${w.co.calls} outside calls`);
  assert.equal(await count(e, `ref = '${EID}' AND status = 'open'`), 1, 'never two open payments for one request');
  // The page asking about it.
  e.WEB.countFrom();
  const r = req('/api/self-join/pay-check', { id: out.pay.id });
  const res = await handleJoinPay(r, e, new URL(r.url), rpc, { fetch: w.f, now: T0 + 120000 });
  assert.equal(res.status, 200);
  assert.ok(e.WEB.queries <= BUDGET);
}));

// ================================================================== 3. "same account?" only from a clear answer

test('R4-10 new keys: only a clear "no such link" (400/404) means another account; no answer, a 5xx or a 429 stops the save with plain words', quiet(async () => {
  assert.equal(notThisAccount(new PayError('STATUS_REFUSED', '', 400)), true);
  assert.equal(notThisAccount(new PayError('STATUS_REFUSED', '', 404)), true);
  assert.equal(notThisAccount(new PayError('STATUS_REFUSED', '', 429)), false);
  assert.equal(notThisAccount(new PayError('UNREACHABLE')), false);
  assert.equal(notThisAccount(new Error('timeout')), false);
  for (const status of [503, 429]) {
    const e = env();
    const w = world({ rzpGetFails: { keyId: RZP_NEW, status } });
    await addConn(e);
    await openLinks(e, w, 2);
    const c = await desk(e, w, '/api/pay/connect', { key: OWNER_KEY, provider: 'razorpay', fields: { keyId: RZP_NEW, keySecret: 'AnotherSecretValue12345' } });
    assert.deepEqual([c.status, c.body.error, c.body.words], [503, 'CHECK_FAILED', 'Could not check with Razorpay. Try again.'], `HTTP ${status}`);
    assert.equal((await unseal(e, (await e.WEB.prepare('SELECT creds FROM pay_connections').first()).creds)).keyId, RZP_ID, 'the old keys stay');
    assert.equal(await count(e, "status = 'open'"), 2, 'no link was closed');
    assert.deepEqual(w.co.cancelled, []);
  }
  // A network failure (no answer at all) is the same.
  const e = env();
  const w = world();
  await addConn(e);
  await openLinks(e, w, 1);
  const down = async (url, init) => (String(url).includes('/payment_links/plink_') && String(init && init.headers && init.headers.Authorization).includes(Buffer.from(`${RZP_NEW}:`).toString('base64').slice(0, 20)) ? Promise.reject(new Error('fetch failed')) : w.f(url, init));
  e.WEB.countFrom();
  const r = req('/api/pay/connect', { key: OWNER_KEY, provider: 'razorpay', fields: { keyId: RZP_NEW, keySecret: 'AnotherSecretValue12345' } });
  const res = await handlePay(r, e, new URL(r.url), { fetch: down, now: T0 + 60000 });
  assert.equal((await res.json()).error, 'CHECK_FAILED');
  assert.equal(await count(e, "status = 'open'"), 1);
  // Razorpay's clear 400 "does not exist": another account, saved, the old link closed.
  const e2 = env();
  const w2 = world();
  await addConn(e2);
  await openLinks(e2, w2, 1);
  const ok2 = await desk(e2, w2, '/api/pay/connect', { key: OWNER_KEY, provider: 'razorpay', fields: { keyId: RZP_NEW, keySecret: 'AnotherSecretValue12345' } });
  assert.equal(ok2.status, 200);
  assert.deepEqual(w2.co.cancelled, ['plink_1']);
}));

// ================================================================== 4. PhonePe: a link made again is asked with the keys that made it

test('R4-11 PhonePe, keys of another account, then the old request page runs out and is made again: the new link is asked with the NEW keys and its payment found', quiet(async () => {
  const e = env();
  const w = world();
  await addConn(e, { provider: 'phonepe', creds: { clientId: 'PPCLIENT_A', clientVersion: '1', clientSecret: 'ppsecretA0123456' } });
  const made = await desk(e, w, '/api/pay/request', { key: OWNER_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-1', amountP: 150000, label: 'Monthly', note: 'R-1', upiId: '' });
  const id = made.body.request.id;
  assert.equal(w.co.pp[id].client, 'PPCLIENT_A');
  // The hour runs out at PhonePe; the owner pastes another PhonePe account's keys.
  w.co.pp[id].state = 'FAILED';
  const c = await desk(e, w, '/api/pay/connect', { key: OWNER_KEY, provider: 'phonepe', fields: { clientId: 'PPCLIENT_B', clientVersion: '1', clientSecret: 'ppsecretB0123456' } }, T0 + 120000);
  assert.equal(c.status, 200);
  assert.equal((await rowOf(e, id)).status, 'expired');
  // The member opens it again: a new page, made with the NEW keys.
  await desk(e, w, '/api/pay/member-check', { memberKey: MEMBER_KEY, id }, T0 + 180000);
  assert.equal(w.co.pp[`${id}-2`].client, 'PPCLIENT_B');
  const creds = await unseal(e, (await e.WEB.prepare("SELECT creds FROM pay_connections WHERE provider = 'phonepe'").first()).creds);
  assert.ok(!creds.older[0].ids.includes(id), 'the request is off the old account list');
  // They pay it: the desk's check finds it (asked with the new keys, never the old ones).
  w.co.pp[`${id}-2`].state = 'COMPLETED';
  const k = await desk(e, w, '/api/pay/check', { key: DESK_KEY, id }, T0 + 240000);
  assert.equal(k.body.request.status, 'paid');
}));

// ================================================================== 5a. an old account's webhook secret covers only its old links

test('R4-12 Cashfree after a switch of account: a notice signed with the OLD secret pays an old link, but never a request made with the new keys (and never switches the connection off)', quiet(async () => {
  const e = env();
  const w = world();
  const OLD_SECRET = 'cfsk_ma_test_secret_A_0001';
  await addConn(e, { provider: 'cashfree', hook: 'hook-cf-0123456789ab', creds: { appId: 'CFAPP_A_12345678', secretKey: OLD_SECRET } });
  const ask = (ref, now) => desk(e, w, '/api/pay/request', { key: OWNER_KEY, kind: 'fee', memberId: 'm-1', ref, amountP: 200000, label: 'Monthly', note: 'R-1', phone: PHONE }, now);
  const oldOne = (await ask('ms-1', T0 + 60000)).body.request.id;
  await desk(e, w, '/api/pay/connect', { key: OWNER_KEY, provider: 'cashfree', fields: { appId: 'CFAPP_B_87654321', secretKey: 'cfsk_ma_test_secret_B_0002' } }, T0 + 120000);
  const newOne = (await ask('ms-2', T0 + 180000)).body.request.id;
  assert.equal(w.co.cf[newOne].app, 'CFAPP_B_87654321');
  const signed = (linkId) => {
    const raw = JSON.stringify({ type: 'PAYMENT_LINK_EVENT', data: { link_id: linkId, link_status: 'PAID', link_amount: 2000, link_amount_paid: 2000, order: { transaction_id: `cft_${linkId}`, transaction_status: 'SUCCESS' } } });
    const ts = '1731564000';
    return { raw, headers: { 'x-webhook-signature': createHmac('sha256', OLD_SECRET).update(ts + raw).digest('base64'), 'x-webhook-timestamp': ts } };
  };
  const a = signed(newOne);
  assert.equal((await desk(e, w, '/api/pay/hook/cashfree/hook-cf-0123456789ab', a.raw, T0 + 200000, a.headers)).status, 200);
  assert.equal((await rowOf(e, newOne)).status, 'open', 'the old secret cannot pay a request of the new account');
  const b = signed(oldOne);
  await desk(e, w, '/api/pay/hook/cashfree/hook-cf-0123456789ab', b.raw, T0 + 210000, b.headers);
  assert.equal((await rowOf(e, oldOne)).status, 'paid', 'it still pays the old link it was kept for');
  const raw = JSON.stringify({ type: 'MERCHANT_OAUTH_REVOKED', data: {} });
  const ts = '1731564001';
  await desk(e, w, '/api/pay/hook/cashfree/hook-cf-0123456789ab', raw, T0 + 220000, { 'x-webhook-signature': createHmac('sha256', OLD_SECRET).update(ts + raw).digest('base64'), 'x-webhook-timestamp': ts });
  assert.equal((await e.WEB.prepare('SELECT status FROM pay_connections').first()).status, 'on');
}));

// ================================================================== 5c. an old account's OAuth token is refreshed too

test('R4-13 an old account kept after "Connect Cashfree" with another account: its token is refreshed before it runs out, so its old link is still asked', quiet(async () => {
  const e = env({ CASHFREE_PARTNER_KEY: 'partner-key', CASHFREE_CLIENT_ID: 'cid', CASHFREE_CLIENT_SECRET: 'csecret' });
  const w = world({ cfTokens: { tok_new: 'CFAPP_NEW', r_old_fresh: 'CFAPP_OLD' } });
  w.co.cf[rid(1)] = { app: 'CFAPP_OLD', status: 'PAID', amount: 2000 };
  await addRow(e, { id: rid(1), provider: 'cashfree', status: 'cancelled', checkedAt: iso(T0 - 3600000) });
  await addConn(e, {
    provider: 'cashfree',
    via: 'oauth',
    account: 'acct_new',
    creds: {
      accessToken: 'tok_new',
      refreshToken: 'r_new',
      expiresAt: iso(T0 + 30 * DAY),
      older: [{ keys: { accessToken: 'tok_old_expired', refreshToken: 'r_old', expiresAt: iso(T0 - 60000) }, ids: [rid(1)], until: iso(T0 + 7 * DAY) }],
    },
  });
  const r = await cron(e, w, T0 + 10 * 60000);
  within(r, 'cron');
  assert.deepEqual(w.co.cfRefreshed, ['r_old']);
  const row = await rowOf(e, rid(1));
  assert.deepEqual([row.status, row.late], ['paid', 1], 'found with the refreshed old token');
  const creds = await unseal(e, (await e.WEB.prepare('SELECT creds FROM pay_connections').first()).creds);
  assert.equal(creds.older[0].keys.accessToken, 'r_old_fresh', 'the fresh token is kept for next time');
  assert.equal(creds.accessToken, 'tok_new');
}));

// ================================================================== 5d. cash for the rest of a part payment

test('R4-14 a due part paid online a moment ago: the desk may take the REST in cash; the full due in cash is still stopped', quiet(async () => {
  const e = env();
  const w = world();
  await addRow(e, { id: rid(1), ref: 'ms-1', linkId: 'plink_1', amountP: 50000, status: 'paid', paidP: 50000, paidAt: iso(T0 + 50000) });
  const settle = (extra) => desk(e, w, '/api/pay/settle', { key: DESK_KEY, kind: 'fee', ref: 'ms-1', ...extra }, T0 + 60000);
  const rest = await settle({ amountP: 150000, dueP: 200000 });
  assert.deepEqual([rest.status, rest.body.paidOnline, rest.body.onlineP], [200, null, 50000], '₹500 online + ₹1,500 cash = the ₹2,000 due: fine');
  const full = await settle({ amountP: 200000, dueP: 200000 });
  assert.equal(full.body.paidOnline && full.body.paidOnline.id, rid(1), 'the whole due again in cash: stopped');
  const old = await settle({});
  assert.equal(old.body.paidOnline && old.body.paidOnline.id, rid(1), 'an app that sends no amounts: stopped, as before');
}));
