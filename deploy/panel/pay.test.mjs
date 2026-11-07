// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). F79 online payments (R-328, 4 Nov 2026).
// No real payment company is called: every company and the gym server are faked here (mocked HTTP).
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';

import { handlePay, markPaid, scheduledPay, readState, cleanUpi } from './pay.js';
import { lastFour, masterKeyBytes, seal, unseal } from './payCrypto.js';
import { cashfree, methodOf, payu, phonepe, razorpay, requestIdOf } from './payProviders.js';
import { sqliteD1 } from './sqliteD1.mjs';

const MASTER = Buffer.alloc(32, 7).toString('base64');
const OTHER = Buffer.alloc(32, 9).toString('base64');
const OWNER_KEY = 'owner-key-0123456789abcdef';
const DESK_KEY = 'desk-key-0123456789abcdef';
const MEMBER_KEY = 'member-key-0123456789abcdef';
const RZP_ID = 'rzp_test_AbCdEf123456';
const RZP_SECRET = 'SeCrEtVaLuE9876543210xyz';

function env(extra = {}) {
  return { WEB: sqliteD1(), PAYMENTS_MASTER_KEY: MASTER, ...extra };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake network: the gym server's staff_me / member_* calls, and whatever company routes a test adds. */
function net(routes = []) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    calls.push({ url: u, method, headers: init.headers || {}, body: init.body });
    if (u.endsWith('/rpc/staff_me')) {
      const { p_key } = JSON.parse(init.body);
      if (p_key === OWNER_KEY) return json({ gymId: 'gym-1', name: 'Iron Temple', person: { role: 'owner' } });
      if (p_key === DESK_KEY) return json({ gymId: 'gym-1', name: 'Iron Temple', person: { role: 'staff' } });
      return json({ message: 'BAD_KEY' }, 400);
    }
    if (u.endsWith('/rpc/member_pay_me')) {
      const { p_key } = JSON.parse(init.body);
      if (p_key === MEMBER_KEY) return json({ gymId: 'gym-1', memberId: 'app-1', rosterId: 'm-1', name: 'Asha' });
      return json({ message: 'BAD_KEY' }, 400);
    }
    if (u.endsWith('/rpc/member_orders')) return json([{ order_id: 'o-1', order_no: 12, total_p: 249900, status: 'ordered' }]);
    for (const r of routes) {
      if ((r.method || 'GET') === method && r.match.test(u)) return r.reply(u, init);
    }
    return json({ error: 'no route ' + u }, 599);
  };
  return { f, calls };
}

const post = (path, body) => new Request(`https://app.mettleup.fit${path}`, { method: 'POST', body: JSON.stringify(body) });
async function call(e, path, body, n, now) {
  const req = post(path, body);
  const res = await handlePay(req, e, new URL(req.url), { fetch: n.f, now });
  return { status: res.status, body: await res.json() };
}

const rzpRoutes = (state) => [
  { match: /api\.razorpay\.com\/v1\/payment_links\?count=1$/, reply: (_u, init) => (init.headers.Authorization === `Basic ${btoa(`${RZP_ID}:${RZP_SECRET}`)}` ? json({ items: [] }) : json({ error: { description: 'bad' } }, 401)) },
  {
    method: 'POST',
    match: /api\.razorpay\.com\/v1\/payment_links$/,
    reply: (_u, init) => {
      state.made = JSON.parse(init.body);
      return json({ id: 'plink_1', short_url: 'https://rzp.io/i/abc', status: 'created' });
    },
  },
  { match: /api\.razorpay\.com\/v1\/payment_links\/plink_1$/, reply: () => json(state.link || { id: 'plink_1', status: 'created', payments: [] }) },
];

async function connectRazorpay(e, n) {
  return call(e, '/api/pay/connect', { key: OWNER_KEY, provider: 'razorpay', fields: { keyId: RZP_ID, keySecret: RZP_SECRET } }, n);
}

// ------------------------------------------------------------------ sealing

