// F79 online payments (R-328): one adapter per payment company. Each makes a payment link for an
// amount, reads that link's state, and checks the company's webhook signature. The money always goes
// to the GYM's own account with that company; MettleUp only asks "make a link" and "was it paid".
//
// Adapter shape (pay.js uses only this):
//   id, name, fields                       the boxes the owner fills in (secret: true = never shown again)
//   check(fields, mode)                    plain words when a pasted value cannot be right, else null
//   hint(fields)                           the last 4 characters shown on screen afterwards
//   test(creds, mode, f)                   { ok: true } | { error: 'BAD_KEYS' | 'UNREACHABLE' | ... }
//   createLink(creds, mode, req, f)        { linkId, url, expiresAt }
//   status(creds, mode, linkId, f)         { state: 'open'|'paid'|'expired'|'cancelled'|'refunded', failed?, paymentId?, amountP?, method?, refundedP? }
//                                          ('refunded': refunded in full; refundedP > 0: paid, refunded in part. Razorpay and
//                                          Cashfree only; paymentId only the payment's OWN id)
//   verifyHook(secret, raw, headers)       true when the company signed this body
//   readHook(json)                         { kind: 'paid'|'failed'|'revoked'|'other', linkId?, ref?, paymentId?, amountP?, method?, account? }
//   cancel?(creds, mode, linkId, f)        close a link so it cannot be paid (Razorpay, Cashfree; PayU has none and
//                                          PhonePe's page dies within the hour by itself)
//
// `mode` is 'test' (sandbox, no real money) or 'live'. `f` is fetch (tests pass a fake). `req` is
// { id, amountP, description, note, name, phone, notifyUrl }. Amounts here are paise; Cashfree and PayU
// take rupees, converted in this file only. No key, token or secret is ever logged.

import { hmac256, sameText, sha256Hex, toB64, toHex } from './payCrypto.js';

const LINK_DAYS = 7;

export const rupees = (p) => (Math.round(Number(p)) / 100).toFixed(2);
const paise = (r) => Math.round(Number(r) * 100);
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const clip = (s, n) => str(s).slice(0, n);

/** Where a company method name lands in the gym's receipt: upi | card | bank | other. PURE. */
export function methodOf(raw) {
  const m = str(raw).toLowerCase();
  if (m.includes('upi')) return 'upi';
  if (m.includes('card') || m === 'cc' || m === 'dc' || m === 'credit' || m === 'debit') return 'card';
  if (m.includes('net') || m === 'nb' || m.includes('bank')) return 'bank';
  return m ? 'other' : 'upi';
}

/** Our request id inside a company reference ("pr_abc" or "pr_abc-2" for a remade link). PURE. */
export function requestIdOf(ref) {
  return str(ref).split('-')[0];
}

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/** A company call that could not be made or answered with a server error. */
export class PayError extends Error {
  constructor(code, detail = '') {
    super(code);
    this.name = 'PayError';
    this.code = code;
    this.detail = detail; // the company's own short error words, never a key
  }
}

async function send(f, url, init) {
  let res;
  try {
    res = await f(url, init);
  } catch {
    throw new PayError('UNREACHABLE');
  }
  const body = await readJson(res);
  if (res.status === 401 || res.status === 403) throw new PayError('BAD_KEYS', companyWords(body));
  if (res.status >= 500) throw new PayError('UNREACHABLE');
  return { status: res.status, body };
}

/** The company's own short reason, for the log and the owner (never contains our keys). PURE. */
function companyWords(body) {
  const e = body && (body.error || body);
  return clip(str((e && (e.description || e.message || e.msg)) || ''), 160);
}

// ------------------------------------------------------------------------------------------ Razorpay
// https://razorpay.com/docs/api/payments/payment-links/  Keys: rzp_test_... (test) / rzp_live_... (live).
// Paste-keys gyms: Basic auth with Key ID + Key Secret. "Connect Razorpay" (OAuth, partner): Bearer token.

const RZP = 'https://api.razorpay.com/v1';

function rzpAuth(creds) {
  if (creds.accessToken) return `Bearer ${creds.accessToken}`;
  return `Basic ${btoa(`${creds.keyId}:${creds.keySecret}`)}`;
}

