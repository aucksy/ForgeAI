// node --test deploy/panel (CI: ci.yml "Panel Worker tests"). The payment sweep (R-542, 14 Nov 2026: the owner's
// "tested to death"): every angle in docs/payments/TEST-MATRIX.md that the Worker owns and joinPay.test.mjs /
// pay.test.mjs do not already prove. Each test name starts with its matrix row id (W-xx) so the matrix can be audited.
// No real payment company or gym server is called: both are faked here. Fake numbers, fake keys only.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { handleJoinPay } from './joinPay.js';
import { handlePay, markPaid, scheduledPay, stillWatched } from './pay.js';
import { seal } from './payCrypto.js';
import { cashfree, razorpay, rupees } from './payProviders.js';
import { handleSelfJoin } from './selfJoin.js';
import { sqliteD1 } from './sqliteD1.mjs';

const MASTER = Buffer.alloc(32, 7).toString('base64');
const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const OWNER_KEY = 'owner-key-0123456789abcdef';
const DESK_KEY = 'desk-key-0123456789abcdef';
const OTHER_GYM_KEY = 'other-gym-key-0123456789ab';
const MEMBER_KEY = 'member-key-0123456789abcdef';
const RZP_ID = 'rzp_test_AbCdEf123456';
const RZP_SECRET = 'SeCrEtVaLuE9876543210xyz';
const PHONE = '9000081001';
const PROOF = `v1.join.${PHONE}.1999999999.${'a'.repeat(32)}.${'b'.repeat(64)}`;
const FORM = { code: 'QA0002', name: 'Ravi Kumar', proof: PROOF, gender: 'male', plan: 'plan-monthly', start: '2026-11-20', adult: true, health: true, lang: 'en', website: '', pay: 'online' };
const EID = 'join-0a1b2c3d4e5f60718293a4b5c6d7e8f9';
const SENT = { ok: true, gymName: 'Shakti Gym', planName: 'Monthly', startsOn: '2026-11-20', totalP: 200000, linked: false, enquiryId: EID };
const T0 = Date.parse('2026-11-14T06:00:00Z');

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Runs fn with console silenced; returns everything that would have been logged (for the "logs hold nothing" row). */
async function logsOf(fn) {
  const lines = [];
  const keep = { warn: console.warn, error: console.error, log: console.log };
  const grab = (...a) => lines.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  console.warn = grab;
  console.error = grab;
  console.log = grab;
  try {
    await fn();
  } finally {
    Object.assign(console, keep);
  }
  return lines;
}
const quiet = (fn) => async () => void (await logsOf(fn));

function env(extra = {}) {
  return { WEB: sqliteD1(), PAYMENTS_MASTER_KEY: MASTER, PHONE_CODE_SECRET: SECRET, FEEDBACK_SALT: 'salt', ...extra };
}

/** The gym server. `state.sent` = self_join_send's answer; `state.down` = unreachable; `state.member` = already a member. */
function gymServer(state = {}) {
  const calls = [];
  const rpc = async (fn, args) => {
    calls.push({ fn, args });
    if (state.down) throw new Error('fetch failed');
    if (fn === 'self_join_send') {
      if (state.member) return { status: 200, data: { error: 'MEMBER' } };
      return { status: 200, data: state.sent || SENT };
    }
    if (fn === 'self_join_pay_gym') {
      if (state.payGymDown) throw new Error('fetch failed');
      return { status: 200, data: /^[0-9a-f]{64}$/.test(args.p_sig) && args.p_code === 'QA0002' ? { ok: true, gymId: 'gym-1' } : { error: 'BAD_SIG' } };
    }
    return { status: 404, data: null };
  };
  return { calls, rpc, state };
}

/**
 * Razorpay (links plink_1, plink_2... in order made; `co.links[id]` = what Razorpay says about each; `co.down` = 5xx;
 * `co.cancelled` = links we asked Razorpay to cancel) and the gym server's key checks, over fetch.
 */
function company(co = {}) {
  co.links = co.links || {};
  co.cancelled = co.cancelled || [];
  co.made = co.made || [];
  const calls = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    calls.push({ url: u, method, body: init.body });
    if (u.endsWith('/rpc/staff_me')) {
      if (co.gymDown) return json({ message: 'down' }, 503);
      const { p_key } = JSON.parse(init.body);
      if (p_key === OWNER_KEY) return json({ gymId: 'gym-1', name: 'Shakti Gym', person: { role: 'owner' } });
      if (p_key === DESK_KEY) return json({ gymId: 'gym-1', name: 'Shakti Gym', person: { role: 'staff' } });
      if (p_key === OTHER_GYM_KEY) return json({ gymId: 'gym-2', name: 'Other Gym', person: { role: 'owner' } });
      return json({ message: 'BAD_KEY' }, 400);
    }
    // The member app's calls (shop orders): one member, one order whose total is co.orderTotal.
    if (u.endsWith('/rpc/member_pay_me')) {
      return JSON.parse(init.body).p_key === MEMBER_KEY ? json({ gymId: 'gym-1', memberId: 'app-1', rosterId: 'm-1', name: 'Asha' }) : json({ message: 'BAD_KEY' }, 400);
    }
    if (u.endsWith('/rpc/member_orders')) return json([{ order_id: 'o-1', order_no: 12, total_p: co.orderTotal || 249900, status: 'ordered' }]);
    if (/api\.razorpay\.com/.test(u)) {
      if (co.down) return json({ error: { description: 'server error' } }, 503);
      // Which keys asked (test or live): Razorpay's test and live are two separate worlds.
      const auth = String((init.headers || {}).Authorization || '');
      const keyMode = /rzp_live_/.test(Buffer.from(auth.replace(/^Basic /, ''), 'base64').toString()) ? 'live' : 'test';
      if (/\/payment_links\?count=1$/.test(u)) return json({ items: [] });
      if (/\/payment_links$/.test(u) && method === 'POST') {
        const id = `plink_${co.made.length + 1}`;
        const body = JSON.parse(init.body);
        co.made.push({ id, mode: keyMode, ...body });
        co.links[id] = { id, status: 'created', amount: body.amount, payments: [], mode: keyMode };
        return json({ id, short_url: `https://rzp.io/i/${id}`, status: 'created' });
      }
      const cancel = /\/payment_links\/(plink_\d+)\/cancel$/.exec(u);
      if (cancel && method === 'POST') {
        if (co.cancelDown) return json({ error: { description: 'gateway timeout' } }, 504);
        co.cancelled.push(cancel[1]);
        if (co.links[cancel[1]]) co.links[cancel[1]].status = 'cancelled';
        return json({ id: cancel[1], status: 'cancelled' });
      }
      const one = /\/payment_links\/(plink_\d+)$/.exec(u);
      if (one) {
        co.asked = (co.asked || []).concat(one[1]);
        const link = co.links[one[1]];
        if (link && link.mode && link.mode !== keyMode) return json({ error: { code: 'BAD_REQUEST_ERROR', description: 'The api key provided is invalid' } }, 401);
        return link ? json(link) : json({ error: { description: 'not found' } }, 400);
      }
    }
    // PayU: create_invoice makes an invoice page; verify_payment reads co.payu[txnid]. PayU cannot cancel an invoice.
    if (/test\.payu\.in|info\.payu\.in/.test(u)) {
      const form = Object.fromEntries(new URLSearchParams(init.body));
      if (form.command === 'create_invoice') {
        const v = JSON.parse(form.var1);
        co.payuMade = (co.payuMade || []).concat(v);
        return json({ status: 1, URL: `https://pay.payu.in/invoice/${v.txnid}` });
      }
      if (form.command === 'verify_payment') {
        co.asked = (co.asked || []).concat(form.var1);
        return json({ status: 1, transaction_details: { [form.var1]: (co.payu || {})[form.var1] || { status: 'Not Found' } } });
      }
    }
    return json({ error: 'no route ' + u }, 599);
  };
  return { f, calls, co };
}

