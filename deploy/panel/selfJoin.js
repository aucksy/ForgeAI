// R-513 Join online, phase 1 (14 Nov 2026): the "Become a member" form. POST /api/self-join on the panel's own
// address, from public/join-online.html (app.mettleup.fit/m/<GYM CODE>). The same guards as the friend page
// (friend.js): a hidden "website" box (filled = a bot: answered as sent, nothing sent on), a size limit, and a daily
// limit per network address (PER_DAY), kept in the SAME D1 table as the friend page (friend_asks, D1 migration 0010,
// cleaned daily by worker.js) under its own hash, so no new D1 table is needed. Then the gym server's self_join_send
// (supabase/migrations/0077_self_join.sql) checks the gym code, the signed 'join' number proof from "Verify with
// WhatsApp" (phoneInbound.js), the plan and the start day, its own limits (30 a day per gym, 3 a day per number), and
// writes the request into THAT gym's Enquiries only.
//
// PRICES. The page never decides a price: nothing it sends about money is passed on (checkSelfJoin keeps only the
// fields below), and the gym server reads the plan's price and joining fee from the gym's own plan record.
//
// Nothing about the person is kept here (only a salted, daily one-way hash of the network address).
//
// The answer is a code the page turns into English or Hindi words:
//   201 {ok: true, gymName, planName, startsOn, totalP, linked, pay?, payWhy?}
//       R-528: with "pay": "online" in the form, once the request is kept its payment is made (joinPay.js attachJoinPay):
//       pay = the page's view of it; payWhy = why not (the page then says "Pay at the desk"). The request is kept
//       either way: a payment that fails never loses it.
//   400 {error: 'BAD_REQUEST' | 'BAD_NAME' | 'BAD_PROOF' | 'BAD_PLAN' | 'BAD_DATE' | 'NO_CONSENT'}
//   403 {error: 'CLOSED'}   404 {error: 'NO_GYM'}   409 {error: 'MEMBER'}   429 {error: 'TOO_MANY'}
//   503 {error: 'NOT_READY' | 'TRY_AGAIN'}

import { APP_ORIGIN, GYM_PAGE_HOST } from './hosts.js';
import { attachJoinPay } from './joinPay.js';

export const PER_DAY = 10;
const GENDERS = ['male', 'female', 'other'];
const PROOF = /^v1\.join\.[6-9]\d{9}\.\d{10}\.[0-9a-f]{32}\.[0-9a-f]{64}$/;

/** The checked form, a bot (drop it), or a reason code. Only these fields ever go on. PURE. */
export function checkSelfJoin(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'BAD_REQUEST' };
  if (typeof body.website === 'string' && body.website.trim()) return { bot: true };
  const code = String(body.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: 'NO_GYM' };
  const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  if (name.length < 2 || !/\p{L}/u.test(name)) return { error: 'BAD_NAME' };
  const proof = typeof body.proof === 'string' ? body.proof.trim() : '';
  if (!PROOF.test(proof)) return { error: 'BAD_PROOF' };
  const plan = typeof body.plan === 'string' ? body.plan.trim() : '';
  if (plan.length < 1 || plan.length > 64) return { error: 'BAD_PLAN' };
  const start = typeof body.start === 'string' ? body.start.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { error: 'BAD_DATE' };
  if (body.adult !== true || body.health !== true) return { error: 'NO_CONSENT' };
  const gender = GENDERS.includes(body.gender) ? body.gender : null;
  const lang = body.lang === 'hi' ? 'hi' : 'en';
  return { value: { code, name, proof, plan, start, gender, lang } };
}

/** The gym server's answer as the page's code; anything unknown is TRY_AGAIN. PURE. */
export function serverAnswer(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.ok === true) {
    const body = { ok: true };
    if (typeof row.gymName === 'string') body.gymName = row.gymName;
    if (typeof row.planName === 'string') body.planName = row.planName;
    if (typeof row.startsOn === 'string') body.startsOn = row.startsOn;
    const total = Number(row.totalP);
    if (row.totalP != null && Number.isSafeInteger(total)) body.totalP = total;
    body.linked = row.linked === true;
    return { status: 201, body };
  }
  const e = row && typeof row.error === 'string' ? row.error : '';
  if (e === 'NO_GYM') return { status: 404, body: { error: e } };
  if (e === 'CLOSED') return { status: 403, body: { error: e } };
  if (e === 'MEMBER') return { status: 409, body: { error: e } };
  if (['BAD_NAME', 'BAD_PROOF', 'BAD_PLAN', 'BAD_DATE', 'NO_CONSENT'].includes(e)) return { status: 400, body: { error: e } };
  if (e === 'TOO_MANY') return { status: 429, body: { error: e } };
  return { status: 503, body: { error: 'TRY_AGAIN' } };
}

