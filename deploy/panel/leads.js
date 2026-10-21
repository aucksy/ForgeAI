// The landing page's "free demo" form (launch I3, 21 Oct 2026): POST /api/lead -> Cloudflare D1
// `forgeai-web`, table `leads` (migrations/0002_leads.sql), not the gym server. Kept to call the gym
// back about a demo; deleted after 12 months if no deal (the form says so). Read with
// `python scripts/leads.py`. Bots: a hidden "website" box (filled = quietly dropped), 5 a day per
// network address, 300 a day in all. The address is kept only as a salted, daily one-way hash.

export const PER_DAY = 5;
export const ALL_PER_DAY = 300;
const SIZES = ['Under 100', '100-300', '300-600', 'Over 600'];
const TODAY = ['register', 'excel', 'ggms', 'other'];

/** The checked lead, a bot (drop it), or a plain reason. PURE. */
export function checkLead(body) {
  if (!body || typeof body !== 'object') return { error: 'Send a JSON object.' };
  if (typeof body.website === 'string' && body.website.trim()) return { bot: true };
  const digits = String(body.phone ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(digits)) return { error: 'Type a 10-digit mobile number.' };
  const text = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const gym = text(body.gym, 80);
  const city = text(body.city, 40); // optional: the page's top form asks only the number
  if (!gym) return { error: 'Type your gym’s name.' };
  return {
    value: {
      phone: digits,
      gym,
      city,
      size: SIZES.includes(body.size) ? body.size : '',
      today: TODAY.includes(body.today) ? body.today : '',
      lang: body.lang === 'hi' ? 'hi' : 'en',
    },
  };
}

async function hashIp(ip, salt, day) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lead:${salt}:${day}:${ip}`));
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function answer(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** POST /api/lead -> 201 { ok } | 400/405/413/429/503 { error }. A bot also gets 201 (and nothing is kept). */
export async function handleLead(request, env, now = new Date()) {
  if (request.method !== 'POST') return answer(405, { error: 'Use POST.' });
  if (!env.WEB || !env.FEEDBACK_SALT) {
    console.error('[lead] not set up: D1 binding WEB or secret FEEDBACK_SALT missing');
    return answer(503, { error: 'Not set up yet.' });
  }
  if (Number(request.headers.get('Content-Length') || 0) > 2000) return answer(413, { error: 'Too long.' });
  const raw = await request.text();
  if (raw.length > 2000) return answer(413, { error: 'Too long.' });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return answer(400, { error: 'Send a JSON object.' }); // quiet: the sender's mistake, answered
  }
  const checked = checkLead(body);
  if (checked.bot) return answer(201, { ok: true });
  if (checked.error) return answer(400, { error: checked.error });
  const v = checked.value;
  const at = now.toISOString();
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || 'unknown', env.FEEDBACK_SALT, at.slice(0, 10));
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const row = await env.WEB.prepare('SELECT COUNT(*) AS n, SUM(ip_hash = ?) AS ip FROM leads WHERE at > ?').bind(ipHash, dayAgo).first();
    if (row && (row.n >= ALL_PER_DAY || row.ip >= PER_DAY)) return answer(429, { error: 'Too many tries today. Please try tomorrow.' });
    await env.WEB.prepare('INSERT INTO leads (at, phone, gym, city, size, today, lang, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(at, v.phone, v.gym, v.city, v.size, v.today, v.lang, ipHash)
      .run();
  } catch (e) {
    console.error('[lead] could not save', e);
    return answer(503, { error: 'Could not save. Try again.' });
  }
  return answer(201, { ok: true });
}
