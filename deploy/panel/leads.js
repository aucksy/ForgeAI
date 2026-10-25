// The landing page's "free demo" form (launch I3, 21 Oct 2026): POST /api/lead -> Cloudflare D1
// `forgeai-web`, table `leads` (migrations/0002_leads.sql), not the gym server. Kept to call the gym
// back about a demo; deleted after 12 months if no deal (the form says so). Read with
// `python scripts/leads.py`. Bots: a hidden "website" box (filled = dropped, with a log line), 5 a
// day per network address, 300 a day in all. The address is kept only as a salted, daily one-way hash.
// 25 Oct 2026 (owner's own demo request never reached HQ): the gym name is OPTIONAL. The top form
// ("Or we call you") has only a number box and borrowed the gym name from the coloured box at the
// top of the page; when that was empty the page refused, jumped up to it, and nothing was sent. A
// number is enough to call back, so a lead is never refused for a missing gym name (HQ shows
// "Gym name: not entered"). Every refusal is logged here (reason only, never the number).

export const PER_DAY = 5;
export const ALL_PER_DAY = 300;
const SIZES = ['Under 100', '100-300', '300-600', 'Over 600'];
// 'ggms' stays accepted for forms sent before 24 Oct 2026; the page now offers 'software' (R-118).
const TODAY = ['register', 'excel', 'software', 'other', 'ggms'];

/** The checked lead, a bot (drop it), or a plain reason. PURE. */
export function checkLead(body) {
  if (!body || typeof body !== 'object') return { error: 'Send a JSON object.' };
  if (typeof body.website === 'string' && body.website.trim()) return { bot: true };
  const digits = String(body.phone ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(digits)) return { error: 'Type a 10-digit mobile number.' };
  const text = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const gym = text(body.gym, 80);
  // gym and city are optional: the page's top form asks only the number (see the top of this file).
  const city = text(body.city, 40);
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

/** A refusal the sender is told about, logged with its reason (never the number or the address). */
function refused(status, words, why) {
  console.warn(`[lead] refused ${status}: ${why}`);
  return answer(status, { error: words });
}

/** POST /api/lead -> 201 { ok } | 400/405/413/429/503 { error }. A bot also gets 201 (and nothing is kept). */
export async function handleLead(request, env, now = new Date()) {
  if (request.method !== 'POST') return refused(405, 'Use POST.', 'not a POST');
  if (!env.WEB || !env.FEEDBACK_SALT) {
    console.error('[lead] not set up: D1 binding WEB or secret FEEDBACK_SALT missing');
    return answer(503, { error: 'Not set up yet.' });
  }
  if (Number(request.headers.get('Content-Length') || 0) > 2000) return refused(413, 'Too long.', 'body over 2000 bytes');
  const raw = await request.text();
  if (raw.length > 2000) return refused(413, 'Too long.', 'body over 2000 bytes');
  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    return refused(400, 'Send a JSON object.', `not JSON (${e instanceof Error ? e.message : 'parse error'})`);
  }
  const checked = checkLead(body);
  if (checked.bot) {
    // Answered as a success so a bot learns nothing; logged so a real person whose browser filled
    // the hidden box can still be spotted in the Worker's logs.
    console.warn('[lead] dropped: the hidden "website" box was filled (a bot, or a browser autofill)');
    return answer(201, { ok: true });
  }
  if (checked.error) return refused(400, checked.error, checked.error);
  const v = checked.value;
  const at = now.toISOString();
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || 'unknown', env.FEEDBACK_SALT, at.slice(0, 10));
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const row = await env.WEB.prepare('SELECT COUNT(*) AS n, SUM(ip_hash = ?) AS ip FROM leads WHERE at > ?').bind(ipHash, dayAgo).first();
    if (row && (row.n >= ALL_PER_DAY || row.ip >= PER_DAY)) {
      return refused(429, 'You have sent too many demo requests today. Please try again tomorrow.', row.n >= ALL_PER_DAY ? `${ALL_PER_DAY} a day in all reached` : `${PER_DAY} a day from one address reached`);
    }
    await env.WEB.prepare('INSERT INTO leads (at, phone, gym, city, size, today, lang, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(at, v.phone, v.gym, v.city, v.size, v.today, v.lang, ipHash)
      .run();
  } catch (e) {
    console.error('[lead] could not save', e);
    return answer(503, { error: 'Could not save. Try again.' });
  }
  return answer(201, { ok: true });
}