test('seal and unseal: round trip; the plain text never shows; wrong key or a changed byte fails', async () => {
  const e = { PAYMENTS_MASTER_KEY: MASTER };
  const s = await seal(e, { keySecret: RZP_SECRET });
  assert.ok(!s.includes(RZP_SECRET));
  assert.deepEqual(await unseal(e, s), { keySecret: RZP_SECRET });
  await assert.rejects(unseal({ PAYMENTS_MASTER_KEY: OTHER }, s), /SEALED_BAD/);
  const bad = s.slice(0, -4) + (s.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  await assert.rejects(unseal(e, bad), /SEALED_BAD/);
  await assert.rejects(seal({}, { a: 1 }), /PAYMENTS_OFF/);
  assert.notEqual(await seal(e, { a: 1 }), await seal(e, { a: 1 }), 'a fresh IV each time');
  assert.equal(masterKeyBytes('short'), null);
  assert.equal(masterKeyBytes('a'.repeat(64)).length, 32);
  assert.equal(lastFour('rzp_test_AbCdEf123456'), '3456');
});

// ------------------------------------------------------------------ off switches

test('tables missing: every call says NOT_READY; master key missing: connecting is not switched on', async () => {
  const n = net();
  const noTables = { WEB: { prepare: () => ({ bind: () => ({}), all: async () => { throw new Error('no such table'); } }) }, PAYMENTS_MASTER_KEY: MASTER };
  assert.deepEqual((await call(noTables, '/api/pay/desk', { key: OWNER_KEY }, n)).body, { on: false, why: 'NOT_READY' });
  const e = env({ PAYMENTS_MASTER_KEY: '' });
  const desk = (await call(e, '/api/pay/desk', { key: OWNER_KEY }, n)).body;
  assert.equal(desk.on, true);
  assert.equal(desk.connectOn, false);
  assert.equal(desk.testMode, true);
  assert.deepEqual(desk.providers.map((p) => p.id), ['razorpay', 'cashfree', 'payu', 'phonepe']);
  assert.ok(desk.providers.every((p) => p.oauth === false));
  assert.deepEqual((await connectRazorpay(e, n)).body, { on: false, why: 'NO_MASTER_KEY' });
  assert.equal((await call(e, '/api/pay/desk', { key: 'wrong-key-0123456789' }, n)).status, 401);
});

// ------------------------------------------------------------------ connect

test('connect: owner only; keys checked with the company, sealed, and never answered back', async () => {
  const state = {};
  const n = net(rzpRoutes(state));
  const e = env();
  assert.equal((await call(e, '/api/pay/connect', { key: DESK_KEY, provider: 'razorpay', fields: { keyId: RZP_ID, keySecret: RZP_SECRET } }, n)).body.error, 'OWNER_ONLY');
  const live = await call(e, '/api/pay/connect', { key: OWNER_KEY, provider: 'razorpay', fields: { keyId: 'rzp_live_AbCdEf123456', keySecret: RZP_SECRET } }, n);
  assert.equal(live.body.words, 'Test mode needs your Razorpay test key. It starts with rzp_test_.');
  const wrong = await call(e, '/api/pay/connect', { key: OWNER_KEY, provider: 'razorpay', fields: { keyId: RZP_ID, keySecret: 'not-the-secret-xyz' } }, n);
  assert.equal(wrong.body.error, 'BAD_KEYS');
  const r = await connectRazorpay(e, n);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.connection, { provider: 'razorpay', mode: 'test', testMode: true, via: 'keys', hint: '3456', on: true, offReason: '', connectedAt: r.body.connection.connectedAt });
  const row = await e.WEB.prepare('SELECT * FROM pay_connections').first();
  assert.ok(!row.creds.includes(RZP_SECRET) && !row.creds.includes(RZP_ID), 'stored sealed');
  assert.deepEqual(await unseal(e, row.creds), { keyId: RZP_ID, keySecret: RZP_SECRET });
  const desk = await call(e, '/api/pay/desk', { key: DESK_KEY }, n);
  const text = JSON.stringify(desk.body);
  assert.ok(!text.includes(RZP_SECRET) && !text.includes(RZP_ID) && !text.includes(row.creds));
  assert.equal(desk.body.canManage, false);
  assert.equal(desk.body.providers[0].connection.hint, '3456');
});

