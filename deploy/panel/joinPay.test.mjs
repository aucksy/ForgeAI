// node --test deploy/panel (CI: ci.yml "Panel Worker tests"). R-528 (14 Nov 2026): pay online on the join page, with
// the owner's two switches. No real payment company or gym server is called: both are faked here. Fake numbers only.
// R-555: join payments are offered only with the Worker's JOIN_PAY "live", and a company link only once payments are
// live (PAY_LIVE "on"): env() below has both, the tests at the end prove each one off.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attachJoinPay, handleJoinPay, joinCharge, joinView, offerForCode, phoneOfProof, webOffer } from './joinPay.js';
import { handlePay } from './pay.js';
import { seal } from './payCrypto.js';
import { handleSelfJoin } from './selfJoin.js';
import { sqliteD1 } from './sqliteD1.mjs';

const MASTER = Buffer.alloc(32, 7).toString('base64');
const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const OWNER_KEY = 'owner-key-0123456789abcdef';
const DESK_KEY = 'desk-key-0123456789abcdef';
const MEMBER_KEY = 'member-key-0123456789abcdef';
const PROOF = `v1.join.9000081001.1999999999.${'a'.repeat(32)}.${'b'.repeat(64)}`;
const FORM = { code: 'qa0002', name: 'Ravi Kumar', proof: PROOF, gender: 'male', plan: 'plan-monthly', start: '2026-11-20', adult: true, health: true, lang: 'en', website: '' };
const SENT = { ok: true, gymName: 'Shakti Gym', planName: 'Monthly', startsOn: '2026-11-20', totalP: 200000, linked: false, enquiryId: 'join-0a1b2c3d4e5f60718293a4b5c6d7e8f9' };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function quiet(fn) {
  return async () => {
    const { warn, error, log } = console;
    console.warn = () => {};
    console.error = () => {};
    console.log = () => {};
    try {
      await fn();
    } finally {
      Object.assign(console, { warn, error, log });
    }
  };
}

function env(extra = {}, d1 = {}) {
  return { WEB: sqliteD1(d1), PAYMENTS_MASTER_KEY: MASTER, PHONE_CODE_SECRET: SECRET, FEEDBACK_SALT: 'salt', JOIN_PAY: 'live', PAY_LIVE: 'on', ...extra };
}

/** The gym server: 0081 (or not), the request, and who a key is. */
function gymServer({ has0081 = true, sent = SENT } = {}) {
  const calls = [];
  const rpc = async (fn, args) => {
    calls.push({ fn, args });
    if (fn === 'self_join_send') return { status: 200, data: has0081 ? sent : { ...sent, enquiryId: undefined } };
    if (fn === 'self_join_pay_gym') {
      if (!has0081) return { status: 404, data: { code: 'PGRST202', message: 'Could not find the function' } };
      return { status: 200, data: /^[0-9a-f]{64}$/.test(args.p_sig) && args.p_code === 'QA0002' ? { ok: true, gymId: 'gym-1' } : { error: 'BAD_SIG' } };
    }
    return { status: 404, data: null };
  };
  return { calls, rpc };
}

/** Razorpay and the gym server's key checks, over fetch. `state.link` is what the company says about the link. */
function net(state = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', body: init.body });
    if (u.endsWith('/rpc/staff_me')) {
      const { p_key } = JSON.parse(init.body);
      if (p_key === OWNER_KEY) return json({ gymId: 'gym-1', name: 'Shakti Gym', person: { role: 'owner' } });
      if (p_key === DESK_KEY) return json({ gymId: 'gym-1', name: 'Shakti Gym', person: { role: 'staff' } });
      return json({ message: 'BAD_KEY' }, 400);
    }
    if (u.endsWith('/rpc/member_pay_me')) return json({ gymId: 'gym-1', memberId: 'app-1', rosterId: 'm-1', name: 'Asha' });
    if (u.endsWith('/rpc/member_orders')) return json([{ order_id: 'o-1', order_no: 12, total_p: 249900, status: 'ordered' }]);
    if (/api\.razorpay\.com\/v1\/payment_links$/.test(u) && init.method === 'POST') {
      if (state.refuse) return json({ error: { description: 'no' } }, 400);
      state.made = JSON.parse(init.body);
      return json({ id: 'plink_1', short_url: 'https://rzp.io/i/join', status: 'created' });
    }
    if (/api\.razorpay\.com\/v1\/payment_links\/plink_1$/.test(u)) return json(state.link || { id: 'plink_1', status: 'created', payments: [] });
    return json({ error: 'no route ' + u }, 599);
  };
  return { f, calls };
}

