// "Send feedback" (launch plan H7, inbox #39; 21 Oct 2026). Both apps POST here; the message is kept
// in Cloudflare's free database (D1 `forgeai-web`, table `feedback`, migrations/0001_feedback.sql),
// NOT in the gym server. Claude reads and sorts it (scripts/feedback.py; runbook docs/launch/FEEDBACK.md).
//
// The text is written by members and strangers: it is stored as data and never acted on as an order.
// What is kept: the text, which app, its version, the phone or browser, the screen, the gym code if
// any, a random id per install (no name, no number), and a one-way hash of the network address (only
// to stop floods). Kept 1 year (the privacy notice says so).

export const MAX_TEXT = 2000;
export const PER_DAY = 20; // messages one network address, or one install, may send in 24 hours
export const ALL_PER_DAY = 1000; // all messages together in 24 hours (keeps the free database's limits safe)

const SHORT = 120;

/** The checked message, or a plain reason it was refused. PURE. */
export function checkFeedback(body) {
  if (!body || typeof body !== 'object') return { error: 'Send a JSON object.' };
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return { error: 'Write something first.' };
  if (text.length > MAX_TEXT) return { error: `Keep it under ${MAX_TEXT} letters.` };
  const source = body.source === 'admin' ? 'admin' : body.source === 'member' ? 'member' : null;
  if (!source) return { error: 'Unknown app.' };
  const short = (v) => (typeof v === 'string' ? v.trim().slice(0, SHORT) : '');
  const gym = short(body.gym).toUpperCase();
  return {
    value: {
      source,
      text,
      app: short(body.app),
      device: short(body.device),
      screen: short(body.screen),
      gym: /^[A-Z0-9]{6}$/.test(gym) ? gym : '',
      sender: /^[A-Za-z0-9-]{8,64}$/.test(body.sender ?? '') ? body.sender : '',
    },
  };
}

async function hashIp(ip, salt, day) {
  const data = new TextEncoder().encode(`${salt}:${day}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function answer(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** POST /api/feedback -> 201 { ok: true } | 400/405/413/429/503 { error }. */
export async function handleFeedback(request, env, now = new Date()) {
  if (request.method !== 'POST') return answer(405, { error: 'Use POST.' });
  if (!env.WEB || !env.FEEDBACK_SALT) {
    console.error('[feedback] not set up: D1 binding WEB or secret FEEDBACK_SALT missing');
    return answer(503, { error: 'Feedback is not set up yet.' });
  }
  // Refuse a big body before reading it (the length the sender declares), then check what came.
  if (Number(request.headers.get('Content-Length') || 0) > MAX_TEXT * 4) return answer(413, { error: 'Too long.' });
  const raw = await request.text();
  if (raw.length > MAX_TEXT * 4) return answer(413, { error: 'Too long.' });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return answer(400, { error: 'Send a JSON object.' }); // quiet: a bad body is the sender's mistake, answered
  }
  const checked = checkFeedback(body);
  if (checked.error) return answer(400, { error: checked.error });
  const v = checked.value;
  const at = now.toISOString();
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || 'unknown', env.FEEDBACK_SALT, at.slice(0, 10));
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const row = await env.WEB.prepare(
      // Crash reports (crash.js) share the table and have their own limits: they never use up these.
      "SELECT COUNT(*) AS n, SUM(ip_hash = ?) AS ip, SUM(sender <> '' AND sender = ?) AS me FROM feedback WHERE at > ? AND status <> 'crash'",
    )
      .bind(ipHash, v.sender, dayAgo)
      .first();
    if (row && (row.n >= ALL_PER_DAY || row.ip >= PER_DAY || row.me >= PER_DAY)) {
      return answer(429, { error: 'Too many messages today. Try again tomorrow.' });
    }
    await env.WEB.prepare(
      'INSERT INTO feedback (at, source, text, app, device, screen, gym, sender, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(at, v.source, v.text, v.app, v.device, v.screen, v.gym, v.sender, ipHash)
      .run();
  } catch (e) {
    console.error('[feedback] could not save', e);
    return answer(503, { error: 'Could not save. Try again.' });
  }
  return answer(201, { ok: true });
}
