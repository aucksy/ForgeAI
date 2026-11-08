// "Verify with WhatsApp" (8 Nov 2026, owner approved). The person sends ONE WhatsApp message FROM their phone TO
// MettleUp's business number, so nothing is sent by us: Meta blocks every message we send (131042, a tax flag
// stuck on Meta's side), but messages people send to us are free and still arrive.
//
//   POST /api/phone-code/inbound/start  {phone, purpose: 'pin'|'signup', website}
//        -> {ok, id, code, waNumber, waText: "MettleUp code 123456", expiresAt}
//   GET  /api/phone-code/inbound/status?id=<id>
//        -> {ok, state: 'waiting'|'verified'|'wrong_number'|'expired'|'too_many', expiresAt?, hint?, proof?}
//   Meta's webhook (whatsappHook.js) hands each incoming message to inboundMessages() below.
//
// WHO PROVES WHAT. WhatsApp itself tells us the sender's number (value.messages[].from), and the webhook is only
// believed when Meta's signature is right (WHATSAPP_APP_SECRET). So: the code in the message finds the waiting tap,
// and the sender's number must be the number that was typed. A right message gives the SAME proof as the old
// "we send you a code" way (phoneCode.js makeProof, checked by the gym server itself, supabase 0061), so the gym
// server needs no change. A message from another number only says "wrong number" and keeps waiting (5 = dead).
//
// SWITCHED OFF until all of these exist: the var WHATSAPP_INBOUND_NUMBER (the business number people send to,
// digits), the secrets PHONE_CODE_SECRET and WHATSAPP_APP_SECRET (without Meta's signature anybody could post a
// fake "message from your number"), D1 binding WEB with migrations/0013_phone_inbound.sql, PHONE_CODES not "off",
// and Meta's webhook subscribed to the "messages" field.
//
// PRIVACY, as phoneCode.js: D1 keeps keyed hashes of the number, the code and the id, never the number or the
// code. Only a verified row holds the number, encrypted, until the proof is handed out (then it is emptied).
// Logs never hold the number (only its last 2 digits), the code or the message text.
// LIMITS: the same as asking for a code (phoneCode.js limitFor, counted in phone_code_asks): per number 1 a minute,
// 3 an hour, 5 a day; per network address 10 an hour. Codes last 10 minutes; a verified one never works again.

import { CODE_MINUTES, MAX_WRONG, PURPOSES, hmacHex, indianMobile, ipKey, limitFor, makeProof, newCode, phoneKey, sameText } from './phoneCode.js';

export const WA_PREFIX = 'MettleUp code';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const LIVE = "('waiting','wrong_number')";

// ------------------------------------------------------------------ pure helpers

/** The message the person sends. PURE. */
export const inboundText = (code) => `${WA_PREFIX} ${code}`;

/** The business number from the var, as digits with the country code ("91XXXXXXXXXX"), or null. PURE. */
export function inboundNumber(env) {
  const d = String(env?.WHATSAPP_INBOUND_NUMBER ?? '').replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(d)) return `91${d}`;
  return /^[1-9]\d{9,14}$/.test(d) ? d : null;
}

/** The 6-digit code after "MettleUp code" in a message, or null. Case, spaces, ":" or "-" do not matter. PURE. */
export function parseCode(text) {
  if (typeof text !== 'string' || text.length > 2000) return null;
  const m = /mettle\s*up\s*code\s*[:\-#]?\s*(\d{3})\s?(\d{3})(?!\d)/i.exec(text);
  return m ? `${m[1]}${m[2]}` : null;
}

/** Everything needed is in place (the table is checked separately). PURE. */
export function inboundConfigured(env) {
  return Boolean(inboundNumber(env) && env.PHONE_CODE_SECRET && env.WHATSAPP_APP_SECRET && env.WEB && env.PHONE_CODES !== 'off');
}

export const idKey = (secret, id) => hmacHex(secret, `inbound-id:${id}`);
export const inboundCodeKey = (secret, code) => hmacHex(secret, `inbound-code:${code}`);

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function boxKey(secret) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`inbound-box:${secret}`));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** The verified number, encrypted for its own row only (the row's id_key is bound in). */
export async function sealPhone(secret, rowKey, phone) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(rowKey) }, await boxKey(secret), new TextEncoder().encode(phone));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function openPhone(secret, rowKey, box) {
  const [iv, ct] = String(box).split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: new TextEncoder().encode(rowKey) }, await boxKey(secret), unb64(ct));
  return new TextDecoder().decode(pt);
}