export const razorpay = {
  id: 'razorpay',
  name: 'Razorpay',
  fields: [
    { name: 'keyId', label: 'Key ID', secret: false, placeholder: 'rzp_test_…' },
    { name: 'keySecret', label: 'Key Secret', secret: true },
  ],
  check(fields, mode) {
    const id = str(fields.keyId).trim();
    if (!/^rzp_(test|live)_[A-Za-z0-9]{8,32}$/.test(id)) return 'A Razorpay Key ID starts with rzp_test_ or rzp_live_.';
    if (mode === 'test' && !id.startsWith('rzp_test_')) return 'Test mode needs your Razorpay test key. It starts with rzp_test_.';
    if (mode === 'live' && !id.startsWith('rzp_live_')) return 'Use your live Razorpay key. It starts with rzp_live_.';
    if (str(fields.keySecret).trim().length < 12) return 'Paste the whole Key Secret from Razorpay.';
    return null;
  },
  hint: (fields) => str(fields.keyId).trim().slice(-4),
  async test(creds, _mode, f = fetch) {
    const r = await send(f, `${RZP}/payment_links?count=1`, { headers: { Authorization: rzpAuth(creds) } });
    return r.status === 200 ? { ok: true } : { error: 'BAD_KEYS', detail: companyWords(r.body) };
  },
  async createLink(creds, _mode, req, f = fetch) {
    const expireBy = Math.floor(Date.now() / 1000) + LINK_DAYS * 86400;
    const body = {
      amount: Math.round(req.amountP),
      currency: 'INR',
      accept_partial: false,
      reference_id: clip(req.ref || req.id, 40),
      description: clip(req.description, 2048),
      customer: { name: clip(req.name, 80), ...(req.phone ? { contact: req.phone } : {}) },
      // The gym sends the link itself (WhatsApp / the app); Razorpay's own SMS stays off.
      notify: { sms: false, email: false },
      reminder_enable: false,
      expire_by: expireBy,
      notes: { mettleup: req.id, receipt: clip(req.note, 200) },
    };
    const r = await send(f, `${RZP}/payment_links`, {
      method: 'POST',
      headers: { Authorization: rzpAuth(creds), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status !== 200 || !r.body.id || !r.body.short_url) throw new PayError('LINK_REFUSED', companyWords(r.body));
    return { linkId: str(r.body.id), url: str(r.body.short_url), expiresAt: new Date(expireBy * 1000).toISOString() };
  },
  async status(creds, _mode, linkId, f = fetch) {
    const r = await send(f, `${RZP}/payment_links/${encodeURIComponent(linkId)}`, { headers: { Authorization: rzpAuth(creds) } });
    if (r.status !== 200) throw new PayError('STATUS_REFUSED', companyWords(r.body));
    const b = r.body;
    const pays = Array.isArray(b.payments) ? b.payments : [];
    // Payment sweep (R-542): only CAPTURED money is paid. An "authorized" payment can still be dropped and refunded by
    // the bank, so it is not paid until Razorpay captures it (the link's own status becomes 'paid' then).
    const ok = pays.find((p) => p && p.status === 'captured');
    // Review round 2 (R-542): fully refunded money (Razorpay sets the payment's status to "refunded") is not paid,
    // even though the link itself still says "paid". A part refund stays "captured" (paid; the desk sorts the rest).
    if (!ok && pays.some((p) => p && p.status === 'refunded')) return { state: 'refunded' };
    if (b.status === 'paid' || ok) {
      // Review round 3 (R-550): the link's answer lists its payments without any refund fields
      // (https://razorpay.com/docs/api/payments/payment-links/fetch-id-standard/), so its "refunded" status was never
      // proven. The payment itself says it: GET /v1/payments/:id gives status (refunded once fully refunded),
      // amount_refunded (paise) and refund_status (null, partial or full) (https://razorpay.com/docs/api/payments/fetch-with-id/).
      // Refunded in full = 'refunded' (never paid); in part = paid, with refundedP so Approve refuses it. When the
      // payment cannot be read, the link's own answer stands (paid), as before.
      let refundedP = 0;
      if (ok && ok.payment_id) {
        try {
          const p = await send(f, `${RZP}/payments/${encodeURIComponent(ok.payment_id)}`, { headers: { Authorization: rzpAuth(creds) } });
          if (p.status === 200 && p.body) {
            const took = Number(p.body.amount) || Number(ok.amount) || 0;
            refundedP = Math.max(0, Math.round(Number(p.body.amount_refunded) || 0));
            const rs = str(p.body.refund_status).toLowerCase();
            if (str(p.body.status) === 'refunded' || rs === 'full' || (took > 0 && refundedP >= took)) return { state: 'refunded' };
            if (rs === 'partial' && refundedP === 0) refundedP = 1; // a part refund whose amount is not shown yet
          }
        } catch {
          // Not readable just now: the link's answer stands.
        }
      }
      return { state: 'paid', paymentId: str(ok ? ok.payment_id : ''), amountP: ok ? Number(ok.amount) : Number(b.amount_paid), method: methodOf(ok && ok.method), refundedP };
    }
    const failed = pays.some((p) => p && p.status === 'failed');
    if (b.status === 'expired') return { state: 'expired', failed };
    if (b.status === 'cancelled') return { state: 'cancelled', failed };
    return { state: 'open', failed };
  },
  /** Close a link so it can no longer be paid (POST /payment_links/:id/cancel). */
  async cancel(creds, _mode, linkId, f = fetch) {
    const r = await send(f, `${RZP}/payment_links/${encodeURIComponent(linkId)}/cancel`, { method: 'POST', headers: { Authorization: rzpAuth(creds), 'Content-Type': 'application/json' }, body: '{}' });
    if (r.status !== 200) throw new PayError('CANCEL_REFUSED', companyWords(r.body));
  },
  /** X-Razorpay-Signature = hex HMAC-SHA256(raw body, webhook secret). */
  async verifyHook(secret, raw, headers) {
    const got = str(headers.get('x-razorpay-signature'));
    if (!secret || !got) return false;
    return sameText(toHex(await hmac256(secret, raw)), got);
  },
  readHook(j) {
    const ev = str(j && j.event);
    const p = (j && j.payload) || {};
    if (ev === 'account.app.authorization_revoked') return { kind: 'revoked', account: str(j.account_id) };
    if (ev === 'payment_link.paid') {
      const link = (p.payment_link && p.payment_link.entity) || {};
      const pay = (p.payment && p.payment.entity) || {};
      return { kind: 'paid', linkId: str(link.id), ref: str(link.reference_id), paymentId: str(pay.id), amountP: Number(pay.amount), method: methodOf(pay.method), account: str(j.account_id) };
    }
    if (ev === 'payment.failed') {
      const pay = (p.payment && p.payment.entity) || {};
      return { kind: 'failed', paymentId: str(pay.id), account: str(j.account_id), ref: str(pay.notes && pay.notes.mettleup) };
    }
    if (ev === 'payment_link.expired' || ev === 'payment_link.cancelled') {
      const link = (p.payment_link && p.payment_link.entity) || {};
      return { kind: ev.endsWith('expired') ? 'expired' : 'cancelled', linkId: str(link.id), ref: str(link.reference_id) };
    }
    return { kind: 'other' };
  },
};

// ------------------------------------------------------------------------------------------ Cashfree
// https://www.cashfree.com/docs/api-reference/payments/latest/payment-links  Keys: App ID + Secret key.
// Each link carries its own notify_url, so Cashfree tells us about the payment with no dashboard set-up;
// the webhook is signed with the gym's own secret key: base64(HMAC-SHA256(timestamp + raw body)).

const CF_VERSION = '2023-08-01';
const cfHost = (mode) => (mode === 'live' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg');

function cfHeaders(creds) {
  const h = { 'x-api-version': CF_VERSION, 'Content-Type': 'application/json' };
  if (creds.accessToken) h.Authorization = `Bearer ${creds.accessToken}`;
  else {
    h['x-client-id'] = creds.appId;
    h['x-client-secret'] = creds.secretKey;
  }
  return h;
}

export const cashfree = {
  id: 'cashfree',
  name: 'Cashfree',
  fields: [
    { name: 'appId', label: 'App ID', secret: false },
    { name: 'secretKey', label: 'Secret key', secret: true, placeholder: 'cfsk_ma_test_…' },
  ],
  check(fields, mode) {
    const id = str(fields.appId).trim();
    const sk = str(fields.secretKey).trim();
    if (id.length < 8) return 'Paste the whole App ID from Cashfree.';
    if (sk.length < 12) return 'Paste the whole Secret key from Cashfree.';
    if (mode === 'test' && /_prod_|^cfsk_ma_prod/.test(sk)) return 'Test mode needs your Cashfree test keys (from the Test environment).';
    if (mode === 'live' && /_test_/.test(sk)) return 'Use your live Cashfree keys (from Production).';
    return null;
  },
  hint: (fields) => str(fields.appId).trim().slice(-4),
  async test(creds, mode, f = fetch) {
    // A link that cannot exist: 404 means the keys were accepted, 401 means they were not.
    const r = await send(f, `${cfHost(mode)}/links/mettleup_check_${Date.now()}`, { headers: cfHeaders(creds) });
    return r.status === 404 || r.status === 200 ? { ok: true } : { error: 'BAD_KEYS', detail: companyWords(r.body) };
  },
  async createLink(creds, mode, req, f = fetch) {
    if (!req.phone) throw new PayError('NEEDS_PHONE');
    const expires = new Date(Date.now() + LINK_DAYS * 86400000).toISOString();
    const body = {
      link_id: clip(req.ref || req.id, 50),
      link_amount: Number(rupees(req.amountP)),
      link_currency: 'INR',
      link_purpose: clip(req.description, 500),
      customer_details: { customer_phone: req.phone, customer_name: clip(req.name, 80) },
      link_partial_payments: false,
      link_notify: { send_sms: false, send_email: false },
      link_expiry_time: expires,
      link_notes: { receipt: clip(req.note, 200) },
      ...(req.notifyUrl ? { link_meta: { notify_url: req.notifyUrl } } : {}),
    };
    const r = await send(f, `${cfHost(mode)}/links`, { method: 'POST', headers: cfHeaders(creds), body: JSON.stringify(body) });
    if (r.status !== 200 || !r.body.link_url) throw new PayError('LINK_REFUSED', companyWords(r.body));
    return { linkId: str(r.body.link_id || body.link_id), url: str(r.body.link_url), expiresAt: expires };
  },
  async status(creds, mode, linkId, f = fetch) {
    const host = cfHost(mode);
    const r = await send(f, `${host}/links/${encodeURIComponent(linkId)}`, { headers: cfHeaders(creds) });
    if (r.status !== 200) throw new PayError('STATUS_REFUSED', companyWords(r.body));
    const st = str(r.body.link_status).toUpperCase();
    if (st === 'PAID') {
      // The payment id the webhook also carries (cf_payment_id): the link's paid order, then its payment.
      const o = await send(f, `${host}/links/${encodeURIComponent(linkId)}/orders?status=PAID`, { headers: cfHeaders(creds) });
      const orders = Array.isArray(o.body) ? o.body : [];
      const order = orders.find((x) => str(x && x.order_status).toUpperCase() === 'PAID') || orders[0];
      let pay = null;
      let back = 0;
      if (order && order.order_id) {
        const p = await send(f, `${host}/orders/${encodeURIComponent(order.order_id)}/payments`, { headers: cfHeaders(creds) });
        const list = Array.isArray(p.body) ? p.body : [];
        pay = list.find((x) => str(x && x.payment_status).toUpperCase() === 'SUCCESS') || null;
        // Review round 2 (R-542): money refunded in full (a refund done or under way) is not paid any more.
        const rf = await send(f, `${host}/orders/${encodeURIComponent(order.order_id)}/refunds`, { headers: cfHeaders(creds) });
        const refunds = Array.isArray(rf.body) ? rf.body : [];
        back = refunds
          .filter((x) => ['SUCCESS', 'PENDING', 'ONHOLD'].includes(str(x && x.refund_status).toUpperCase()))
          .reduce((s, x) => s + paise(x.refund_amount), 0);
        const took = paise(pay ? pay.payment_amount : r.body.link_amount_paid);
        if (back > 0 && back >= took) return { state: 'refunded' };
      }
      return {
        state: 'paid',
        // Only the payment's own id (cf_payment_id, the one the webhook carries as transaction_id). Without it: none,
        // so pay.js uses the same link-level id as the webhook would, never two ids for one payment.
        paymentId: str(pay ? pay.cf_payment_id : ''),
        amountP: paise(pay ? pay.payment_amount : r.body.link_amount_paid),
        method: methodOf(pay && pay.payment_group),
        // Review round 3: a part refund (done or under way) stays paid, but Approve refuses it (pay.js recheckPaid).
        refundedP: back,
      };
    }
    if (st === 'EXPIRED') return { state: 'expired' };
    if (st === 'CANCELLED') return { state: 'cancelled' };
    return { state: 'open' };
  },
  /** Close a link so it can no longer be paid (POST /links/:id/cancel). */
  async cancel(creds, mode, linkId, f = fetch) {
    const r = await send(f, `${cfHost(mode)}/links/${encodeURIComponent(linkId)}/cancel`, { method: 'POST', headers: cfHeaders(creds), body: '{}' });
    if (r.status !== 200) throw new PayError('CANCEL_REFUSED', companyWords(r.body));
  },
  /** x-webhook-signature = base64(HMAC-SHA256(x-webhook-timestamp + raw body, secret key)). */
  async verifyHook(secret, raw, headers) {
    const got = str(headers.get('x-webhook-signature'));
    const ts = str(headers.get('x-webhook-timestamp'));
    if (!secret || !got || !ts) return false;
    return sameText(toB64(await hmac256(secret, ts + raw)), got);
  },
  readHook(j) {
    const d = (j && j.data) || {};
    const type = str(j && j.type);
    if (type === 'PAYMENT_LINK_EVENT') {
      const st = str(d.link_status).toUpperCase();
      const order = d.order || {};
      if (st === 'PAID' || str(order.transaction_status).toUpperCase() === 'SUCCESS') {
        return { kind: 'paid', linkId: str(d.link_id), ref: str(d.link_id), paymentId: str(order.transaction_id), amountP: paise(d.link_amount_paid || d.link_amount), method: 'upi' };
      }
      if (st === 'EXPIRED' || st === 'CANCELLED') return { kind: st === 'EXPIRED' ? 'expired' : 'cancelled', linkId: str(d.link_id), ref: str(d.link_id) };
      return { kind: 'other' };
    }
    if (type === 'MERCHANT_OAUTH_REVOKED' || type === 'OAUTH_REVOKE' || /REVOKE/.test(type)) return { kind: 'revoked', account: str(d.merchant_id || d.merchantId) };
    return { kind: 'other' };
  },
};

// ------------------------------------------------------------------------------------------ PayU
// https://docs.payu.in  Keys: Merchant key + Salt. Links: the "create_invoice" command (an invoice page
// the member pays on); state: "verify_payment". Both are POSTs to postservice with
// hash = sha512(key|command|var1|salt). PayU has no per-link webhook, so the state is read (pay.js polls).

const payuHost = (mode) => (mode === 'live' ? 'https://info.payu.in' : 'https://test.payu.in');

export async function sha512Hex(text) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(text))));
}

