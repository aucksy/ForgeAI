// F187 sign-in codes by WhatsApp (R-383, 6 Nov 2026). A 6-digit code proves a person holds a mobile number:
//   - Forgot PIN (purpose 'pin'): an owner or desk person gets a code, types it, and picks a new PIN.
//   - Set up a new gym (purpose 'signup'): the code proves the number is real; one free trial per number.
// Routes on the panel's own address (app.mettleup.fit):
//   GET  /api/phone-code/status  -> {available, mode}     false = the screens hide the WhatsApp way; mode 'send' | 'inbound'
//   POST /api/phone-code/send    {phone, purpose, website} -> {ok: true} (always the same for 'pin')
//   POST /api/phone-code/verify  {phone, purpose, code}   -> {ok: true, proof, expiresAt} | {error, triesLeft}
//
// SWITCHED OFF until all of these exist: the secret WHATSAPP_TOKEN (Meta system-user token), the var
// WHATSAPP_PHONE_NUMBER_ID, the secret PHONE_CODE_SECRET (32+ random characters; the SAME value is in the
// gym server's phone_code_settings row, supabase 0061), D1 binding WEB with migrations/0012_phone_codes.sql,
// and PHONE_CODES not "off" (a kill switch). docs/WHATSAPP-SETUP.md.
//
// MONEY. Every WhatsApp message costs money, so the limits are here on the server: per number 1 a minute,
// 3 an hour, 5 a day; per network address 10 an hour; for everyone PHONE_CODE_DAILY_CAP (default 200) a
// day (India day), which switches sending off and logs loudly. Only Indian mobiles (+91, 10 digits, 6-9).
// A hidden "website" box catches simple bots (the same trap as the demo and friend forms).
//
// NOBODY LEARNS WHO HAS AN ACCOUNT. For 'pin' the answer is the same whether the number has an account or
// not ("If this number has an account, a code is on its way"); a number with no account gets a code that
// was never sent (so typing a code there answers exactly like a wrong code). The limits count every ask,
// sent or not, so they answer the same too. Only numbers on a gym's staff list get a real message.
//
// CODES. crypto-random, kept only as HMAC-SHA256(secret, id + code), 10 minutes, 5 wrong tries then dead,
// one use, compared in constant time. A right code gives a PROOF the gym server checks itself (0061):
// "v1.<purpose>.<phone>.<expires>.<nonce>.<hmac>", 15 minutes, one use. The app never just says "verified".
// LOGS: every send result and error, never the code, the number or the token.
//
// 8 Nov 2026: "Verify with WhatsApp" (phoneInbound.js) flips the direction: the person sends US the code, which is
// free and not blocked by Meta. /status then answers {available: true, mode: 'inbound'}; this file's send path stays.

import { handleInbound, inboundAvailable } from './phoneInbound.js';

export const CODE_MINUTES = 10;
export const MAX_WRONG = 5;
export const PROOF_MINUTES = 15;
export const LIMITS = { perMinute: 1, perHour: 3, perDay: 5, perIpHour: 10 };
export const DEFAULT_DAILY_CAP = 200;
export const GRAPH_VERSION = 'v27.0';
export const TEMPLATE = 'login_code';
export const PURPOSES = ['pin', 'signup'];

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const IST = 330 * MIN;

// ------------------------------------------------------------------ pure helpers

/** An Indian mobile as 10 digits, or null (same rule as the gym server's _norm_phone). PURE. */
export function indianMobile(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** A 6-digit code from crypto.getRandomValues, without modulo bias. */
export function newCode(random = (a) => crypto.getRandomValues(a)) {
  const box = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 1000000) * 1000000;
  for (;;) {
    random(box);
    if (box[0] < limit) return String(box[0] % 1000000).padStart(6, '0');
  }
}

export function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256(secret, message) as lowercase hex. The gym server computes the same (pgcrypto hmac). */
export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