/** What the status answer says about a row, before any proof. PURE. */
export function stateOf(row, nowMs) {
  if (!row) return 'expired';
  if (row.state === 'verified') return 'verified';
  if (row.state === 'dead') return Number(row.wrong_msgs) >= MAX_WRONG ? 'too_many' : 'expired';
  if (Number(row.expires_at) <= nowMs) return 'expired';
  return row.state === 'wrong_number' ? 'wrong_number' : 'waiting';
}

const tail = (v) => (typeof v === 'string' && v.length >= 2 ? `..${v.slice(-2)}` : '?');

// ------------------------------------------------------------------ answers

function answer(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function refused(status, body, why) {
  console.warn(`[phone-inbound] refused ${status} ${body.error}: ${why}`);
  return answer(status, body);
}

/** On: configured and the 0013 table can be read. Errors = off. */
export async function inboundAvailable(env) {
  if (!inboundConfigured(env)) return false;
  try {
    await env.WEB.prepare('SELECT 1 FROM phone_inbound LIMIT 1').first();
    return true;
  } catch (e) {
    console.warn('[phone-inbound] off: table phone_inbound could not be read (apply D1 migration 0013)', e instanceof Error ? e.message : e);
    return false;
  }
}

/** /api/phone-code/inbound/*. `now` in ms. */
export async function handleInbound(request, env, path, url, { now = Date.now() } = {}) {
  if (path === '/api/phone-code/inbound/start') return start(request, env, now);
  if (path === '/api/phone-code/inbound/status') {
    if (request.method !== 'GET') return answer(405, { error: 'BAD_REQUEST' });
    return status(env, url.searchParams.get('id') || '', now);
  }
  return answer(404, { error: 'NOT_FOUND' });
}

async function readJson(request) {
  if (request.method !== 'POST') return { error: 'not a POST', status: 405 };
  const raw = await request.text();
  if (raw.length > 1000) return { error: 'body over 1000 bytes', status: 413 };
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'not an object', status: 400 };
    return { body };
  } catch {
    return { error: 'not JSON', status: 400 };
  }
}