async function connectRazorpay(e, mode = 'live') {
  const creds = await seal(e, { keyId: `rzp_${mode}_AbCdEf123456`, keySecret: 'SeCrEtVaLuE9876543210xyz' });
  await e.WEB.prepare(
    `INSERT INTO pay_connections (gym_id, provider, mode, via, creds, hint, account, hook, status, off_reason, connected_at, updated_at)
     VALUES ('gym-1', 'razorpay', ?, 'keys', ?, '3456', '', 'hook-0123456789abcdef', 'on', '', '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z')`,
  )
    .bind(mode, creds)
    .run();
}

async function setUpi(e, upi = 'shaktigym@okhdfc') {
  await e.WEB.prepare("INSERT INTO pay_gyms (gym_id, upi, payee, updated_at) VALUES ('gym-1', ?, 'Shakti Gym', '2026-11-14T00:00:00Z')").bind(upi).run();
}

const req = (path, body, ip = '1.1.1.1') => new Request(`https://app.mettleup.fit${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'CF-Connecting-IP': ip } });

async function join(e, gs, n, body = { ...FORM, pay: 'online' }) {
  const res = await handleSelfJoin(req('/api/self-join', body), e, gs.rpc, new Date('2026-11-14T06:00:00Z'), { fetch: n.f });
  return { status: res.status, body: await res.json() };
}

async function jp(e, gs, n, path, body, now = Date.parse('2026-11-14T06:01:00Z')) {
  const r = req(path, body);
  const res = await handleJoinPay(r, e, new URL(r.url), gs.rpc, { fetch: n.f, now });
  return { status: res.status, body: await res.json() };
}

async function desk(e, n, path, body) {
  const r = req(path, body);
  const res = await handlePay(r, e, new URL(r.url), { fetch: n.f, now: Date.parse('2026-11-14T06:02:00Z') });
  return { status: res.status, body: await res.json() };
}

// ------------------------------------------------------------------ the pure parts

test('the charge is the gym server price; the F210 trial hook takes only the trial fee, nothing for a free trial', () => {
  assert.deepEqual(joinCharge({ totalP: 200000, planName: 'Monthly' }), { amountP: 200000, label: 'Monthly', trial: false });
  assert.deepEqual(joinCharge({ totalP: 200000, planName: 'Monthly' }, { days: 7, feeP: 19900 }), { amountP: 19900, label: 'Trial, 7 days', trial: true });
  assert.equal(joinCharge({ totalP: 200000, planName: 'Monthly' }, { days: 3, feeP: 0 }), null);
  assert.equal(joinCharge({ totalP: 50, planName: 'Tiny' }), null, 'under a rupee is never a payment');
  assert.equal(joinCharge({ totalP: undefined, planName: 'Monthly' }), null);
});

test('what the page offers: a company link first, else the UPI ID; off when the switch is off or nothing is set up', () => {
  const conn = { provider: 'razorpay', mode: 'test' };
  assert.deepEqual(webOffer({ ready: false, web: true, conn, upi: 'a@b' }), { online: false, why: 'NOT_READY' });
  assert.deepEqual(webOffer({ ready: true, web: true, conn: null, upi: '' }), { online: false, why: 'NO_ACCOUNT' });
  assert.deepEqual(webOffer({ ready: true, web: false, conn, upi: '' }), { online: false, why: 'SWITCHED_OFF' });
  assert.deepEqual(webOffer({ ready: true, web: true, conn, upi: 'a@b' }), { online: true, how: 'link', testMode: true });
  assert.deepEqual(webOffer({ ready: true, web: true, conn: { ...conn, mode: 'live' }, upi: '' }), { online: true, how: 'link', testMode: false });
  assert.deepEqual(webOffer({ ready: true, web: true, conn: null, upi: 'a@b' }), { online: true, how: 'upi', testMode: false });
  assert.equal(phoneOfProof(PROOF), '9000081001');
  assert.equal(phoneOfProof('v1.member.9000081001.1.x.y'), '');
  const v = joinView({ id: 'pr_1', provider: '', amount_p: 200000, label: 'Monthly', payee: 'Shakti Gym', upi: 'a@b', link_url: '', mode: '', status: 'paid', failed_at: '', paid_p: 200000 });
  assert.equal(v.upiId, null, 'a closed payment shows no way to pay again');
  assert.equal(v.how, 'upi');
});

// ------------------------------------------------------------------ "can this gym be paid online?"

test('pay-info: online only with 0016, 0081, the signature, an account and the switch on', quiet(async () => {
  const n = net();
  const gs = gymServer();
  const before0016 = env({}, { skip: ['0016_pay_switches.sql'] });
  await connectRazorpay(before0016);
  assert.deepEqual((await jp(before0016, gs, n, '/api/self-join/pay-info', { code: 'qa0002' })).body, { online: false });

  const e = env();
  assert.deepEqual((await jp(e, gs, n, '/api/self-join/pay-info', { code: 'QA0002' })).body, { online: false }, 'no account set up');
  await setUpi(e);
  assert.deepEqual((await jp(e, gs, n, '/api/self-join/pay-info', { code: 'QA0002' })).body, { online: true, how: 'upi', testMode: false });
  await connectRazorpay(e);
  assert.deepEqual((await jp(e, gs, n, '/api/self-join/pay-info', { code: 'QA0002' })).body, { online: true, how: 'link', testMode: false });
  // The gym server is asked with the Worker's signature, never a bare code.
  const ask = gs.calls.find((c) => c.fn === 'self_join_pay_gym');
  assert.match(ask.args.p_sig, /^[0-9a-f]{64}$/);
  assert.equal(ask.args.p_code, 'QA0002');

  // Before 0081 on the gym server, or with no secret: pay at the desk.
  assert.deepEqual((await jp(e, gymServer({ has0081: false }), n, '/api/self-join/pay-info', { code: 'QA0002' })).body, { online: false });
  assert.deepEqual((await jp({ ...e, PHONE_CODE_SECRET: '' }, gs, n, '/api/self-join/pay-info', { code: 'QA0002' })).body, { online: false });

  // The owner switches the web page off (owner only); the page goes back to pay at the desk.
  assert.equal((await desk(e, n, '/api/pay/switches', { key: DESK_KEY, web: false })).status, 403);
  assert.deepEqual((await desk(e, n, '/api/pay/switches', { key: OWNER_KEY, web: false })).body, { switches: { ready: true, app: true, web: false } });
  assert.deepEqual((await jp(e, gs, n, '/api/self-join/pay-info', { code: 'QA0002' })).body, { online: false });
  assert.deepEqual((await desk(e, n, '/api/pay/desk', { key: OWNER_KEY })).body.switches, { ready: true, app: true, web: false });
  // Before 0016 the switches cannot be saved and read as greyed.
  assert.deepEqual((await desk(before0016, n, '/api/pay/switches', { key: OWNER_KEY, web: false })).body, { on: false, why: 'NOT_READY' });
  assert.deepEqual((await desk(before0016, n, '/api/pay/desk', { key: OWNER_KEY })).body.switches, { ready: false, app: true, web: true });
}));

// ------------------------------------------------------------------ the request, then its payment

test('a company link for the gym server price; sent twice = the same payment; the company says paid; the desk sees it', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const state = {};
  const n = net(state);
  const gs = gymServer();
  const a = await join(e, gs, n);
  assert.equal(a.status, 201);
  assert.equal(a.body.ok, true);
  assert.equal(a.body.pay.how, 'link');
  assert.equal(a.body.pay.url, 'https://rzp.io/i/join');
  assert.equal(a.body.pay.amountP, 200000);
  assert.equal(a.body.pay.testMode, false, 'payments are live: never a test payment for the public (R-555)');
  assert.equal(a.body.pay.status, 'open');
  assert.equal(state.made.amount, 200000, 'the price the gym server read, never one from the page');
  assert.equal(state.made.customer.contact, '9000081001', 'the number from the proof goes to the company only');
  assert.equal(a.body.enquiryId, undefined, 'the page is never told the enquiry id');
  // The page cannot set a price: an amount in the form is ignored.
  const b = await join(e, gs, n, { ...FORM, pay: 'online', totalP: 100, amountP: 100 });
  assert.equal(b.body.pay.id, a.body.pay.id, 'the same request: the same payment and link');
  const rows = (await e.WEB.prepare("SELECT * FROM pay_requests WHERE kind = 'join'").all()).results;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ref, SENT.enquiryId);
  assert.equal(rows[0].member_id, '', 'no member is made or named');

  // Not paid yet: the desk sees "not paid"; the page sees open.
  let list = (await desk(e, n, '/api/pay/joins', { key: DESK_KEY })).body.joins;
  assert.deepEqual(list.map((j) => [j.ref, j.status, j.said]), [[SENT.enquiryId, 'open', false]]);
  state.link = { id: 'plink_1', status: 'paid', payments: [{ payment_id: 'pay_JOIN1', status: 'captured', amount: 200000, method: 'upi' }] };
  // (After the desk's look at 06:02, which now also asks the company: review round 2, R-542.)
  const paid = await jp(e, gs, n, '/api/self-join/pay-check', { id: a.body.pay.id }, Date.parse('2026-11-14T06:03:00Z'));
  assert.equal(paid.body.pay.status, 'paid');
  assert.equal(paid.body.pay.url, null);
  assert.equal(paid.body.pay.paymentId, undefined, 'the page never sees the payment id');
  list = (await desk(e, n, '/api/pay/joins', { key: OWNER_KEY })).body.joins;
  assert.equal(list[0].status, 'paid');
  assert.equal(list[0].paymentId, 'pay_JOIN1');
  // Paid: sending the form again never starts a second payment.
  const again = await join(e, gs, n);
  assert.equal(again.body.pay.status, 'paid');
  assert.equal((await e.WEB.prepare("SELECT COUNT(*) AS n FROM pay_requests WHERE kind = 'join'").first()).n, 1);
  // The desk's receipt sweep (fees only) leaves it for Approve; "paid" lists it until the receipt is made.
  assert.equal((await desk(e, n, '/api/pay/paid', { key: OWNER_KEY })).body.paid.length, 1);
}));

test('a failed or abandoned payment keeps the request "Not paid"; the person can try again', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const state = {};
  const n = net(state);
  const gs = gymServer();
  const a = await join(e, gs, n);
  state.link = { id: 'plink_1', status: 'created', payments: [{ payment_id: 'pay_X', status: 'failed', amount: 200000 }] };
  const tried = await jp(e, gs, n, '/api/self-join/pay-check', { id: a.body.pay.id });
  assert.equal(tried.body.pay.status, 'open');
  assert.equal(tried.body.pay.failed, true);
  assert.equal(tried.body.pay.url, 'https://rzp.io/i/join', 'the same link can be tried again');
  const list = (await desk(e, n, '/api/pay/joins', { key: OWNER_KEY })).body.joins;
  assert.deepEqual(list.map((j) => [j.status, j.failed]), [['open', true]]);
  // The link ran out: closed, still not paid; the request itself is the gym server's and is never touched here.
  state.link = { id: 'plink_1', status: 'expired', payments: [] };
  const later = await jp(e, gs, n, '/api/self-join/pay-check', { id: a.body.pay.id }, Date.parse('2026-11-14T07:00:00Z'));
  assert.equal(later.body.pay.status, 'expired');
  assert.equal(gs.calls.filter((c) => c.fn === 'self_join_send').length, 1, 'no second request, no member');
}));

test('a plain UPI ID: "I have paid" marks it for the desk to check the bank; a company payment cannot be "said" paid', quiet(async () => {
  const e = env();
  await setUpi(e);
  const n = net();
  const gs = gymServer();
  const a = await join(e, gs, n);
  assert.equal(a.body.pay.how, 'upi');
  assert.equal(a.body.pay.upiId, 'shaktigym@okhdfc');
  assert.equal(a.body.pay.url, null);
  assert.equal(a.body.pay.said, false);
  const said = await jp(e, gs, n, '/api/self-join/pay-said', { id: a.body.pay.id });
  assert.equal(said.body.pay.said, true);
  assert.equal(said.body.pay.status, 'open', 'nobody confirmed it: still open until the desk checks');
  const list = (await desk(e, n, '/api/pay/joins', { key: DESK_KEY })).body.joins;
  assert.deepEqual(list.map((j) => [j.status, j.said, j.provider]), [['open', true, null]]);

  const e2 = env();
  await connectRazorpay(e2);
  const b = await join(e2, gs, net());
  const no = await jp(e2, gs, net(), '/api/self-join/pay-said', { id: b.body.pay.id });
  assert.equal(no.body.pay.said, false);
  assert.equal((await jp(e2, gs, net(), '/api/self-join/pay-check', { id: 'pr_nope' })).status, 404);
  assert.equal((await jp(e2, gs, net(), '/api/self-join/pay-check', { id: 'pr_0123456789abcdef0123' })).status, 404);
}));

test('pay at the desk stays: chosen, before 0081, link refused with no UPI, or switched off - the request is kept every time', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  const gs = gymServer();
  const desk1 = await join(e, gs, net(), { ...FORM });
  assert.equal(desk1.status, 201);
  assert.equal(desk1.body.pay, undefined);
  assert.equal((await e.WEB.prepare('SELECT COUNT(*) AS n FROM pay_requests').first()).n, 0);

  const before = await join(e, gymServer({ has0081: false }), net());
  assert.equal(before.status, 201);
  assert.equal(before.body.payWhy, 'NOT_READY');

  const refused = await join(e, gs, net({ refuse: true }));
  assert.equal(refused.status, 201);
  assert.equal(refused.body.payWhy, 'LINK_FAILED');
  assert.equal((await e.WEB.prepare("SELECT status FROM pay_requests WHERE kind = 'join'").first()).status, 'cancelled');

  await desk(e, net(), '/api/pay/switches', { key: OWNER_KEY, web: false });
  const off = await join(e, gs, net());
  assert.equal(off.status, 201);
  assert.equal(off.body.payWhy, 'SWITCHED_OFF');
}));

test('"Take payments in the member app" off: the app still shows what is owed, with no QR, UPI link or payment page', quiet(async () => {
  const e = env();
  await connectRazorpay(e);
  await setUpi(e);
  const n = net();
  const made = await desk(e, n, '/api/pay/request', { key: OWNER_KEY, kind: 'fee', memberId: 'm-1', ref: 'ms-1', amountP: 150000, label: 'Monthly', note: 'R-1', upiId: 'shaktigym@okhdfc', payee: 'Shakti Gym' });
  assert.equal(made.body.request.url, 'https://rzp.io/i/join');
  let mine = (await desk(e, n, '/api/pay/mine', { memberKey: MEMBER_KEY })).body;
  assert.equal(mine.requests[0].url, 'https://rzp.io/i/join');
  assert.equal(mine.gymUpi, 'shaktigym@okhdfc');
  await desk(e, n, '/api/pay/switches', { key: OWNER_KEY, app: false });
  mine = (await desk(e, n, '/api/pay/mine', { memberKey: MEMBER_KEY })).body;
  assert.equal(mine.appPay, false);
  assert.equal(mine.requests.length, 1, 'what the member owes still shows');
  assert.equal(mine.requests[0].amountP, 150000);
  assert.equal(mine.requests[0].url, null);
  assert.equal(mine.requests[0].upiId, null);
  assert.equal(mine.requests[0].deskOnly, true);
  assert.equal(mine.gymUpi, null);
  const check = (await desk(e, n, '/api/pay/member-check', { memberKey: MEMBER_KEY, id: made.body.request.id })).body.request;
  assert.equal(check.deskOnly, true);
  assert.equal(check.url, null);
  assert.deepEqual((await desk(e, n, '/api/pay/shop', { memberKey: MEMBER_KEY, orderId: 'o-1' })).body, { on: true, deskOnly: true, request: null });
  // The desk's own link is not the member app: it still works.
  const deskLink = (await desk(e, n, '/api/pay/check', { key: DESK_KEY, id: made.body.request.id })).body.request;
  assert.equal(deskLink.url, 'https://rzp.io/i/join');
}));

// ------------------------------------------------------------------ R-555: the JOIN_PAY switch and live-only links

test('JOIN_PAY off (the owner hold): pay at the desk, nothing asked, nothing made, no payment to check', quiet(async () => {
  for (const flag of [undefined, '', 'off', 'on', 'LIVE', true]) {
    const e = env({ JOIN_PAY: flag });
    await connectRazorpay(e);
    await setUpi(e);
    const state = {};
    const n = net(state);
    const gs = gymServer();
    const info = await jp(e, gs, n, '/api/self-join/pay-info', { code: 'QA0002' });
    assert.equal(info.status, 200);
    assert.deepEqual(info.body, { online: false }, String(flag));
    assert.deepEqual(await offerForCode(e, gs.rpc, 'QA0002'), { online: false, why: 'OFF' });
    assert.equal(gs.calls.filter((c) => c.fn === 'self_join_pay_gym').length, 0, 'the gym server is not asked');
    // The form sent with "pay": "online" anyway: the request is kept, with no payment.
    const sent = await join(e, gs, n);
    assert.equal(sent.status, 201);
    assert.equal(sent.body.ok, true);
    assert.equal(sent.body.pay, undefined);
    assert.equal(sent.body.payWhy, 'OFF');
    assert.equal(state.made, undefined, 'no company link made');
    assert.equal((await e.WEB.prepare('SELECT COUNT(*) AS n FROM pay_requests').first()).n, 0);
    assert.deepEqual(await attachJoinPay(e, gs.rpc, { code: 'QA0002', enquiryId: SENT.enquiryId, totalP: 200000, planName: 'Monthly', proof: PROOF }, { f: n.f }), { why: 'OFF' });
    for (const path of ['/api/self-join/pay-check', '/api/self-join/pay-said']) {
      assert.equal((await jp(e, gs, n, path, { id: 'pr_0123456789abcdef0123' })).status, 404, path);
    }
    assert.equal(n.calls.length, 0, 'no outside call at all');
  }
}));

test('JOIN_PAY live but payments in test mode: never a test company link for the public; a UPI ID still works', quiet(async () => {
  const e = env({ PAY_LIVE: undefined });
  await connectRazorpay(e, 'test');
  const state = {};
  const n = net(state);
  const gs = gymServer();
  assert.deepEqual((await jp(e, gs, n, '/api/self-join/pay-info', { code: 'QA0002' })).body, { online: false }, 'only a test-mode company: pay at the desk');
  const noUpi = await join(e, gs, n);
  assert.equal(noUpi.status, 201);
  assert.equal(noUpi.body.payWhy, 'NO_ACCOUNT');
  assert.equal(state.made, undefined);
  await setUpi(e);
  assert.deepEqual((await jp(e, gs, n, '/api/self-join/pay-info', { code: 'QA0002' })).body, { online: true, how: 'upi', testMode: false });
  const upi = await join(e, gs, n);
  assert.equal(upi.body.pay.how, 'upi');
  assert.equal(upi.body.pay.url, null);
  assert.equal(upi.body.pay.testMode, false);
  assert.equal(state.made, undefined, 'the test company is never asked for a link');
  // Live payments with a live connection: the company link (the tests above).
  const live = env();
  await connectRazorpay(live);
  assert.deepEqual((await jp(live, gs, net(), '/api/self-join/pay-info', { code: 'QA0002' })).body, { online: true, how: 'link', testMode: false });
}));
