// F79 online payments (R-328, 4 Nov 2026): the Worker side. Both apps talk to /api/pay/...; this file
// keeps each gym's payment-company connection (sealed keys, payCrypto.js), makes payment links through
// the gym's own account (payProviders.js), and learns when a link is paid three ways:
//   1. the desk's or member's screen asks while it is open (/api/pay/check, at most every 5 s per link);
//   2. the scheduled check every 10 minutes for links still open (wrangler.jsonc cron, scheduledPay);
//   3. the company's webhook where one can be registered for us (Cashfree's per-link notify_url, and
//      the Razorpay partner webhook once "Connect Razorpay" is approved).
// All three go through markPaid(), keyed by the company's payment id (table pay_events), so a payment
// is "paid" once however many times it is reported. The RECEIPT is then made by the gym's admin app
// (claim -> its normal receipt -> recorded), so receipt numbers and rules stay exactly as at the desk.
//
// Off switches, all graceful (an app sees { on: false, why } and hides the online parts):
//   - D1 tables missing (migrations/0011_payments.sql not applied)   why 'NOT_READY'
//   - PAYMENTS_MASTER_KEY missing: connecting a company is "not switched on yet"; UPI requests still work
// Test mode: every connection is 'test' (sandbox, no real money) until the Worker var PAY_LIVE is "on".
// "Connect Razorpay"/"Connect Cashfree" (OAuth) show only when PAY_OAUTH_RAZORPAY / PAY_OAUTH_CASHFREE
// are "on" with the partner secrets set (after MettleUp's partner approval).
//
// Never logged, never answered: a key, a token, a sealed value, a member's phone.

import { answer } from './feedback.js';
import { hasMasterKey, hmac256, lastFour, randomId, sameText, seal, toHex, unseal } from './payCrypto.js';
import { OFFERED, PROVIDERS, PROVIDER_ORDER, PayError, requestIdOf } from './payProviders.js';
import { saidAt, saveSwitches, switchesOf, switchesReady } from './paySwitches.js';

const SUPABASE = 'https://hdxzqbdiokjklnypfisq.supabase.co';
// The public, read-only app key (the same one in the panel and the app).
const ANON = 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';
export const APP_ORIGIN = 'https://app.mettleup.fit';

const MAX_BODY = 8192;
const CHECK_EVERY_MS = 5000;
const CLAIM_MS = 5 * 60000;
const CRON_EVERY_MS = 4 * 60000;
const CRON_DAYS = 8;
// Review round 2 (R-542): links WE closed are asked less often than open ones (every 30 minutes, for 8 days), and not
// at all once the company says they are closed (checked_at = 'done', which sorts after every date).
const CLOSED_EVERY_MS = 30 * 60000;
const CHECK_DONE = 'done';
// Today's "Joined online" asks the company about at most this many of the gym's unpaid join payments per look.
const TODAY_CHECKS = 10;
// Review round 3 (R-550): a link is watched until ITS OWN expiry plus this margin (and never less than CRON_DAYS from
// the request). A request made on day 0 whose link was made on day 5 is payable until day 12, so it is watched to 13.
const LINK_MARGIN_MS = 86400000;
// Review round 3 (R-550): Cloudflare's free Workers plan allows 50 outside calls (fetch) per invocation
// (https://developers.cloudflare.com/workers/platform/limits/, "Subrequests"); D1 queries are counted apart, 1,000 per
// invocation on Free (same page, "Subrequests to internal services"). One ask about one link can cost up to ASK_MOST
// outside calls (Cashfree, paid: link, orders, payments, refunds; an OAuth token refresh; a cancel). So every run that
// asks about many links stops before its budget (default 40, PAY_SUBREQUESTS on a paid plan) can be overrun.
const ASK_MOST = 6;
const DEFAULT_ASKS = 40;
const RECENT_PAID_MS = 15 * 60000;
const MAX_AMOUNT_P = 10_00_000_00; // ₹10 lakh: a typing mistake, not a gym fee
const UPI_ID = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/;

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const nowIso = (now) => new Date(now ?? Date.now()).toISOString();

/** 'live' only when MettleUp's owner has switched live payments on; otherwise everything is sandbox. PURE. */
export function payMode(env) {
  return env && env.PAY_LIVE === 'on' ? 'live' : 'test';
}

/** Is "Connect <company>" (OAuth, partner) switched on for this company? PURE. */
export function oauthOn(env, provider) {
  if (!env) return false;
  if (provider === 'razorpay') return env.PAY_OAUTH_RAZORPAY === 'on' && Boolean(env.RAZORPAY_CLIENT_ID && env.RAZORPAY_CLIENT_SECRET);
  if (provider === 'cashfree') return env.PAY_OAUTH_CASHFREE === 'on' && Boolean(env.CASHFREE_PARTNER_KEY && env.CASHFREE_CLIENT_ID && env.CASHFREE_CLIENT_SECRET);
  return false;
}

/** A clean UPI ID or ''. PURE. */
export function cleanUpi(raw) {
  const v = str(raw).replace(/\s+/g, '').toLowerCase();
  return UPI_ID.test(v) ? v : '';
}

/** pr_ + 20 hex letters: no '-' (a remade link adds -2), at most 25 letters (PayU's txnid). */
export function newRequestId() {
  return `pr_${toHex(crypto.getRandomValues(new Uint8Array(10)))}`;
}

/** Outside calls one run may make (Free plan: 50 per invocation; a margin is kept for the rest of the run). PURE. */
export function runBudget(env) {
  const n = Math.floor(Number(env && env.PAY_SUBREQUESTS));
  return Number.isFinite(n) && n >= 12 ? Math.min(n, 990) : DEFAULT_ASKS;
}

/**
 * A fetch that counts: past `max` calls it refuses (as "unreachable"), so a run can never pass the platform's limit.
 * Callers stop starting a new ask when fewer than ASK_MOST calls are left. PURE apart from the counting.
 */
export function askBudget(f, max) {
  let used = 0;
  const counted = (...a) => {
    used += 1;
    return used > max ? Promise.reject(new Error('BUDGET')) : f(...a);
  };
  return { f: counted, left: () => max - used, roomForOne: () => max - used >= ASK_MOST };
}

/** Until when a request's company link may still be paid, so is still watched. PURE. */
export function watchUntil(row) {
  const fromRequest = Date.parse(str(row && row.created_at)) + CRON_DAYS * 86400000;
  const fromLink = Date.parse(str(row && row.expires_at)) + LINK_MARGIN_MS;
  return Math.max(Number.isFinite(fromRequest) ? fromRequest : 0, Number.isFinite(fromLink) ? fromLink : 0);
}

/** The same window in SQL (`p` = a table alias with its dot): bind windowArgs(now) in its place. */
const IN_WINDOW = (p = '') => `(${p}created_at >= ? OR ${p}expires_at >= ?)`;
const windowArgs = (now) => [nowIso(now - CRON_DAYS * 86400000), nowIso(now - LINK_MARGIN_MS)];

const ok = (body) => answer(200, body);
const no = (status, error, extra = {}) => answer(status, { error, ...extra });

// ------------------------------------------------------------------------------------ who is asking