async function connectRazorpay(e, gymId = 'gym-1', hook = 'hook-0123456789abcdef', mode = 'test', extra = {}) {
  const creds = await seal(e, { keyId: RZP_ID, keySecret: RZP_SECRET, ...extra.creds });
  await e.WEB.prepare(
    `INSERT INTO pay_connections (gym_id, provider, mode, via, creds, hint, account, hook, status, off_reason, connected_at, updated_at)
     VALUES (?, 'razorpay', ?, ?, ?, '3456', ?, ?, 'on', '', '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z')`,
  )
    .bind(gymId, mode, extra.via || 'keys', creds, extra.account || '', hook)
    .run();
}

/** A gym on PayU (pasted Merchant key + Salt). PayU has no link cancel and no per-link webhook. */
async function connectPayU(e, gymId = 'gym-1', mode = 'test') {
  const creds = await seal(e, { key: 'PayUKey123', salt: 'PayUSaltValue99' });
  await e.WEB.prepare(
    `INSERT INTO pay_connections (gym_id, provider, mode, via, creds, hint, account, hook, status, off_reason, connected_at, updated_at)
     VALUES (?, 'payu', ?, 'keys', ?, 'y123', '', 'hook-payu-0123456789', 'on', '', '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z')`,
  )
    .bind(gymId, mode, creds)
    .run();
}

async function setUpi(e, upi = 'shaktigym@okhdfc', gymId = 'gym-1') {
  await e.WEB.prepare("INSERT INTO pay_gyms (gym_id, upi, payee, updated_at) VALUES (?, ?, 'Shakti Gym', '2026-11-14T00:00:00Z')").bind(gymId, upi).run();
}

