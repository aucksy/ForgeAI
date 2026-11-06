// node --test deploy/hq/billing.test.mjs  (CI: ci.yml "HQ Worker and page tests"). Billing step 3.
// Every secret here is MADE UP for the test; no payment company and no database is ever reached.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { BILLING_PROVIDERS, billingSettings, handleBilling, orderMismatch, runBillingDaily, sendRenewalMessage } from './billing.js';
import { DbError } from './db.js';

const RZP_HOOK_SECRET = 'made-up-webhook-secret-123';
const CF_SECRET = 'cfsk_ma_test_madeup_0123456789';
const ENV_RZP = {
  BILLING: 'test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_HQ_KEY: 'made-up-server-key',
  RAZORPAY_KEY_ID: 'rzp_test_MadeUpKey1234',
  RAZORPAY_KEY_SECRET: 'made-up-key-secret-xyz',
  RAZORPAY_WEBHOOK_SECRET: RZP_HOOK_SECRET,
};
const ENV_CF = {
  BILLING: 'test',
  BILLING_PROVIDER: 'cashfree',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_HQ_KEY: 'made-up-server-key',
  CASHFREE_APP_ID: 'TEST1234567890',
  CASHFREE_SECRET_KEY: CF_SECRET,
};

const rzpSign = (raw, secret = RZP_HOOK_SECRET) => createHmac('sha256', secret).update(raw).digest('hex');
const cfSign = (ts, raw, secret = CF_SECRET) => createHmac('sha256', secret).update(ts + raw).digest('base64');

function rzpPaid({ linkId = 'plink_TEST1', payId = 'pay_TEST1', amount = 149900, currency = 'INR' } = {}) {
  return JSON.stringify({
    event: 'payment_link.paid',
    payload: {
      payment_link: { entity: { id: linkId, amount, currency, reference_id: 'mu_abc1234567', status: 'paid' } },
      payment: { entity: { id: payId, amount, currency, status: 'captured', method: 'upi' } },
    },
  });
}

