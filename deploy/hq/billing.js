// Billing step 3 (docs/overhaul/BILLING-DESIGN.md, R-382/R-385, 6 Nov 2026): a gym owner buys a MettleUp
// plan online, and the payment company's webhook turns the payment into a plan. TEST MODE ONLY and OFF by
// default. Database side: supabase/migrations/0063_gym_checkout.sql (NOT APPLIED).
//
// WHY HERE (the HQ Worker) AND NOT THE GYM PANEL: turning a payment into a plan (apply_gym_payment) needs the
// server key, and only this Worker holds it (SUPABASE_HQ_KEY). The panel Worker has only the public key, so
// it forwards the owner's "buy" to this Worker (deploy/panel/worker.js /api/billing/checkout, service
// binding HQ_PUSH) and never sees a payment-company key. These routes need no HQ sign-in: the webhook is
// proven by the company's signature, the checkout by the gym owner's own key (checked in the database).
//
//   POST /billing/checkout        {key, plan, billing}  -> {url, amountPaise, kind, reuse} | {error}
//   POST /billing/hook/razorpay   Razorpay webhook (X-Razorpay-Signature = hex HMAC-SHA256(raw body, secret))
//   POST /billing/hook/cashfree   Cashfree webhook (x-webhook-signature = base64 HMAC-SHA256(timestamp + raw body))
//   nightly (worker.js scheduled) runBillingDaily: due downgrades + plan-end reminders (messages: a stub, off)
//   nightly, its own Cron Trigger (worker.js BILLING_CRON) runBillingReconcile: asks the company about every
//     link we opened in the last 48 hours that is still open here; one it says is paid goes through
//     hq_billing_paid, the same single path as the webhook (0064; a payment already applied is a harmless
//     duplicate). Catches a webhook that never arrived.
//
// SETTINGS (none exist yet; while any is missing every route answers 503 NOT_SET_UP and does nothing):
//   var    BILLING                 "test" switches this on (test mode). Unset or anything else = off.
//                                  There is no live mode in this file yet: "payments live" is the owner's word.
//   var    BILLING_PROVIDER        "razorpay" (default) or "cashfree": one company at a time.
//   secret RAZORPAY_KEY_ID         MettleUp's own Razorpay TEST key id (rzp_test_...; a live key is refused)
//   secret RAZORPAY_KEY_SECRET     its key secret
//   secret RAZORPAY_WEBHOOK_SECRET the secret typed when adding the webhook in Razorpay's dashboard
//                                  (URL https://hq.mettleup.fit/billing/hook/razorpay, event payment_link.paid)
//   secret CASHFREE_APP_ID         MettleUp's own Cashfree TEST app id (sandbox)
//   secret CASHFREE_SECRET_KEY     its secret key (also signs Cashfree's webhooks; a _prod_ key is refused)
//   secret SUPABASE_HQ_KEY         already there (HQ's server key)
//   var    BILLING_RECONCILE_MAX   optional: at most this many links asked about per night (default 20 for
//                                  Razorpay, 10 for Cashfree, which needs 3 calls a link; the free plan allows
//                                  50 calls per run). The oldest open links go first.
//   var    BILLING_MESSAGES       "on" would send plan-end reminders by WhatsApp/SMS: NOT BUILT, a stub that
//                                  sends nothing either way. The admin app shows its own reminder.
// And the database's own switch: app_config 'billing_checkout' (0063), off.
//
// Nothing here logs a key, a secret, a signature or an owner key.

import { hmac256, sameText, toB64, toHex } from '../panel/payCrypto.js';
import { DbError, rpc } from './db.js';

export const HQ_ORIGIN = 'https://hq.mettleup.fit';
export const PAY_NOW_URL = 'https://app.mettleup.fit/#/settings/mettleup';
const LINK_HOURS = 24;

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const clip = (s, n) => str(s).slice(0, n);