// ------------------------------------------------------------------ requests, checks, idempotency

test('a request makes a Razorpay link (paise, reference, no SMS); the desk check finds it paid once', async () => {
  const state = {};
  const n = net(rzpRoutes(state));
  const e = env();
  await connectRazorpay(e, n);
  const body = { key: DESK_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-1', amountP: 150000, label: 'Monthly plan', note: 'Receipt 2026-27-0042', upiId: 'IronTemple@okhdfc', payee: 'Iron Temple', name: 'Asha', phone: '9829012345' };
  const made = (await call(e, '/api/pay/request', body, n)).body.request;
  assert.equal(made.url, 'https://rzp.io/i/abc');
  assert.equal(made.provider, 'razorpay');
  assert.equal(made.testMode, true);
  assert.equal(made.upiId, 'irontemple@okhdfc');
  assert.equal(state.made.amount, 150000);
  assert.equal(state.made.reference_id, made.id);
  assert.deepEqual(state.made.notify, { sms: false, email: false });
  // The same dues again: the same request, no second link.
  const again = (await call(e, '/api/pay/request', body, n)).body.request;
  assert.equal(again.id, made.id);
  assert.equal(n.calls.filter((c) => c.method === 'POST' && /payment_links$/.test(c.url)).length, 1);

  let checked = (await call(e, '/api/pay/check', { key: DESK_KEY, id: made.id }, n, Date.now())).body.request;
  assert.equal(checked.status, 'open');
  state.link = { id: 'plink_1', status: 'paid', amount_paid: 150000, payments: [{ payment_id: 'pay_A1', amount: 150000, status: 'captured', method: 'upi' }] };
  checked = (await call(e, '/api/pay/check', { key: DESK_KEY, id: made.id }, n, Date.now() + 6000)).body.request;
  assert.equal(checked.status, 'paid');
  assert.equal(checked.paymentId, 'pay_A1');
  assert.equal(checked.method, 'upi');
  assert.equal(checked.paidP, 150000);
  // The same payment reported again (webhook, cron): nothing changes.
  assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: made.id, paymentId: 'pay_A1', amountP: 150000, method: 'upi' }), 'duplicate');
  const events = await e.WEB.prepare('SELECT COUNT(*) AS n FROM pay_events').first();
  assert.equal(events.n, 1);

  // One receipt: the first desk claims, the second is told it is taken; recording needs the claim.
  const paid = (await call(e, '/api/pay/paid', { key: OWNER_KEY }, n)).body.paid;
  assert.deepEqual(paid.map((p) => p.id), [made.id]);
  const c1 = (await call(e, '/api/pay/claim', { key: DESK_KEY, id: made.id }, n)).body;
  const c2 = (await call(e, '/api/pay/claim', { key: OWNER_KEY, id: made.id }, n)).body;
  assert.ok(c1.token);
  assert.equal(c2.taken, true);
  assert.equal((await call(e, '/api/pay/recorded', { key: DESK_KEY, id: made.id, token: 'wrong', receiptNo: 'x' }, n)).body.error, 'NOT_CLAIMED');
  const rec = (await call(e, '/api/pay/recorded', { key: DESK_KEY, id: made.id, token: c1.token, receiptNo: '2026-27/0042' }, n)).body.request;
  assert.equal(rec.recorded, true);
  assert.equal(rec.receiptNo, '2026-27/0042');
  assert.deepEqual((await call(e, '/api/pay/paid', { key: OWNER_KEY }, n)).body.paid, []);
  // Recording twice changes nothing.
  assert.equal((await call(e, '/api/pay/recorded', { key: DESK_KEY, id: made.id, token: c1.token, receiptNo: 'other' }, n)).body.request.receiptNo, '2026-27/0042');
});