function hookRequest(path, raw, headers) {
  return new Request(`https://hq.mettleup.fit${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: raw });
}

/** A stand-in database: one checkout of Rs 1,499 on link plink_TEST1; apply happens at most once. */
function fakeDb({ amountPaise = 149900 } = {}) {
  const calls = [];
  const state = { status: 'open', applied: 0, paymentId: null };
  async function call(_env, fn, args) {
    calls.push({ fn, args });
    if (fn === 'hq_billing_order') {
      if (args.p_link_id !== 'plink_TEST1' && args.p_link_id !== 'mu_cf_link_1') throw new DbError('UNKNOWN_ORDER', 400);
      return { checkoutId: 'c1', amountPaise, currency: 'INR', status: state.status, kind: 'renew' };
    }
    if (fn === 'hq_billing_paid') {
      if (state.status === 'paid') return { duplicate: true, checkoutId: 'c1' };
      // The database checks the amount again (0063 hq_billing_paid).
      if (args.p_amount_paise !== amountPaise || args.p_currency !== 'INR') return { error: 'AMOUNT_MISMATCH', checkoutId: 'c1' };
      state.status = 'paid';
      state.applied += 1;
      state.paymentId = args.p_payment_id;
      return { applied: true, receiptNo: 'MU-2026-0001', checkoutId: 'c1' };
    }
    throw new Error(`unexpected ${fn}`);
  }
  return { call, calls, state };
}

// ---------------------------------------------------------------- settings: off by default, test only

test('billing is off until every setting exists, and a live key is refused', () => {
  assert.equal(billingSettings({}).on, false);
  assert.ok(billingSettings({}).missing.includes('BILLING'));
  assert.equal(billingSettings(ENV_RZP).on, true);
  assert.equal(billingSettings({ ...ENV_RZP, BILLING: 'live' }).on, false);
  assert.ok(billingSettings({ ...ENV_RZP, RAZORPAY_KEY_ID: 'rzp_live_MadeUpKey1234' }).missing.includes('RAZORPAY_KEY_ID'));
  assert.equal(billingSettings({ ...ENV_RZP, RAZORPAY_WEBHOOK_SECRET: '' }).on, false);
  assert.equal(billingSettings(ENV_CF).on, true);
  assert.ok(billingSettings({ ...ENV_CF, CASHFREE_SECRET_KEY: 'cfsk_ma_prod_madeup_0123456789' }).missing.includes('CASHFREE_SECRET_KEY'));
  assert.equal(billingSettings({ ...ENV_RZP, BILLING_PROVIDER: 'payu' }).on, false);
});

test('not set up: every route answers 503 NOT_SET_UP and touches nothing', async () => {
  const db = fakeDb();
  const raw = rzpPaid();
  for (const path of ['/billing/checkout', '/billing/hook/razorpay', '/billing/hook/cashfree']) {
    const res = await handleBilling(hookRequest(path, raw, { 'x-razorpay-signature': rzpSign(raw) }), {}, { call: db.call });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'NOT_SET_UP' });
  }
  assert.equal(db.calls.length, 0);
});

// ---------------------------------------------------------------- signatures

test('Razorpay signature: hex HMAC-SHA256 over the RAW body', async () => {
  const raw = rzpPaid();
  const h = (sig) => new Headers(sig === undefined ? {} : { 'x-razorpay-signature': sig });
  assert.equal(await BILLING_PROVIDERS.razorpay.verify(ENV_RZP, raw, h(rzpSign(raw))), true);
  // The same JSON re-encoded (one space) is not the signed body.
  assert.equal(await BILLING_PROVIDERS.razorpay.verify(ENV_RZP, raw.replace('"event":', '"event": '), h(rzpSign(raw))), false);
  assert.equal(await BILLING_PROVIDERS.razorpay.verify(ENV_RZP, raw, h(rzpSign(raw, 'another-made-up-secret'))), false);
  assert.equal(await BILLING_PROVIDERS.razorpay.verify(ENV_RZP, raw, h(undefined)), false);
  assert.equal(await BILLING_PROVIDERS.razorpay.verify({ ...ENV_RZP, RAZORPAY_WEBHOOK_SECRET: '' }, raw, h(rzpSign(raw, ''))), false);
});

test('Cashfree signature: base64 HMAC-SHA256 over timestamp + raw body', async () => {
  const raw = JSON.stringify({ type: 'PAYMENT_LINK_EVENT', data: { link_id: 'mu_cf_link_1', link_status: 'PAID' } });
  const ts = '1762412345678';
  const h = (sig, t = ts) => new Headers({ 'x-webhook-signature': sig, 'x-webhook-timestamp': t });
  assert.equal(await BILLING_PROVIDERS.cashfree.verify(ENV_CF, raw, h(cfSign(ts, raw))), true);
  assert.equal(await BILLING_PROVIDERS.cashfree.verify(ENV_CF, raw, h(cfSign(ts, raw), '1762412345679')), false);
  assert.equal(await BILLING_PROVIDERS.cashfree.verify(ENV_CF, `${raw} `, h(cfSign(ts, raw))), false);
  assert.equal(await BILLING_PROVIDERS.cashfree.verify(ENV_CF, raw, new Headers({ 'x-webhook-signature': cfSign(ts, raw) })), false);
});

test('a webhook with a bad signature is refused before the database is asked', async () => {
  const db = fakeDb();
  const raw = rzpPaid();
  const res = await handleBilling(hookRequest('/billing/hook/razorpay', raw, { 'x-razorpay-signature': rzpSign(raw, 'wrong-made-up-secret') }), ENV_RZP, { call: db.call });
  assert.equal(res.status, 401);
  assert.equal(db.calls.length, 0);
  assert.equal(db.state.applied, 0);
});

test('the other company\'s webhook path is not open (one company at a time)', async () => {
  const db = fakeDb();
  const raw = rzpPaid();
  const res = await handleBilling(hookRequest('/billing/hook/cashfree', raw, {}), ENV_RZP, { call: db.call });
  assert.equal(res.status, 404);
  assert.equal(db.calls.length, 0);
});

// ---------------------------------------------------------------- amount, duplicate, happy path

test('orderMismatch: whole paise and INR only', () => {
  assert.equal(orderMismatch({ amountPaise: 149900, currency: 'INR' }, { amountPaise: 149900, currency: 'INR' }), null);
  assert.equal(orderMismatch({ amountPaise: 149900, currency: 'INR' }, { amountPaise: 100, currency: 'INR' }), 'AMOUNT_MISMATCH');
  assert.equal(orderMismatch({ amountPaise: 149900, currency: 'INR' }, { amountPaise: 149900, currency: 'USD' }), 'AMOUNT_MISMATCH');
  assert.equal(orderMismatch({ amountPaise: 149900, currency: 'INR' }, { amountPaise: 149900.5, currency: 'INR' }), 'AMOUNT_MISMATCH');
  assert.equal(orderMismatch({ amountPaise: 149900, currency: 'INR' }, { amountPaise: NaN, currency: 'INR' }), 'AMOUNT_MISMATCH');
});

test('happy path: a signed "paid" applies the payment once', async () => {
  const db = fakeDb();
  const raw = rzpPaid();
  const res = await handleBilling(hookRequest('/billing/hook/razorpay', raw, { 'x-razorpay-signature': rzpSign(raw) }), ENV_RZP, { call: db.call });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { applied: true, receiptNo: 'MU-2026-0001' });
  assert.deepEqual(db.calls.map((c) => c.fn), ['hq_billing_order', 'hq_billing_paid']);
  assert.deepEqual(db.calls[1].args, { p_provider: 'razorpay', p_link_id: 'plink_TEST1', p_payment_id: 'pay_TEST1', p_amount_paise: 149900, p_currency: 'INR' });
  assert.equal(db.state.applied, 1);
});

test('amount mismatch: answered 200 (no retries) and never applied', async () => {
  const db = fakeDb();
  const raw = rzpPaid({ amount: 100 });
  const res = await handleBilling(hookRequest('/billing/hook/razorpay', raw, { 'x-razorpay-signature': rzpSign(raw) }), ENV_RZP, { call: db.call });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { error: 'AMOUNT_MISMATCH' });
  assert.equal(db.state.applied, 0);
  // The paid amount (not the order's) goes to the database, which records the mismatch.
  assert.equal(db.calls[1].args.p_amount_paise, 100);
});

test('wrong currency: never applied', async () => {
  const db = fakeDb();
  const raw = rzpPaid({ currency: 'USD' });
  const res = await handleBilling(hookRequest('/billing/hook/razorpay', raw, { 'x-razorpay-signature': rzpSign(raw) }), ENV_RZP, { call: db.call });
  assert.deepEqual(await res.json(), { error: 'AMOUNT_MISMATCH' });
  assert.equal(db.state.applied, 0);
});

test('duplicate webhook: the second one changes nothing', async () => {
  const db = fakeDb();
  const raw = rzpPaid();
  const send = () => handleBilling(hookRequest('/billing/hook/razorpay', raw, { 'x-razorpay-signature': rzpSign(raw) }), ENV_RZP, { call: db.call });
  assert.equal((await send()).status, 200);
  const second = await send();
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { duplicate: true });
  assert.equal(db.state.applied, 1);
});

test('events that are not "paid", and links that are not ours, are ignored with 200', async () => {
  const db = fakeDb();
  const other = JSON.stringify({ event: 'payment.captured', payload: {} });
  let res = await handleBilling(hookRequest('/billing/hook/razorpay', other, { 'x-razorpay-signature': rzpSign(other) }), ENV_RZP, { call: db.call });
  assert.deepEqual(await res.json(), { ignored: true });
  const foreign = rzpPaid({ linkId: 'plink_SOMEONE_ELSE' });
  res = await handleBilling(hookRequest('/billing/hook/razorpay', foreign, { 'x-razorpay-signature': rzpSign(foreign) }), ENV_RZP, { call: db.call });
  assert.equal(res.status, 200);
  assert.equal(db.state.applied, 0);
});

test('a database outage answers 503 so the company retries later', async () => {
  const raw = rzpPaid();
  const call = async () => {
    throw new DbError('OFFLINE', 503);
  };
  const res = await handleBilling(hookRequest('/billing/hook/razorpay', raw, { 'x-razorpay-signature': rzpSign(raw) }), ENV_RZP, { call });
  assert.equal(res.status, 503);
});

test('Cashfree "paid" link webhook: amount in rupees becomes paise; applied once', async () => {
  const db = fakeDb();
  const raw = JSON.stringify({
    type: 'PAYMENT_LINK_EVENT',
    data: { link_id: 'mu_cf_link_1', link_status: 'PAID', link_amount: 1499, link_amount_paid: 1499, link_currency: 'INR', order: { order_id: 'CF_ORDER_1', transaction_id: 77001, transaction_status: 'SUCCESS' } },
  });
  const ts = '1762412345678';
  const res = await handleBilling(hookRequest('/billing/hook/cashfree', raw, { 'x-webhook-signature': cfSign(ts, raw), 'x-webhook-timestamp': ts }), ENV_CF, { call: db.call });
  assert.deepEqual(await res.json(), { applied: true, receiptNo: 'MU-2026-0001' });
  assert.equal(db.calls[1].args.p_amount_paise, 149900);
  assert.equal(db.calls[1].args.p_payment_id, '77001');
});

// ---------------------------------------------------------------- checkout: the price comes from the server

test('checkout: the link is made for the SERVER\'s amount, never the browser\'s', async () => {
  const calls = [];
  const call = async (_env, fn, args) => {
    calls.push({ fn, args });
    if (fn === 'hq_billing_checkout_start') {
      return { checkoutId: 'c9', ref: 'mu_0123456789abcdef', kind: 'renew', plan: 'pro', billing: 'monthly', amountPaise: 149900, currency: 'INR',
        description: 'MettleUp Pro, 1 month', gymName: 'Test Gym', gymCode: 'TEST01', name: 'Owner', phone: null, linkUrl: null, reuse: false };
    }
    if (fn === 'hq_billing_checkout_link') return { checkoutId: 'c9', linkUrl: args.p_link_url };
    throw new Error(`unexpected ${fn}`);
  };
  let sent = null;
  const fetchImpl = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
    return new Response(JSON.stringify({ id: 'plink_NEW1', short_url: 'https://rzp.io/i/test1' }), { status: 200 });
  };
  const req = new Request('https://hq.mettleup.fit/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'owner-key-made-up', plan: 'pro', billing: 'monthly', amountPaise: 100 }),
  });
  const res = await handleBilling(req, ENV_RZP, { call, fetchImpl });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { url: 'https://rzp.io/i/test1', amountPaise: 149900, kind: 'renew', reuse: false });
  assert.equal(sent.url, 'https://api.razorpay.com/v1/payment_links');
  assert.equal(sent.body.amount, 149900);
  assert.equal(sent.body.currency, 'INR');
  assert.equal(sent.body.reference_id, 'mu_0123456789abcdef');
  // No price ever reaches the database from the browser.
  assert.deepEqual(calls[0].args, { p_key: 'owner-key-made-up', p_plan: 'pro', p_billing: 'monthly', p_provider: 'razorpay' });
  assert.deepEqual(calls[1].args, { p_checkout: 'c9', p_link_id: 'plink_NEW1', p_link_url: 'https://rzp.io/i/test1' });
});

test('checkout: refusals from the server come back as their word; Pro + AI is refused before the server', async () => {
  const call = async () => {
    throw new DbError('FOUNDING_FULL', 400);
  };
  const ask = (plan, billing) => handleBilling(new Request('https://hq.mettleup.fit/billing/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'owner-key-made-up', plan, billing }),
  }), ENV_RZP, { call, fetchImpl: async () => assert.fail('no company call') });
  let res = await ask('pro', 'lifetime');
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'FOUNDING_FULL' });
  res = await ask('ai', 'monthly');
  assert.deepEqual(await res.json(), { error: 'BAD_INPUT' });
});

test('checkout: a refused link closes the checkout (a founding place is freed)', async () => {
  const calls = [];
  const call = async (_env, fn, args) => {
    calls.push(fn);
    if (fn === 'hq_billing_checkout_start') return { checkoutId: 'c5', ref: 'mu_0123456789abcdef', kind: 'founding', amountPaise: 2999900, currency: 'INR', reuse: false };
    return null;
  };
  const fetchImpl = async () => new Response(JSON.stringify({ error: { description: 'bad' } }), { status: 400 });
  const res = await handleBilling(new Request('https://hq.mettleup.fit/billing/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'owner-key-made-up', plan: 'pro', billing: 'lifetime' }),
  }), ENV_RZP, { call, fetchImpl });
  assert.deepEqual(await res.json(), { error: 'LINK_REFUSED' });
  assert.deepEqual(calls, ['hq_billing_checkout_start', 'hq_billing_checkout_failed']);
});

// ---------------------------------------------------------------- nightly + the message stub

test('nightly billing: off = nothing asked; before 0063 = skipped quietly; messages are a stub that sends nothing', async () => {
  let asked = 0;
  assert.deepEqual(await runBillingDaily({}, { call: async () => { asked += 1; } }), { skipped: 'not set up' });
  assert.equal(asked, 0);
  assert.deepEqual(await runBillingDaily(ENV_RZP, { call: async () => { throw new DbError('NOT_READY', 400); } }), { skipped: 'migration 0063 not applied' });
  const out = await runBillingDaily({ ...ENV_RZP, BILLING_MESSAGES: 'on' }, {
    call: async () => ({ downgraded: 1, reminders: [{ gymId: 'g1', daysBefore: 7 }, { gymId: 'g2', daysBefore: 1 }] }),
  });
  assert.deepEqual(out, { downgraded: 1, reminders: 2, sent: 0 });
  assert.equal(sendRenewalMessage({}, { daysBefore: 3 }).sent, false);
  assert.equal(sendRenewalMessage({ BILLING_MESSAGES: 'on' }, { daysBefore: 3 }).link, 'https://app.mettleup.fit/#/settings/mettleup');
});
