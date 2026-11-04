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
import { PROVIDERS, PROVIDER_ORDER, PayError, requestIdOf } from './payProviders.js';

const SUPABASE = 'https://hdxzqbdiokjklnypfisq.supabase.co';
// The public, read-only app key (the same one in the panel and the app).
const ANON = 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';
export const APP_ORIGIN = 'https://app.mettleup.fit';

const MAX_BODY = 8192;
const CHECK_EVERY_MS = 5000;
const CLAIM_MS = 5 * 60000;
const CRON_EVERY_MS = 4 * 60000;
const CRON_DAYS = 8;
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
  const first = await db
    .prepare('INSERT OR IGNORE INTO pay_events (provider, payment_id, request_id, at) VALUES (?, ?, ?, ?)')
    .bind(provider, pid, row.id, nowIso(at))
    .run();
  if (!first.meta || first.meta.changes === 0) return 'duplicate';
  const r = await db
    .prepare(
      `UPDATE pay_requests SET status = 'paid', payment_id = ?, paid_p = ?, method = ?, paid_at = ?,
              late = CASE WHEN status IN ('cancelled', 'expired') THEN 1 ELSE 0 END
        WHERE id = ? AND status <> 'paid'`,
    )
    .bind(pid, Math.round(Number(amountP)) || Number(row.amount_p), str(method) || 'upi', nowIso(at), row.id)
    .run();
  if (!r.meta || r.meta.changes === 0) {
    console.warn('[pay] a second payment on request', row.id, 'from', provider, '- the gym should refund it');
    return 'second';
  }
  console.log('[pay] paid', row.id, provider, row.mode);
  return 'paid';
}

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
async function credsOf(env, db, conn, f) {
  const creds = await unseal(env, conn.creds);
  if (conn.via !== 'oauth' || !creds.refreshToken) return creds;
  const left = Date.parse(str(creds.expiresAt)) - Date.now();
  if (Number.isFinite(left) && left > 86400000) return creds;
  const fresh = await refreshOauth(env, conn.provider, creds, conn.mode, f);
  if (!fresh) return creds;
  const next = { ...creds, ...fresh };
  await db.prepare('UPDATE pay_connections SET creds = ?, updated_at = ? WHERE gym_id = ? AND provider = ?').bind(await seal(env, next), nowIso(), conn.gym_id, conn.provider).run();
  return next;
}

/** Ask the company about one request (throttled), and act on the answer. Returns the fresh row. */
export async function checkWithCompany(env, db, row, { f = fetch, force = false, now = Date.now() } = {}) {
  if (!row || !row.provider || !row.link_id) return row;
  if (row.status !== 'open' && !(row.status === 'expired' && now - Date.parse(row.expires_at || row.created_at) < 86400000)) return row;
  if (!force && row.checked_at && now - Date.parse(row.checked_at) < CHECK_EVERY_MS) return row;
  if (!hasMasterKey(env)) return row;
  const conn = await connOf(db, row.gym_id, row.provider);
  if (!conn || conn.status !== 'on') return row;
  await db.prepare('UPDATE pay_requests SET checked_at = ? WHERE id = ?').bind(nowIso(now), row.id).run();
  const adapter = PROVIDERS[row.provider];
  let st;
  try {
    st = await adapter.status(await credsOf(env, db, conn, f), conn.mode, row.link_id, f);
  } catch (e) {
    if (e instanceof PayError && e.code === 'BAD_KEYS') await turnOff(db, row.gym_id, row.provider, 'bad_keys', now);
    else console.warn('[pay] status check failed', row.provider, e instanceof PayError ? e.code : 'error');
    return requestOf(db, row.id);
  }
  if (st.state === 'paid') {
    await markPaid(db, { provider: row.provider, requestId: row.id, paymentId: st.paymentId || `${row.link_id}:paid`, amountP: st.amountP, method: st.method, at: now });
  } else if (st.state === 'expired' || st.state === 'cancelled') {
    await db.prepare("UPDATE pay_requests SET status = ?, failed_at = CASE WHEN ? THEN ? ELSE failed_at END WHERE id = ? AND status = 'open'").bind(st.state, st.failed ? 1 : 0, nowIso(now), row.id).run();
  } else if (st.failed) {
    await db.prepare('UPDATE pay_requests SET failed_at = ? WHERE id = ?').bind(nowIso(now), row.id).run();
  }
  return requestOf(db, row.id);
}