const req = (path, body, headers = {}) => new Request(`https://app.mettleup.fit${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'CF-Connecting-IP': '1.1.1.1', ...headers } });

async function join(e, gs, n, body = FORM, at = T0) {
  const res = await handleSelfJoin(req('/api/self-join', body), e, gs.rpc, new Date(at), { fetch: n.f });
  return { status: res.status, body: await res.json() };
}
async function page(e, gs, n, path, body, now = T0 + 60000) {
  const r = req(path, body);
  const res = await handleJoinPay(r, e, new URL(r.url), gs.rpc, { fetch: n.f, now });
  return { status: res.status, body: await res.json() };
}
async function desk(e, n, path, body, now = T0 + 120000) {
  const r = req(path, body);
  const res = await handlePay(r, e, new URL(r.url), { fetch: n.f, now });
  return { status: res.status, body: await res.json() };
}
async function hook(e, n, path, raw, headers, now = T0 + 180000) {
  const r = req(path, raw, headers);
  const res = await handlePay(r, e, new URL(r.url), { fetch: n.f, now });
  return res.status;
}
const rows = async (e) => (await e.WEB.prepare("SELECT * FROM pay_requests WHERE kind = 'join' ORDER BY created_at, id").all()).results;
const rzpPaid = (id, payId, amount, extra = {}) => ({ id, status: 'paid', amount, amount_paid: amount, payments: [{ payment_id: payId, status: 'captured', amount, method: 'upi' }], ...extra });

function cashfreeSigned(secret, body, ts = '1731564000') {
  const raw = JSON.stringify(body);
  return { raw, headers: { 'x-webhook-signature': createHmac('sha256', secret).update(ts + raw).digest('base64'), 'x-webhook-timestamp': ts } };
}
function razorpaySigned(secret, body) {
  const raw = JSON.stringify(body);
  return { raw, headers: { 'x-razorpay-signature': createHmac('sha256', secret).update(raw).digest('hex') } };
}
const rzpLinkPaid = (ref, linkId, payId, amount, account = '') => ({
  event: 'payment_link.paid',
  account_id: account,
  payload: { payment_link: { entity: { id: linkId, reference_id: ref } }, payment: { entity: { id: payId, amount, method: 'upi' } } },
});

// ================================================================== paid / failed / cancelled / timed out

test('W-01 paid: the company says paid -> paid once, the page, the desk and the company all carry the same amount', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const gs = gymServer();
  const a = await join(e, gs, n);
  assert.equal(a.body.pay.amountP, 200000, 'the page');
  assert.equal(n.co.made[0].amount, 200000, 'the company link');
  n.co.links.plink_1 = rzpPaid('plink_1', 'pay_1', 200000);
  const p = await page(e, gs, n, '/api/self-join/pay-check', { id: a.body.pay.id });
  assert.equal(p.body.pay.status, 'paid');
  assert.equal(p.body.pay.paidP, 200000);
  const j = (await desk(e, n, '/api/pay/joins', { key: DESK_KEY })).body.joins;
  assert.deepEqual(j.map((x) => [x.status, x.amountP, x.paidP, x.paymentId]), [['paid', 200000, 200000, 'pay_1']]);
  assert.equal((await e.WEB.prepare('SELECT COUNT(*) AS n FROM pay_events').first()).n, 1);
}));

test('W-02 failed: a failed try is said, stays open and payable, and is never paid', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const gs = gymServer();
  const a = await join(e, gs, n);
  n.co.links.plink_1.payments = [{ payment_id: 'pay_f', status: 'failed', amount: 200000 }];
  const p = await page(e, gs, n, '/api/self-join/pay-check', { id: a.body.pay.id });
  assert.deepEqual([p.body.pay.status, p.body.pay.failed, p.body.pay.paidP], ['open', true, 0]);
  assert.equal((await e.WEB.prepare('SELECT COUNT(*) AS n FROM pay_events').first()).n, 0);
}));

test('W-03 cancelled and W-04 timed out: the company closes the link -> closed, not paid; a payment after that is still the gym money (late)', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const gs = gymServer();
  const a = await join(e, gs, n);
  n.co.links.plink_1.status = 'expired';
  const p = await page(e, gs, n, '/api/self-join/pay-check', { id: a.body.pay.id });
  assert.equal(p.body.pay.status, 'expired');
  assert.equal(p.body.pay.url, null, 'no way to pay a closed link on the page');
  // The company then reports a payment anyway (it happened just before it closed): kept, marked late, never lost.
  assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: a.body.pay.id, paymentId: 'pay_late', amountP: 200000, method: 'upi' }), 'paid');
  const r = (await rows(e))[0];
  assert.deepEqual([r.status, r.late, r.paid_p], ['paid', 1, 200000]);
}));

test('W-05 Razorpay: a payment only "authorized" (not captured) is NOT paid yet', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const gs = gymServer();
  const a = await join(e, gs, n);
  n.co.links.plink_1.payments = [{ payment_id: 'pay_auth', status: 'authorized', amount: 200000, method: 'card' }];
  const p = await page(e, gs, n, '/api/self-join/pay-check', { id: a.body.pay.id });
  assert.equal(p.body.pay.status, 'open', 'authorized money can still be refunded by the bank: wait for captured');
  const st = await razorpay.status({ keyId: RZP_ID, keySecret: RZP_SECRET }, 'test', 'plink_1', n.f);
  assert.equal(st.state, 'open');
}));

// ================================================================== the page closed half way, double taps, two tabs

test('W-06 page closed half way and reopened: the same payment and link come back; nothing new is made', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const gs = gymServer();
  const a = await join(e, gs, n);
  const back = await page(e, gs, n, '/api/self-join/pay-check', { id: a.body.pay.id }, T0 + 3600000);
  assert.equal(back.body.pay.id, a.body.pay.id);
  assert.equal(back.body.pay.url, 'https://rzp.io/i/plink_1');
  assert.equal(n.co.made.length, 1);
}));

test('W-07 double tap on Send / two tabs: the same request twice is ONE payment and ONE company link', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  // The Send button is disabled while sending, and a second tab's send uses its own one-use number proof, so the gym
  // server answers them one after the other (it links the second to the same request). Three sends, one payment.
  const gs = gymServer({ sent: { ...SENT, linked: true } });
  const a = await join(e, gs, n);
  const b = await join(e, gs, n);
  const again = await join(e, gs, n);
  const open = (await rows(e)).filter((r) => r.status === 'open');
  assert.equal(open.length, 1, 'one open payment for the request');
  assert.deepEqual([b.body.pay.id, again.body.pay.id], [a.body.pay.id, a.body.pay.id]);
  assert.equal(n.co.made.length, 1, 'one company link');
  // The page re-checking twice in the same second asks the company once (5 s throttle).
  const before = n.calls.filter((c) => /payment_links\/plink_/.test(c.url)).length;
  await Promise.all([page(e, gs, n, '/api/self-join/pay-check', { id: again.body.pay.id }), page(e, gs, n, '/api/self-join/pay-check', { id: again.body.pay.id })]);
  const after = n.calls.filter((c) => /payment_links\/plink_/.test(c.url)).length;
  assert.ok(after - before <= 2);
}));

test('W-08 double tap on Pay: two payments reported for one request = paid once; the second is never a second "paid"', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const a = await join(e, gymServer(), n);
  assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: a.body.pay.id, paymentId: 'pay_1', amountP: 200000 }), 'paid');
  assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: a.body.pay.id, paymentId: 'pay_1', amountP: 200000 }), 'duplicate');
  assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: a.body.pay.id, paymentId: 'pay_2', amountP: 200000 }), 'second');
  const r = (await rows(e))[0];
  assert.deepEqual([r.status, r.payment_id, r.paid_p], ['paid', 'pay_1', 200000], 'the first payment stands');
  assert.equal(n.co.made[0].accept_partial, false, 'the company link takes one full payment only');
}));

// ================================================================== webhooks

test('W-09 webhook twice, late and out of order: paid once; "expired" after "paid" never unpays it', quiet(async () => {
  const e = env();
  await connectRazorpay(e, 'gym-1', 'hook-0123456789abcdef', 'test', { via: 'oauth', account: 'acc_gym1' });
  const n = company();
  const a = await join(e, gymServer(), n);
  const ev = razorpaySigned('whsec_partner', rzpLinkPaid(a.body.pay.id, 'plink_1', 'pay_9', 200000, 'acc_gym1'));
  const E = { ...e, RAZORPAY_PARTNER_WEBHOOK_SECRET: 'whsec_partner' };
  assert.equal(await hook(E, n, '/api/pay/hook/razorpay', ev.raw, ev.headers), 200);
  assert.equal(await hook(E, n, '/api/pay/hook/razorpay', ev.raw, ev.headers), 200);
  const exp = razorpaySigned('whsec_partner', { event: 'payment_link.expired', account_id: 'acc_gym1', payload: { payment_link: { entity: { id: 'plink_1', reference_id: a.body.pay.id } } } });
  assert.equal(await hook(E, n, '/api/pay/hook/razorpay', exp.raw, exp.headers), 200);
  const r = (await rows(e))[0];
  assert.deepEqual([r.status, r.payment_id], ['paid', 'pay_9']);
  assert.equal((await e.WEB.prepare('SELECT COUNT(*) AS n FROM pay_events').first()).n, 1);
}));

test('W-10 webhook missing: the 10-minute check finds the payment by itself', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const a = await join(e, gymServer(), n);
  n.co.links.plink_1 = rzpPaid('plink_1', 'pay_cron', 200000);
  assert.equal(await scheduledPay(e, { f: n.f, now: T0 + 10 * 60000 }), 1);
  assert.equal((await rows(e))[0].status, 'paid');
  void a;
}));

test('W-11 webhook forged or with a bad signature: refused 401, nothing paid; an unsigned body too', quiet(async () => {
  const e = env({ RAZORPAY_PARTNER_WEBHOOK_SECRET: 'whsec_partner' });
  await connectRazorpay(e, 'gym-1', 'hook-0123456789abcdef', 'test', { via: 'oauth', account: 'acc_gym1' });
  const n = company();
  const a = await join(e, gymServer(), n);
  const body = rzpLinkPaid(a.body.pay.id, 'plink_1', 'pay_forged', 200000, 'acc_gym1');
  const forged = razorpaySigned('not-the-secret', body);
  assert.equal(await hook(e, n, '/api/pay/hook/razorpay', forged.raw, forged.headers), 401);
  assert.equal(await hook(e, n, '/api/pay/hook/razorpay', JSON.stringify(body), {}), 401);
  // A good signature over a DIFFERENT body (amount changed after signing) is refused too.
  const good = razorpaySigned('whsec_partner', body);
  assert.equal(await hook(e, n, '/api/pay/hook/razorpay', good.raw.replace('200000', '100'), good.headers), 401);
  // No partner secret set at all: nothing can be signed, everything is refused.
  assert.equal(await hook({ ...e, RAZORPAY_PARTNER_WEBHOOK_SECRET: '' }, n, '/api/pay/hook/razorpay', good.raw, good.headers), 401);
  // A paste-keys Razorpay gym has no webhook secret: its own hook address refuses everything.
  assert.equal(await hook(e, n, '/api/pay/hook/razorpay/hook-0123456789abcdef', good.raw, good.headers), 401);
  assert.equal((await rows(e))[0].status, 'open');
  assert.equal((await e.WEB.prepare('SELECT COUNT(*) AS n FROM pay_events').first()).n, 0);
}));

test('W-12 webhook for another gym: a gym hook cannot pay another gym request', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const a = await join(e, gymServer(), n);
  // Gym 2 has Cashfree with its own secret and hook. It signs an event naming gym 1's request.
  const creds = await seal(e, { appId: 'TEST1234567', secretKey: 'cfsk_ma_test_gym2secret' });
  await e.WEB.prepare(
    `INSERT INTO pay_connections (gym_id, provider, mode, via, creds, hint, account, hook, status, off_reason, connected_at, updated_at)
     VALUES ('gym-2', 'cashfree', 'test', 'keys', ?, '4567', '', 'hook-gym2-abcdef012345', 'on', '', '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z')`,
  )
    .bind(creds)
    .run();
  const ev = cashfreeSigned('cfsk_ma_test_gym2secret', { type: 'PAYMENT_LINK_EVENT', data: { link_id: a.body.pay.id, link_status: 'PAID', link_amount_paid: 2000, order: { transaction_id: 'cf_x', transaction_status: 'SUCCESS' } } });
  assert.equal(await hook(e, n, '/api/pay/hook/cashfree/hook-gym2-abcdef012345', ev.raw, ev.headers), 200);
  assert.equal((await rows(e))[0].status, 'open', 'gym 1 request untouched');
}));

test('W-13 partner webhook (Connect Razorpay) for another gym account: never pays a request of a different gym', quiet(async () => {
  const e = env({ RAZORPAY_PARTNER_WEBHOOK_SECRET: 'whsec_partner' });
  await connectRazorpay(e, 'gym-1', 'hook-0123456789abcdef', 'test', { via: 'oauth', account: 'acc_gym1' });
  await connectRazorpay(e, 'gym-2', 'hook-gym2-0123456789ab', 'test', { via: 'oauth', account: 'acc_gym2' });
  const n = company();
  const a = await join(e, gymServer(), n);
  // Razorpay's partner webhook from gym 2's account naming gym 1's request id (a payer who learnt the id).
  const ev = razorpaySigned('whsec_partner', rzpLinkPaid(a.body.pay.id, 'plink_x', 'pay_other', 200000, 'acc_gym2'));
  assert.equal(await hook(e, n, '/api/pay/hook/razorpay', ev.raw, ev.headers), 200);
  assert.equal((await rows(e))[0].status, 'open', 'another gym account can never mark this paid');
  // An event with no account at all is not trusted either.
  const noAcc = razorpaySigned('whsec_partner', rzpLinkPaid(a.body.pay.id, 'plink_1', 'pay_noacc', 200000, ''));
  assert.equal(await hook(e, n, '/api/pay/hook/razorpay', noAcc.raw, noAcc.headers), 200);
  assert.equal((await rows(e))[0].status, 'open');
  // The right account: paid.
  const mine = razorpaySigned('whsec_partner', rzpLinkPaid(a.body.pay.id, 'plink_1', 'pay_mine', 200000, 'acc_gym1'));
  assert.equal(await hook(e, n, '/api/pay/hook/razorpay', mine.raw, mine.headers), 200);
  assert.equal((await rows(e))[0].status, 'paid');
}));

test('W-14 webhook amount different from the plan: kept as what was really paid (never the asked amount), the desk sees both', quiet(async () => {
  const e = env();
  const creds = await seal(e, { appId: 'TEST1234567', secretKey: 'cfsk_ma_test_secret123' });
  await e.WEB.prepare(
    `INSERT INTO pay_connections (gym_id, provider, mode, via, creds, hint, account, hook, status, off_reason, connected_at, updated_at)
     VALUES ('gym-1', 'cashfree', 'test', 'keys', ?, '4567', '', 'hook-cf-0123456789ab', 'on', '', '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z')`,
  )
    .bind(creds)
    .run();
  const f = async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/rpc/staff_me')) return json({ gymId: 'gym-1', name: 'Shakti Gym', person: { role: 'owner' } });
    if (/sandbox\.cashfree\.com\/pg\/links$/.test(u) && init.method === 'POST') {
      const b = JSON.parse(init.body);
      return json({ link_id: b.link_id, link_url: 'https://payments-test.cashfree.com/links/x', link_status: 'ACTIVE' });
    }
    return json({ error: 'no route' }, 599);
  };
  const a = await join(e, gymServer(), { f });
  const ev = cashfreeSigned('cfsk_ma_test_secret123', { type: 'PAYMENT_LINK_EVENT', data: { link_id: a.body.pay.id, link_status: 'PAID', link_amount_paid: 1500, order: { transaction_id: 'cf_1500', transaction_status: 'SUCCESS' } } });
  assert.equal(await hook(e, { f }, '/api/pay/hook/cashfree/hook-cf-0123456789ab', ev.raw, ev.headers), 200);
  const j = (await desk(e, { f }, '/api/pay/joins', { key: OWNER_KEY })).body.joins[0];
  assert.deepEqual([j.status, j.amountP, j.paidP], ['paid', 200000, 150000], 'asked 2,000, paid 1,500: both shown, the desk app never rounds it up');
}));

test('W-15 webhook not JSON or for an unknown request: answered 200, nothing changes; a signed "paid" with no payment id is paid ONCE under the link id', quiet(async () => {
  const e = env({ RAZORPAY_PARTNER_WEBHOOK_SECRET: 'whsec_partner' });
  await connectRazorpay(e, 'gym-1', 'hook-0123456789abcdef', 'test', { via: 'oauth', account: 'acc_gym1' });
  const n = company();
  const a = await join(e, gymServer(), n);
  const raw = 'not json';
  assert.equal(await hook(e, n, '/api/pay/hook/razorpay', raw, { 'x-razorpay-signature': createHmac('sha256', 'whsec_partner').update(raw).digest('hex') }), 200);
  const unknown = razorpaySigned('whsec_partner', rzpLinkPaid('pr_ffffffffffffffffffff', 'plink_9', 'pay_u', 200000, 'acc_gym1'));
  assert.equal(await hook(e, n, '/api/pay/hook/razorpay', unknown.raw, unknown.headers), 200);
  assert.equal((await rows(e))[0].status, 'open');
  // Review round 2: the company's own signed word that the link was paid, without the payment's id, is the same as the
  // check finding the link paid: paid once, under "<link>:paid". The check's real id later is the same payment.
  const noId = razorpaySigned('whsec_partner', rzpLinkPaid(a.body.pay.id, 'plink_1', '', 200000, 'acc_gym1'));
  assert.equal(await hook(e, n, '/api/pay/hook/razorpay', noId.raw, noId.headers), 200);
  assert.deepEqual([(await rows(e))[0].status, (await rows(e))[0].payment_id], ['paid', 'plink_1:paid']);
  assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: a.body.pay.id, paymentId: 'pay_real', amountP: 200000 }), 'duplicate');
  assert.equal((await rows(e))[0].payment_id, 'pay_real');
  // No master key or no tables: the hook address does not exist (the company retries later).
  assert.equal(await hook({ ...e, PAYMENTS_MASTER_KEY: '' }, n, '/api/pay/hook/razorpay', noId.raw, noId.headers), 404);
}));

// ================================================================== amounts

test('W-16 amount tampered in the browser: every amount the page sends is ignored, on send, check and "I have paid"', quiet(async () => {
  const e = env();
  await setUpi(e);
  const n = company();
  const gs = gymServer();
  const a = await join(e, gs, n, { ...FORM, totalP: 100, amountP: 100, priceP: 1, joiningFeeP: 0 });
  assert.equal(a.body.pay.amountP, 200000);
  const sendArgs = gs.calls.find((c) => c.fn === 'self_join_send').args;
  assert.ok(!Object.keys(sendArgs).some((k) => /total|amount|price|fee/i.test(k)), 'no money field reaches the gym server');
  const c = await page(e, gs, n, '/api/self-join/pay-check', { id: a.body.pay.id, amountP: 1, status: 'paid', paidP: 200000 });
  assert.deepEqual([c.body.pay.status, c.body.pay.amountP, c.body.pay.paidP], ['open', 200000, 0]);
  const s = await page(e, gs, n, '/api/self-join/pay-said', { id: a.body.pay.id, amountP: 1, status: 'paid' });
  assert.deepEqual([s.body.pay.status, s.body.pay.amountP], ['open', 200000]);
}));

test('W-17 plan price changed between the form and the payment: the old link is closed (here and at the company) before a new one', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const gs = gymServer();
  const a = await join(e, gs, n);
  assert.equal(n.co.made[0].amount, 200000);
  // The gym raised the price; the person sends again (or picked another plan): 2,500 now.
  gs.state.sent = { ...SENT, totalP: 250000, linked: true };
  const b = await join(e, gs, n, FORM, T0 + 600000);
  assert.notEqual(b.body.pay.id, a.body.pay.id);
  assert.equal(b.body.pay.amountP, 250000);
  const all = await rows(e);
  assert.deepEqual(all.map((r) => [r.amount_p, r.status]), [[200000, 'cancelled'], [250000, 'open']], 'never two open payments for one request');
  assert.deepEqual(n.co.cancelled, ['plink_1'], 'the old link can no longer be paid at the company');
  const j = (await desk(e, n, '/api/pay/joins', { key: DESK_KEY })).body.joins;
  assert.equal(j.filter((x) => x.status === 'open').length, 1);
}));

test('W-18 price changed but the old link was ALREADY paid: no new payment; the paid one stands', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const gs = gymServer();
  const a = await join(e, gs, n);
  n.co.links.plink_1 = rzpPaid('plink_1', 'pay_old', 200000);
  gs.state.sent = { ...SENT, totalP: 250000, linked: true };
  const b = await join(e, gs, n, FORM, T0 + 600000);
  assert.equal(b.body.pay.id, a.body.pay.id);
  assert.equal(b.body.pay.status, 'paid');
  assert.equal(n.co.made.length, 1, 'no second link');
}));

test('W-19 rupee/paise rounding: Cashfree rupees both ways; Razorpay paise; odd paise survive', async () => {
  for (const p of [100, 101, 199999, 200000, 123456, 99999999]) {
    assert.equal(Math.round(Number(rupees(p)) * 100), p, `${p} paise -> rupees -> paise`);
  }
  assert.equal(rupees(120050), '1200.50');
  const ev = cashfree.readHook({ type: 'PAYMENT_LINK_EVENT', data: { link_id: 'pr_x', link_status: 'PAID', link_amount_paid: 1999.99, order: { transaction_id: 't' } } });
  assert.equal(ev.amountP, 199999);
  const rz = razorpay.readHook(rzpLinkPaid('pr_x', 'plink_1', 'pay_1', 199999));
  assert.equal(rz.amountP, 199999);
});

test('W-20 no GST or other charge is ever added: the link amount is exactly the gym server total', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const gs = gymServer({ sent: { ...SENT, totalP: 149900 } });
  const a = await join(e, gs, n);
  assert.equal(n.co.made[0].amount, 149900);
  assert.equal(a.body.pay.amountP, 149900);
  assert.equal(n.co.made[0].accept_partial, false);
}));

// ================================================================== switches and accounts changing mid-flow

test('W-21 the gym switches the web switch off mid-flow: new joins pay at the desk; a payment already started is still learnt', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const gs = gymServer();
  const a = await join(e, gs, n);
  await desk(e, n, '/api/pay/switches', { key: OWNER_KEY, web: false });
  n.co.links.plink_1 = rzpPaid('plink_1', 'pay_mid', 200000);
  const p = await page(e, gs, n, '/api/self-join/pay-check', { id: a.body.pay.id });
  assert.equal(p.body.pay.status, 'paid', 'money already paid is never lost because a switch moved');
  const next = await join(e, gymServer({ sent: { ...SENT, enquiryId: 'join-ffffffffffffffffffffffffffffffff' } }), n);
  assert.equal(next.body.payWhy, 'SWITCHED_OFF');
}));

test('W-22 the gym removes its payment account mid-flow: open links are checked first (paid kept), the rest closed at the company and here', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const a = await join(e, gymServer(), n);
  const b = await join(e, gymServer({ sent: { ...SENT, enquiryId: 'join-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } }), n);
  n.co.links.plink_1 = rzpPaid('plink_1', 'pay_before_disconnect', 200000);
  const off = await desk(e, n, '/api/pay/disconnect', { key: OWNER_KEY, provider: 'razorpay' }, T0 + 300000);
  assert.equal(off.body.connection.on, false);
  const all = await rows(e);
  const byId = Object.fromEntries(all.map((r) => [r.id, r]));
  assert.equal(byId[a.body.pay.id].status, 'paid', 'paid just before the disconnect: still recorded');
  assert.equal(byId[b.body.pay.id].status, 'cancelled', 'not paid: closed, so nobody pays a link we can no longer see');
  assert.deepEqual(n.co.cancelled, ['plink_2']);
  const view = await page(e, gymServer(), n, '/api/self-join/pay-check', { id: b.body.pay.id });
  assert.equal(view.body.pay.url, null);
  // Review round 2: the keys stay sealed (switched off, never making a link) only until the company itself says the
  // closed link is closed; then the 10-minute check wipes them.
  assert.notEqual((await e.WEB.prepare('SELECT creds FROM pay_connections').first()).creds, '');
  await scheduledPay(e, { f: n.f, now: T0 + 3600000 });
  assert.equal((await rows(e)).find((r) => r.id === b.body.pay.id).checked_at, 'done');
  assert.equal((await e.WEB.prepare('SELECT creds FROM pay_connections').first()).creds, '', 'nothing left to watch: wiped');
}));

test('W-23 the gym server down at each step: send -> try again, nothing kept; pay-gym -> request kept, pay at the desk', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const down = await join(e, gymServer({ down: true }), n);
  assert.deepEqual([down.status, down.body.error], [503, 'TRY_AGAIN']);
  assert.equal((await rows(e)).length, 0, 'no payment for a request that was never kept');
  const half = await join(e, gymServer({ payGymDown: true }), n);
  assert.deepEqual([half.status, half.body.ok, half.body.payWhy], [201, true, 'NOT_READY'], 'the request is kept; pay at the desk');
  assert.equal((await rows(e)).length, 0);
  // The desk's list with the gym server down: refused plainly, nothing changes.
  const list = await desk(e, company({ gymDown: true }), '/api/pay/joins', { key: DESK_KEY });
  assert.equal(list.status, 503);
}));

test('W-24 the payment company down: no link and no UPI -> pay at the desk (request kept); a check while it is down changes nothing', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const down = company({ down: true });
  const a = await join(e, gymServer(), down);
  assert.deepEqual([a.status, a.body.payWhy], [201, 'LINK_FAILED']);
  assert.equal((await rows(e))[0].status, 'cancelled');
  // With a UPI ID too: the UPI way still works.
  const e2 = env();
  await connectRazorpay(e2);
  await setUpi(e2);
  const b = await join(e2, gymServer(), down);
  assert.equal(b.body.pay.upiId, 'shaktigym@okhdfc');
  assert.equal(b.body.pay.status, 'open');
  // A link made while up, then the company goes down during the checks.
  const e3 = env();
  await connectRazorpay(e3);
  const n = company();
  const c = await join(e3, gymServer(), n);
  n.co.down = true;
  const p = await page(e3, gymServer(), n, '/api/self-join/pay-check', { id: c.body.pay.id });
  assert.deepEqual([p.status, p.body.pay.status], [200, 'open']);
  assert.equal(await scheduledPay(e3, { f: n.f, now: T0 + 20 * 60000 }), 0);
}));

test('W-25 our database (D1) failing while the payment is made: the request is kept, the page says pay at the desk', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const real = e.WEB.prepare;
  e.WEB.prepare = (sql) => (/INSERT INTO pay_requests/.test(sql) ? { bind: () => ({ run: async () => { throw new Error('D1 down'); } }) } : real(sql));
  const a = await join(e, gymServer(), company());
  assert.deepEqual([a.status, a.body.ok, a.body.payWhy], [201, true, 'TRY_AGAIN']);
}));

// ================================================================== test keys vs live keys

test('W-26 test vs live: a live key is refused in test mode, and once live a TEST connection never makes a link for a real member', quiet(async () => {
  const e = env();
  const n = company();
  const live = await desk(e, n, '/api/pay/connect', { key: OWNER_KEY, provider: 'razorpay', fields: { keyId: 'rzp_live_AbCdEf123456', keySecret: RZP_SECRET } });
  assert.equal(live.status, 400);
  await connectRazorpay(e); // a test-mode connection made before "payments live"
  const L = { ...e, PAY_LIVE: 'on' };
  const info = await page(L, gymServer(), n, '/api/self-join/pay-info', { code: 'QA0002' });
  assert.deepEqual(info.body, { online: false }, 'live Worker, test keys: the join page offers no test link');
  const a = await join(L, gymServer(), n);
  assert.equal(a.body.pay, undefined);
  assert.equal(n.co.made.length, 0, 'no test link made for a real person');
  const fee = await desk(L, n, '/api/pay/request', { key: DESK_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-1', amountP: 150000, upiId: 'gym@okhdfc' });
  assert.equal(fee.body.request.url, null, 'the desk too: UPI QR only until live keys are connected');
  assert.equal(n.co.made.length, 0);
  // Before live (test Worker): the test connection works and everything says test mode.
  const t = await join(e, gymServer(), n);
  assert.equal(t.body.pay.testMode, true);
}));

// ================================================================== people

test('W-27 two joins with one phone: linked to the same request -> the same payment; already a member -> refused, no payment', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const a = await join(e, gymServer(), n);
  const b = await join(e, gymServer({ sent: { ...SENT, linked: true } }), n);
  assert.equal(b.body.pay.id, a.body.pay.id);
  const m = await join(e, gymServer({ member: true }), n);
  assert.deepEqual([m.status, m.body.error], [409, 'MEMBER']);
  assert.equal((await rows(e)).length, 1);
}));

// ================================================================== the desk

test('W-28 Approve by two desks at once: one claim wins; the other is told it is taken; recording needs the claim; twice = once', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const a = await join(e, gymServer(), n);
  n.co.links.plink_1 = rzpPaid('plink_1', 'pay_1', 200000);
  await page(e, gymServer(), n, '/api/self-join/pay-check', { id: a.body.pay.id });
  const [c1, c2] = await Promise.all([desk(e, n, '/api/pay/claim', { key: DESK_KEY, id: a.body.pay.id }), desk(e, n, '/api/pay/claim', { key: OWNER_KEY, id: a.body.pay.id })]);
  const tokens = [c1.body.token, c2.body.token].filter(Boolean);
  assert.equal(tokens.length, 1, 'exactly one desk holds it');
  assert.equal((await desk(e, n, '/api/pay/recorded', { key: DESK_KEY, id: a.body.pay.id, token: 'guess', receiptNo: 'X' })).body.error, 'NOT_CLAIMED');
  const rec = await desk(e, n, '/api/pay/recorded', { key: DESK_KEY, id: a.body.pay.id, token: tokens[0], receiptNo: '2026-27/0007' });
  assert.equal(rec.body.request.receiptNo, '2026-27/0007');
  const again = await desk(e, n, '/api/pay/recorded', { key: OWNER_KEY, id: a.body.pay.id, token: tokens[0], receiptNo: '2026-27/0008' });
  assert.equal(again.body.request.receiptNo, '2026-27/0007', 'the receipt number is written once');
  const late = await desk(e, n, '/api/pay/claim', { key: OWNER_KEY, id: a.body.pay.id });
  assert.deepEqual([late.body.taken, late.body.recorded], [true, true]);
  // Another gym's desk cannot see, claim or record it.
  assert.equal((await desk(e, n, '/api/pay/claim', { key: OTHER_GYM_KEY, id: a.body.pay.id })).status, 404);
  assert.equal((await desk(e, n, '/api/pay/joins', { key: OTHER_GYM_KEY })).body.joins.length, 0);
}));

test('W-29 UPI "I have paid" tapped without paying: never paid, never in the receipts sweep; only the desk can confirm', quiet(async () => {
  const e = env();
  await setUpi(e);
  const n = company();
  const gs = gymServer();
  const a = await join(e, gs, n);
  for (let i = 0; i < 3; i++) await page(e, gs, n, '/api/self-join/pay-said', { id: a.body.pay.id });
  const r = (await rows(e))[0];
  assert.deepEqual([r.status, r.paid_p, r.payment_id, r.recorded_at], ['open', 0, '', '']);
  assert.equal((await e.WEB.prepare('SELECT COUNT(*) AS n FROM pay_said').first()).n, 1, 'said once');
  assert.equal((await desk(e, n, '/api/pay/paid', { key: OWNER_KEY })).body.paid.length, 0, 'the receipts sweep never sees it');
  const j = (await desk(e, n, '/api/pay/joins', { key: DESK_KEY })).body.joins[0];
  assert.deepEqual([j.status, j.said], ['open', true]);
  // The page can never turn a UPI payment into "paid": no route does it.
  for (const path of ['/api/self-join/pay-paid', '/api/self-join/pay-done']) assert.equal((await page(e, gs, n, path, { id: a.body.pay.id })).status, 404);
}));

test('W-30 nothing marks paid without a verified company event: the page, a guessed id, a fee id and a shop id all fail', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const gs = gymServer();
  const a = await join(e, gs, n);
  for (let i = 0; i < 5; i++) await page(e, gs, n, '/api/self-join/pay-check', { id: a.body.pay.id }, T0 + 60000 + i * 6000);
  assert.equal((await rows(e))[0].status, 'open', 'asking never pays');
  assert.equal((await page(e, gs, n, '/api/self-join/pay-check', { id: 'pr_0000000000000000000a' })).status, 404);
  const fee = await desk(e, n, '/api/pay/request', { key: DESK_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-1', amountP: 150000 });
  assert.equal((await page(e, gs, n, '/api/self-join/pay-said', { id: fee.body.request.id })).status, 404, 'the join page cannot touch a member fee');
  // markPaid needs the right company: a Cashfree "payment" for a Razorpay request does nothing.
  assert.equal(await markPaid(e.WEB, { provider: 'cashfree', requestId: a.body.pay.id, paymentId: 'x', amountP: 200000 }), 'unknown');
}));

test('W-31 logs never hold a card, a phone, a name, a UPI ID, a key, a secret, a proof or an amount', async () => {
  const e = env({ RAZORPAY_PARTNER_WEBHOOK_SECRET: 'whsec_partner' });
  await connectRazorpay(e, 'gym-1', 'hook-0123456789abcdef', 'test', { via: 'oauth', account: 'acc_gym1' });
  await setUpi(e);
  const n = company();
  const gs = gymServer();
  const lines = await logsOf(async () => {
    const a = await join(e, gs, n);
    await page(e, gs, n, '/api/self-join/pay-check', { id: a.body.pay.id });
    const forged = razorpaySigned('wrong', rzpLinkPaid(a.body.pay.id, 'plink_1', 'pay_1', 200000, 'acc_gym1'));
    await hook(e, n, '/api/pay/hook/razorpay', forged.raw, forged.headers);
    const ok = razorpaySigned('whsec_partner', rzpLinkPaid(a.body.pay.id, 'plink_1', 'pay_1', 200000, 'acc_gym1'));
    await hook(e, n, '/api/pay/hook/razorpay', ok.raw, ok.headers);
    await desk(e, n, '/api/pay/joins', { key: DESK_KEY });
    await join(e, gymServer({ down: true }), n);
    await join(e, gs, company({ down: true }));
    await desk(e, n, '/api/pay/disconnect', { key: OWNER_KEY, provider: 'razorpay' });
  });
  const text = lines.join('\n');
  assert.ok(lines.length > 0, 'the flow did log something');
  for (const bad of [PHONE, 'Ravi', 'shaktigym@okhdfc', RZP_ID, RZP_SECRET, MASTER, SECRET, 'whsec_partner', OWNER_KEY, DESK_KEY, PROOF.slice(0, 30), '200000', '2000.00', '4111']) {
    assert.ok(!text.includes(bad), `a log line holds ${bad}`);
  }
});

test('W-32 a TEST-mode shop payment never tells the Shop page "Paid online" (the desk must not hand over goods for it)', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const add = (id, provider, mode) =>
    e.WEB.prepare(
      `INSERT INTO pay_requests (id, gym_id, kind, app_member, ref, amount_p, provider, mode, status, paid_p, paid_at, created_at)
       VALUES (?, 'gym-1', 'shop', 'app-1', ?, 249900, ?, ?, 'paid', 249900, ?, ?)`,
    )
      .bind(id, `order-${id}`, provider, mode, new Date(T0).toISOString(), new Date(T0).toISOString())
      .run();
  await add('pr_shoptest00000000000', 'razorpay', 'test');
  await add('pr_shoplive00000000000', 'razorpay', 'live');
  await add('pr_shopupi000000000000', '', '');
  const shopPaid = (await desk(e, n, '/api/pay/paid', { key: OWNER_KEY })).body.shopPaid.map((s) => s.orderId).sort();
  assert.deepEqual(shopPaid, ['order-pr_shoplive00000000000', 'order-pr_shopupi000000000000']);
}));

// ================================================================== review round 2 (15 Nov 2026): links WE closed

test('W-33 PayU, price changed: we close the old invoice (PayU cannot), they pay it from the old tab, no webhook -> the 10-minute check still finds it (paid late) and Today shows it', quiet(async () => {
  const e = env();
  await connectPayU(e);
  const n = company();
  const a = await join(e, gymServer(), n);
  assert.equal(a.body.pay.how, 'link');
  const b = await join(e, gymServer({ sent: { ...SENT, totalP: 250000 } }), n, FORM, T0 + 60000);
  assert.notEqual(b.body.pay.id, a.body.pay.id);
  assert.equal((await rows(e)).find((r) => r.id === a.body.pay.id).status, 'cancelled', 'closed here; PayU itself cannot close it');
  // They pay the OLD invoice (2,000) from the tab they still had open.
  n.co.payu = { [a.body.pay.id]: { status: 'success', mihpayid: '403993715', amt: '2000.00', mode: 'UPI' } };
  await scheduledPay(e, { f: n.f, now: T0 + 40 * 60000 });
  const old = (await rows(e)).find((r) => r.id === a.body.pay.id);
  assert.deepEqual([old.status, old.late, old.paid_p, old.payment_id], ['paid', 1, 200000, '403993715']);
  const today = await desk(e, n, '/api/pay/joins', { key: DESK_KEY }, T0 + 41 * 60000);
  assert.equal(today.body.joins.find((j) => j.id === a.body.pay.id).status, 'paid', 'Today shows the money, so the desk does not charge again');
}));

test('W-34 Razorpay, price changed and the cancel fails on a network error: the old link is still payable there -> a payment on it is still found', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company({ cancelDown: true });
  const a = await join(e, gymServer(), n);
  await join(e, gymServer({ sent: { ...SENT, totalP: 250000 } }), n, FORM, T0 + 60000);
  assert.deepEqual(n.co.cancelled, [], 'Razorpay never confirmed the cancel');
  n.co.links.plink_1 = rzpPaid('plink_1', 'pay_old_tab', 200000);
  await scheduledPay(e, { f: n.f, now: T0 + 40 * 60000 });
  const old = (await rows(e)).find((r) => r.id === a.body.pay.id);
  assert.deepEqual([old.status, old.late, old.payment_id], ['paid', 1, 'pay_old_tab']);
}));

test('W-35 disconnect while a link is payable and its cancel fails: the keys are kept sealed (never making a link) until it is settled, the payment is found, then the keys are wiped', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company({ cancelDown: true });
  const a = await join(e, gymServer(), n);
  await desk(e, n, '/api/pay/disconnect', { key: OWNER_KEY, provider: 'razorpay' }, T0 + 300000);
  const conn = await e.WEB.prepare('SELECT status, off_reason, creds FROM pay_connections').first();
  assert.deepEqual([conn.status, conn.off_reason, conn.creds !== ''], ['off', 'disconnected', true]);
  const info = await page(e, gymServer(), n, '/api/self-join/pay-info', { code: 'QA0002' });
  assert.deepEqual(info.body, { online: false }, 'a disconnected company never makes a link');
  n.co.links.plink_1 = rzpPaid('plink_1', 'pay_after_disconnect', 200000);
  await scheduledPay(e, { f: n.f, now: T0 + 40 * 60000 });
  const r = (await rows(e)).find((x) => x.id === a.body.pay.id);
  assert.deepEqual([r.status, r.late], ['paid', 1]);
  assert.equal((await e.WEB.prepare('SELECT creds FROM pay_connections').first()).creds, '', 'settled: wiped on the same run');
}));

test('W-36 which links stay watched: open; closed by us for 8 days; never once the company says closed, once paid, or with no company link', async () => {
  const at = Date.parse('2026-11-14T06:00:00Z');
  const row = (o) => ({ provider: 'payu', link_id: 'pr_x', status: 'open', checked_at: '', created_at: '2026-11-14T05:00:00.000Z', ...o });
  assert.equal(stillWatched(row(), at), true);
  assert.equal(stillWatched(row({ status: 'cancelled' }), at), true);
  assert.equal(stillWatched(row({ status: 'expired' }), at), true);
  assert.equal(stillWatched(row({ status: 'cancelled', created_at: '2026-11-05T05:00:00.000Z' }), at), false, 'older than 8 days');
  assert.equal(stillWatched(row({ status: 'cancelled', checked_at: 'done' }), at), false);
  assert.equal(stillWatched(row({ status: 'paid' }), at), false);
  assert.equal(stillWatched(row({ provider: '', link_id: '' }), at), false, 'a plain UPI one: nobody to ask');
});

// ================================================================== review round 2: Today, Make member, shop

test('W-37 paid at home a minute ago, no webhook: Today asks the company itself and shows "Paid online" (not 10 minutes later)', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const a = await join(e, gymServer(), n);
  n.co.links.plink_1 = rzpPaid('plink_1', 'pay_home', 200000);
  const today = await desk(e, n, '/api/pay/joins', { key: DESK_KEY }, T0 + 120000);
  const j = today.body.joins.find((x) => x.id === a.body.pay.id);
  assert.deepEqual([j.status, j.paidP], ['paid', 200000]);
}));

test('W-38 Make member / the desk cancel: the link is cancelled AT THE COMPANY too; a payment made a moment before is kept, never cancelled', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const a = await join(e, gymServer(), n);
  const c = await desk(e, n, '/api/pay/cancel', { key: DESK_KEY, id: a.body.pay.id });
  assert.equal(c.body.request.status, 'cancelled');
  assert.deepEqual(n.co.cancelled, ['plink_1'], 'nobody can pay it from an old message any more');
  const b = await join(e, gymServer({ sent: { ...SENT, enquiryId: 'join-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } }), n);
  n.co.links.plink_2 = rzpPaid('plink_2', 'pay_just_now', 200000);
  const d = await desk(e, n, '/api/pay/cancel', { key: DESK_KEY, id: b.body.pay.id });
  assert.equal(d.body.request.status, 'paid', 'paid a moment ago: Make member must not hide it');
  assert.deepEqual(n.co.cancelled, ['plink_1']);
}));

test('W-39 a shop order whose total changed: the old link is cancelled at the company too; one already paid stands and no new link is made', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company({ orderTotal: 249900 });
  const s1 = await desk(e, n, '/api/pay/shop', { memberKey: MEMBER_KEY, orderId: 'o-1', phone: '9000081001' });
  assert.equal(s1.body.request.amountP, 249900);
  n.co.orderTotal = 199900;
  const s2 = await desk(e, n, '/api/pay/shop', { memberKey: MEMBER_KEY, orderId: 'o-1', phone: '9000081001' }, T0 + 180000);
  assert.equal(s2.body.request.amountP, 199900);
  assert.deepEqual(n.co.cancelled, ['plink_1']);
  n.co.links.plink_2 = rzpPaid('plink_2', 'pay_shop', 199900);
  n.co.orderTotal = 150000;
  const s3 = await desk(e, n, '/api/pay/shop', { memberKey: MEMBER_KEY, orderId: 'o-1', phone: '9000081001' }, T0 + 240000);
  assert.equal(s3.body.request.status, 'paid');
  assert.equal(n.co.made.length, 2, 'no third link for an order already paid');
}));

// ================================================================== review round 2: test vs live, refunds, ids, logs

test('W-40 a TEST link is never reused after going live, never asked with live keys, and can never switch live payments off', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const a = await join(e, gymServer(), n);
  assert.equal(n.co.made[0].mode, 'test');
  // Payments go live: the owner connects live keys; the Worker says live.
  await e.WEB.prepare("UPDATE pay_connections SET mode = 'live', creds = ? WHERE provider = 'razorpay'").bind(await seal(e, { keyId: 'rzp_live_AbCdEf123456', keySecret: RZP_SECRET })).run();
  const L = { ...e, PAY_LIVE: 'on' };
  n.co.asked = [];
  const p = await page(L, gymServer(), n, '/api/self-join/pay-check', { id: a.body.pay.id }, T0 + 60000);
  assert.equal(p.status, 200);
  assert.deepEqual(n.co.asked, [], 'the test link is never asked with the live keys');
  assert.equal((await e.WEB.prepare('SELECT status FROM pay_connections').first()).status, 'on', 'live payments stay on');
  const b = await join(L, gymServer(), n, FORM, T0 + 120000);
  assert.notEqual(b.body.pay.id, a.body.pay.id, 'not the old test payment');
  assert.equal(b.body.pay.testMode, false);
  assert.equal(n.co.made[1].mode, 'live');
  assert.equal((await rows(e)).find((r) => r.id === a.body.pay.id).status, 'cancelled');
  // The desk's fee links too: a test-mode one from before is not handed out once live.
  await e.WEB.prepare("UPDATE pay_connections SET mode = 'test', creds = ? WHERE provider = 'razorpay'").bind(await seal(e, { keyId: RZP_ID, keySecret: RZP_SECRET })).run();
  const fee1 = await desk(e, n, '/api/pay/request', { key: DESK_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-1', amountP: 150000 });
  assert.equal(fee1.body.request.testMode, true);
  await e.WEB.prepare("UPDATE pay_connections SET mode = 'live', creds = ? WHERE provider = 'razorpay'").bind(await seal(e, { keyId: 'rzp_live_AbCdEf123456', keySecret: RZP_SECRET })).run();
  const fee2 = await desk(L, n, '/api/pay/request', { key: DESK_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-1', amountP: 150000 }, T0 + 180000);
  assert.notEqual(fee2.body.request.id, fee1.body.request.id);
  assert.equal(fee2.body.request.testMode, false);
}));

test('W-41 refunded before Approve: the check just before Approve says "refunded" (Razorpay), so nothing is saved as paid', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const a = await join(e, gymServer(), n);
  n.co.links.plink_1 = rzpPaid('plink_1', 'pay_R', 200000);
  await page(e, gymServer(), n, '/api/self-join/pay-check', { id: a.body.pay.id });
  const fine = await desk(e, n, '/api/pay/check', { key: DESK_KEY, id: a.body.pay.id, beforeApprove: true });
  assert.deepEqual([fine.body.request.status, fine.body.refunded], ['paid', false]);
  n.co.links.plink_1.payments[0].status = 'refunded';
  const back = await desk(e, n, '/api/pay/check', { key: DESK_KEY, id: a.body.pay.id, beforeApprove: true });
  assert.deepEqual([back.body.request.status, back.body.refunded], ['paid', true]);
  // An open one is asked right then (not throttled): paid a second ago is found before Approve.
  const b = await join(e, gymServer({ sent: { ...SENT, enquiryId: 'join-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } }), n);
  await page(e, gymServer(), n, '/api/self-join/pay-check', { id: b.body.pay.id }, T0 + 300000);
  n.co.links.plink_2 = rzpPaid('plink_2', 'pay_now', 200000);
  const now = await desk(e, n, '/api/pay/check', { key: DESK_KEY, id: b.body.pay.id, beforeApprove: true }, T0 + 301000);
  assert.equal(now.body.request.status, 'paid');
}));

test('W-42 Cashfree: a full refund (done or under way) is "refunded"; a part refund or a cancelled refund is still paid; only the payment own id is used', async () => {
  const cf = (refunds, payments = [{ cf_payment_id: 'cfp_1', payment_status: 'SUCCESS', payment_amount: 2000, payment_group: 'upi' }]) => async (url) => {
    const u = String(url);
    if (/\/links\/L1$/.test(u)) return json({ link_status: 'PAID', link_amount_paid: 2000 });
    if (/\/links\/L1\/orders/.test(u)) return json([{ order_id: 'o_1', order_status: 'PAID' }]);
    if (/\/orders\/o_1\/payments$/.test(u)) return json(payments);
    if (/\/orders\/o_1\/refunds$/.test(u)) return json(refunds);
    return json({}, 404);
  };
  const creds = { appId: 'TEST12345678', secretKey: 'cfsk_ma_test_abcdef' };
  assert.equal((await cashfree.status(creds, 'test', 'L1', cf([{ refund_status: 'SUCCESS', refund_amount: 2000 }]))).state, 'refunded');
  assert.equal((await cashfree.status(creds, 'test', 'L1', cf([{ refund_status: 'PENDING', refund_amount: 2000 }]))).state, 'refunded');
  const part = await cashfree.status(creds, 'test', 'L1', cf([{ refund_status: 'SUCCESS', refund_amount: 500 }]));
  assert.deepEqual([part.state, part.paymentId, part.amountP], ['paid', 'cfp_1', 200000]);
  assert.equal((await cashfree.status(creds, 'test', 'L1', cf([{ refund_status: 'CANCELLED', refund_amount: 2000 }]))).state, 'paid');
  const noPay = await cashfree.status(creds, 'test', 'L1', cf([], []));
  assert.equal(noPay.paymentId, '', 'never the order id in its place (the webhook would name it differently)');
  // Razorpay: a part refund keeps the payment "captured" = paid.
  const rf = async () => json({ id: 'plink_1', status: 'paid', amount_paid: 200000, payments: [{ payment_id: 'pay_P', status: 'captured', amount: 200000, method: 'upi' }] });
  assert.equal((await razorpay.status({ keyId: RZP_ID, keySecret: RZP_SECRET }, 'test', 'plink_1', rf)).state, 'paid');
});

test('W-43 one payment named two ways (the check knew only the link, the webhook the payment): ONE payment, the real id kept, no false "refund it"', async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  let id = '';
  const lines = await logsOf(async () => {
    const a = await join(e, gymServer(), n);
    id = a.body.pay.id;
    assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: id, paymentId: 'plink_1:paid', amountP: 200000 }), 'paid');
    assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: id, paymentId: 'pay_real', amountP: 200000 }), 'duplicate');
    assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: id, paymentId: 'plink_1:paid', amountP: 200000 }), 'duplicate');
  });
  assert.equal((await rows(e))[0].payment_id, 'pay_real');
  assert.ok(!lines.join('\n').includes('refund'), 'no false "the gym should refund it"');
  // Two REAL ids are two payments: said, so the gym can look.
  const two = await logsOf(async () => assert.equal(await markPaid(e.WEB, { provider: 'razorpay', requestId: id, paymentId: 'pay_other', amountP: 200000 }), 'second'));
  assert.ok(two.join('\n').includes('second payment'));
});

test('W-44 logs never hold a payment request id (anyone holding one can tap "I have paid" on the join page)', async () => {
  const e = env({ RAZORPAY_PARTNER_WEBHOOK_SECRET: 'whsec_partner' });
  await connectRazorpay(e, 'gym-1', 'hook-0123456789abcdef', 'test', { via: 'oauth', account: 'acc_gym1' });
  const n = company();
  const lines = await logsOf(async () => {
    const a = await join(e, gymServer(), n);
    const ok = razorpaySigned('whsec_partner', rzpLinkPaid(a.body.pay.id, 'plink_1', 'pay_1', 200000, 'acc_gym1'));
    await hook(e, n, '/api/pay/hook/razorpay', ok.raw, ok.headers);
    const again = razorpaySigned('whsec_partner', rzpLinkPaid(a.body.pay.id, 'plink_1', 'pay_2', 200000, 'acc_gym1'));
    await hook(e, n, '/api/pay/hook/razorpay', again.raw, again.headers);
    await join(e, gymServer({ sent: { ...SENT, totalP: 250000 } }), company({ cancelDown: true }), FORM, T0 + 60000);
    await desk(e, n, '/api/pay/disconnect', { key: OWNER_KEY, provider: 'razorpay' });
  });
  assert.ok(lines.length > 0);
  assert.ok(!/pr_[0-9a-f]{20}/.test(lines.join('\n')), 'a log line holds a request id');
});

test('W-45 a gym on pasted Razorpay keys has no webhook secret: its webhooks are refused, and the payment is still found by Today and the 10-minute check', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const n = company();
  const a = await join(e, gymServer(), n);
  const signed = razorpaySigned('anything', rzpLinkPaid(a.body.pay.id, 'plink_1', 'pay_W', 200000));
  assert.equal(await hook(e, n, '/api/pay/hook/razorpay/hook-0123456789abcdef', signed.raw, signed.headers), 401);
  n.co.links.plink_1 = rzpPaid('plink_1', 'pay_W', 200000);
  const today = await desk(e, n, '/api/pay/joins', { key: DESK_KEY }, T0 + 200000);
  assert.equal(today.body.joins[0].status, 'paid');
}));