test('failed try keeps the link open; a payment after a cancel is still recorded (late)', async () => {
  const state = {};
  const n = net(rzpRoutes(state));
  const e = env();
  await connectRazorpay(e, n);
  const made = (await call(e, '/api/pay/request', { key: DESK_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-2', amountP: 50000 }, n)).body.request;
  state.link = { id: 'plink_1', status: 'created', payments: [{ payment_id: 'pay_F', amount: 50000, status: 'failed', method: 'card' }] };
  const failed = (await call(e, '/api/pay/check', { key: DESK_KEY, id: made.id }, n)).body.request;
  assert.equal(failed.status, 'open');
  assert.equal(failed.failed, true);
  state.link = { id: 'plink_1', status: 'cancelled', payments: [] };
  const cancelled = (await call(e, '/api/pay/cancel', { key: DESK_KEY, id: made.id }, n)).body.request;
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: made.id, paymentId: 'pay_L', amountP: 50000, method: 'card' }), 'paid');
  const row = await e.WEB.prepare('SELECT status, late, method FROM pay_requests WHERE id = ?').bind(made.id).first();
  assert.deepEqual({ ...row }, { status: 'paid', late: 1, method: 'card' });
  assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: made.id, paymentId: 'pay_M', amountP: 50000 }), 'second');
  assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: 'pr_nothere', paymentId: 'pay_N', amountP: 1 }), 'unknown');
});

