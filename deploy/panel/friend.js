// F147 Bring a friend (4 Nov 2026): the friend invite page's form. POST /api/friend on the panel's own
// address, from public/friend.html (app.mettleup.fit/f/<CODE>). Same guards as the landing page's demo
// form (leads.js): a hidden "website" box (filled = a bot: answered as sent, nothing sent on), a size
// limit, and 5 sends a day from one network address, kept in D1 `forgeai-web` table friend_asks
// (migrations/0010_friend_asks.sql) as a salted, daily one-way hash only. Then the gym server's
// friend_invite_send (supabase/migrations/0056_bring_a_friend.sql) checks the invite code, the name and
// number, its own limits (5 a day per link, 30 a day per gym), and writes the enquiry into THAT gym's
// records only. Nothing about the friend is kept here.
//
// The answer is a code the page turns into English + Hinglish words:
//   201 {ok: true}
//   400 {error: 'BAD_NAME' | 'BAD_PHONE' | 'BAD_REQUEST'}   404 {error: 'NO_INVITE'}
//   429 {error: 'TOO_MANY'}   503 {error: 'NOT_READY' | 'TRY_AGAIN'}

export const PER_DAY = 5;
const TIMES = ['morning', 'afternoon', 'evening', 'any'];

/** The checked form, a bot (drop it), or a reason code. PURE. */
export function checkFriend(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'BAD_REQUEST' };
  if (typeof body.website === 'string' && body.website.trim()) return { bot: true };
  const code = String(body.code ?? '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return { error: 'NO_INVITE' };
  const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  if (name.length < 2 || !/\p{L}/u.test(name)) return { error: 'BAD_NAME' };
  const phone = String(body.phone ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(phone)) return { error: 'BAD_PHONE' };
  const time = TIMES.includes(body.time) ? body.time : 'any';
  return { value: { code, name, phone, time } };
}

/** The gym server's refusal as the page's code; anything unknown is TRY_AGAIN. PURE. */
export function serverAnswer(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.ok === true) return { status: 201, body: { ok: true } };
  const e = row && typeof row.error === 'string' ? row.error : '';
  if (e === 'NO_INVITE') return { status: 404, body: { error: e } };
  if (e === 'BAD_NAME' || e === 'BAD_PHONE') return { status: 400, body: { error: e } };
  if (e === 'TOO_MANY') return { status: 429, body: { error: e } };
  return { status: 503, body: { error: 'TRY_AGAIN' } };
}

async function hashIp(ip, salt, day) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`friend:${salt}:${day}:${ip}`));
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function answer(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** A refusal, logged with its reason (never the name, the number or the address). */
function refused(status, code, why) {
  console.warn(`[friend] refused ${status}: ${why}`);
  return answer(status, { error: code });
}

/**
 * The address limit. true = over it. When D1 or the table is missing (0010 not applied), the send goes
 * on: the gym server's own limits still hold, and the log line says what to apply.
 */
async function overLimit(env, request, now) {
  if (!env.WEB || !env.FEEDBACK_SALT) {
    console.warn('[friend] no address limit: D1 binding WEB or secret FEEDBACK_SALT missing');
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
    console.warn('[friend] no address limit: table friend_asks could not be used (apply D1 migration 0010)', e instanceof Error ? e.message : e);
  }
  return false;
}

/** Daily clean-up (worker.js scheduled): address hashes older than 2 days. Returns how many went. */
export async function deleteOldFriendAsks(db, now = new Date()) {
  const before = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const r = await db.prepare('DELETE FROM friend_asks WHERE at < ?').bind(before).run();
  return Number(r?.meta?.changes ?? 0);
}

/**
 * POST /api/friend. `rpc(fn, args)` calls the gym server and resolves to {status, data} (worker.js
 * passes the real one; tests a fake).
 */
export async function handleFriend(request, env, rpc, now = new Date()) {
  if (request.method !== 'POST') return refused(405, 'BAD_REQUEST', 'not a POST');
  if (Number(request.headers.get('Content-Length') || 0) > 2000) return refused(413, 'BAD_REQUEST', 'body over 2000 bytes');
  const raw = await request.text();
  if (raw.length > 2000) return refused(413, 'BAD_REQUEST', 'body over 2000 bytes');
  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    return refused(400, 'BAD_REQUEST', `not JSON (${e instanceof Error ? e.message : 'parse error'})`);
  }
  const checked = checkFriend(body);
  if (checked.bot) {
    console.warn('[friend] dropped: the hidden "website" box was filled (a bot, or a browser autofill)');
    return answer(201, { ok: true });
  }
  if (checked.error) return refused(checked.error === 'NO_INVITE' ? 404 : 400, checked.error, checked.error);
  if (await overLimit(env, request, now)) return refused(429, 'TOO_MANY', `${PER_DAY} a day from one address reached`);
  const v = checked.value;
  let r;
  try {
    r = await rpc('friend_invite_send', { p_code: v.code, p_name: v.name, p_phone: v.phone, p_time: v.time, p_website: null });
  } catch (e) {
    console.error('[friend] the gym server could not be reached', e);
    return answer(503, { error: 'TRY_AGAIN' });
  }
  // A gym server without 0056 yet: PostgREST answers 404 with PGRST202.
  if (r.status === 404 || (r.data && r.data.code === 'PGRST202')) {
    console.error('[friend] the gym server has no friend_invite_send yet (apply supabase migration 0056)');
    return answer(503, { error: 'NOT_READY' });
  }
  if (r.status >= 400) {
    console.error('[friend] the gym server refused', r.status, r.data && r.data.message);
    return answer(503, { error: 'TRY_AGAIN' });
  }
  const out = serverAnswer(r.data);
  if (out.status !== 201) console.warn(`[friend] the gym server said ${out.body.error}`);
  return answer(out.status, out.body);
}