async function start(request, env, now) {
  const read = await readJson(request);
  if (read.error) return refused(read.status, { error: 'BAD_REQUEST' }, read.error);
  const body = read.body;
  const purpose = PURPOSES.includes(body.purpose) ? body.purpose : null;
  if (!purpose) return refused(400, { error: 'BAD_REQUEST' }, 'unknown purpose');
  const phone = indianMobile(body.phone);
  if (!phone) return refused(400, { error: 'BAD_PHONE' }, 'not an Indian mobile');
  if (!inboundConfigured(env)) return refused(503, { error: 'NOT_AVAILABLE' }, 'switched off (number, secrets or D1 missing)');
  const waNumber = inboundNumber(env);
  const expiresAt = now + CODE_MINUTES * MIN;
  if (typeof body.website === 'string' && body.website.trim()) {
    // A bot: a normal-looking answer whose id is never stored (its status says "expired").
    console.warn('[phone-inbound] dropped: the hidden "website" box was filled (a bot, or a browser autofill)');
    const code = newCode();
    return answer(200, { ok: true, id: crypto.randomUUID(), code, waNumber, waText: inboundText(code), expiresAt });
  }

  const secret = env.PHONE_CODE_SECRET;
  const pk = await phoneKey(secret, phone);
  const ik = await ipKey(secret, request.headers.get('CF-Connecting-IP') || 'unknown');
  try {
    const phoneTimes = (await env.WEB.prepare('SELECT at FROM phone_code_asks WHERE phone_key = ? AND at > ?').bind(pk, now - DAY).all()).results.map((r) => Number(r.at));
    const ipTimes = (await env.WEB.prepare('SELECT at FROM phone_code_asks WHERE ip_key = ? AND at > ?').bind(ik, now - HOUR).all()).results.map((r) => Number(r.at));
    const over = limitFor({ phoneTimes, ipTimes }, now);
    if (over) return refused(429, over.error === 'TOO_SOON' ? { error: 'TOO_SOON', retryAfter: over.retryAfter } : { error: 'TOO_MANY' }, over.why ?? 'one a minute');
    // sent stays 0: a message TO us costs nothing, so the paid daily cap does not count it.
    await env.WEB.prepare('INSERT INTO phone_code_asks (at, phone_key, ip_key, sent) VALUES (?, ?, ?, 0)').bind(now, pk, ik).run();
    // A new tap replaces any waiting one for this number and purpose.
    await env.WEB.prepare(`UPDATE phone_inbound SET state = 'dead' WHERE phone_key = ? AND purpose = ? AND state IN ${LIVE}`).bind(pk, purpose).run();
    // The code finds the row when the message arrives, so no two live rows share one.
    let code = null;
    let ck = null;
    for (let i = 0; i < 8 && !code; i++) {
      const c = newCode();
      const k = await inboundCodeKey(secret, c);
      const taken = await env.WEB.prepare(`SELECT 1 AS x FROM phone_inbound WHERE code_key = ? AND state IN ${LIVE} AND expires_at > ?`).bind(k, now).first();
      if (!taken) [code, ck] = [c, k];
    }
    if (!code) return refused(503, { error: 'TRY_AGAIN' }, 'no free code after 8 draws');
    const id = crypto.randomUUID();
    await env.WEB.prepare('INSERT INTO phone_inbound (id_key, phone_key, purpose, code_key, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await idKey(secret, id), pk, purpose, ck, now, expiresAt)
      .run();
    console.log(`[phone-inbound] started purpose=${purpose}`);
    return answer(200, { ok: true, id, code, waNumber, waText: inboundText(code), expiresAt });
  } catch (e) {
    console.error('[phone-inbound] D1 could not be used (apply D1 migration 0013)', e instanceof Error ? e.message : e);
    return answer(503, { error: 'NOT_AVAILABLE' });
  }
}

async function status(env, id, now) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return refused(400, { error: 'BAD_REQUEST' }, 'no id');
  if (!inboundConfigured(env)) return refused(503, { error: 'NOT_AVAILABLE' }, 'switched off');
  const secret = env.PHONE_CODE_SECRET;
  const key = await idKey(secret, id);
  let row;
  try {
    row = await env.WEB.prepare('SELECT * FROM phone_inbound WHERE id_key = ?').bind(key).first();
  } catch (e) {
    console.error('[phone-inbound] D1 could not be used (apply D1 migration 0013)', e instanceof Error ? e.message : e);
    return answer(503, { error: 'NOT_AVAILABLE' });
  }
  const state = stateOf(row, now);
  if (state !== 'verified') {
    const out = { ok: true, state };
    if (state === 'waiting' || state === 'wrong_number') {
      out.expiresAt = Number(row.expires_at);
      if (Number(row.no_code) === 1) out.hint = 'no_code';
    }
    return answer(200, out);
  }
  // Verified: the proof is handed out ONCE; the stored number is emptied in the same step.
  if (row.proof_at != null || !row.sender_box) return answer(200, { ok: true, state: 'verified' });
  const taken = await env.WEB.prepare('UPDATE phone_inbound SET proof_at = ?, sender_box = NULL WHERE id_key = ? AND proof_at IS NULL').bind(now, key).run();
  if (Number(taken?.meta?.changes ?? 0) !== 1) return answer(200, { ok: true, state: 'verified' });
  let phone;
  try {
    phone = await openPhone(secret, key, row.sender_box);
  } catch (e) {
    console.error('[phone-inbound] the stored number could not be opened (secret changed?)', e instanceof Error ? e.message : e);
    return answer(200, { ok: true, state: 'expired' });
  }
  const { proof, expiresAt } = await makeProof(secret, row.purpose, phone, now);
  console.log(`[phone-inbound] proof given purpose=${row.purpose}`);
  return answer(200, { ok: true, state: 'verified', proof, expiresAt });
}