test('keys the company stops accepting turn the connection off; Settings sees why', async () => {
  const state = {};
  const n = net(rzpRoutes(state));
  const e = env();
  await connectRazorpay(e, n);
  const made = (await call(e, '/api/pay/request', { key: DESK_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-3', amountP: 50000 }, n)).body.request;
  n.f.routesOff = true;
  const n2 = net([{ match: /payment_links\/plink_1$/, reply: () => json({ error: { description: 'auth' } }, 401) }]);
  await call(e, '/api/pay/check', { key: DESK_KEY, id: made.id }, n2);
  const desk = (await call(e, '/api/pay/desk', { key: OWNER_KEY }, n2)).body;
  assert.equal(desk.providers[0].connection.on, false);
  assert.equal(desk.providers[0].connection.offReason, 'bad_keys');
});

test('disconnect wipes the sealed keys; the partner webhook "revoked" turns a connection off', async () => {
  const state = {};
  const n = net(rzpRoutes(state));
  const e = env({ RAZORPAY_PARTNER_WEBHOOK_SECRET: 'whsec_partner' });
  await connectRazorpay(e, n);
  const off = (await call(e, '/api/pay/disconnect', { key: OWNER_KEY, provider: 'razorpay' }, n)).body.connection;
  assert.equal(off.on, false);
  assert.equal(off.offReason, 'disconnected');
  assert.equal((await e.WEB.prepare('SELECT creds FROM pay_connections').first()).creds, '');

  // An OAuth connection (account acc_X), then Razorpay says the gym revoked us.
  await connectRazorpay(e, n);
  await e.WEB.prepare("UPDATE pay_connections SET via = 'oauth', account = 'acc_X'").run();
  const raw = JSON.stringify({ event: 'account.app.authorization_revoked', account_id: 'acc_X', payload: {} });
  const sig = createHmac('sha256', 'whsec_partner').update(raw).digest('hex');
  const bad = new Request('https://app.mettleup.fit/api/pay/hook/razorpay', { method: 'POST', body: raw, headers: { 'x-razorpay-signature': 'deadbeef' } });
  assert.equal((await handlePay(bad, e, new URL(bad.url), { fetch: n.f })).status, 401);
  const good = new Request('https://app.mettleup.fit/api/pay/hook/razorpay', { method: 'POST', body: raw, headers: { 'x-razorpay-signature': sig } });
  assert.equal((await handlePay(good, e, new URL(good.url), { fetch: n.f })).status, 200);
  const row = await e.WEB.prepare('SELECT status, off_reason, creds FROM pay_connections').first();
  assert.deepEqual({ ...row }, { status: 'off', off_reason: 'revoked', creds: '' });
});

test('Cashfree: link with notify_url; its signed webhook marks paid once; a bad signature is refused', async () => {
  const made = {};
  const n = net([
    { match: /sandbox\.cashfree\.com\/pg\/links\/mettleup_check_/, reply: (_u, init) => (init.headers['x-client-secret'] === 'cfsk_ma_test_secret123' ? json({ message: 'link not found' }, 404) : json({ message: 'auth' }, 401)) },
    {
      method: 'POST',
      match: /sandbox\.cashfree\.com\/pg\/links$/,
      reply: (_u, init) => {
        Object.assign(made, JSON.parse(init.body));
        assert.equal(init.headers['x-api-version'], '2023-08-01');
        return json({ link_id: made.link_id, link_url: 'https://payments-test.cashfree.com/links/abc', link_status: 'ACTIVE' });
      },
    },
  ]);
  const e = env();
  const c = await call(e, '/api/pay/connect', { key: OWNER_KEY, provider: 'cashfree', fields: { appId: 'TEST1234567', secretKey: 'cfsk_ma_test_secret123' } }, n);
  assert.equal(c.body.connection.on, true);
  const noPhone = (await call(e, '/api/pay/request', { key: OWNER_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-9', amountP: 120050 }, n)).body;
  assert.equal(noPhone.linkError, 'NEEDS_PHONE', 'Cashfree needs the member mobile; the UPI QR still works');
  const req = (await call(e, '/api/pay/request', { key: OWNER_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-10', amountP: 120050, phone: '9829012345' }, n)).body.request;
  assert.equal(made.link_amount, 1200.5, 'rupees for Cashfree');
  assert.equal(made.customer_details.customer_phone, '9829012345');
  const hookRow = await e.WEB.prepare("SELECT hook FROM pay_connections WHERE provider = 'cashfree'").first();
  assert.equal(made.link_meta.notify_url, `https://app.mettleup.fit/api/pay/hook/cashfree/${hookRow.hook}`);

  const raw = JSON.stringify({ type: 'PAYMENT_LINK_EVENT', data: { link_id: req.id, link_status: 'PAID', link_amount_paid: 1200.5, order: { order_id: 'CF1', transaction_id: 'cfpay_77', transaction_status: 'SUCCESS' } } });
  const ts = '1730700000';
  const sig = createHmac('sha256', 'cfsk_ma_test_secret123').update(ts + raw).digest('base64');
  const url = `https://app.mettleup.fit/api/pay/hook/cashfree/${hookRow.hook}`;
  const bad = new Request(url, { method: 'POST', body: raw, headers: { 'x-webhook-signature': sig.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')), 'x-webhook-timestamp': ts } });
  assert.equal((await handlePay(bad, e, new URL(url), { fetch: n.f })).status, 401);
  for (let i = 0; i < 2; i++) {
    const good = new Request(url, { method: 'POST', body: raw, headers: { 'x-webhook-signature': sig, 'x-webhook-timestamp': ts } });
    assert.equal((await handlePay(good, e, new URL(url), { fetch: n.f })).status, 200);
  }
  const row = await e.WEB.prepare('SELECT status, payment_id, paid_p FROM pay_requests WHERE id = ?').bind(req.id).first();
  assert.deepEqual({ ...row }, { status: 'paid', payment_id: 'cfpay_77', paid_p: 120050 });
  assert.equal((await e.WEB.prepare('SELECT COUNT(*) AS n FROM pay_events').first()).n, 1);
});

test('the scheduled check finds an open link paid; a member sees only their own requests', async () => {
  const state = {};
  const n = net(rzpRoutes(state));
  const e = env();
  await connectRazorpay(e, n);
  const t0 = Date.now();
  const mineReq = (await call(e, '/api/pay/request', { key: DESK_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-4', amountP: 99900, label: 'Monthly plan', upiId: 'gym@okhdfc' }, n, t0)).body.request;
  await call(e, '/api/pay/request', { key: DESK_KEY, kind: 'fee', memberId: 'm-OTHER', ref: 'ms-5', amountP: 99900, online: false }, n, t0);
  const seen = (await call(e, '/api/pay/mine', { memberKey: MEMBER_KEY }, n, t0)).body;
  assert.deepEqual(seen.requests.map((r) => r.id), [mineReq.id]);
  assert.equal(seen.requests[0].url, 'https://rzp.io/i/abc');
  assert.equal(seen.requests[0].upiId, 'gym@okhdfc');
  assert.ok(!('paymentId' in seen.requests[0]) && !('memberId' in seen.requests[0]));
  state.link = { id: 'plink_1', status: 'paid', payments: [{ payment_id: 'pay_C', amount: 99900, status: 'captured', method: 'card' }] };
  assert.equal(await scheduledPay(e, { f: n.f, now: t0 + 5 * 60000 }), 1);
  const after = (await call(e, '/api/pay/member-check', { memberKey: MEMBER_KEY, id: mineReq.id }, n, t0 + 6 * 60000)).body.request;
  assert.equal(after.status, 'paid');
  assert.equal(after.url, null);
});

test('a member pays a shop order: the amount is the order total from the gym server', async () => {
  const n = net();
  const e = env({ PAYMENTS_MASTER_KEY: '' });
  await call(e, '/api/pay/desk', { key: OWNER_KEY, upiId: 'Gym@OKHDFC', payee: 'Iron Temple' }, n);
  const r = (await call(e, '/api/pay/shop', { memberKey: MEMBER_KEY, orderId: 'o-1' }, n)).body.request;
  assert.equal(r.amountP, 249900);
  assert.equal(r.label, 'Order 12');
  assert.equal(r.upiId, 'gym@okhdfc');
  assert.equal(r.url, null, 'UPI only: no company connected');
  assert.equal((await call(e, '/api/pay/shop', { memberKey: MEMBER_KEY, orderId: 'o-404' }, n)).status, 404);
  // UPI only: the desk takes it and taps Paid -> the request is done.
  const desk = (await call(e, '/api/pay/recorded', { key: DESK_KEY, id: r.id, receiptNo: '', method: 'upi' }, n)).body.request;
  assert.equal(desk.status, 'paid');
});

// ------------------------------------------------------------------ the adapters' own rules

test('Razorpay webhook: hex HMAC-SHA256 of the raw body', async () => {
  const raw = '{"event":"payment_link.paid"}';
  const sig = createHmac('sha256', 'whsec_1').update(raw).digest('hex');
  assert.equal(await razorpay.verifyHook('whsec_1', raw, new Headers({ 'x-razorpay-signature': sig })), true);
  assert.equal(await razorpay.verifyHook('whsec_2', raw, new Headers({ 'x-razorpay-signature': sig })), false);
  assert.equal(await razorpay.verifyHook('', raw, new Headers({ 'x-razorpay-signature': sig })), false);
  const ev = razorpay.readHook({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: 'plink_9', reference_id: 'pr_x' } }, payment: { entity: { id: 'pay_9', amount: 1000, method: 'card' } } } });
  assert.deepEqual(ev, { kind: 'paid', linkId: 'plink_9', ref: 'pr_x', paymentId: 'pay_9', amountP: 1000, method: 'card', account: '' });
});

test('Cashfree webhook: base64 HMAC-SHA256 of timestamp + raw body', async () => {
  const raw = '{"type":"PAYMENT_LINK_EVENT"}';
  const sig = createHmac('sha256', 'sk').update('123' + raw).digest('base64');
  assert.equal(await cashfree.verifyHook('sk', raw, new Headers({ 'x-webhook-signature': sig, 'x-webhook-timestamp': '123' })), true);
  assert.equal(await cashfree.verifyHook('sk', raw, new Headers({ 'x-webhook-signature': sig, 'x-webhook-timestamp': '124' })), false);
});

test('PayU: request hash sha512(key|command|var1|salt); reply hash in reverse order; paid from verify_payment', async () => {
  let sent = null;
  const f = async (url, init) => {
    sent = Object.fromEntries(new URLSearchParams(init.body));
    assert.match(String(url), /^https:\/\/test\.payu\.in\/merchant\/postservice\.php\?form=2$/);
    if (sent.command === 'create_invoice') return json({ Status: 'Success', URL: 'https://pmny.in/abc' });
    return json({ status: 1, transaction_details: { pr_1: { status: 'success', mihpayid: '403993715', amt: '1500.00', mode: 'UPI' } } });
  };
  const creds = { key: 'gtKFFx', salt: 'eCwWELxi' };
  const link = await payu.createLink(creds, 'test', { id: 'pr_1', amountP: 150000, description: 'Monthly', note: 'R1', name: 'Asha', phone: '9829012345' }, f);
  assert.equal(link.url, 'https://pmny.in/abc');
  const expect = createHash('sha512').update(`gtKFFx|create_invoice|${sent.var1}|eCwWELxi`).digest('hex');
  assert.equal(sent.hash, expect);
  assert.equal(JSON.parse(sent.var1).amount, '1500.00');
  const st = await payu.status(creds, 'test', 'pr_1', f);
  assert.deepEqual(st, { state: 'paid', paymentId: '403993715', amountP: 150000, method: 'upi' });
  const p = { key: 'gtKFFx', txnid: 'pr_1', amount: '1500.00', productinfo: 'Monthly', firstname: 'Asha', email: '', status: 'success', udf1: 'R1' };
  const rev = createHash('sha512').update(`eCwWELxi|success||||||||||R1||Asha|Monthly|1500.00|pr_1|gtKFFx`).digest('hex');
  assert.equal(await payu.verifyHook('eCwWELxi', new URLSearchParams({ ...p, hash: rev }).toString(), new Headers(), creds), true);
  assert.equal(await payu.verifyHook('eCwWELxi', new URLSearchParams({ ...p, amount: '1.00', hash: rev }).toString(), new Headers(), creds), false);
});

test('PhonePe: token first, O-Bearer header, paise; webhook auth is sha256(username:password)', async () => {
  const seen = [];
  const f = async (url, init = {}) => {
    seen.push({ url: String(url), init });
    if (/oauth\/token$/.test(url)) return json({ access_token: 'tok_1', expires_at: 0 });
    if (/checkout\/v2\/pay$/.test(url)) return json({ orderId: 'OMO1', state: 'PENDING', expireAt: 1730703600000, redirectUrl: 'https://mercury-uat.phonepe.com/x' });
    return json({ state: 'COMPLETED', amount: 150000, paymentDetails: [{ transactionId: 'OM9', paymentMode: 'UPI_QR', state: 'COMPLETED', amount: 150000 }] });
  };
  const creds = { clientId: 'TEST-M1', clientVersion: '1', clientSecret: 'secret-secret-1' };
  const link = await phonepe.createLink(creds, 'test', { id: 'pr_2', amountP: 150000, description: 'Monthly', note: 'R2' }, f);
  assert.equal(link.url, 'https://mercury-uat.phonepe.com/x');
  const pay = seen.find((s) => /checkout\/v2\/pay$/.test(s.url));
  assert.equal(pay.init.headers.Authorization, 'O-Bearer tok_1');
  assert.equal(JSON.parse(pay.init.body).amount, 150000);
  assert.match(seen[0].url, /^https:\/\/api-preprod\.phonepe\.com\/apis\/pg-sandbox\/v1\/oauth\/token$/);
  assert.deepEqual(await phonepe.status(creds, 'test', 'pr_2', f), { state: 'paid', paymentId: 'OM9', amountP: 150000, method: 'upi' });
  const h = createHash('sha256').update('user:pass').digest('hex');
  assert.equal(await phonepe.verifyHook('user:pass', '{}', new Headers({ authorization: h })), true);
  assert.equal(await phonepe.verifyHook('user:pass', '{}', new Headers({ authorization: 'x' })), false);
});

test('small rules: methods, references, UPI IDs, OAuth state', async () => {
  assert.equal(methodOf('UPI_QR'), 'upi');
  assert.equal(methodOf('credit_card'), 'card');
  assert.equal(methodOf('netbanking'), 'bank');
  assert.equal(methodOf('wallet'), 'other');
  assert.equal(requestIdOf('pr_abc-3'), 'pr_abc');
  assert.equal(cleanUpi(' Iron Temple@okhdfc '), 'irontemple@okhdfc');
  assert.equal(cleanUpi('irontemple'), '');
  const e = { PAYMENTS_MASTER_KEY: MASTER };
  assert.equal(await readState(e, 'bad.sig'), null);
});
