// Spoken feedback (R-206, 30 Oct 2026). The member app records a short clip and POSTs it here; this
// Worker sends it to Groq's Whisper (speech to text) with the owner's key and answers with the text.
// The member reads the text, can fix it, and then sends it through /api/feedback as usual.
//
// Why on the server: the key is a Worker secret (GROQ_API_KEY, `npx wrangler secret put GROQ_API_KEY`),
// never in the app (anyone can pull a key out of an APK). The phone's own speech to text was poor,
// worse with gym music.
//
// Nothing of the clip is kept: not the sound, not the text. Only a count per install per India day in
// D1 `forgeai-web`, table `ai_usage` (kind 'voice', gym_id = 'v:' + the install id or the address hash),
// so no new table is needed.
//
// Groq's free limits (Oct 2026): 20 clips a minute, 2,000 a day, 7,200 s of sound an hour. Ours stay
// under them: PER_INSTALL_PER_DAY each, ALL_PER_DAY together, MAX_BYTES a clip (~2 min at 32 kbps).

export const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
// whisper-large-v3 (not -turbo): the better one for Hindi and mixed Hindi-English. Override: var GROQ_MODEL.
export const GROQ_MODEL = 'whisper-large-v3';
export const MAX_BYTES = 1_000_000;
export const PER_INSTALL_PER_DAY = 20;
export const ALL_PER_DAY = 1000;
export const TIMEOUT_MS = 30_000;
const TYPES = /^audio\/(mp4|m4a|x-m4a|aac|mpeg|mp3|ogg|webm|wav|x-wav|flac|3gpp)$/;
// A hint for Whisper: what the clip is about and the words it may hear.
const PROMPT = 'Feedback about a gym workout app. Hindi or English. Sets, reps, kg, rest timer, workout.';

function answer(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** India date, YYYY-MM-DD. PURE. */
export function indiaDay(now) {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/** Whisper's text, tidied: one line of spaces, no "[music]"-style tags, cut to the feedback limit. PURE. */
export function cleanText(text, max = 2000) {
  return String(text ?? '')
    .replace(/\[[^\]]{0,30}\]|\([^)]{0,30}music[^)]{0,30}\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function hashIp(ip, salt, day) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${day}:${ip}`));
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Take one clip from today's allowance. -> the count after it, or null when it is used up. */
export async function takeClip(db, who, day, perDay = PER_INSTALL_PER_DAY, all = ALL_PER_DAY) {
  const row = await db
    .prepare(
      "INSERT INTO ai_usage (day, gym_id, kind, calls) SELECT ?1, ?2, 'voice', 1 " +
        "WHERE (SELECT COALESCE(SUM(calls), 0) FROM ai_usage WHERE day = ?1 AND kind = 'voice') < ?4 " +
        'ON CONFLICT (day, gym_id, kind) DO UPDATE SET calls = calls + 1 ' +
        "WHERE calls < ?3 AND (SELECT COALESCE(SUM(calls), 0) FROM ai_usage WHERE day = ?1 AND kind = 'voice') < ?4 " +
        'RETURNING calls',
    )
    .bind(day, who, perDay, all)
    .first();
  return row ? Number(row.calls) : null;
}

/**
 * POST /api/feedback/voice  multipart: `audio` (the clip), `sender` (the install's random id, optional)
 *   200 { text } · 400 bad clip · 405 not POST · 413 too long · 422 { reason: 'empty' } nothing heard
 *   429 { reason: 'limit' | 'busy' } · 502 { reason: 'failed' } · 503 { reason: 'off' }
 * The app keeps the clip on every answer but 200, so the member can try again or type.
 */
export async function handleVoice(request, env, { now = new Date(), fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  if (request.method !== 'POST') return answer(405, { error: 'Use POST.' });
  if (!env.GROQ_API_KEY || !env.WEB || !env.FEEDBACK_SALT) {
    console.error('[voice] not set up: secret GROQ_API_KEY, secret FEEDBACK_SALT or D1 binding WEB missing');
    return answer(503, { reason: 'off', error: 'Speaking is not switched on yet. Type your message instead.' });
  }
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BYTES + 20_000) return answer(413, { error: 'Too long. Keep it under 2 minutes.' });
  let form;
  try {
    form = await request.formData();
  } catch {
    return answer(400, { error: 'Send the clip as a form.' }); // quiet: the sender's mistake, answered
  }
  const audio = form.get('audio');
  if (!audio || typeof audio === 'string') return answer(400, { error: 'No clip came.' });
  if (audio.size > MAX_BYTES) return answer(413, { error: 'Too long. Keep it under 2 minutes.' });
  if (audio.size < 500) return answer(422, { reason: 'empty', error: 'We heard nothing. Try again, closer to the phone.' });
  const type = (audio.type || '').toLowerCase();
  if (type && !TYPES.test(type)) return answer(400, { error: 'This kind of sound file is not taken.' });

  const day = indiaDay(now);
  const sender = String(form.get('sender') ?? '');
  const who = /^[A-Za-z0-9-]{8,64}$/.test(sender)
    ? `v:${sender}`
    : `v:ip:${await hashIp(request.headers.get('CF-Connecting-IP') || 'unknown', env.FEEDBACK_SALT, day)}`;
  let used;
  try {
    used = await takeClip(env.WEB, who, day);
  } catch (e) {
    console.error('[voice] usage table not readable', e);
    return answer(503, { reason: 'off', error: 'Speaking is not switched on yet. Type your message instead.' });
  }
  if (used === null) return answer(429, { reason: 'limit', error: 'You have spoken a lot today. Type your message, or try tomorrow.' });

  const out = new FormData();
  out.append('file', audio, audio.name || 'feedback.m4a');
  out.append('model', env.GROQ_MODEL || GROQ_MODEL);
  out.append('response_format', 'json');
  out.append('temperature', '0');
  out.append('prompt', PROMPT);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(GROQ_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: out, signal: ctrl.signal });
  } catch (e) {
    console.error('[voice] Groq gave no answer', e?.name, e?.message);
    return answer(502, { reason: 'failed', error: 'Could not turn your voice into text. Try again, or type.' });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    console.warn('[voice] Groq is busy (429)', (await res.text().catch(() => '')).slice(0, 200));
    return answer(429, { reason: 'busy', error: 'Too many people are speaking right now. Wait a minute and try again.' });
  }
  if (!res.ok) {
    // 404 = Groq retired the model (it did so without warning in Oct 2026): set var GROQ_MODEL.
    console.error('[voice] Groq answered', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return answer(502, { reason: 'failed', error: 'Could not turn your voice into text. Try again, or type.' });
  }
  const body = await res.json().catch((e) => {
    console.error('[voice] Groq answer was not JSON', e?.message);
    return null;
  });
  const text = cleanText(body?.text);
  if (!text) return answer(422, { reason: 'empty', error: 'We heard nothing. Try again, closer to the phone.' });
  return answer(200, { text });
}