/** Equal strings, compared in time that does not depend on where they differ. PURE. */
export function sameText(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

export const codeHash = (secret, id, code) => hmacHex(secret, `code:${id}:${code}`);
export const phoneKey = (secret, phone) => hmacHex(secret, `phone:${phone}`);
export const ipKey = async (secret, ip) => (await hmacHex(secret, `ip:${ip}`)).slice(0, 32);

/** The proof the gym server checks (0061 _phone_proof). */
export async function makeProof(secret, purpose, phone, nowMs, nonce = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const exp = Math.floor(nowMs / 1000) + PROOF_MINUTES * 60;
  const body = `v1.${purpose}.${phone}.${exp}.${nonce}`;
  return { proof: `${body}.${await hmacHex(secret, body)}`, expiresAt: exp * 1000 };
}

/** The signed question "does this number have an account?" (0061 phone_code_has_account). */
export async function accountQuestion(secret, phone, nowMs) {
  const at = Math.floor(nowMs / 1000);
  return { p_phone: phone, p_at: at, p_sig: await hmacHex(secret, `exists.${phone}.${at}`) };
}

/** Start of today in India, in ms. PURE. */
export function indiaDayStart(nowMs) {
  return Math.floor((nowMs + IST) / DAY) * DAY - IST;
}

/** The WhatsApp Cloud API body for the login_code authentication template (copy-code button). PURE. */
export function templateBody(phone, code, template = TEMPLATE, lang = 'en') {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `91${phone}`,
    type: 'template',
    template: {
      name: template,
      language: { code: lang },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    },
  };
}

/** Which limit an ask breaks, from the earlier asks' times (ms). null = fine. PURE. */
export function limitFor({ phoneTimes, ipTimes }, nowMs) {
  const since = (list, ms) => list.filter((t) => t > nowMs - ms);
  const lastMinute = since(phoneTimes, MIN);
  if (lastMinute.length >= LIMITS.perMinute) {
    return { error: 'TOO_SOON', retryAfter: Math.max(1, Math.ceil((Math.min(...lastMinute) + MIN - nowMs) / 1000)) };
  }
  if (since(phoneTimes, HOUR).length >= LIMITS.perHour) return { error: 'TOO_MANY', why: 'number: 3 an hour' };
  if (since(phoneTimes, DAY).length >= LIMITS.perDay) return { error: 'TOO_MANY', why: 'number: 5 a day' };
  if (since(ipTimes, HOUR).length >= LIMITS.perIpHour) return { error: 'TOO_MANY', why: 'address: 10 an hour' };
  return null;
}

export function dailyCap(env) {
  const n = Number(env.PHONE_CODE_DAILY_CAP);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_DAILY_CAP;
}

/** Everything needed to send is in place (the cap is checked separately). PURE. */
export function configured(env) {
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.PHONE_CODE_SECRET && env.WEB && env.PHONE_CODES !== 'off');
}

// ------------------------------------------------------------------ answers

