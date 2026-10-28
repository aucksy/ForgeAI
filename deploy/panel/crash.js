// Crash reports (#34 alerts, built 28 Oct 2026). Both apps POST an uncaught error here; it is kept in
// the feedback table of Cloudflare's free database (D1 `forgeai-web`) as a row with status 'crash',
// so no new table or migration is needed. The feedback sorting (status 'new') never sees these rows;
// HQ's feedback list shows them labelled "crash". A daily GitHub Action opens one issue per new crash
// signature (scripts/watch/crashes.mjs).
//
// No personal data: only the error's message and stack (cut short, and scrubbed of anything that
// looks like an email, a phone or a long number, or a key), the app, its version and the screen's
// name. No gym code, no install id, no device. The network address only as a one-way daily hash, to
// limit floods, as feedback does.
//
// The text comes from anyone who can reach the address: stored as data, never acted on as an order.

export const MAX_MESSAGE = 300;
export const MAX_STACK = 1500;
export const STACK_LINES = 12;
export const CRASH_PER_DAY = 30; // reports one network address may send in 24 hours
export const CRASH_ALL_PER_DAY = 2000; // all reports together in 24 hours (free database limits)

/** Anything that could be personal or secret goes, before it is stored. PURE. */
export function scrub(text) {
  return String(text)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b(eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, '[token]')
    .replace(/\b(sk|pk|sb|key|AIza)[\w-]{16,}/g, '[key]')
    // Not a stack frame's line or column (bundle:1:1234567): in a one-line release bundle the column is the
    // only clue to where it crashed (0.60.0 review).
    .replace(/(?<![\d+])(?<!(?:bundle|\.m?js|\.tsx?):(?:\d{1,7}:)?)(\+?\d[\d -]{4,}\d)/g, '[n]')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
}

/**
 * The part of an error that stays the same between builds and phones: the message with numbers and
 * quoted values blanked, and the top 3 stack lines without build hashes, line numbers or addresses. PURE.
 */
export function crashShape(source, message, stack) {
  const msg = String(message)
    .replace(/(["'`]).*?\1/g, '"_"')
    .replace(/\d+/g, '0')
    .slice(0, 160);
  const frames = String(stack)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l !== String(message).trim() && !/^(Error|\w*Error):/.test(l))
    .slice(0, 3)
    .map((l) =>
      l
        .replace(/https?:\/\/[^\s)]+\//g, '')
        .replace(/[-.][A-Za-z0-9_]{8,}(\.m?js)/g, '$1')
        .replace(/:\d+(:\d+)?/g, '')
        .replace(/\d+/g, '0'),
    );
  return [source, msg, ...frames].join('\n');
}

/** A short id for a crash's shape (12 hex letters). */
export async function crashSignature(source, message, stack) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(crashShape(source, message, stack)));
  return [...new Uint8Array(digest)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The checked report, or a plain reason it was refused. PURE. */
export function checkCrash(body) {
  if (!body || typeof body !== 'object') return { error: 'Send a JSON object.' };
  const source = body.source === 'admin' ? 'admin' : body.source === 'member' ? 'member' : null;
  if (!source) return { error: 'Unknown app.' };
  const message = typeof body.message === 'string' ? scrub(body.message.trim()).slice(0, MAX_MESSAGE) : '';
  if (!message) return { error: 'No message.' };
  const stack =
    typeof body.stack === 'string'
      ? scrub(body.stack)
          .split('\n')
          .slice(0, STACK_LINES)
          .map((l) => l.slice(0, 200))
          .join('\n')
          .slice(0, MAX_STACK)
      : '';
  const app = typeof body.app === 'string' && /^[0-9A-Za-z.+-]{1,32}$/.test(body.app) ? body.app : '';
  const screen = typeof body.screen === 'string' ? body.screen.replace(/[^A-Za-z0-9/_()[\].-]/g, '').slice(0, 80) : '';
  const fatal = body.fatal === true;
  return { value: { source, message, stack, app, screen, fatal } };
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

/**
 * POST /api/crash -> 201 { ok: true } | 200 { ok: true, seen: true } (the same crash from the same
 * address today: counted once) | 400/405/413/429/503 { error }.
 */
export async function handleCrash(request, env, now = new Date()) {
  if (request.method !== 'POST') return answer(405, { error: 'Use POST.' });
  if (!env.WEB || !env.FEEDBACK_SALT) {
    console.error('[crash] not set up: D1 binding WEB or secret FEEDBACK_SALT missing');
    return answer(503, { error: 'Not set up.' });
  }
  const limit = (MAX_MESSAGE + MAX_STACK) * 4;
  if (Number(request.headers.get('Content-Length') || 0) > limit) return answer(413, { error: 'Too long.' });
  const raw = await request.text();
  if (raw.length > limit) return answer(413, { error: 'Too long.' });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return answer(400, { error: 'Send a JSON object.' }); // quiet: a bad body is the sender's mistake, answered
  }
  const checked = checkCrash(body);
  if (checked.error) return answer(400, { error: checked.error });
  const v = checked.value;
  const at = now.toISOString();
  const sig = await crashSignature(v.source, v.message, v.stack);
  const note = `sig:${sig}`;
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || 'unknown', env.FEEDBACK_SALT, at.slice(0, 10));
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const row = await env.WEB.prepare(
      "SELECT COUNT(*) AS n, SUM(ip_hash = ?) AS ip, SUM(ip_hash = ? AND note = ?) AS same FROM feedback WHERE status = 'crash' AND at > ?",
    )
      .bind(ipHash, ipHash, note, dayAgo)
      .first();
    if (row && row.same > 0) return answer(200, { ok: true, seen: true });
    if (row && (row.n >= CRASH_ALL_PER_DAY || row.ip >= CRASH_PER_DAY)) return answer(429, { error: 'Too many reports today.' });
    const text = `${v.fatal ? '[fatal] ' : ''}${v.message}${v.stack ? `\n\n${v.stack}` : ''}`;
    await env.WEB.prepare(
      "INSERT INTO feedback (at, source, text, app, device, screen, gym, sender, ip_hash, status, note) VALUES (?, ?, ?, ?, '', ?, '', '', ?, 'crash', ?)",
    )
      .bind(at, v.source, text, v.app, v.screen, ipHash, note)
      .run();
  } catch (e) {
    console.error('[crash] could not save', e);
    return answer(503, { error: 'Could not save.' });
  }
  return answer(201, { ok: true });
}