// ------------------------------------------------------------------ the webhook side

/** The text messages in Meta's webhook body: [{from, text}]. PURE. */
export function incomingTexts(body) {
  const out = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      for (const m of Array.isArray(change?.value?.messages) ? change.value.messages : []) {
        if (m && typeof m.from === 'string' && m.type === 'text' && typeof m.text?.body === 'string') out.push({ from: m.from, text: m.text.body });
      }
    }
  }
  return out;
}

/**
 * Called by whatsappHook.js for a SIGNED webhook POST only. Checks each incoming text message against the waiting
 * taps. Returns what happened per message (for the test): 'verified' | 'wrong_number' | 'no_code' | 'none'.
 * Never throws (Meta must always get its 200); never logs the number, the code or the text.
 */
export async function inboundMessages(env, body, now = Date.now(), log = console) {
  const results = [];
  if (!inboundConfigured(env)) return results;
  const secret = env.PHONE_CODE_SECRET;
  for (const { from, text } of incomingTexts(body)) {
    try {
      results.push(await oneMessage(env, secret, from, text, now, log));
    } catch (e) {
      log.error(`[phone-inbound] message from=${tail(from)} could not be checked`, e instanceof Error ? e.message : e);
      results.push('none');
    }
  }
  return results;
}

async function oneMessage(env, secret, from, text, now, log) {
  const sender = indianMobile(from);
  const senderKey = sender ? await phoneKey(secret, sender) : null;
  const code = parseCode(text);
  if (code) {
    const row = await env.WEB.prepare(`SELECT id_key, phone_key, purpose, wrong_msgs FROM phone_inbound WHERE code_key = ? AND state IN ${LIVE} AND expires_at > ? ORDER BY created_at DESC LIMIT 1`)
      .bind(await inboundCodeKey(secret, code), now)
      .first();
    if (row) {
      if (senderKey && sameText(senderKey, row.phone_key)) {
        const box = await sealPhone(secret, row.id_key, sender);
        const done = await env.WEB.prepare(`UPDATE phone_inbound SET state = 'verified', verified_at = ?, sender_box = ? WHERE id_key = ? AND state IN ${LIVE}`).bind(now, box, row.id_key).run();
        if (Number(done?.meta?.changes ?? 0) === 1) {
          log.log(`[phone-inbound] verified purpose=${row.purpose} from=${tail(from)}`);
          return 'verified';
        }
        return 'none';
      }
      const wrong = Number(row.wrong_msgs) + 1;
      await env.WEB.prepare(`UPDATE phone_inbound SET wrong_msgs = ?, state = ? WHERE id_key = ? AND state IN ${LIVE}`)
        .bind(wrong, wrong >= MAX_WRONG ? 'dead' : 'wrong_number', row.id_key)
        .run();
      log.warn(`[phone-inbound] code sent from a different number (${wrong} of ${MAX_WRONG}) from=${tail(from)}`);
      return 'wrong_number';
    }
  }
  // No code, or a code that is not waiting (changed, expired, or already used): if this number is waiting, say so.
  if (!senderKey) return 'none';
  const marked = await env.WEB.prepare(`UPDATE phone_inbound SET no_code = 1 WHERE phone_key = ? AND state IN ${LIVE} AND expires_at > ?`).bind(senderKey, now).run();
  if (Number(marked?.meta?.changes ?? 0) > 0) {
    log.warn(`[phone-inbound] a message from a waiting number had no right code from=${tail(from)}`);
    return 'no_code';
  }
  return 'none';
}

/** Daily clean-up (worker.js scheduled): rows older than 2 days. Returns how many went. */
export async function deleteOldInbound(db, nowMs = Date.now()) {
  const r = await db.prepare('DELETE FROM phone_inbound WHERE created_at < ?').bind(nowMs - 2 * DAY).run();
  return Number(r?.meta?.changes ?? 0);
}