/** Make the company link for a request row (also a fresh one when PhonePe's hour ran out). */
async function makeLink(env, db, row, conn, extra, f, origin) {
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
    .prepare("UPDATE pay_requests SET provider = ?, mode = ?, link_id = ?, link_url = ?, expires_at = ?, link_n = ?, status = 'open' WHERE id = ?")
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
  // The admin app hands over the gym's UPI ID (kept in the gym's own records) for members' shop QR.
  if (b.upiId !== undefined) {
    await db
      .prepare('INSERT INTO pay_gyms (gym_id, upi, payee, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(gym_id) DO UPDATE SET upi = excluded.upi, payee = excluded.payee, updated_at = excluded.updated_at')
      .bind(who.gymId, cleanUpi(b.upiId), str(b.payee || who.gymName).slice(0, 60), nowIso(now))
      .run();
  }
  const rows = (await db.prepare('SELECT * FROM pay_connections WHERE gym_id = ?').bind(who.gymId).all()).results || [];
  const keysOn = hasMasterKey(env);
  return ok({
    on: true,
    connectOn: keysOn,
    testMode: payMode(env) === 'test',
    canManage: who.role === 'owner',
    providers: PROVIDER_ORDER.map((id) => ({
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
  if (!hasMasterKey(env)) return ok({ on: false, why: 'NO_MASTER_KEY' });
  const mode = payMode(env);
  const fields = {};
  for (const x of adapter.fields) fields[x.name] = str(b.fields && b.fields[x.name]).trim();
  const wrong = adapter.check(fields, mode);
  if (wrong) return no(400, 'CHECK', { words: wrong });
  const tried = await adapter.test(fields, mode, f);
  if (!tried.ok) return no(400, 'BAD_KEYS', { detail: tried.detail || '' });
  const prev = await connOf(db, who.gymId, adapter.id);
  const hookId = prev ? prev.hook : randomId(18);
  const sealed = await seal(env, fields);
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

async function disconnect(env, db, b, f, now) {
  const who = await deskWho(env, b.key, f);
  if (who.role !== 'owner') return no(403, 'OWNER_ONLY');
  const provider = str(b.provider);
  if (!PROVIDERS[provider]) return no(400, 'UNKNOWN_PROVIDER');
  const conn = await connOf(db, who.gymId, provider);
  if (conn && conn.via === 'oauth' && hasMasterKey(env)) {
    try {
      await revokeOauth(env, provider, await unseal(env, conn.creds), conn, f);
    } catch {
      console.warn('[pay] the company did not confirm the disconnect; ours is off anyway', provider);
    }
  }
  // The sealed keys are wiped, not just switched off.
  await db.prepare("UPDATE pay_connections SET status = 'off', off_reason = 'disconnected', creds = '', updated_at = ? WHERE gym_id = ? AND provider = ?").bind(nowIso(now), who.gymId, provider).run();
  return ok({ connection: connectionView(await connOf(db, who.gymId, provider)) });
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
  // The same dues and amount already asked for: the same request (and link), never a second one.
  const same = await db
    .prepare("SELECT * FROM pay_requests WHERE gym_id = ? AND kind = ? AND ref = ? AND amount_p = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1")
    .bind(who.gymId, kind, ref, amountP)
    .first();
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
    const conns = ((await db.prepare("SELECT * FROM pay_connections WHERE gym_id = ? AND status = 'on'").bind(who.gymId).all()).results || []).sort(
      (x, y) => PROVIDER_ORDER.indexOf(x.provider) - PROVIDER_ORDER.indexOf(y.provider),
    );
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
  return ok({ request: requestView(await checkWithCompany(env, db, row, { f, now })) });
}

async function cancelRequest(env, db, b, f, now) {
  const { row } = await deskRow(env, db, b, f);
  if (!row) return no(404, 'NOT_FOUND');
  // A payment that already happened is never hidden by a cancel: check first.
  const fresh = await checkWithCompany(env, db, row, { f, now, force: true });
  if (fresh.status === 'open') await db.prepare("UPDATE pay_requests SET status = 'cancelled' WHERE id = ? AND status = 'open'").bind(row.id).run();
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
  // Shop orders paid online in the last 3 days, so the Shop page can say "Paid online".
  const since = nowIso(now - 3 * 86400000);
  const shop =
    (
      await db
        .prepare("SELECT ref, paid_p, provider FROM pay_requests WHERE gym_id = ? AND kind = 'shop' AND status = 'paid' AND paid_at >= ?")
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
    // Taken at the desk (cash, or UPI to the gym's own QR): the request is done.
    await db
      .prepare("UPDATE pay_requests SET status = 'paid', method = ?, paid_p = ?, paid_at = ?, receipt_no = ?, recorded_at = ? WHERE id = ? AND status IN ('open', 'expired', 'cancelled')")
      .bind(str(b.method) || 'upi', Math.round(Number(b.amountP)) || Number(row.amount_p), nowIso(now), receiptNo, nowIso(now), row.id)
      .run();
  }
  return ok({ request: requestView(await requestOf(db, row.id)) });
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
  return ok({ on: true, fees: Boolean(who.rosterId), requests: rows.map(memberView), gymUpi: gym ? gym.upi || null : null });
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
  let fresh = await checkWithCompany(env, db, row, { f, now });
  // PhonePe's page lasts an hour: an open request whose link ran out gets a new link when looked at.
  if (fresh.status === 'expired' && fresh.provider === 'phonepe' && hasMasterKey(env)) fresh = await remake(env, db, fresh, f, now);
  return ok({ request: memberView(fresh) });
}

async function remake(env, db, row, f, now) {
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
  if (row && row.status === 'open' && Number(row.amount_p) !== amountP) {
    await db.prepare("UPDATE pay_requests SET status = 'cancelled' WHERE id = ?").bind(row.id).run();
    row = null;
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
    const conns = ((await db.prepare("SELECT * FROM pay_connections WHERE gym_id = ? AND status = 'on'").bind(who.gymId).all()).results || []).sort(
      (x, y) => PROVIDER_ORDER.indexOf(x.provider) - PROVIDER_ORDER.indexOf(y.provider),
    );
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
  let secret = '';
  if (hookId) {
    conn = await db.prepare('SELECT * FROM pay_connections WHERE hook = ? AND provider = ?').bind(hookId, provider).first();
    if (!conn || !conn.creds) return no(404, 'Not found');
    const creds = await unseal(env, conn.creds);
    secret = provider === 'cashfree' ? creds.secretKey || env.CASHFREE_PARTNER_KEY || '' : provider === 'payu' ? creds.salt : provider === 'phonepe' ? creds.webhookAuth || '' : creds.webhookSecret || '';
  } else if (provider === 'razorpay') {
    secret = str(env.RAZORPAY_PARTNER_WEBHOOK_SECRET);
  } else if (provider === 'cashfree') {
    secret = str(env.CASHFREE_PARTNER_KEY);
  }
  const creds = conn && provider === 'payu' ? await unseal(env, conn.creds) : {};
  if (!(await adapter.verifyHook(secret, raw, request.headers, creds))) {
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
  // Only a request of the gym this webhook belongs to.
  const gymOk = row && (conn ? row.gym_id === conn.gym_id : true);
  if (!gymOk) return ok({ ok: true });
  if (ev.kind === 'paid') await markPaid(db, { provider, requestId: row.id, paymentId: ev.paymentId, amountP: ev.amountP, method: ev.method, at: now });
  else if (ev.kind === 'failed') await db.prepare("UPDATE pay_requests SET failed_at = ? WHERE id = ? AND status = 'open'").bind(nowIso(now), row.id).run();
  else if (ev.kind === 'expired' || ev.kind === 'cancelled') await db.prepare("UPDATE pay_requests SET status = ? WHERE id = ? AND status = 'open'").bind(ev.kind, row.id).run();
  return ok({ ok: true });
}

// ------------------------------------------------------------------------------------ scheduled check

/** Every 10 minutes: links still open (made in the last 8 days, not asked for 4 minutes) are checked. */
export async function scheduledPay(env, { f = fetch, now = Date.now() } = {}) {
  const db = env && env.WEB;
  if (!(await tablesReady(db)) || !hasMasterKey(env)) return 0;
  const rows =
    (
      await db
        .prepare(
          `SELECT * FROM pay_requests WHERE status = 'open' AND provider <> '' AND link_id <> ''
             AND created_at >= ? AND (checked_at = '' OR checked_at < ?) ORDER BY checked_at LIMIT 40`,
        )
        .bind(nowIso(now - CRON_DAYS * 86400000), nowIso(now - CRON_EVERY_MS))
        .all()
    ).results || [];
  let paid = 0;
  for (const row of rows) {
    const fresh = await checkWithCompany(env, db, row, { f, now, force: true });
    if (fresh && fresh.status === 'paid') paid += 1;
  }
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
  await db
    .prepare(
      `INSERT INTO pay_connections (gym_id, provider, mode, via, creds, hint, account, hook, status, off_reason, connected_at, updated_at)
       VALUES (?, ?, ?, 'oauth', ?, ?, ?, ?, 'on', '', ?, ?)
       ON CONFLICT(gym_id, provider) DO UPDATE SET mode = excluded.mode, via = 'oauth', creds = excluded.creds, hint = excluded.hint,
         account = excluded.account, status = 'on', off_reason = '', connected_at = excluded.connected_at, updated_at = excluded.updated_at`,
    )
    .bind(st.g, provider, mode, await seal(env, tokens.creds), lastFour(tokens.account), tokens.account, prev ? prev.hook : randomId(18), nowIso(now), nowIso(now))
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