async function payuCall(creds, mode, command, var1, f) {
  const hash = await sha512Hex(`${creds.key}|${command}|${var1}|${creds.salt}`);
  const form = new URLSearchParams({ key: creds.key, command, var1, hash });
  return send(f, `${payuHost(mode)}/merchant/postservice.php?form=2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString(),
  });
}

export const payu = {
  id: 'payu',
  name: 'PayU',
  fields: [
    { name: 'key', label: 'Merchant key', secret: false },
    { name: 'salt', label: 'Salt', secret: true },
  ],
  check(fields) {
    if (!/^[A-Za-z0-9]{4,20}$/.test(str(fields.key).trim())) return 'Paste the Merchant key from PayU. It is letters and numbers only.';
    if (str(fields.salt).trim().length < 8) return 'Paste the whole Salt from PayU.';
    return null;
  },
  hint: (fields) => str(fields.key).trim().slice(-4),
  async test(creds, mode, f = fetch) {
    const r = await payuCall(creds, mode, 'verify_payment', `mettleupcheck${Date.now()}`, f);
    const b = r.body;
    if (r.status === 200 && b && b.transaction_details !== undefined) return { ok: true };
    return { error: 'BAD_KEYS', detail: companyWords(b) };
  },
  async createLink(creds, mode, req, f = fetch) {
    const validDays = LINK_DAYS;
    const var1 = JSON.stringify({
      amount: rupees(req.amountP),
      txnid: clip(req.ref || req.id, 25),
      productinfo: clip(req.description, 100) || 'Gym payment',
      firstname: clip(req.name, 60) || 'Member',
      email: '',
      phone: str(req.phone),
      validation_period: validDays,
      send_email_now: '0',
      send_sms: '0',
      udf1: clip(req.note, 60),
    });
    const r = await payuCall(creds, mode, 'create_invoice', var1, f);
    const url = str(r.body && (r.body.URL || r.body.url));
    if (r.status !== 200 || !url) throw new PayError('LINK_REFUSED', companyWords(r.body));
    return { linkId: clip(req.ref || req.id, 25), url, expiresAt: new Date(Date.now() + validDays * 86400000).toISOString() };
  },
  async status(creds, mode, linkId, f = fetch) {
    const r = await payuCall(creds, mode, 'verify_payment', linkId, f);
    const t = r.body && r.body.transaction_details && r.body.transaction_details[linkId];
    const st = str(t && t.status).toLowerCase();
    if (st === 'success') return { state: 'paid', paymentId: str(t.mihpayid), amountP: paise(t.amt || t.transaction_amount), method: methodOf(t.mode) };
    if (st === 'failure' || st === 'failed') return { state: 'open', failed: true };
    return { state: 'open' };
  },
  /** PayU's reply hash: sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key). */
  async verifyHook(salt, raw, _headers, creds = {}) {
    const p = Object.fromEntries(new URLSearchParams(raw));
    if (!salt || !p.hash) return false;
    const s = [salt, p.status, '', '', '', '', '', p.udf5, p.udf4, p.udf3, p.udf2, p.udf1, p.email, p.firstname, p.productinfo, p.amount, p.txnid, creds.key || p.key].map((x) => x ?? '').join('|');
    return sameText(await sha512Hex(s), str(p.hash).toLowerCase());
  },
  readHook(p) {
    const st = str(p && p.status).toLowerCase();
    if (st === 'success') return { kind: 'paid', linkId: str(p.txnid), ref: str(p.txnid), paymentId: str(p.mihpayid), amountP: paise(p.amount), method: methodOf(p.mode) };
    if (st === 'failure') return { kind: 'failed', ref: str(p.txnid), paymentId: str(p.mihpayid) };
    return { kind: 'other' };
  },
};

// ------------------------------------------------------------------------------------------ PhonePe
// https://developer.phonepe.com/payment-gateway  (Standard Checkout v2). Keys: Client ID, Client secret,
// Client version. A token first (client_credentials), then "pay" makes a checkout page that lasts at most
// an hour (pay.js makes a new one when an old one ran out). Auth header: "O-Bearer <token>".

const ppHosts = (mode) =>
  mode === 'live'
    ? { auth: 'https://api.phonepe.com/apis/identity-manager', pg: 'https://api.phonepe.com/apis/pg' }
    : { auth: 'https://api-preprod.phonepe.com/apis/pg-sandbox', pg: 'https://api-preprod.phonepe.com/apis/pg-sandbox' };

const PP_LINK_SECONDS = 3600;

async function ppToken(creds, mode, f) {
  const form = new URLSearchParams({
    client_id: creds.clientId,
    client_version: str(creds.clientVersion || '1'),
    client_secret: creds.clientSecret,
    grant_type: 'client_credentials',
  });
  const r = await send(f, `${ppHosts(mode).auth}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (r.status !== 200 || !r.body.access_token) throw new PayError('BAD_KEYS', companyWords(r.body));
  return str(r.body.access_token);
}

export const phonepe = {
  id: 'phonepe',
  name: 'PhonePe',
  fields: [
    { name: 'clientId', label: 'Client ID', secret: false },
    { name: 'clientVersion', label: 'Client version', secret: false, placeholder: '1' },
    { name: 'clientSecret', label: 'Client secret', secret: true },
  ],
  check(fields) {
    if (str(fields.clientId).trim().length < 6) return 'Paste the whole Client ID from PhonePe.';
    if (!/^[0-9]{1,4}$/.test(str(fields.clientVersion || '1').trim())) return 'Client version is a number, like 1.';
    if (str(fields.clientSecret).trim().length < 12) return 'Paste the whole Client secret from PhonePe.';
    return null;
  },
  hint: (fields) => str(fields.clientId).trim().slice(-4),
  async test(creds, mode, f = fetch) {
    try {
      await ppToken(creds, mode, f);
      return { ok: true };
    } catch (e) {
      if (e instanceof PayError && e.code === 'UNREACHABLE') throw e;
      return { error: 'BAD_KEYS', detail: e instanceof PayError ? e.detail : '' };
    }
  },
  async createLink(creds, mode, req, f = fetch) {
    const token = await ppToken(creds, mode, f);
    const merchantOrderId = clip(req.ref || req.id, 63);
    const r = await send(f, `${ppHosts(mode).pg}/checkout/v2/pay`, {
      method: 'POST',
      headers: { Authorization: `O-Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantOrderId,
        amount: Math.round(req.amountP),
        expireAfter: PP_LINK_SECONDS,
        metaInfo: { udf1: clip(req.note, 200), udf2: req.id },
        paymentFlow: {
          type: 'PG_CHECKOUT',
          message: clip(req.description, 200),
          merchantUrls: { redirectUrl: 'https://app.mettleup.fit/paid.html' },
        },
      }),
    });
    if (r.status !== 200 || !r.body.redirectUrl) throw new PayError('LINK_REFUSED', companyWords(r.body));
    const exp = Number(r.body.expireAt);
    return { linkId: merchantOrderId, url: str(r.body.redirectUrl), expiresAt: new Date(Number.isFinite(exp) && exp > 0 ? exp : Date.now() + PP_LINK_SECONDS * 1000).toISOString() };
  },
  async status(creds, mode, linkId, f = fetch) {
    const token = await ppToken(creds, mode, f);
    const r = await send(f, `${ppHosts(mode).pg}/checkout/v2/order/${encodeURIComponent(linkId)}/status`, { headers: { Authorization: `O-Bearer ${token}` } });
    if (r.status !== 200) throw new PayError('STATUS_REFUSED', companyWords(r.body));
    const st = str(r.body.state).toUpperCase();
    const pays = Array.isArray(r.body.paymentDetails) ? r.body.paymentDetails : [];
    if (st === 'COMPLETED') {
      const ok = pays.find((p) => str(p && p.state).toUpperCase() === 'COMPLETED') || pays[0] || {};
      return { state: 'paid', paymentId: str(ok.transactionId || r.body.orderId), amountP: Number(ok.amount || r.body.amount), method: methodOf(ok.paymentMode) };
    }
    if (st === 'FAILED') return { state: 'expired', failed: true };
    return { state: 'open', failed: pays.some((p) => str(p && p.state).toUpperCase() === 'FAILED') };
  },
  /** Authorization header = sha256("username:password") the gym set for its PhonePe webhook. */
  async verifyHook(userPass, _raw, headers) {
    const got = str(headers.get('authorization')).replace(/^SHA256\s+/i, '').toLowerCase();
    if (!userPass || !got) return false;
    return sameText(await sha256Hex(userPass), got);
  },
  readHook(j) {
    const ev = str(j && j.event);
    const p = (j && j.payload) || {};
    const pays = Array.isArray(p.paymentDetails) ? p.paymentDetails : [];
    if (ev === 'checkout.order.completed') {
      const ok = pays[0] || {};
      return { kind: 'paid', linkId: str(p.merchantOrderId), ref: str(p.merchantOrderId), paymentId: str(ok.transactionId || p.orderId), amountP: Number(ok.amount || p.amount), method: methodOf(ok.paymentMode) };
    }
    if (ev === 'checkout.order.failed') return { kind: 'failed', ref: str(p.merchantOrderId) };
    return { kind: 'other' };
  },
};

export const PROVIDERS = { razorpay, cashfree, payu, phonepe };

/** Every company the server still knows, in screen order (a gym already on PayU or PhonePe keeps working). */
export const PROVIDER_ORDER = ['razorpay', 'cashfree', 'payu', 'phonepe'];

/** R-547 (owner's decision A, 14 Nov 2026): the only companies a gym can pick or connect from now on. */
export const OFFERED = ['razorpay', 'cashfree'];