async function hashIp(ip, salt, day) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`selfjoin:${salt}:${day}:${ip}`));
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function answer(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** A refusal, logged with its reason (never the name, the number, the proof or the address). */
function refused(status, code, why) {
  console.warn(`[self-join] refused ${status}: ${why}`);
  return answer(status, { error: code });
}

/**
 * The address limit. true = over it. When D1 or the table is missing, the send goes on: the gym server's own limits
 * and the WhatsApp check's limits still hold, and the log line says what to apply.
 */
async function overLimit(env, request, now) {
  if (!env.WEB || !env.FEEDBACK_SALT) {
    console.warn('[self-join] no address limit: D1 binding WEB or secret FEEDBACK_SALT missing');
    return false;
  }
  const at = now.toISOString();
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || 'unknown', env.FEEDBACK_SALT, at.slice(0, 10));
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const row = await env.WEB.prepare('SELECT COUNT(*) AS n FROM friend_asks WHERE ip_hash = ? AND at > ?').bind(ipHash, dayAgo).first();
    if (row && Number(row.n) >= PER_DAY) return true;
    await env.WEB.prepare('INSERT INTO friend_asks (at, ip_hash) VALUES (?, ?)').bind(at, ipHash).run();
  } catch (e) {
    console.warn('[self-join] no address limit: table friend_asks could not be used (apply D1 migration 0010)', e instanceof Error ? e.message : e);
  }
  return false;
}

/**
 * POST /api/self-join. `rpc(fn, args)` calls the gym server and resolves to {status, data} (worker.js passes the real
 * one; tests a fake).
 */
export async function handleSelfJoin(request, env, rpc, now = new Date(), deps = {}) {
  if (request.method !== 'POST') return refused(405, 'BAD_REQUEST', 'not a POST');
  if (Number(request.headers.get('Content-Length') || 0) > 3000) return refused(413, 'BAD_REQUEST', 'body over 3000 bytes');
  const raw = await request.text();
  if (raw.length > 3000) return refused(413, 'BAD_REQUEST', 'body over 3000 bytes');
  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    return refused(400, 'BAD_REQUEST', `not JSON (${e instanceof Error ? e.message : 'parse error'})`);
  }
  const checked = checkSelfJoin(body);
  if (checked.bot) {
    console.warn('[self-join] dropped: the hidden "website" box was filled (a bot, or a browser autofill)');
    return answer(201, { ok: true });
  }
  if (checked.error) return refused(checked.error === 'NO_GYM' ? 404 : 400, checked.error, checked.error);
  if (await overLimit(env, request, now)) return refused(429, 'TOO_MANY', `${PER_DAY} a day from one address reached`);
  const v = checked.value;
  let r;
  try {
    r = await rpc('self_join_send', {
      p_code: v.code,
      p_name: v.name,
      p_proof: v.proof,
      p_gender: v.gender,
      p_plan: v.plan,
      p_start: v.start,
      p_adult: true,
      p_health: true,
      p_lang: v.lang,
      p_website: null,
    });
  } catch (e) {
    console.error('[self-join] the gym server could not be reached', e);
    return answer(503, { error: 'TRY_AGAIN' });
  }
  // A gym server without 0077 yet: PostgREST answers 404 with PGRST202.
  if (r.status === 404 || (r.data && r.data.code === 'PGRST202')) {
    console.error('[self-join] the gym server has no self_join_send yet (apply supabase migration 0077)');
    return answer(503, { error: 'NOT_READY' });
  }
  if (r.status >= 400) {
    console.error('[self-join] the gym server refused', r.status, r.data && r.data.message);
    return answer(503, { error: 'TRY_AGAIN' });
  }
  const out = serverAnswer(r.data);
  if (out.status !== 201) console.warn(`[self-join] the gym server said ${out.body.error}`);
  else console.log(`[self-join] request kept${out.body.linked ? ' (linked to an open enquiry)' : ''}`);
  // R-528: they chose "Pay now": the payment for THIS request (0081 answers its enquiry id; before 0081 there is none).
  if (out.status === 201 && body.pay === 'online') {
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    const made = await attachJoinPay(
      env,
      rpc,
      { code: v.code, enquiryId: row && row.enquiryId, totalP: out.body.totalP, planName: out.body.planName, gymName: out.body.gymName, name: v.name, proof: v.proof },
      // R-539: the payment company's webhook stays on app.mettleup.fit when this page is on join.mettleup.fit (that host
      // serves only the join pages, never /api/pay/hook).
      { now, origin: hookOrigin(request.url), f: deps.fetch },
    );
    if (made.pay) out.body.pay = made.pay;
    else out.body.payWhy = made.why;
  }
  return answer(out.status, out.body);
}

/** Where the payment webhook goes: this address, except join.mettleup.fit (R-539), which hands it to app.mettleup.fit. PURE. */
export function hookOrigin(requestUrl) {
  const u = new URL(requestUrl);
  return u.hostname.toLowerCase() === GYM_PAGE_HOST ? APP_ORIGIN : u.origin;
}