export function jsonAnswer(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/**
 * Is online buying set up on this Worker? -> {on, provider, missing: [names]}. Test mode only: a live key
 * counts as missing (it must never be used before the owner says "payments live"). PURE.
 */
export function billingSettings(env) {
  const e = env || {};
  const provider = str(e.BILLING_PROVIDER || 'razorpay').trim().toLowerCase();
  const missing = [];
  if (str(e.BILLING).trim().toLowerCase() !== 'test') missing.push('BILLING');
  if (!e.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!e.SUPABASE_HQ_KEY) missing.push('SUPABASE_HQ_KEY');
  if (provider === 'razorpay') {
    if (!/^rzp_test_[A-Za-z0-9]{8,32}$/.test(str(e.RAZORPAY_KEY_ID).trim())) missing.push('RAZORPAY_KEY_ID');
    if (str(e.RAZORPAY_KEY_SECRET).trim().length < 12) missing.push('RAZORPAY_KEY_SECRET');
    if (str(e.RAZORPAY_WEBHOOK_SECRET).length < 8) missing.push('RAZORPAY_WEBHOOK_SECRET');
  } else if (provider === 'cashfree') {
    if (str(e.CASHFREE_APP_ID).trim().length < 8) missing.push('CASHFREE_APP_ID');
    const sk = str(e.CASHFREE_SECRET_KEY).trim();
    if (sk.length < 12 || /_prod_/.test(sk)) missing.push('CASHFREE_SECRET_KEY');
  } else {
    missing.push('BILLING_PROVIDER');
  }
  return { on: missing.length === 0, provider, missing };
}

// ------------------------------------------------------------------------------ the two companies
// Payment links: the company's own secure page (UPI, card, net banking); no script on our pages.

const RZP = 'https://api.razorpay.com/v1';
const CF = 'https://sandbox.cashfree.com/pg'; // TEST (sandbox) only
const CF_VERSION = '2023-08-01';

async function companyCall(f, url, init) {
  let res;
  try {
    res = await f(url, init);
  } catch {
    return { status: 0, body: {} };
  }
  let body = {};
  try {
    const t = await res.text();
    body = t ? JSON.parse(t) : {};
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

export const BILLING_PROVIDERS = {
  razorpay: {
    /** order: the answer of hq_billing_checkout_start. -> {linkId, url} | {error} */
    async createLink(env, order, f = fetch) {
      const auth = `Basic ${btoa(`${str(env.RAZORPAY_KEY_ID).trim()}:${str(env.RAZORPAY_KEY_SECRET).trim()}`)}`;
      const body = {
        amount: order.amountPaise,
        currency: 'INR',
        accept_partial: false,
        reference_id: clip(order.ref, 40),
        description: clip(order.description, 2048),
        customer: { name: clip(order.name || order.gymName, 80), ...(order.phone ? { contact: str(order.phone) } : {}) },
        notify: { sms: false, email: false },
        reminder_enable: false,
        expire_by: Math.floor(Date.now() / 1000) + LINK_HOURS * 3600,
        callback_url: PAY_NOW_URL,
        callback_method: 'get',
        notes: { mettleup_checkout: clip(order.ref, 40), gym: clip(order.gymCode, 20) },
      };
      const r = await companyCall(f, `${RZP}/payment_links`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.status === 0 || r.status >= 500) return { error: 'UNREACHABLE' };
      if (r.status !== 200 || !r.body.id || !r.body.short_url) return { error: 'LINK_REFUSED' };
      return { linkId: str(r.body.id), url: str(r.body.short_url) };
    },
    /** The nightly check: what Razorpay says about one of our links. -> readRazorpayLink's answer | {error}. */
    async fetchPaid(env, linkId, f = fetch) {
      const auth = `Basic ${btoa(`${str(env.RAZORPAY_KEY_ID).trim()}:${str(env.RAZORPAY_KEY_SECRET).trim()}`)}`;
      const r = await companyCall(f, `${RZP}/payment_links/${encodeURIComponent(linkId)}`, { headers: { Authorization: auth } });
      if (r.status === 0 || r.status >= 500) return { error: 'UNREACHABLE' };
      if (r.status !== 200) return { error: 'REFUSED' };
      return readRazorpayLink(r.body);
    },
    async verify(env, raw, headers) {
      const got = str(headers.get('x-razorpay-signature'));
      const secret = str(env.RAZORPAY_WEBHOOK_SECRET);
      if (!secret || !got) return false;
      return sameText(toHex(await hmac256(secret, raw)), got);
    },
    /** -> {kind: 'paid', linkId, paymentId, amountPaise, currency} | {kind: 'other'}. PURE. */
    read(j) {
      if (str(j && j.event) !== 'payment_link.paid') return { kind: 'other' };
      const p = (j && j.payload) || {};
      const link = (p.payment_link && p.payment_link.entity) || {};
      const pay = (p.payment && p.payment.entity) || {};
      return { kind: 'paid', linkId: str(link.id), paymentId: str(pay.id), amountPaise: Number(pay.amount), currency: str(pay.currency).toUpperCase() };
    },
  },
  cashfree: {
    async createLink(env, order, f = fetch) {
      if (!order.phone) return { error: 'NEEDS_PHONE' };
      const body = {
        link_id: clip(order.ref, 50),
        link_amount: Number((order.amountPaise / 100).toFixed(2)),
        link_currency: 'INR',
        link_purpose: clip(order.description, 500),
        customer_details: { customer_phone: str(order.phone), customer_name: clip(order.name || order.gymName, 80) },
        link_partial_payments: false,
        link_notify: { send_sms: false, send_email: false },
        link_expiry_time: new Date(Date.now() + LINK_HOURS * 3600000).toISOString(),
        link_notes: { gym: clip(order.gymCode, 20) },
        link_meta: { notify_url: `${HQ_ORIGIN}/billing/hook/cashfree`, return_url: PAY_NOW_URL },
      };
      const r = await companyCall(f, `${CF}/links`, {
        method: 'POST',
        headers: {
          'x-api-version': CF_VERSION,
          'Content-Type': 'application/json',
          'x-client-id': str(env.CASHFREE_APP_ID).trim(),
          'x-client-secret': str(env.CASHFREE_SECRET_KEY).trim(),
        },
        body: JSON.stringify(body),
      });
      if (r.status === 0 || r.status >= 500) return { error: 'UNREACHABLE' };
      if (r.status !== 200 || !r.body.link_url) return { error: 'LINK_REFUSED' };
      return { linkId: str(r.body.link_id || body.link_id), url: str(r.body.link_url) };
    },
    /** The nightly check: the link, then its paid order, then that order's successful payment (the same id the
     *  webhook sends as transaction_id). Up to 3 calls. -> readCashfreeLink's answer | {error}. */
    async fetchPaid(env, linkId, f = fetch) {
      const headers = {
        'x-api-version': CF_VERSION,
        'x-client-id': str(env.CASHFREE_APP_ID).trim(),
        'x-client-secret': str(env.CASHFREE_SECRET_KEY).trim(),
      };
      const get = async (path) => {
        const r = await companyCall(f, `${CF}${path}`, { headers });
        if (r.status === 0 || r.status >= 500) return { error: 'UNREACHABLE' };
        if (r.status !== 200) return { error: 'REFUSED' };
        return { body: r.body };
      };
      const link = await get(`/links/${encodeURIComponent(linkId)}`);
      if (link.error) return link;
      if (str(link.body && link.body.link_status).toUpperCase() !== 'PAID') return readCashfreeLink(link.body, [], []);
      const orders = await get(`/links/${encodeURIComponent(linkId)}/orders`);
      if (orders.error) return orders;
      const list = Array.isArray(orders.body) ? orders.body : [];
      const order = list.find((o) => str(o && o.order_status).toUpperCase() === 'PAID');
      let pays = [];
      if (order && order.order_id) {
        const p = await get(`/orders/${encodeURIComponent(str(order.order_id))}/payments`);
        if (p.error) return p;
        pays = Array.isArray(p.body) ? p.body : [];
      }
      return readCashfreeLink(link.body, list, pays);
    },
    async verify(env, raw, headers) {
      const got = str(headers.get('x-webhook-signature'));
      const ts = str(headers.get('x-webhook-timestamp'));
      const secret = str(env.CASHFREE_SECRET_KEY).trim();
      if (!secret || !got || !ts) return false;
      return sameText(toB64(await hmac256(secret, ts + raw)), got);
    },
    read(j) {
      if (str(j && j.type) !== 'PAYMENT_LINK_EVENT') return { kind: 'other' };
      const d = (j && j.data) || {};
      if (str(d.link_status).toUpperCase() !== 'PAID') return { kind: 'other' };
      const o = d.order || {};
      return {
        kind: 'paid',
        linkId: str(d.link_id),
        paymentId: str(o.transaction_id || o.order_id),
        amountPaise: Math.round(Number(d.link_amount_paid) * 100),
        currency: str(d.link_currency).toUpperCase(),
      };
    },
  },
};

/**
 * Razorpay's answer for one payment link (GET /v1/payment_links/:id), in the webhook's shape. Paid only when
 * the link says "paid" AND one of its payments was captured. PURE.
 * -> {paid: true, paymentId, amountPaise, currency} | {paid: false}
 */
export function readRazorpayLink(body) {
  const b = body || {};
  if (str(b.status).toLowerCase() !== 'paid') return { paid: false };
  const pays = Array.isArray(b.payments) ? b.payments : [];
  const pay = pays.find((p) => str(p && p.status).toLowerCase() === 'captured');
  if (!pay || !str(pay.payment_id)) return { paid: false };
  const amount = Number(b.amount_paid != null ? b.amount_paid : pay.amount);
  return { paid: true, paymentId: str(pay.payment_id), amountPaise: amount, currency: str(b.currency).toUpperCase() };
}

/**
 * Cashfree's answer for one link (the link, its orders, the paid order's payments), in the webhook's shape:
 * the payment id is the successful payment's cf_payment_id (the webhook's transaction_id), else the order id,
 * as the webhook falls back to. PURE. -> {paid: true, paymentId, amountPaise, currency} | {paid: false}
 */
export function readCashfreeLink(link, orders, payments) {
  const l = link || {};
  if (str(l.link_status).toUpperCase() !== 'PAID') return { paid: false };
  const order = (Array.isArray(orders) ? orders : []).find((o) => str(o && o.order_status).toUpperCase() === 'PAID');
  if (!order) return { paid: false };
  const pay = (Array.isArray(payments) ? payments : []).find((p) => str(p && p.payment_status).toUpperCase() === 'SUCCESS');
  const paymentId = str((pay && pay.cf_payment_id) || order.order_id);
  if (!paymentId) return { paid: false };
  return { paid: true, paymentId, amountPaise: Math.round(Number(l.link_amount_paid) * 100), currency: str(l.link_currency).toUpperCase() };
}

/**
 * Does the paid amount and currency match what we asked for? Whole paise, INR only. PURE.
 * -> null when it matches, else 'AMOUNT_MISMATCH'.
 */
export function orderMismatch(order, paid) {
  const want = Number(order && order.amountPaise);
  const got = Number(paid && paid.amountPaise);
  if (!Number.isInteger(want) || !Number.isInteger(got) || want !== got) return 'AMOUNT_MISMATCH';
  if (str(order.currency).toUpperCase() !== 'INR' || str(paid.currency).toUpperCase() !== 'INR') return 'AMOUNT_MISMATCH';
  return null;
}

// ------------------------------------------------------------------------------ the routes

const PLANS = new Set(['starter', 'pro']);
const BILLINGS = new Set(['monthly', 'yearly', 'lifetime']);
// The refusals the owner's screen has words for; anything else is UNKNOWN.
const OWNER_CODES = new Set(['BAD_KEY', 'OWNER_ONLY', 'NOT_OPEN', 'BAD_PLAN', 'LIFETIME', 'FOUNDING_CLOSED', 'FOUNDING_FULL', 'BAD_DATE', 'TOO_MANY', 'NOT_READY']);

async function checkout(request, env, s, deps) {
  const { fetchImpl = fetch, call = rpc } = deps;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonAnswer(400, { error: 'BAD_INPUT' });
  }
  const key = str(body && body.key);
  const plan = str(body && body.plan).toLowerCase();
  const billing = str(body && body.billing).toLowerCase();
  // Any price in the body is ignored: the database works it out.
  if (key.length < 8 || key.length > 200 || !PLANS.has(plan) || !BILLINGS.has(billing)) return jsonAnswer(400, { error: 'BAD_INPUT' });
  let order;
  try {
    order = await call(env, 'hq_billing_checkout_start', { p_key: key, p_plan: plan, p_billing: billing, p_provider: s.provider }, { fetchImpl });
  } catch (e) {
    const code = e instanceof DbError ? e.code : 'UNKNOWN';
    if (code === 'OFFLINE' || code === 'UNKNOWN') return jsonAnswer(503, { error: 'UNREACHABLE' });
    return jsonAnswer(400, { error: OWNER_CODES.has(code) ? code : 'UNKNOWN' });
  }
  if (order && order.reuse && order.linkUrl) {
    return jsonAnswer(200, { url: order.linkUrl, amountPaise: order.amountPaise, kind: order.kind, reuse: true });
  }
  const made = await BILLING_PROVIDERS[s.provider].createLink(env, order, fetchImpl);
  if (made.error) {
    console.warn('[billing] the payment company did not make the link:', made.error);
    try {
      await call(env, 'hq_billing_checkout_failed', { p_checkout: order.checkoutId }, { fetchImpl });
    } catch (e) {
      console.error('[billing] could not close a refused checkout', e instanceof Error ? e.message : 'error');
    }
    return jsonAnswer(made.error === 'UNREACHABLE' ? 503 : 400, { error: made.error === 'UNREACHABLE' ? 'UNREACHABLE' : 'LINK_REFUSED' });
  }
  try {
    await call(env, 'hq_billing_checkout_link', { p_checkout: order.checkoutId, p_link_id: made.linkId, p_link_url: made.url }, { fetchImpl });
  } catch (e) {
    // Without the link saved, a payment on it could not be matched: do not hand it out.
    console.error('[billing] link made but not saved', e instanceof Error ? e.message : 'error');
    return jsonAnswer(503, { error: 'UNREACHABLE' });
  }
  return jsonAnswer(200, { url: made.url, amountPaise: order.amountPaise, kind: order.kind, reuse: false });
}

async function webhook(request, env, providerId, deps) {
  const { fetchImpl = fetch, call = rpc } = deps;
  const provider = BILLING_PROVIDERS[providerId];
  const raw = await request.text(); // the exact bytes the company signed
  if (!(await provider.verify(env, raw, request.headers))) {
    console.warn(`[billing] ${providerId} webhook with a bad signature refused`);
    return jsonAnswer(401, { error: 'BAD_SIGNATURE' });
  }
  let j;
  try {
    j = JSON.parse(raw);
  } catch {
    return jsonAnswer(400, { error: 'BAD_INPUT' });
  }
  const paid = provider.read(j);
  if (paid.kind !== 'paid') return jsonAnswer(200, { ignored: true });
  if (!paid.linkId || !paid.paymentId) return jsonAnswer(400, { error: 'BAD_INPUT' });
  let order;
  try {
    order = await call(env, 'hq_billing_order', { p_provider: providerId, p_link_id: paid.linkId }, { fetchImpl });
  } catch (e) {
    const code = e instanceof DbError ? e.code : 'UNKNOWN';
    // Not one of ours (another link on the same account): nothing to do, and no point retrying.
    if (code === 'UNKNOWN_ORDER') return jsonAnswer(200, { ignored: true, error: code });
    console.error(`[billing] ${providerId} webhook: order not read (${code}); the company will retry`);
    return jsonAnswer(503, { error: 'UNREACHABLE' });
  }
  const wrong = orderMismatch(order, paid);
  // Amount or currency not what we asked for: recorded as a mismatch (the database checks again and keeps
  // it for HQ), never applied. 200 so the company does not keep sending it.
  if (wrong) console.warn(`[billing] ${providerId} paid amount does not match checkout ${str(order.checkoutId)}`);
  let out;
  try {
    out = await call(env, 'hq_billing_paid', {
      p_provider: providerId,
      p_link_id: paid.linkId,
      p_payment_id: paid.paymentId,
      p_amount_paise: Number.isFinite(paid.amountPaise) ? Math.round(paid.amountPaise) : null,
      p_currency: paid.currency,
    }, { fetchImpl });
  } catch (e) {
    const code = e instanceof DbError ? e.code : 'UNKNOWN';
    console.error(`[billing] ${providerId} webhook: payment not applied (${code}); the company will retry`);
    return jsonAnswer(503, { error: 'UNREACHABLE' });
  }
  if (out && out.duplicate) return jsonAnswer(200, { duplicate: true });
  if (out && out.error) {
    console.error(`[billing] ${providerId} payment kept but not applied: ${str(out.error)} (checkout ${str(out.checkoutId)})`);
    return jsonAnswer(200, { error: str(out.error) });
  }
  return jsonAnswer(200, { applied: true, receiptNo: out && out.receiptNo });
}

/** Every /billing/ request. deps: {fetchImpl, call} (tests pass stand-ins). */
export async function handleBilling(request, env, deps = {}) {
  const url = new URL(request.url);
  if (request.method !== 'POST') return jsonAnswer(405, { error: 'POST_ONLY' });
  const s = billingSettings(env);
  if (!s.on) {
    console.warn('[billing] not set up; missing:', s.missing.join(', '));
    return jsonAnswer(503, { error: 'NOT_SET_UP' });
  }
  if (url.pathname === '/billing/checkout') return checkout(request, env, s, deps);
  const hook = /^\/billing\/hook\/(razorpay|cashfree)$/.exec(url.pathname);
  // Only the company in use: a webhook for the other one is refused like a bad signature.
  if (hook && hook[1] === s.provider) return webhook(request, env, hook[1], deps);
  return jsonAnswer(404, { error: 'NOT_FOUND' });
}

// ------------------------------------------------------------------------------ nightly

/**
 * Plan-end reminders by WhatsApp/SMS: a STUB. It sends nothing, whatever BILLING_MESSAGES says, until the
 * message itself is approved and built (a WhatsApp template needs Meta's approval; it costs per message).
 * The admin app shows its own reminder from owner_billing either way. -> {sent: false, reason}
 */
export function sendRenewalMessage(env, item) {
  const reason = str(env && env.BILLING_MESSAGES) === 'on' ? 'not built yet' : 'off';
  return { sent: false, reason, daysBefore: item && item.daysBefore, link: PAY_NOW_URL };
}

/** The nightly billing job: due downgrades and the 7/3/1-day reminders. Never throws. */
export async function runBillingDaily(env, { fetchImpl = fetch, call = rpc } = {}) {
  if (!billingSettings(env).on) return { skipped: 'not set up' };
  try {
    const out = await call(env, 'hq_billing_daily', {}, { fetchImpl });
    const reminders = Array.isArray(out && out.reminders) ? out.reminders : [];
    const sent = reminders.map((r) => sendRenewalMessage(env, r));
    console.log('[billing-cron] downgrades', Number(out && out.downgraded) || 0, 'reminders', reminders.length, 'messages sent', sent.filter((x) => x.sent).length);
    return { downgraded: Number(out && out.downgraded) || 0, reminders: reminders.length, sent: 0 };
  } catch (e) {
    const code = e instanceof DbError ? e.code : 'UNKNOWN';
    if (code === 'NOT_READY') return { skipped: 'migration 0063 not applied' };
    console.error('[billing-cron] failed', code);
    return { error: code };
  }
}

// ------------------------------------------------------------------------------ nightly reconciliation (0064)

/** How many links one night asks about: the free plan allows 50 calls per run. PURE. */
export function reconcileLimit(env, provider) {
  const own = Number(env && env.BILLING_RECONCILE_MAX);
  const top = provider === 'cashfree' ? 10 : 20;
  return Number.isInteger(own) && own > 0 ? Math.min(own, top) : top;
}

/**
 * The nightly check for webhooks that never came (0064). Asks the payment company about every link opened in
 * the last 48 hours that is still open in the database; a paid one goes through hq_billing_paid, the same one
 * path the webhook takes (it checks the amount again, applies once, and keeps a wrong amount for HQ's
 * "Payments to check"). Off unless online buying is set up (billingSettings): with keys missing it asks
 * nobody and changes nothing. Never throws.
 * -> {asked, paid, applied, duplicate, kept, unpaid, failed} | {skipped} | {error}
 */
export async function runBillingReconcile(env, { fetchImpl = fetch, call = rpc } = {}) {
  const s = billingSettings(env);
  if (!s.on) return { skipped: 'not set up' };
  let rows;
  try {
    rows = await call(env, 'hq_billing_open_links', { p_provider: s.provider, p_hours: 48 }, { fetchImpl });
  } catch (e) {
    const code = e instanceof DbError ? e.code : 'UNKNOWN';
    if (code === 'NOT_READY') return { skipped: 'migration 0064 not applied' };
    console.error('[billing-reconcile] open links not read', code);
    return { error: code };
  }
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && str(r.linkId)).slice(0, reconcileLimit(env, s.provider));
  const out = { asked: 0, paid: 0, applied: 0, duplicate: 0, kept: 0, unpaid: 0, failed: 0 };
  for (const row of list) {
    out.asked += 1;
    let got;
    try {
      got = await BILLING_PROVIDERS[s.provider].fetchPaid(env, str(row.linkId), fetchImpl);
    } catch {
      got = { error: 'UNKNOWN' };
    }
    if (got.error) {
      out.failed += 1;
      continue;
    }
    if (!got.paid) {
      out.unpaid += 1;
      continue;
    }
    out.paid += 1;
    try {
      const r = await call(env, 'hq_billing_paid', {
        p_provider: s.provider,
        p_link_id: str(row.linkId),
        p_payment_id: got.paymentId,
        p_amount_paise: Number.isFinite(got.amountPaise) ? Math.round(got.amountPaise) : null,
        p_currency: got.currency,
      }, { fetchImpl });
      if (r && r.duplicate) out.duplicate += 1;
      else if (r && r.error) out.kept += 1;
      else out.applied += 1;
    } catch (e) {
      out.failed += 1;
      console.error('[billing-reconcile] payment not applied', e instanceof DbError ? e.code : 'UNKNOWN');
    }
  }
  console.log('[billing-reconcile]', JSON.stringify(out));
  return out;
}