function answer(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function refused(status, body, why) {
  console.warn(`[phone-code] refused ${status} ${body.error}: ${why}`);
  return answer(status, body);
}

async function readJson(request) {
  if (request.method !== 'POST') return { error: 'not a POST', status: 405 };
  if (Number(request.headers.get('Content-Length') || 0) > 1000) return { error: 'body over 1000 bytes', status: 413 };
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

async function sentToday(env, nowMs) {
  const row = await env.WEB.prepare('SELECT COUNT(*) AS n FROM phone_code_asks WHERE sent = 1 AND at >= ?').bind(indiaDayStart(nowMs)).first();
  return Number(row?.n ?? 0);
}

/** On, and today's cap not reached. Errors (no table yet) = off. */
export async function isAvailable(env, nowMs = Date.now()) {
  if (!configured(env)) return false;
  try {
    return (await sentToday(env, nowMs)) < dailyCap(env);
  } catch (e) {
    console.warn('[phone-code] off: table phone_code_asks could not be read (apply D1 migration 0012)', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Sends the template. {ok, id} or {ok: false, status, code, message}. Never logs the code or the token. */
export async function sendWhatsApp(env, phone, code, fetcher = fetch) {
  const version = env.WHATSAPP_GRAPH_VERSION || GRAPH_VERSION;
  const url = `https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    const r = await fetcher(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(templateBody(phone, code, env.WHATSAPP_TEMPLATE || TEMPLATE, env.WHATSAPP_TEMPLATE_LANG || 'en')),
    });
    let data = null;
    try {
      data = await r.json();
    } catch {
      data = null;
    }
    if (r.ok && data && Array.isArray(data.messages) && data.messages[0]?.id) return { ok: true, id: String(data.messages[0].id) };
    const err = (data && data.error) || {};
    return { ok: false, status: r.status, code: err.code ?? null, message: typeof err.message === 'string' ? err.message.slice(0, 200) : 'no error text' };
  } catch (e) {
    return { ok: false, status: 0, code: null, message: e instanceof Error ? e.message.slice(0, 200) : 'fetch failed' };
  }
}

// ------------------------------------------------------------------ routes

/**
 * /api/phone-code/*. `rpc(fn, args)` calls the gym server ({status, data}); `fetcher` sends to Meta
 * (tests pass fakes). `now` in ms.
 */
export async function handlePhoneCode(request, env, url, rpc, { fetcher = fetch, now = Date.now(), ctx = null } = {}) {
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/api/phone-code/status') {
    if (request.method !== 'GET') return answer(405, { error: 'BAD_REQUEST' });
    // 8 Nov 2026: "Verify with WhatsApp" (the person sends US a message, phoneInbound.js) wins when it is on;
    // the old "we send you a code" stays as it was underneath.
    if (await inboundAvailable(env)) return answer(200, { available: true, mode: 'inbound' });
    return answer(200, (await isAvailable(env, now)) ? { available: true, mode: 'send' } : { available: false });
  }
  if (path.startsWith('/api/phone-code/inbound/')) return handleInbound(request, env, path, url, { now });
  if (path === '/api/phone-code/send') return send(request, env, rpc, fetcher, now, ctx);
  if (path === '/api/phone-code/verify') return verify(request, env, now);
  return answer(404, { error: 'NOT_FOUND' });
}

const NEUTRAL = { ok: true };

async function send(request, env, rpc, fetcher, now, ctx) {
  const read = await readJson(request);
  if (read.error) return refused(read.status, { error: 'BAD_REQUEST' }, read.error);
  const body = read.body;
  if (typeof body.website === 'string' && body.website.trim()) {
    console.warn('[phone-code] dropped: the hidden "website" box was filled (a bot, or a browser autofill)');
    return answer(200, NEUTRAL);
  }
  const purpose = PURPOSES.includes(body.purpose) ? body.purpose : null;
  if (!purpose) return refused(400, { error: 'BAD_REQUEST' }, 'unknown purpose');
  const phone = indianMobile(body.phone);
  if (!phone) return refused(400, { error: 'BAD_PHONE' }, 'not an Indian mobile');
  if (!configured(env)) return refused(503, { error: 'NOT_AVAILABLE' }, 'switched off (token, number id, secret or D1 missing)');

  const secret = env.PHONE_CODE_SECRET;
  const pk = await phoneKey(secret, phone);
  const ik = await ipKey(secret, request.headers.get('CF-Connecting-IP') || 'unknown');
  let askId;
  try {
    const phoneTimes = (await env.WEB.prepare('SELECT at FROM phone_code_asks WHERE phone_key = ? AND at > ?').bind(pk, now - DAY).all()).results.map((r) => Number(r.at));
    const ipTimes = (await env.WEB.prepare('SELECT at FROM phone_code_asks WHERE ip_key = ? AND at > ?').bind(ik, now - HOUR).all()).results.map((r) => Number(r.at));
    const over = limitFor({ phoneTimes, ipTimes }, now);
    if (over) return refused(429, over.error === 'TOO_SOON' ? { error: 'TOO_SOON', retryAfter: over.retryAfter } : { error: 'TOO_MANY' }, over.why ?? 'one a minute');
    // Counted before anything else, so every later answer costs one ask, account or not.
    const ins = await env.WEB.prepare('INSERT INTO phone_code_asks (at, phone_key, ip_key, sent) VALUES (?, ?, ?, 0)').bind(now, pk, ik).run();
    askId = ins?.meta?.last_row_id;
    const cap = dailyCap(env);
    if ((await sentToday(env, now)) >= cap) {
      console.error(`[phone-code] DAILY CAP REACHED: ${cap} WhatsApp codes sent today (India day). Sending is OFF until midnight IST. Raise PHONE_CODE_DAILY_CAP only if this is real use.`);
      return answer(503, { error: 'NOT_AVAILABLE' });
    }
  } catch (e) {
    console.error('[phone-code] D1 could not be used (apply D1 migration 0012)', e instanceof Error ? e.message : e);
    return answer(503, { error: 'NOT_AVAILABLE' });
  }

  let real = true;
  if (purpose === 'pin') {
    let r;
    try {
      r = await rpc('phone_code_has_account', await accountQuestion(secret, phone, now));
    } catch (e) {
      console.error('[phone-code] the gym server could not be reached', e instanceof Error ? e.message : e);
      return answer(503, { error: 'TRY_AGAIN' });
    }
    if (r.status === 404 || (r.data && r.data.code === 'PGRST202')) {
      console.error('[phone-code] the gym server has no phone_code_has_account yet (apply supabase migration 0061)');
      return answer(503, { error: 'TRY_AGAIN' });
    }
    if (r.status >= 400 || typeof r.data !== 'boolean') {
      console.error('[phone-code] the gym server refused the account check', r.status, r.data && r.data.message);
      return answer(503, { error: 'TRY_AGAIN' });
    }
    real = r.data;
  }

  // A new code replaces any waiting one for this number and purpose.
  const code = newCode();
  const id = crypto.randomUUID();
  try {
    await env.WEB.prepare('UPDATE phone_codes SET dead = 1 WHERE phone_key = ? AND purpose = ? AND used_at IS NULL AND dead = 0').bind(pk, purpose).run();
    // No account: a code nobody is sent (a random hash), so "wrong code" answers look the same.
    const stored = real ? await codeHash(secret, id, code) : await hmacHex(secret, `never:${id}:${crypto.randomUUID()}`);
    await env.WEB.prepare('INSERT INTO phone_codes (id, phone_key, purpose, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, pk, purpose, stored, now, now + CODE_MINUTES * MIN)
      .run();
  } catch (e) {
    console.error('[phone-code] the code could not be kept', e instanceof Error ? e.message : e);
    return answer(503, { error: 'TRY_AGAIN' });
  }
  if (!real) {
    console.log('[phone-code] pin: no account for this number; nothing sent (neutral answer)');
    return answer(200, NEUTRAL);
  }

  const deliver = async () => {
    const sent = await sendWhatsApp(env, phone, code, fetcher);
    if (!sent.ok) {
      console.error(`[phone-code] WhatsApp send FAILED purpose=${purpose} status=${sent.status} code=${sent.code} message=${sent.message}`);
      try {
        await env.WEB.prepare('UPDATE phone_codes SET dead = 1 WHERE id = ?').bind(id).run();
      } catch {
        // The code is never sent anyway.
      }
      return false;
    }
    console.log(`[phone-code] WhatsApp sent purpose=${purpose} id=${sent.id}`);
    try {
      if (askId != null) await env.WEB.prepare('UPDATE phone_code_asks SET sent = 1 WHERE rowid = ?').bind(askId).run();
      else await env.WEB.prepare('UPDATE phone_code_asks SET sent = 1 WHERE phone_key = ? AND at = ?').bind(pk, now).run();
    } catch (e) {
      console.warn('[phone-code] the send was not counted', e instanceof Error ? e.message : e);
    }
    return true;
  };
  // Forgot PIN: answered at once and sent after, so the answer's speed does not tell who has an account.
  if (purpose === 'pin') {
    if (ctx) ctx.waitUntil(deliver());
    else await deliver();
    return answer(200, NEUTRAL);
  }
  return (await deliver()) ? answer(200, NEUTRAL) : answer(502, { error: 'SEND_FAILED' });
}

async function verify(request, env, now) {
  const read = await readJson(request);
  if (read.error) return refused(read.status, { error: 'BAD_REQUEST' }, read.error);
  const body = read.body;
  const purpose = PURPOSES.includes(body.purpose) ? body.purpose : null;
  if (!purpose) return refused(400, { error: 'BAD_REQUEST' }, 'unknown purpose');
  const phone = indianMobile(body.phone);
  if (!phone) return refused(400, { error: 'BAD_PHONE' }, 'not an Indian mobile');
  const code = String(body.code ?? '').replace(/\D/g, '');
  if (!configured(env)) return refused(503, { error: 'NOT_AVAILABLE' }, 'switched off');
  const secret = env.PHONE_CODE_SECRET;
  const pk = await phoneKey(secret, phone);
  let row;
  try {
    row = await env.WEB.prepare(
      'SELECT id, code_hash, wrong_tries FROM phone_codes WHERE phone_key = ? AND purpose = ? AND used_at IS NULL AND dead = 0 AND expires_at > ? AND wrong_tries < ? ORDER BY created_at DESC LIMIT 1',
    )
      .bind(pk, purpose, now, MAX_WRONG)
      .first();
  } catch (e) {
    console.error('[phone-code] D1 could not be used (apply D1 migration 0012)', e instanceof Error ? e.message : e);
    return answer(503, { error: 'NOT_AVAILABLE' });
  }
  if (!row) return refused(400, { error: 'WRONG_CODE', triesLeft: 0 }, 'no live code (expired, used, dead or never sent)');
  const ok = code.length === 6 && sameText(await codeHash(secret, row.id, code), row.code_hash);
  if (!ok) {
    const tries = Number(row.wrong_tries) + 1;
    await env.WEB.prepare('UPDATE phone_codes SET wrong_tries = ?, dead = ? WHERE id = ?').bind(tries, tries >= MAX_WRONG ? 1 : 0, row.id).run();
    return refused(400, { error: 'WRONG_CODE', triesLeft: Math.max(0, MAX_WRONG - tries) }, `wrong code (${tries} of ${MAX_WRONG})`);
  }
  // One use: only the first of two parallel right answers gets the proof.
  const used = await env.WEB.prepare('UPDATE phone_codes SET used_at = ? WHERE id = ? AND used_at IS NULL').bind(now, row.id).run();
  if (Number(used?.meta?.changes ?? 0) !== 1) return refused(400, { error: 'WRONG_CODE', triesLeft: 0 }, 'already used');
  const { proof, expiresAt } = await makeProof(secret, purpose, phone, now);
  console.log(`[phone-code] code right purpose=${purpose}; proof given`);
  return answer(200, { ok: true, proof, expiresAt });
}

/** Daily clean-up (worker.js scheduled): codes and asks older than 2 days. Returns how many went. */
export async function deleteOldPhoneCodes(db, nowMs = Date.now()) {
  const before = nowMs - 2 * DAY;
  const a = await db.prepare('DELETE FROM phone_codes WHERE created_at < ?').bind(before).run();
  const b = await db.prepare('DELETE FROM phone_code_asks WHERE at < ?').bind(before).run();
  return Number(a?.meta?.changes ?? 0) + Number(b?.meta?.changes ?? 0);
}