class WhoError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function rpc(env, fn, args, f) {
  let res;
  try {
    res = await f(`${env.SUPABASE_URL || SUPABASE}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(args),
    });
  } catch {
    throw new WhoError('OFFLINE');
  }
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (res.ok) return body;
  if (body && body.code === 'PGRST202') throw new WhoError('NOT_READY');
  if (body && /BAD_KEY/.test(str(body.message))) throw new WhoError('BAD_KEY');
  if (res.status >= 500) throw new WhoError('OFFLINE');
  throw new WhoError('BAD_KEY');
}

/** The desk (owner or staff) a key opens: staff_me (0010/0048). An old owner key has no person = the owner. */
export async function deskWho(env, key, f = fetch) {
  if (!key || str(key).length < 16) throw new WhoError('BAD_KEY');
  const me = await rpc(env, 'staff_me', { p_key: key }, f);
  if (!me || !me.gymId) throw new WhoError('BAD_KEY');
  const role = me.person && me.person.role ? str(me.person.role) : 'owner';
  return { gymId: str(me.gymId), role, gymName: str(me.name) };
}

/**
 * The member a member key opens. member_pay_me (supabase 0057) adds their place on the gym's list
 * (rosterId) with the same checks as "My membership"; before it is live, member_me alone (shop only).
 */
export async function memberWho(env, key, f = fetch) {
  if (!key || str(key).length < 16) throw new WhoError('BAD_KEY');
  try {
    const me = await rpc(env, 'member_pay_me', { p_key: key }, f);
    if (me && me.gymId) return { gymId: str(me.gymId), memberId: str(me.memberId), rosterId: me.rosterId ? str(me.rosterId) : '', name: str(me.name) };
  } catch (e) {
    if (!(e instanceof WhoError) || e.code !== 'NOT_READY') throw e;
  }
  const me = await rpc(env, 'member_me', { p_key: key }, f);
  if (!me || !me.gymId) throw new WhoError('BAD_KEY');
  return { gymId: str(me.gymId), memberId: str(me.memberId), rosterId: '', name: str(me.name) };
}

// ------------------------------------------------------------------------------------ the database

export async function tablesReady(db) {
  if (!db) return false;
  try {
    await db.prepare('SELECT 1 FROM pay_requests LIMIT 1').all();
    await db.prepare('SELECT 1 FROM pay_gyms LIMIT 1').all();
    return true;
  } catch {
    return false;
  }
}

const connOf = (db, gymId, provider) => db.prepare('SELECT * FROM pay_connections WHERE gym_id = ? AND provider = ?').bind(gymId, provider).first();
const requestOf = (db, id) => db.prepare('SELECT * FROM pay_requests WHERE id = ?').bind(id).first();

/** What a screen may see of a connection: never creds. PURE. */
export function connectionView(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    mode: row.mode,
    testMode: row.mode !== 'live',
    via: row.via,
    hint: row.hint,
    on: row.status === 'on',
    offReason: row.off_reason || '',
    connectedAt: row.connected_at,
  };
}

/**
 * R-547 (owner's decision A, 14 Nov 2026): gyms pick only Razorpay or Cashfree. PayU and PhonePe are still shown,
 * and can still be re-keyed and disconnected, ONLY for a gym that already has that connection (on, or switched off
 * by the company or by bad keys). Once the gym disconnects it, it is gone from the screen. PURE.
 */
export function offeredTo(provider, row) {
  return OFFERED.includes(provider) || Boolean(row && row.provider === provider && row.off_reason !== 'disconnected');
}

/** What a screen may see of a request. PURE. */
export function requestView(row) {
  const p = PROVIDERS[row.provider];
  return {
    id: row.id,
    kind: row.kind,
    memberId: row.member_id || null,
    ref: row.ref,
    amountP: Number(row.amount_p),
    label: row.label,
    note: row.note,
    upiId: row.upi || null,
    payee: row.payee,
    provider: row.provider || null,
    providerName: p ? p.name : null,
    testMode: row.provider ? row.mode !== 'live' : false,
    url: row.link_url || null,
    status: row.status,
    failed: Boolean(row.failed_at) && row.status === 'open',
    paidP: Number(row.paid_p) || 0,
    method: row.method || null,
    paymentId: row.payment_id || null,
    paidAt: row.paid_at || null,
    late: Number(row.late) === 1,
    receiptNo: row.receipt_no || null,
    recorded: Boolean(row.recorded_at),
    createdAt: row.created_at,
    expiresAt: row.expires_at || null,
  };
}

/**
 * The ONE way a request becomes paid. Idempotent by (company, payment id): the same payment reported
 * twice (desk check + webhook + cron) changes nothing the second time. A payment after the link was
 * cancelled or ran out is still the gym's money: it is marked paid with late = 1, so the desk records it
 * and sees "paid after the link closed".
 * -> 'paid' | 'duplicate' | 'unknown' (no such request) | 'second' (a second payment on a paid request)
 */
export async function markPaid(db, { provider, requestId, paymentId, amountP, method, at }) {
  const pid = str(paymentId).trim();
  if (!pid) return 'unknown';
  const row = await requestOf(db, requestIdOf(requestId));
  if (!row || row.provider !== provider) return 'unknown';
  // Review round 3 (R-550): "this payment was seen" and "the request is paid" are ONE write (a D1 batch is one
  // transaction). Before, a failed second write left the payment seen and the request unpaid for ever, because every
  // later report of it was skipped as "already seen". The paid write also finishes such a half-done payment (seen for
  // THIS request, the request not paid), so one the old code left behind is healed by the next report of it.
  const [first, r] = await db.batch([
    db.prepare('INSERT OR IGNORE INTO pay_events (provider, payment_id, request_id, at) VALUES (?, ?, ?, ?)').bind(provider, pid, row.id, nowIso(at)),
    db
      .prepare(
        `UPDATE pay_requests SET status = 'paid', payment_id = ?, paid_p = ?, method = ?, paid_at = ?,
                late = CASE WHEN status IN ('cancelled', 'expired') THEN 1 ELSE 0 END
          WHERE id = ? AND status <> 'paid'
            AND EXISTS (SELECT 1 FROM pay_events e WHERE e.provider = ? AND e.payment_id = ? AND e.request_id = ?)`,
      )
      .bind(pid, Math.round(Number(amountP)) || Number(row.amount_p), str(method) || 'upi', nowIso(at), row.id, provider, pid, row.id),
  ]);
  const seenNow = Boolean(first && first.meta && first.meta.changes > 0);
  const paidNow = Boolean(r && r.meta && r.meta.changes > 0);
  if (paidNow && !seenNow) console.warn('[pay] a payment seen before but never marked paid is marked paid now', provider);
  if (!paidNow && !seenNow) return 'duplicate';
  if (!paidNow) {
    // Review round 2 (R-542): the check and the webhook can name ONE payment two ways, when one of them only knows the
    // link was paid (a "<link>:paid" id). That is the same payment, never "a second one to refund"; the real id is kept.
    const prev = await requestOf(db, row.id);
    const before = str(prev && prev.payment_id);
    if (isLinkLevelId(pid) || isLinkLevelId(before)) {
      if (isLinkLevelId(before) && !isLinkLevelId(pid)) await db.prepare('UPDATE pay_requests SET payment_id = ? WHERE id = ?').bind(pid, row.id).run();
      return 'duplicate';
    }
    // Never the request id in a log: anyone holding one can tap "I have paid" on the join page.
    console.warn('[pay] a second payment id on one paid request', provider, '- check it in the company dashboard and refund it if it is real');
    return 'second';
  }
  console.log('[pay] paid', provider, row.mode);
  return 'paid';
}

/** "<link id>:paid": the link is paid, but the answer did not carry the payment's own id. PURE. */
export const isLinkLevelId = (id) => str(id).endsWith(':paid');

/** A connection the company no longer accepts (revoked, keys changed): off, and Settings says why. */
export async function turnOff(db, gymId, provider, reason, now) {
  await db
    .prepare("UPDATE pay_connections SET status = 'off', off_reason = ?, updated_at = ? WHERE gym_id = ? AND provider = ?")
    .bind(reason, nowIso(now), gymId, provider)
    .run();
  console.warn('[pay] connection off', provider, reason);
}

// ------------------------------------------------------------------------------------ company calls

/** The connection's keys/tokens, opened; OAuth tokens refreshed when they are about to run out. */
async function credsOf(env, db, conn, f, now = Date.now()) {
  let creds = await unseal(env, conn.creds);
  // Review round 3: an earlier account's keys kept for its old links (keyChange) go once those links are past watching.
  if (Array.isArray(creds.older) && creds.older.some((o) => !(Date.parse(str(o && o.until)) > now))) {
    const { older, ...rest } = creds;
    const live = older.filter((o) => Date.parse(str(o && o.until)) > now);
    creds = live.length ? { ...rest, older: live } : rest;
    await db.prepare('UPDATE pay_connections SET creds = ?, updated_at = ? WHERE gym_id = ? AND provider = ?').bind(await seal(env, creds), nowIso(now), conn.gym_id, conn.provider).run();
  }
  if (conn.via !== 'oauth' || !creds.refreshToken) return creds;
  const left = Date.parse(str(creds.expiresAt)) - Date.now();
  if (Number.isFinite(left) && left > 86400000) return creds;
  const fresh = await refreshOauth(env, conn.provider, creds, conn.mode, f);
  if (!fresh) return creds;
  const next = { ...creds, ...fresh };
  await db.prepare('UPDATE pay_connections SET creds = ?, updated_at = ? WHERE gym_id = ? AND provider = ?').bind(await seal(env, next), nowIso(), conn.gym_id, conn.provider).run();
  return next;
}

/**
 * Can this request still turn out paid at the company? An open link, and (review round 2, R-542) also one WE closed
 * (a price change, a desk cancel, Make member, a disconnect) that the company may still take money on: PayU cannot
 * cancel a link, PhonePe's page lives up to an hour, a cancel can fail on a network error. So every closed link with a
 * company link id stays watched for 8 days, until the company itself says it is closed ("done"). PURE.
 */
export function stillWatched(row, now = Date.now()) {
  if (!row || !row.provider || !row.link_id || row.status === 'paid') return false;
  if (row.status === 'open') return true;
  // Review round 3: until the link's own expiry plus a day, not only 8 days from the request (watchUntil).
  return row.checked_at !== CHECK_DONE && now < watchUntil(row);
}

/**
 * Review round 3 (R-550): which keys ask about this request. When the owner pasted keys of a DIFFERENT account, the
 * old account's keys are kept sealed inside the new ones (`older`, keyChange) for the old links only, until those
 * links are past watching. Every other request uses the connection's own keys. PURE.
 */
export function keysFor(creds, row, now = Date.now()) {
  const older = Array.isArray(creds && creds.older) ? creds.older : [];
  const hit = older.find((o) => o && Array.isArray(o.ids) && o.ids.includes(row.id) && Date.parse(str(o.until)) > now);
  return hit && hit.keys ? hit.keys : creds;
}

/** A connection whose keys may still ASK about old links: on, or disconnected with its keys kept for that (below). */
const canAsk = (conn) => Boolean(conn && conn.creds && (conn.status === 'on' || conn.off_reason === 'disconnected'));

/** Ask the company about one request (throttled), and act on the answer. Returns the fresh row. */
export async function checkWithCompany(env, db, row, { f = fetch, force = false, now = Date.now() } = {}) {
  if (!stillWatched(row, now)) return row;
  if (!force && row.checked_at && now - Date.parse(row.checked_at) < CHECK_EVERY_MS) return row;
  if (!hasMasterKey(env)) return row;
  const conn = await connOf(db, row.gym_id, row.provider);
  if (!canAsk(conn)) return row;
  // Review round 2 (R-542): each link in its OWN mode. Live keys cannot see a test link (and the other way round), so
  // asking would only fail, and must never switch a gym's live payments off as "bad keys".
  if (row.mode && conn.mode !== row.mode) return row;
  await db.prepare('UPDATE pay_requests SET checked_at = ? WHERE id = ?').bind(nowIso(now), row.id).run();
  const adapter = PROVIDERS[row.provider];
  let st;
  let creds = null;
  let keys = null;
  try {
    creds = await credsOf(env, db, conn, f, now);
    keys = keysFor(creds, row, now);
    st = await adapter.status(keys, row.mode || conn.mode, row.link_id, f);
  } catch (e) {
    // Only the connection's OWN keys failing switches it off; an old account's kept keys failing never does.
    if (e instanceof PayError && e.code === 'BAD_KEYS' && conn.status === 'on' && keys === creds) await turnOff(db, row.gym_id, row.provider, 'bad_keys', now);
    else console.warn('[pay] status check failed', row.provider, e instanceof PayError ? e.code : 'error');
    return requestOf(db, row.id);
  }
  if (st.state === 'paid') {
    await markPaid(db, { provider: row.provider, requestId: row.id, paymentId: st.paymentId || `${row.link_id}:paid`, amountP: st.amountP, method: st.method, at: now });
  } else if (st.state === 'expired' || st.state === 'cancelled') {
    await db.prepare("UPDATE pay_requests SET status = ?, failed_at = CASE WHEN ? THEN ? ELSE failed_at END WHERE id = ? AND status = 'open'").bind(st.state, st.failed ? 1 : 0, nowIso(now), row.id).run();
    // The company itself says nobody can pay it any more: no more asking.
    await db.prepare("UPDATE pay_requests SET checked_at = ? WHERE id = ? AND status <> 'paid'").bind(CHECK_DONE, row.id).run();
  } else if (st.state === 'refunded') {
    // Money that came and went back (refunded before we ever saw it paid): never paid.
  } else if (st.state === 'open' && row.status === 'cancelled' && adapter.cancel) {
    // Review round 3 (R-550): we closed it here, but the company still takes money on it (its cancel failed, or a
    // disconnect or a key change ran out of calls for this run): cancel it there now. Still watched until it says so.
    try {
      await adapter.cancel(keys, row.mode || conn.mode, row.link_id, f);
      console.log('[pay] a link closed here is now cancelled at the company too', row.provider);
    } catch (e) {
      console.warn('[pay] the company did not cancel a link closed here; asked again later', row.provider, e instanceof PayError ? e.code : 'error');
    }
  } else if (st.failed) {
    await db.prepare('UPDATE pay_requests SET failed_at = ? WHERE id = ?').bind(nowIso(now), row.id).run();
  }
  return requestOf(db, row.id);
}

/**
 * Payment sweep (R-542): close an open request so nobody can pay it any more: the company link is cancelled first
 * (best effort; Razorpay and Cashfree can, PayU cannot, PhonePe's page dies within the hour), then the row. A payment
 * that still lands on it later is kept as late (markPaid), never lost. `conn` = its connection, still with its keys.
 */
export async function closeRequest(env, db, row, conn, f, now = Date.now()) {
  const adapter = PROVIDERS[row.provider];
  let atCompany = false;
  // Only with keys of the link's own mode (review round 2): live keys cannot cancel a test link.
  if (adapter && adapter.cancel && row.link_id && conn && conn.creds && (!row.mode || row.mode === conn.mode) && hasMasterKey(env)) {
    try {
      await adapter.cancel(keysFor(await credsOf(env, db, conn, f, now), row, now), row.mode || conn.mode, row.link_id, f);
      atCompany = true;
    } catch (e) {
      console.warn('[pay] the company did not cancel a link; it is closed here', row.provider, e instanceof PayError ? e.code : 'error');
    }
  }
  await db.prepare("UPDATE pay_requests SET status = 'cancelled' WHERE id = ? AND status = 'open'").bind(row.id).run();
  return atCompany;
}

/** The connection row (with its sealed keys) of a request, or null for a plain UPI one. */
export async function connOfRow(db, row) {
  return row && row.provider ? (await db.prepare('SELECT * FROM pay_connections WHERE gym_id = ? AND provider = ?').bind(row.gym_id, row.provider).first()) || null : null;
}

/**
 * Review round 2 (R-542): an open request made in the OTHER mode (a test link from before payments went live, or the
 * other way round) is never reused: it is asked once (a payment is kept) and closed. -> the fresh row when it turned
 * out paid, else null. `mode` = payMode(env).
 */
export async function retireOtherMode(env, db, row, mode, f, now) {
  if (!row || !row.provider || !row.mode || row.mode === mode || row.status !== 'open') return null;
  const fresh = await checkWithCompany(env, db, row, { f, now, force: true });
  if (fresh && fresh.status === 'paid') return fresh;
  if (fresh && fresh.status === 'open') await closeRequest(env, db, fresh, await connOfRow(db, fresh), f);
  return null;
}

/**
 * Review round 2 (R-542): just before the desk Approves, is a PAID payment still paid? A refund (or a payment the
 * bank reversed) before Approve must not become a receipt. -> 'paid' | 'refunded' | 'unknown' (cannot ask: then the
 * desk goes on as before). Only the company's own answer says 'refunded'.
 */
export async function recheckPaid(env, db, row, f) {
  if (!row || row.status !== 'paid' || !row.provider || !row.link_id || !hasMasterKey(env)) return 'unknown';
  const conn = await connOfRow(db, row);
  if (!canAsk(conn) || (row.mode && conn.mode !== row.mode)) return 'unknown';
  try {
    const st = await PROVIDERS[row.provider].status(keysFor(await credsOf(env, db, conn, f), row), row.mode || conn.mode, row.link_id, f);
    // Review round 3 (R-550): ANY refund (in full or in part) is not a payment to Approve: the desk asks them instead.
    if (st.state === 'refunded' || Number(st.refundedP) > 0) {
      console.warn('[pay] a paid payment was refunded before Approve', row.provider);
      return 'refunded';
    }
    return st.state === 'paid' ? 'paid' : 'unknown';
  } catch (e) {
    console.warn('[pay] the check before Approve failed', row.provider, e instanceof PayError ? e.code : 'error');
    return 'unknown';
  }
}

/**
 * The gym's connections that may make links NOW, first company first. Payment sweep (R-542): only a connection in the
 * Worker's own mode, so once "payments live" a test-mode connection (made before) never shows a real member a test
 * link anyone could "pay" with a test card. Checking old links still uses any connection (checkWithCompany).
 */
export async function linkConnections(env, db, gymId) {
  if (!hasMasterKey(env)) return [];
  const mode = payMode(env);
  return (((await db.prepare("SELECT * FROM pay_connections WHERE gym_id = ? AND status = 'on'").bind(gymId).all()).results || []))
    .filter((c) => c.mode === mode)
    .sort((x, y) => PROVIDER_ORDER.indexOf(x.provider) - PROVIDER_ORDER.indexOf(y.provider));
}

/** Make the company link for a request row (also a fresh one when PhonePe's hour ran out). */
export async function makeLink(env, db, row, conn, extra, f, origin) {
  const adapter = PROVIDERS[conn.provider];
  const n = Number(row.link_n) || 1;
  const ref = n > 1 ? `${row.id}-${n}` : row.id;
  const link = await adapter.createLink(
    await credsOf(env, db, conn, f),
    conn.mode,
    {
      id: row.id,
      ref,
      amountP: Number(row.amount_p),
      description: [row.payee, row.label].filter(Boolean).join(': ') || 'Gym payment',
      note: row.note,
      name: str(extra.name).slice(0, 80),
      phone: /^[6-9][0-9]{9}$/.test(str(extra.phone)) ? str(extra.phone) : '',
      notifyUrl: `${origin || APP_ORIGIN}/api/pay/hook/${conn.provider}/${conn.hook}`,
    },
    f,
  );
  await db
    .prepare("UPDATE pay_requests SET provider = ?, mode = ?, link_id = ?, link_url = ?, expires_at = ?, link_n = ?, status = 'open', checked_at = '' WHERE id = ?")
    .bind(conn.provider, conn.mode, link.linkId, link.url, link.expiresAt, n, row.id)
    .run();
}

// ------------------------------------------------------------------------------------ HTTP

async function readBody(request) {
  if (request.method !== 'POST') return { refused: no(405, 'Method not allowed') };
  const text = await request.text();
  if (text.length > MAX_BODY) return { refused: no(413, 'Too big') };
  try {
    const body = JSON.parse(text || '{}');
    return body && typeof body === 'object' ? { body } : { refused: no(400, 'Send a JSON object.') };
  } catch {
    return { refused: no(400, 'Send a JSON object.') };
  }
}

function whoRefusal(e) {
  const code = e instanceof WhoError ? e.code : 'OFFLINE';
  if (code === 'BAD_KEY') return no(401, 'BAD_KEY');
  if (code === 'NOT_READY') return ok({ on: false, why: 'NOT_READY' });
  return no(503, 'OFFLINE');
}

/** Everything under /api/pay/. `deps.fetch` for tests. */
export async function handlePay(request, env, url, deps = {}) {
  const f = deps.fetch || fetch;
  const now = deps.now ?? Date.now();
  const path = url.pathname.replace(/\/+$/, '');
  const db = env && env.WEB;

  // Webhooks and the OAuth return come from the companies, not our apps.
  const hook = /^\/api\/pay\/hook\/([a-z]+)(?:\/([A-Za-z0-9_-]{8,64}))?$/.exec(path);
  if (hook) return handleHook(request, env, hook[1], hook[2] || '', f, now);
  const back = /^\/api\/pay\/oauth\/(razorpay|cashfree)\/back$/.exec(path);
  if (back) return oauthBack(env, back[1], url, f, now);

  if (!(await tablesReady(db))) {
    if (request.method === 'POST') return ok({ on: false, why: 'NOT_READY' });
    return no(404, 'Not found');
  }
  const read = await readBody(request);
  if (read.refused) return read.refused;
  const b = read.body;

  try {
    switch (path) {
      case '/api/pay/desk':
        return await deskState(env, db, b, f, now);
      case '/api/pay/connect':
        return await connect(env, db, b, f, now);
      case '/api/pay/disconnect':
        return await disconnect(env, db, b, f, now);
      case '/api/pay/oauth/start':
        return await oauthStart(env, db, b, f, now, url);
      case '/api/pay/request':
        return await createRequest(env, db, b, f, now, url.origin);
      case '/api/pay/check':
        return await deskCheck(env, db, b, f, now);
      case '/api/pay/cancel':
        return await cancelRequest(env, db, b, f, now);
      case '/api/pay/paid':
        return await paidList(env, db, b, f, now);
      case '/api/pay/claim':
        return await claim(env, db, b, f, now);
      case '/api/pay/recorded':
        return await recorded(env, db, b, f, now);
      case '/api/pay/mine':
        return await mine(env, db, b, f, now);
      case '/api/pay/member-check':
        return await memberCheck(env, db, b, f, now);
      case '/api/pay/shop':
        return await shopRequest(env, db, b, f, now, url.origin);
      case '/api/pay/settle':
        return await settleForDesk(env, db, b, f, now);
      case '/api/pay/switches':
        return await setSwitches(env, db, b, f, now);
      case '/api/pay/joins':
        return await joinList(env, db, b, f, now);
      default:
        return no(404, 'Not found');
    }
  } catch (e) {
    if (e instanceof WhoError) return whoRefusal(e);
    if (e instanceof PayError) return no(502, e.code, { detail: e.detail || '' });
    if (e instanceof Error && e.message === 'PAYMENTS_OFF') return ok({ on: false, why: 'NO_MASTER_KEY' });
    console.error('[pay] failed', path, e instanceof Error ? e.message : 'error');
    return no(500, 'FAILED');
  }
}

/** Settings -> Payments and every desk money sheet: what is switched on, and each company's state. */
async function deskState(env, db, b, f, now) {
  const who = await deskWho(env, b.key, f);
  // The admin app hands over the gym's UPI ID (kept in the gym's own records) for members' shop QR and the join page.
  // Review round 3 (R-550): only the OWNER's key saves it. A staff key's UPI ID is ignored (the rest of this answer is
  // the same), so nobody at the desk can send members' and joiners' money to a UPI ID of their own.
  if (b.upiId !== undefined && who.role === 'owner') {
    await db
      .prepare('INSERT INTO pay_gyms (gym_id, upi, payee, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(gym_id) DO UPDATE SET upi = excluded.upi, payee = excluded.payee, updated_at = excluded.updated_at')
      .bind(who.gymId, cleanUpi(b.upiId), str(b.payee || who.gymName).slice(0, 60), nowIso(now))
      .run();
  }
  const rows = (await db.prepare('SELECT * FROM pay_connections WHERE gym_id = ?').bind(who.gymId).all()).results || [];
  const keysOn = hasMasterKey(env);
  // R-528: the owner's two switches (D1 0016). ready = false before it is applied: the screen greys them.
  const ready = await switchesReady(db);
  return ok({
    on: true,
    connectOn: keysOn,
    testMode: payMode(env) === 'test',
    canManage: who.role === 'owner',
    switches: { ready, ...(await switchesOf(db, who.gymId)) },
    providers: PROVIDER_ORDER.filter((id) => offeredTo(id, rows.find((r) => r.provider === id))).map((id) => ({
      id,
      name: PROVIDERS[id].name,
      fields: PROVIDERS[id].fields.map((x) => ({ name: x.name, label: x.label, secret: x.secret, placeholder: x.placeholder || '' })),
      oauth: keysOn && oauthOn(env, id),
      connection: connectionView(rows.find((r) => r.provider === id)),
    })),
  });
}

/** Paste keys: check them with the company, seal them, keep them. Owner only. */
async function connect(env, db, b, f, now) {
  const who = await deskWho(env, b.key, f);
  if (who.role !== 'owner') return no(403, 'OWNER_ONLY');
  const adapter = PROVIDERS[str(b.provider)];
  if (!adapter) return no(400, 'UNKNOWN_PROVIDER');
  const prev = await connOf(db, who.gymId, adapter.id);
  // R-547: no new PayU or PhonePe connection; a gym already on one can paste its keys again.
  if (!offeredTo(adapter.id, prev)) return no(400, 'UNKNOWN_PROVIDER');
  if (!hasMasterKey(env)) return ok({ on: false, why: 'NO_MASTER_KEY' });
  const mode = payMode(env);
  const fields = {};
  for (const x of adapter.fields) fields[x.name] = str(b.fields && b.fields[x.name]).trim();
  const wrong = adapter.check(fields, mode);
  if (wrong) return no(400, 'CHECK', { words: wrong });
  const tried = await adapter.test(fields, mode, f);
  if (!tried.ok) return no(400, 'BAD_KEYS', { detail: tried.detail || '' });
  const hookId = prev ? prev.hook : randomId(18);
  // Review round 3 (R-550): keys of a different account first settle the old account's links (keyChange).
  const older = await keyChange(env, db, prev, adapter.id, fields, mode, f, now);
  const sealed = await seal(env, older.length ? { ...fields, older } : fields);
  await db
    .prepare(
      `INSERT INTO pay_connections (gym_id, provider, mode, via, creds, hint, account, hook, status, off_reason, connected_at, updated_at)
       VALUES (?, ?, ?, 'keys', ?, ?, '', ?, 'on', '', ?, ?)
       ON CONFLICT(gym_id, provider) DO UPDATE SET mode = excluded.mode, via = 'keys', creds = excluded.creds, hint = excluded.hint,
         account = '', status = 'on', off_reason = '', connected_at = excluded.connected_at, updated_at = excluded.updated_at`,
    )
    .bind(who.gymId, adapter.id, mode, sealed, lastFour(adapter.hint(fields)), hookId, nowIso(now), nowIso(now))
    .run();
  console.log('[pay] connected', adapter.id, mode, 'keys');
  return ok({ connection: connectionView(await connOf(db, who.gymId, adapter.id)) });
}

// Companies whose status answer refuses a link of another account (Razorpay 400, Cashfree 404), so one ask tells
// whether new keys belong to the same account as the old links. PayU answers "Not Found" inside a normal reply.
const ASKS_ACROSS_ACCOUNTS = ['razorpay', 'cashfree'];

/** Do two sets of pasted keys name the same account (the same Key ID / App ID / merchant key)? PURE. */
export function sameAccount(provider, a, b) {
  const shown = (PROVIDERS[provider] ? PROVIDERS[provider].fields : []).filter((x) => !x.secret);
  return shown.length > 0 && shown.every((x) => str(a && a[x.name]).trim() !== '' && str(a[x.name]).trim() === str(b && b[x.name]).trim());
}

/**
 * Review round 3 (R-550): the owner pastes (or signs in with) keys while the old keys still have links a member can
 * pay. The same account (the same Key ID, or the new keys can see an old link): nothing changes. A DIFFERENT account:
 * what disconnect does, with the OLD keys, before they are replaced: every open link is asked once more (a payment is
 * kept) and cancelled at the company and here; then the old keys are kept sealed inside the new ones, for those old
 * links only, until they are past watching, so the 10-minute check, Today and Cashfree's webhooks still work for them.
 * -> the `older` list to seal with the new keys (an earlier account's kept keys stay while they are needed).
 */
export async function keyChange(env, db, prev, provider, fresh, mode, f, now = Date.now()) {
  if (!prev || !prev.creds || !hasMasterKey(env)) return [];
  let old;
  try {
    old = await unseal(env, prev.creds);
  } catch {
    return [];
  }
  const { older: had, ...oldKeys } = old || {};
  const carried = (Array.isArray(had) ? had : []).filter((o) => o && Date.parse(str(o.until)) > now);
  // Test keys never ask about live links (or the other way round), so the other mode's links are not ours to settle.
  if (prev.mode !== mode) return carried;
  const kept = new Set(carried.flatMap((o) => (Array.isArray(o.ids) ? o.ids : [])));
  const mine = (
    (
      await db
        .prepare(
          `SELECT * FROM pay_requests WHERE gym_id = ? AND provider = ? AND mode = ? AND link_id <> '' AND ${IN_WINDOW()}
             AND ((status IN ('open', 'cancelled', 'expired') AND checked_at <> ?) OR (status = 'paid' AND recorded_at = ''))
           ORDER BY created_at DESC LIMIT 200`,
        )
        .bind(prev.gym_id, provider, mode, ...windowArgs(now), CHECK_DONE)
        .all()
    ).results || []
  ).filter((r) => !kept.has(r.id));
  if (!mine.length || sameAccount(provider, oldKeys, fresh)) return carried;
  const probe = mine.find((r) => r.status !== 'paid') || mine[0];
  if (ASKS_ACROSS_ACCOUNTS.includes(provider)) {
    try {
      await PROVIDERS[provider].status(fresh, mode, probe.link_id, f);
      return carried; // the new keys see an old link: the same account (new keys made for it)
    } catch {
      // Not found with the new keys: another account.
    }
  }
  console.log('[pay] keys of another account: the old links are settled with the old keys first', provider);
  const budget = askBudget(f, runBudget(env) - 8);
  for (const row of mine.filter((r) => r.status === 'open')) {
    if (!budget.roomForOne()) break;
    const back = await checkWithCompany(env, db, row, { f: budget.f, now, force: true });
    if (back && back.status === 'open') await closeRequest(env, db, back, prev, budget.f, now);
  }
  // Past this run's calls: closed here; the 10-minute check cancels them at the company with the kept keys.
  await db.prepare("UPDATE pay_requests SET status = 'cancelled' WHERE gym_id = ? AND provider = ? AND mode = ? AND status = 'open'").bind(prev.gym_id, provider, mode).run();
  const until = Math.max(...mine.map(watchUntil));
  return [{ keys: oldKeys, ids: mine.map((r) => r.id), until: nowIso(until) }, ...carried].slice(0, 3);
}

async function disconnect(env, db, b, f, now) {
  const who = await deskWho(env, b.key, f);
  if (who.role !== 'owner') return no(403, 'OWNER_ONLY');
  const provider = str(b.provider);
  if (!PROVIDERS[provider]) return no(400, 'UNKNOWN_PROVIDER');
  const conn = await connOf(db, who.gymId, provider);
  // Payment sweep (R-542): before the keys go, every open link of this company is asked once more (a payment made a
  // moment ago is kept), and the rest are closed at the company and here, so nobody pays a link we can no longer see.
  // Review round 3 (R-550): as many as this run's outside calls allow (Cloudflare's free plan: 50 a run), newest first.
  if (conn && conn.status === 'on' && conn.creds && hasMasterKey(env)) {
    const open =
      (
        await db
          .prepare("SELECT * FROM pay_requests WHERE gym_id = ? AND provider = ? AND status = 'open' AND link_id <> '' ORDER BY created_at DESC LIMIT 100")
          .bind(who.gymId, provider)
          .all()
      ).results || [];
    const budget = askBudget(f, runBudget(env) - 4);
    for (const row of open) {
      if (!budget.roomForOne()) break;
      const fresh = await checkWithCompany(env, db, row, { f: budget.f, now, force: true });
      if (fresh && fresh.status === 'open') await closeRequest(env, db, fresh, conn, budget.f, now);
    }
  }
  // The rest: closed here. They stay watched, and the 10-minute check cancels them at the company too with the keys
  // kept below (review round 3; before, they were only closed here and could be starved of turns).
  await db.prepare("UPDATE pay_requests SET status = 'cancelled' WHERE gym_id = ? AND provider = ? AND status = 'open'").bind(who.gymId, provider).run();
  if (conn && conn.via === 'oauth' && hasMasterKey(env)) {
    try {
      await revokeOauth(env, provider, await unseal(env, conn.creds), conn, f);
    } catch {
      console.warn('[pay] the company did not confirm the disconnect; ours is off anyway', provider);
    }
  }
  // Review round 2 (R-542): pasted keys are kept, sealed and switched off (they never make a link again), ONLY while a
  // closed link of the last 8 days may still be paid at the company (PayU cannot cancel one; a cancel can fail): the
  // 10-minute check keeps asking about those, then wipes the keys (wipeSpentKeys). Nothing left to watch, or a
  // "Connect" sign-in we just revoked: wiped now.
  const keep = conn && conn.via === 'keys' && conn.creds && (await needsKeys(db, who.gymId, provider, conn.mode, now));
  await db
    .prepare("UPDATE pay_connections SET status = 'off', off_reason = 'disconnected', creds = CASE WHEN ? THEN creds ELSE '' END, updated_at = ? WHERE gym_id = ? AND provider = ?")
    .bind(keep ? 1 : 0, nowIso(now), who.gymId, provider)
    .run();
  if (keep) console.log('[pay] disconnected; keys kept only to watch closed links', provider);
  return ok({ connection: connectionView(await connOf(db, who.gymId, provider)) });
}

/** Does a closed link of this gym and company (in that mode) still need its keys to be watched? */
async function needsKeys(db, gymId, provider, mode, now) {
  const r = await db
    .prepare(
      `SELECT 1 AS x FROM pay_requests WHERE gym_id = ? AND provider = ? AND mode = ? AND status IN ('open', 'cancelled', 'expired')
         AND link_id <> '' AND checked_at <> ? AND ${IN_WINDOW()} LIMIT 1`,
    )
    .bind(gymId, provider, mode, CHECK_DONE, ...windowArgs(now))
    .first();
  return Boolean(r);
}

/** The 10-minute check: keys kept after a disconnect are wiped once no closed link needs them. -> how many wiped. */
export async function wipeSpentKeys(db, now = Date.now()) {
  const r = await db
    .prepare(
      `UPDATE pay_connections SET creds = '', updated_at = ? WHERE status = 'off' AND off_reason = 'disconnected' AND creds <> ''
         AND NOT EXISTS (SELECT 1 FROM pay_requests r WHERE r.gym_id = pay_connections.gym_id AND r.provider = pay_connections.provider
           AND r.mode = pay_connections.mode AND r.status IN ('open', 'cancelled', 'expired') AND r.link_id <> '' AND r.checked_at <> ?
           AND ${IN_WINDOW('r.')})`,
    )
    .bind(nowIso(now), CHECK_DONE, ...windowArgs(now))
    .run();
  return (r.meta && r.meta.changes) || 0;
}

/** A "please pay" for a member's dues (the desk) - with a company link when one is connected. */
async function createRequest(env, db, b, f, now, origin) {
  const who = await deskWho(env, b.key, f);
  const kind = b.kind === 'shop' ? 'shop' : 'fee';
  const amountP = Math.round(Number(b.amountP));
  if (!Number.isFinite(amountP) || amountP < 100 || amountP > MAX_AMOUNT_P) return no(400, 'BAD_AMOUNT');
  const ref = str(b.ref).slice(0, 80);
  const memberId = str(b.memberId).slice(0, 80);
  if (!ref || (kind === 'fee' && !memberId)) return no(400, 'BAD_REQUEST');
  const upi = cleanUpi(b.upiId);
  // Review round 3 (R-550): an open request for the same dues at ANOTHER amount (the desk changed the amount) is asked
  // once more and, unless it was just paid (then that payment stands and is answered), closed here and at the company,
  // so a member never has two live links for one due.
  const otherAmount =
    (
      await db
        .prepare("SELECT * FROM pay_requests WHERE gym_id = ? AND kind = ? AND ref = ? AND amount_p <> ? AND status = 'open' ORDER BY created_at DESC LIMIT 5")
        .bind(who.gymId, kind, ref, amountP)
        .all()
    ).results || [];
  const budget = askBudget(f, runBudget(env) - 8);
  for (const o of otherAmount) {
    const back = budget.roomForOne() ? await checkWithCompany(env, db, o, { f: budget.f, now, force: true }) : o;
    if (back && back.status === 'paid') return ok({ request: requestView(back) });
    if (back && back.status === 'open') await closeRequest(env, db, back, await connOfRow(db, back), budget.f, now);
  }
  // The same dues and amount already asked for: the same request (and link), never a second one. Review round 2
  // (R-542): never one made in the other mode (a test link from before payments went live): that one is closed.
  let same = await db
    .prepare("SELECT * FROM pay_requests WHERE gym_id = ? AND kind = ? AND ref = ? AND amount_p = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1")
    .bind(who.gymId, kind, ref, amountP)
    .first();
  if (same && same.provider && same.mode && same.mode !== payMode(env)) same = await retireOtherMode(env, db, same, payMode(env), f, now);
  let row = same;
  if (!row) {
    const id = newRequestId();
    await db
      .prepare(
        `INSERT INTO pay_requests (id, gym_id, kind, member_id, app_member, ref, amount_p, label, note, upi, payee, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, who.gymId, kind, memberId, str(b.appMember).slice(0, 80), ref, amountP, str(b.label).slice(0, 80), str(b.note).slice(0, 60), upi, str(b.payee || who.gymName).slice(0, 60), nowIso(now))
      .run();
    row = await requestOf(db, id);
  }
  // A company link, when the gym has one connected (and the master key is set).
  if (b.online !== false && !row.link_url && hasMasterKey(env)) {
    const conns = await linkConnections(env, db, who.gymId);
    const conn = conns.find((c) => !b.provider || c.provider === b.provider);
    if (conn) {
      try {
        await makeLink(env, db, row, conn, b, f, origin);
      } catch (e) {
        if (e instanceof PayError && e.code === 'BAD_KEYS') await turnOff(db, who.gymId, conn.provider, 'bad_keys', now);
        const code = e instanceof PayError ? e.code : 'FAILED';
        console.warn('[pay] link not made', conn.provider, code);
        // The UPI QR still works: answer the request, with the reason the link is missing.
        return ok({ request: requestView(await requestOf(db, row.id)), linkError: code });
      }
    }
  }
  return ok({ request: requestView(await requestOf(db, row.id)) });
}

async function deskRow(env, db, b, f) {
  const who = await deskWho(env, b.key, f);
  const row = await requestOf(db, str(b.id));
  if (!row || row.gym_id !== who.gymId) return { who, row: null };
  return { who, row };
}

async function deskCheck(env, db, b, f, now) {
  const { row } = await deskRow(env, db, b, f);
  if (!row) return no(404, 'NOT_FOUND');
  // Review round 2 (R-542): just before Approve the company is asked again, not throttled: an open payment paid a
  // moment ago is found, and a paid one refunded since is said ("refunded": the desk saves nothing as paid).
  if (b.beforeApprove === true) {
    if (row.status === 'paid') return ok({ request: requestView(row), refunded: (await recheckPaid(env, db, row, f)) === 'refunded' });
    return ok({ request: requestView(await checkWithCompany(env, db, row, { f, now, force: true })), refunded: false });
  }
  return ok({ request: requestView(await checkWithCompany(env, db, row, { f, now })) });
}

async function cancelRequest(env, db, b, f, now) {
  const { row } = await deskRow(env, db, b, f);
  if (!row) return no(404, 'NOT_FOUND');
  // A payment that already happened is never hidden by a cancel: check first. Review round 2 (R-542): then the link is
  // cancelled at the company too (closeRequest), not only here, so nobody can still pay it from an old message.
  const fresh = await checkWithCompany(env, db, row, { f, now, force: true });
  if (fresh.status === 'open') await closeRequest(env, db, fresh, await connOfRow(db, fresh), f);
  return ok({ request: requestView(await requestOf(db, row.id)) });
}

/** Paid online, receipt not made yet: the admin app makes each one (claim -> receipt -> recorded). */
async function paidList(env, db, b, f, now) {
  const who = await deskWho(env, b.key, f);
  const rows =
    (
      await db
        .prepare("SELECT * FROM pay_requests WHERE gym_id = ? AND status = 'paid' AND recorded_at = '' ORDER BY paid_at LIMIT 50")
        .bind(who.gymId)
        .all()
    ).results || [];
  // Shop orders paid online in the last 3 days, so the Shop page can say "Paid online". Payment sweep (R-542): never a
  // TEST-mode company payment (anyone can "pay" a test link; the desk must not hand over the goods for it).
  const since = nowIso(now - 3 * 86400000);
  const shop =
    (
      await db
        .prepare("SELECT ref, paid_p, provider FROM pay_requests WHERE gym_id = ? AND kind = 'shop' AND status = 'paid' AND paid_at >= ? AND NOT (provider <> '' AND mode <> 'live')")
        .bind(who.gymId, since)
        .all()
    ).results || [];
  return ok({
    paid: rows.filter((r) => !r.claim_until || Date.parse(r.claim_until) < now).map(requestView),
    shopPaid: shop.map((r) => ({ orderId: r.ref, paidP: Number(r.paid_p) })),
  });
}

/** One desk takes the job of making the receipt for 5 minutes; a second desk is told it is taken. */
async function claim(env, db, b, f, now) {
  const { row } = await deskRow(env, db, b, f);
  if (!row) return no(404, 'NOT_FOUND');
  if (row.recorded_at) return ok({ taken: true, recorded: true, request: requestView(row) });
  const token = randomId(12);
  const r = await db
    .prepare("UPDATE pay_requests SET claim = ?, claim_until = ? WHERE id = ? AND recorded_at = '' AND (claim_until = '' OR claim_until < ?)")
    .bind(token, nowIso(now + CLAIM_MS), row.id, nowIso(now))
    .run();
  if (!r.meta || r.meta.changes === 0) return ok({ taken: true, recorded: false, request: requestView(row) });
  return ok({ token, request: requestView(await requestOf(db, row.id)) });
}

/**
 * The receipt is made. With `token` (an online payment this desk claimed) or, for a UPI-only request,
 * the desk's own "Paid" (status becomes paid by the desk). Recording twice changes nothing.
 */
async function recorded(env, db, b, f, now) {
  const { row } = await deskRow(env, db, b, f);
  if (!row) return no(404, 'NOT_FOUND');
  if (row.recorded_at) return ok({ request: requestView(row) });
  const receiptNo = str(b.receiptNo).slice(0, 40);
  if (row.status === 'paid') {
    if (!b.token || !sameText(b.token, row.claim)) return no(409, 'NOT_CLAIMED');
    await db.prepare("UPDATE pay_requests SET receipt_no = ?, recorded_at = ?, claim = '', claim_until = '' WHERE id = ? AND recorded_at = ''").bind(receiptNo, nowIso(now), row.id).run();
  } else {
    // Taken at the desk (cash, or UPI to the gym's own QR): the request is done. Review round 3 (R-550): its company
    // link is asked first (paid online a moment ago: that payment stands and is never overwritten as cash; the desk
    // is told) and then cancelled at the company, so nobody pays the same dues twice.
    if (row.provider && row.link_id && row.status === 'open') {
      const back = await checkWithCompany(env, db, row, { f, now, force: true });
      if (back && back.status === 'paid') return ok({ request: requestView(back), paidOnline: true });
      if (back && back.status === 'open') await closeRequest(env, db, back, await connOfRow(db, back), f, now);
    }
    await db
      .prepare("UPDATE pay_requests SET status = 'paid', method = ?, paid_p = ?, paid_at = ?, receipt_no = ?, recorded_at = ? WHERE id = ? AND status IN ('open', 'expired', 'cancelled')")
      .bind(str(b.method) || 'upi', Math.round(Number(b.amountP)) || Number(row.amount_p), nowIso(now), receiptNo, nowIso(now), row.id)
      .run();
  }
  return ok({ request: requestView(await requestOf(db, row.id)) });
}

/**
 * Review round 3 (R-550): the desk is about to take money for a due (kind 'fee', ref = the membership) or a shop order
 * (kind 'shop', ref = the order) another way: cash, or UPI to the gym's own QR. Every open request for it is asked
 * once more and closed, here and at the company (the same safety check as Make member), so the member cannot also pay
 * an old link. -> { paidOnline: the payment made online a moment ago (the desk must not take the money again) | null,
 * closed: how many were closed }. For a fee, one paid online in the last 15 minutes whose receipt is not made yet also
 * counts (its receipt is being made by itself); for a shop order only one found paid right now does.
 */
async function settleForDesk(env, db, b, f, now) {
  const who = await deskWho(env, b.key, f);
  const kind = b.kind === 'shop' ? 'shop' : b.kind === 'fee' ? 'fee' : '';
  const ref = str(b.ref).slice(0, 80);
  if (!kind || !ref) return no(400, 'BAD_REQUEST');
  const rows =
    (
      await db
        .prepare(
          `SELECT * FROM pay_requests WHERE gym_id = ? AND kind = ? AND ref = ?
             AND (status = 'open' OR (status = 'paid' AND recorded_at = '' AND paid_at >= ?)) ORDER BY created_at DESC LIMIT 10`,
        )
        .bind(who.gymId, kind, ref, nowIso(now - RECENT_PAID_MS))
        .all()
    ).results || [];
  const budget = askBudget(f, runBudget(env) - 4);
  let paidOnline = null;
  let closed = 0;
  for (const row of rows) {
    if (row.status === 'paid') {
      if (kind === 'fee' && !paidOnline) paidOnline = row;
      continue;
    }
    const back = budget.roomForOne() ? await checkWithCompany(env, db, row, { f: budget.f, now, force: true }) : row;
    if (back && back.status === 'paid') {
      if (!paidOnline) paidOnline = back;
      continue;
    }
    if (back && back.status === 'open') {
      await closeRequest(env, db, back, await connOfRow(db, back), budget.f, now);
      closed += 1;
    }
  }
  return ok({ paidOnline: paidOnline ? requestView(paidOnline) : null, closed });
}

/** R-528: Settings -> Payments, the owner's two switches. Owner only; before D1 0016 "not switched on yet". */
async function setSwitches(env, db, b, f, now) {
  const who = await deskWho(env, b.key, f);
  if (who.role !== 'owner') return no(403, 'OWNER_ONLY');
  if (!(await switchesReady(db))) return ok({ on: false, why: 'NOT_READY' });
  const switches = await saveSwitches(db, who.gymId, { app: b.app, web: b.web }, now);
  console.log('[pay] switches saved', switches.app ? 'app on' : 'app off', switches.web ? 'web on' : 'web off');
  return ok({ switches: { ready: true, ...switches } });
}

/**
 * R-528: the payments made from the join page (kind 'join', ref = the enquiry id), last 45 days, for Today's
 * "Joined online": paid (by a company: confirmed), "I have paid" (a plain UPI payment: check the bank), or not paid.
 */
async function joinList(env, db, b, f, now) {
  const who = await deskWho(env, b.key, f);
  // Review round 2 (R-542): Today asks the company itself about this gym's unpaid join payments (open ones first, then
  // links we closed), so money paid a minute ago shows "Paid online" before the desk takes cash, instead of waiting
  // for the 10-minute check (which shares 40 asks a run with every gym). Each is asked at most every 5 seconds.
  if (hasMasterKey(env)) {
    const unpaid =
      (
        await db
          .prepare(
            `SELECT * FROM pay_requests WHERE gym_id = ? AND kind = 'join' AND provider <> '' AND link_id <> '' AND status <> 'paid'
               AND checked_at <> ? AND ${IN_WINDOW()} ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, created_at DESC LIMIT ?`,
          )
          .bind(who.gymId, CHECK_DONE, ...windowArgs(now), TODAY_CHECKS)
          .all()
      ).results || [];
    // Review round 3 (R-550): inside the run's outside calls (one was the key check above).
    const budget = askBudget(f, runBudget(env) - 4);
    for (const r of unpaid) {
      if (!budget.roomForOne()) break;
      await checkWithCompany(env, db, r, { f: budget.f, now });
    }
  }
  const rows =
    (
      await db
        .prepare("SELECT * FROM pay_requests WHERE gym_id = ? AND kind = 'join' AND created_at >= ? ORDER BY created_at DESC LIMIT 100")
        .bind(who.gymId, nowIso(now - 45 * 86400000))
        .all()
    ).results || [];
  const joins = [];
  for (const r of rows) joins.push({ ...requestView(r), said: Boolean(r.provider === '' && (await saidAt(db, r.id))) });
  return ok({ joins });
}

/** A member's own requests: what the gym asked them to pay, and their shop orders' payments. */
async function mine(env, db, b, f, now) {
  const who = await memberWho(env, b.memberKey, f);
  const since = nowIso(now - 30 * 86400000);
  const rows =
    (
      await db
        .prepare(
          `SELECT * FROM pay_requests WHERE gym_id = ? AND created_at >= ? AND status IN ('open', 'paid')
             AND ((kind = 'fee' AND member_id <> '' AND member_id = ?) OR (kind = 'shop' AND app_member = ?))
           ORDER BY created_at DESC LIMIT 20`,
        )
        .bind(who.gymId, since, who.rosterId || '-', who.memberId || '-')
        .all()
    ).results || [];
  const gym = await db.prepare('SELECT * FROM pay_gyms WHERE gym_id = ?').bind(who.gymId).first();
  // R-528: the owner switched off "Take payments in the member app": what is owed still shows, the ways to pay do not.
  const app = (await switchesOf(db, who.gymId)).app;
  return ok({
    on: true,
    fees: Boolean(who.rosterId),
    appPay: app,
    requests: rows.map((r) => (app ? memberView(r) : deskOnlyView(memberView(r)))),
    gymUpi: app && gym ? gym.upi || null : null,
  });
}

/** R-528: the app switch is off: the amount, label and status stay; no QR, UPI link or payment page. PURE. */
export function deskOnlyView(v) {
  return v.status === 'open' ? { ...v, upiId: null, url: null, deskOnly: true } : v;
}

/** The member's view: no ids of other people, no payment ids. PURE. */
export function memberView(row) {
  const v = requestView(row);
  return {
    id: v.id,
    kind: v.kind,
    ref: v.kind === 'shop' ? v.ref : null,
    amountP: v.amountP,
    label: v.label,
    note: v.note,
    upiId: v.upiId,
    payee: v.payee,
    providerName: v.providerName,
    testMode: v.testMode,
    url: v.status === 'open' ? v.url : null,
    status: v.status,
    failed: v.failed,
    paidP: v.paidP,
    paidAt: v.paidAt,
    recorded: v.recorded,
  };
}

async function memberRow(env, db, b, f) {
  const who = await memberWho(env, b.memberKey, f);
  const row = await requestOf(db, str(b.id));
  const mineRow =
    row && row.gym_id === who.gymId && ((row.kind === 'fee' && who.rosterId && row.member_id === who.rosterId) || (row.kind === 'shop' && row.app_member === who.memberId));
  return { who, row: mineRow ? row : null };
}

async function memberCheck(env, db, b, f, now) {
  const { row } = await memberRow(env, db, b, f);
  if (!row) return no(404, 'NOT_FOUND');
  const app = (await switchesOf(db, row.gym_id)).app;
  let fresh = await checkWithCompany(env, db, row, { f, now });
  // PhonePe's page lasts an hour: an open request whose link ran out gets a new link when looked at.
  if (app && fresh.status === 'expired' && fresh.provider === 'phonepe' && hasMasterKey(env)) fresh = await remake(env, db, fresh, f, now);
  return ok({ request: app ? memberView(fresh) : deskOnlyView(memberView(fresh)) });
}

export async function remake(env, db, row, f, now) {
  const conn = await connOf(db, row.gym_id, row.provider);
  if (!conn || conn.status !== 'on') return row;
  await db.prepare('UPDATE pay_requests SET link_n = link_n + 1 WHERE id = ?').bind(row.id).run();
  try {
    await makeLink(env, db, await requestOf(db, row.id), conn, {}, f);
  } catch (e) {
    console.warn('[pay] new link not made', row.provider, e instanceof PayError ? e.code : 'error');
  }
  void now;
  return requestOf(db, row.id);
}

/** A member pays for their own shop order: the amount is the order's, read from the gym server. */
async function shopRequest(env, db, b, f, now, origin) {
  const who = await memberWho(env, b.memberKey, f);
  // R-528: "Take payments in the member app" is off: no new payment; the app says to pay at the desk.
  if (!(await switchesOf(db, who.gymId)).app) return ok({ on: true, deskOnly: true, request: null });
  const orderId = str(b.orderId);
  const orders = await rpc(env, 'member_orders', { p_key: b.memberKey }, f);
  const order = Array.isArray(orders) ? orders.find((o) => o && str(o.order_id) === orderId) : null;
  if (!order || order.status === 'cancelled' || order.status === 'collected') return no(404, 'NOT_FOUND');
  const amountP = Math.round(Number(order.total_p));
  if (!(amountP >= 100)) return no(400, 'BAD_AMOUNT');
  const gym = await db.prepare('SELECT * FROM pay_gyms WHERE gym_id = ?').bind(who.gymId).first();
  let row = await db
    .prepare("SELECT * FROM pay_requests WHERE gym_id = ? AND kind = 'shop' AND ref = ? AND status IN ('open', 'paid') ORDER BY created_at DESC LIMIT 1")
    .bind(who.gymId, orderId)
    .first();
  // Review round 2 (R-542): a link of the other mode (test before live) is never reused.
  if (row && row.status === 'open' && row.provider && row.mode && row.mode !== payMode(env)) row = await retireOtherMode(env, db, row, payMode(env), f, now);
  if (row && row.status === 'open' && Number(row.amount_p) !== amountP) {
    // The order's total changed: the old link is asked once (a payment is kept) and cancelled at the company too.
    const fresh = await checkWithCompany(env, db, row, { f, now, force: true });
    if (fresh && fresh.status === 'paid') row = fresh;
    else {
      if (fresh && fresh.status === 'open') await closeRequest(env, db, fresh, await connOfRow(db, fresh), f);
      row = null;
    }
  }
  if (!row) {
    const id = newRequestId();
    await db
      .prepare(
        `INSERT INTO pay_requests (id, gym_id, kind, app_member, ref, amount_p, label, note, upi, payee, created_at)
         VALUES (?, ?, 'shop', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, who.gymId, who.memberId, orderId, amountP, `Order ${Number(order.order_no) || ''}`.trim(), `Order ${Number(order.order_no) || ''}`.trim(), gym ? gym.upi : '', gym ? gym.payee : '', nowIso(now))
      .run();
    row = await requestOf(db, id);
  }
  if (row.status === 'open' && !row.link_url && hasMasterKey(env)) {
    const conns = await linkConnections(env, db, who.gymId);
    if (conns[0]) {
      try {
        await makeLink(env, db, row, conns[0], { name: who.name, phone: b.phone }, f, origin);
      } catch (e) {
        console.warn('[pay] shop link not made', conns[0].provider, e instanceof PayError ? e.code : 'error');
      }
    }
  }
  return ok({ request: memberView(await requestOf(db, row.id)) });
}

// ------------------------------------------------------------------------------------ webhooks

/**
 * POST /api/pay/hook/<company>/<gym hook id>   a gym's own webhook (Cashfree's per-link notify_url)
 * POST /api/pay/hook/razorpay                   the Razorpay partner webhook ("Connect Razorpay")
 * Always 200 once the signature is good (so the company stops re-sending); 401 when it is not.
 */
async function handleHook(request, env, provider, hookId, f, now) {
  if (request.method !== 'POST') return no(405, 'Method not allowed');
  const adapter = PROVIDERS[provider];
  const db = env && env.WEB;
  if (!adapter || !(await tablesReady(db)) || !hasMasterKey(env)) return no(404, 'Not found');
  const raw = await request.text();
  if (raw.length > 65536) return no(413, 'Too big');
  let conn = null;
  // [secret, the keys it belongs to]: the gym's keys, and (review round 3) an earlier account's keys kept for its old
  // links after the owner pasted another account's keys, so a Cashfree webhook for an old link still verifies.
  let tries = [];
  if (hookId) {
    conn = await db.prepare('SELECT * FROM pay_connections WHERE hook = ? AND provider = ?').bind(hookId, provider).first();
    if (!conn || !conn.creds) return no(404, 'Not found');
    const creds = await unseal(env, conn.creds);
    const sets = [creds, ...(Array.isArray(creds.older) ? creds.older.filter((o) => o && o.keys && Date.parse(str(o.until)) > now).map((o) => o.keys) : [])];
    const secretOf = (c) => (provider === 'cashfree' ? c.secretKey || env.CASHFREE_PARTNER_KEY || '' : provider === 'payu' ? c.salt : provider === 'phonepe' ? c.webhookAuth || '' : c.webhookSecret || '');
    tries = sets.map((c) => [secretOf(c), provider === 'payu' ? c : {}]);
  } else if (provider === 'razorpay') {
    tries = [[str(env.RAZORPAY_PARTNER_WEBHOOK_SECRET), {}]];
  } else if (provider === 'cashfree') {
    tries = [[str(env.CASHFREE_PARTNER_KEY), {}]];
  }
  let signed = false;
  for (const [secret, creds] of tries) {
    if (await adapter.verifyHook(secret, raw, request.headers, creds)) {
      signed = true;
      break;
    }
  }
  if (!signed) {
    console.warn('[pay] webhook signature refused', provider);
    return no(401, 'Bad signature');
  }
  let j;
  try {
    j = provider === 'payu' ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw);
  } catch {
    return ok({ ok: true });
  }
  const ev = adapter.readHook(j);
  if (ev.kind === 'revoked') {
    const c = conn || (ev.account ? await db.prepare('SELECT * FROM pay_connections WHERE provider = ? AND account = ?').bind(provider, ev.account).first() : null);
    if (c) await db.prepare("UPDATE pay_connections SET status = 'off', off_reason = 'revoked', creds = '', updated_at = ? WHERE gym_id = ? AND provider = ?").bind(nowIso(now), c.gym_id, provider).run();
    return ok({ ok: true });
  }
  const ref = ev.ref || ev.linkId;
  if (!ref) return ok({ ok: true });
  let row = await requestOf(db, requestIdOf(ref));
  if (!row && ev.linkId) row = await db.prepare('SELECT * FROM pay_requests WHERE provider = ? AND link_id = ?').bind(provider, ev.linkId).first();
  // Only a request of the gym this webhook belongs to. A gym's own hook address names its connection; the partner
  // webhook (no address, "Connect Razorpay") names the gym's account at the company, which must be THIS request's gym
  // (payment sweep R-542: before, any signed partner event could name any gym's request id).
  let owner = conn;
  if (!owner && row && ev.account) owner = await db.prepare("SELECT * FROM pay_connections WHERE provider = ? AND account = ? AND via = 'oauth'").bind(provider, ev.account).first();
  const gymOk = row && owner && row.gym_id === owner.gym_id;
  if (!gymOk) {
    if (row) console.warn('[pay] webhook for a request of another gym ignored', provider);
    return ok({ ok: true });
  }
  // A webhook that names the link but not the payment's own id: the same link-level id the check uses, so the two
  // never look like two payments (review round 2).
  if (ev.kind === 'paid') await markPaid(db, { provider, requestId: row.id, paymentId: ev.paymentId || (row.link_id ? `${row.link_id}:paid` : ''), amountP: ev.amountP, method: ev.method, at: now });
  else if (ev.kind === 'failed') await db.prepare("UPDATE pay_requests SET failed_at = ? WHERE id = ? AND status = 'open'").bind(nowIso(now), row.id).run();
  else if (ev.kind === 'expired' || ev.kind === 'cancelled') await db.prepare("UPDATE pay_requests SET status = ? WHERE id = ? AND status = 'open'").bind(ev.kind, row.id).run();
  return ok({ ok: true });
}

// ------------------------------------------------------------------------------------ scheduled check

/**
 * Every 10 minutes: links made in the last 8 days are checked: open ones not asked for 4 minutes first, then (review
 * round 2, R-542) links WE closed that the company has not said are closed, not asked for 30 minutes. Then keys kept
 * after a disconnect that nothing needs any more are wiped.
 */
export async function scheduledPay(env, { f = fetch, now = Date.now() } = {}) {
  const db = env && env.WEB;
  if (!(await tablesReady(db)) || !hasMasterKey(env)) return 0;
  // Review round 3 (R-550): longest-not-asked first, open or closed alike. Before, open links went first and every open
  // link was due on every run, so past 40 open links the closed-but-payable ones never got a turn.
  const rows =
    (
      await db
        .prepare(
          `SELECT * FROM pay_requests WHERE provider <> '' AND link_id <> '' AND ${IN_WINDOW()}
             AND ((status = 'open' AND (checked_at = '' OR checked_at < ?))
               OR (status IN ('cancelled', 'expired') AND checked_at <> ? AND (checked_at = '' OR checked_at < ?)))
           ORDER BY checked_at, created_at LIMIT 40`,
        )
        .bind(...windowArgs(now), nowIso(now - CRON_EVERY_MS), CHECK_DONE, nowIso(now - CLOSED_EVERY_MS))
        .all()
    ).results || [];
  // Inside Cloudflare's 50 outside calls a run (Free plan), with a margin: a run stops before it could pass them.
  const budget = askBudget(f, runBudget(env));
  let paid = 0;
  for (const row of rows) {
    if (!budget.roomForOne()) break;
    const fresh = await checkWithCompany(env, db, row, { f: budget.f, now, force: true });
    if (fresh && fresh.status === 'paid') paid += 1;
    // One that could not be asked at all (its keys are gone, or it is of the other mode) goes to the back of the
    // line, so it never takes the turn of one that can be asked.
    else if (fresh && fresh.checked_at === row.checked_at) await db.prepare('UPDATE pay_requests SET checked_at = ? WHERE id = ? AND checked_at = ?').bind(nowIso(now), row.id, row.checked_at).run();
  }
  await wipeSpentKeys(db, now);
  return paid;
}

// ------------------------------------------------------------------------------------ OAuth (partner)

/** state = base64url(json).hex(hmac): which gym asked, for which company, until when. */
async function signState(env, data) {
  const body = btoa(JSON.stringify(data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${body}.${toHex(await hmac256(`state:${env.PAYMENTS_MASTER_KEY}`, body))}`;
}

export async function readState(env, state, now = Date.now()) {
  const [body, sig] = str(state).split('.');
  if (!body || !sig) return null;
  if (!sameText(toHex(await hmac256(`state:${env.PAYMENTS_MASTER_KEY}`, body)), sig)) return null;
  try {
    const data = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    return data && data.e > now ? data : null;
  } catch {
    return null;
  }
}

const oauthReturn = (provider) => `${APP_ORIGIN}/api/pay/oauth/${provider}/back`;
const cfPartnerHost = (mode) => (mode === 'live' ? 'https://api.cashfree.com' : 'https://api-sandbox.cashfree.com');

async function oauthStart(env, db, b, f, now) {
  const who = await deskWho(env, b.key, f);
  if (who.role !== 'owner') return no(403, 'OWNER_ONLY');
  const provider = str(b.provider);
  if (!oauthOn(env, provider) || !hasMasterKey(env)) return no(404, 'OAUTH_OFF');
  const state = await signState(env, { g: who.gymId, p: provider, e: now + 15 * 60000 });
  if (provider === 'razorpay') {
    const q = new URLSearchParams({ client_id: env.RAZORPAY_CLIENT_ID, response_type: 'code', redirect_uri: oauthReturn('razorpay'), scope: 'read_write', state });
    return ok({ url: `https://auth.razorpay.com/authorize?${q}` });
  }
  const r = await f(`${cfPartnerHost(payMode(env))}/partners/oauth/auth_link`, {
    method: 'POST',
    headers: { 'x-partner-apikey': env.CASHFREE_PARTNER_KEY, 'oauth-client-id': env.CASHFREE_CLIENT_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({ response_type: 'code', scope: 'read_write', state, redirect_uri: oauthReturn('cashfree') }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.auth_link) return no(502, 'OAUTH_REFUSED');
  return ok({ url: str(j.auth_link) });
}

/** GET /api/pay/oauth/<company>/back?code&state: the company sends the owner back here. */
async function oauthBack(env, provider, url, f, now) {
  const db = env && env.WEB;
  const fail = (why) => Response.redirect(`${APP_ORIGIN}/?payments=${encodeURIComponent(why)}#/settings/payments`, 302);
  if (!oauthOn(env, provider) || !hasMasterKey(env) || !(await tablesReady(db))) return fail('off');
  const st = await readState(env, url.searchParams.get('state'), now);
  if (!st || st.p !== provider) return fail('expired');
  if (url.searchParams.get('error')) return fail(url.searchParams.get('error') === 'merchant_rejected' ? 'rejected' : 'cancelled');
  const code = str(url.searchParams.get('code'));
  if (!code) return fail('cancelled');
  const mode = payMode(env);
  let tokens;
  try {
    tokens = await exchangeCode(env, provider, code, mode, f);
  } catch {
    return fail('refused');
  }
  const prev = await connOf(db, st.g, provider);
  // Review round 3 (R-550): signing in with another account settles the old account's links first, as pasting does.
  const older = await keyChange(env, db, prev, provider, tokens.creds, mode, f, now);
  await db
    .prepare(
      `INSERT INTO pay_connections (gym_id, provider, mode, via, creds, hint, account, hook, status, off_reason, connected_at, updated_at)
       VALUES (?, ?, ?, 'oauth', ?, ?, ?, ?, 'on', '', ?, ?)
       ON CONFLICT(gym_id, provider) DO UPDATE SET mode = excluded.mode, via = 'oauth', creds = excluded.creds, hint = excluded.hint,
         account = excluded.account, status = 'on', off_reason = '', connected_at = excluded.connected_at, updated_at = excluded.updated_at`,
    )
    .bind(st.g, provider, mode, await seal(env, older.length ? { ...tokens.creds, older } : tokens.creds), lastFour(tokens.account), tokens.account, prev ? prev.hook : randomId(18), nowIso(now), nowIso(now))
    .run();
  console.log('[pay] connected', provider, mode, 'oauth');
  return Response.redirect(`${APP_ORIGIN}/?payments=connected#/settings/payments`, 302);
}

async function exchangeCode(env, provider, code, mode, f) {
  if (provider === 'razorpay') {
    const r = await f('https://auth.razorpay.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.RAZORPAY_CLIENT_ID, client_secret: env.RAZORPAY_CLIENT_SECRET, grant_type: 'authorization_code', redirect_uri: oauthReturn('razorpay'), code, mode }),
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) throw new Error('refused');
    return {
      account: str(j.razorpay_account_id),
      creds: { accessToken: j.access_token, refreshToken: j.refresh_token, publicToken: j.public_token, expiresAt: new Date(Date.now() + Number(j.expires_in || 0) * 1000).toISOString() },
    };
  }
  const r = await f(`${cfPartnerHost(mode)}/partners/oauth/token`, {
    method: 'POST',
    headers: { 'x-partner-apikey': env.CASHFREE_PARTNER_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.CASHFREE_CLIENT_ID, client_secret: env.CASHFREE_CLIENT_SECRET, grant_type: 'authorization_code', code }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('refused');
  return {
    account: str(j.merchant_id || j.merchantId),
    creds: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: new Date(Date.now() + Number(j.expires_in || 86400) * 1000).toISOString() },
  };
}

async function refreshOauth(env, provider, creds, mode, f) {
  try {
    if (provider === 'razorpay') {
      const r = await f('https://auth.razorpay.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.RAZORPAY_CLIENT_ID, client_secret: env.RAZORPAY_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: creds.refreshToken }),
      });
      const j = await r.json();
      if (!r.ok || !j.access_token) return null;
      return { accessToken: j.access_token, refreshToken: j.refresh_token || creds.refreshToken, expiresAt: new Date(Date.now() + Number(j.expires_in || 0) * 1000).toISOString() };
    }
    const r = await f(`${cfPartnerHost(mode)}/partners/oauth/token`, {
      method: 'POST',
      headers: { 'x-partner-apikey': env.CASHFREE_PARTNER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.CASHFREE_CLIENT_ID, client_secret: env.CASHFREE_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: creds.refreshToken }),
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) return null;
    return { accessToken: j.access_token, refreshToken: j.refresh_token || creds.refreshToken, expiresAt: new Date(Date.now() + Number(j.expires_in || 86400) * 1000).toISOString() };
  } catch {
    return null;
  }
}

async function revokeOauth(env, provider, creds, conn, f) {
  if (provider === 'razorpay') {
    await f('https://auth.razorpay.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.RAZORPAY_CLIENT_ID, client_secret: env.RAZORPAY_CLIENT_SECRET, token_type_hint: 'access_token', token: creds.accessToken }),
    });
  } else if (provider === 'cashfree' && conn.account) {
    await f(`${cfPartnerHost(conn.mode)}/partners/oauth/${encodeURIComponent(conn.account)}/revoke`, {
      method: 'POST',
      headers: { 'x-partner-apikey': env.CASHFREE_PARTNER_KEY, 'Content-Type': 'application/json' },
    });
  }
}
