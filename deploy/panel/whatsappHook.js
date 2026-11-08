// R-392 (7 Nov 2026): Meta's WhatsApp webhook, so a code that Meta "accepted" but never delivered says WHY.
// Without it a send only ever shows "accepted" (phoneCode.js), and a payment or number block is invisible.
//
//   GET  /api/whatsapp/hook  Meta's one-time check: hub.mode=subscribe + hub.verify_token -> echo hub.challenge
//   POST /api/whatsapp/hook  Meta's news about each message: sent, delivered, read, failed (+ the error)
//
// It only WRITES LOG LINES (Workers Logs): no database, no reply to anyone. The member's number is never logged
// (only its last 2 digits), nor any message text. The verify token is not a secret: the GET only echoes a number,
// so it lives in wrangler.jsonc vars (WHATSAPP_HOOK_VERIFY). When the secret WHATSAPP_APP_SECRET exists, a POST
// must carry Meta's X-Hub-Signature-256 or it is dropped; without it the lines are marked "unsigned".
// 8 Nov 2026: a SIGNED message TO our number is also checked for a "Verify with WhatsApp" code (phoneInbound.js).
// An unsigned one never verifies anything (anybody could post a fake "message from your number").

import { inboundMessages } from './phoneInbound.js';

const MAX_BODY = 64 * 1024;

async function hmacSha256Hex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const tail = (v) => (typeof v === 'string' && v.length >= 2 ? `..${v.slice(-2)}` : '?');
const short = (v, n = 160) => (typeof v === 'string' ? v.slice(0, n).replace(/\s+/g, ' ') : '');

/** One log line per message status in Meta's POST body. Exported for the test. */
export function statusLines(body) {
  const lines = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {};
      for (const s of Array.isArray(value.statuses) ? value.statuses : []) {
        const errs = (Array.isArray(s.errors) ? s.errors : [])
          .map((e) => `code=${e?.code ?? '?'} title=${short(e?.title, 80)} message=${short(e?.message)} details=${short(e?.error_data?.details)}`)
          .join(' | ');
        const price = s.pricing ? ` billable=${s.pricing.billable} category=${short(s.pricing.category, 30)}` : '';
        lines.push(`[whatsapp] status=${short(s.status, 20)} id=${short(s.id, 80)} to=${tail(s.recipient_id)}${price}${errs ? ` errors: ${errs}` : ''}`);
      }
      // A message sent TO our number: only the fact, never the text or the sender.
      for (const m of Array.isArray(value.messages) ? value.messages : []) lines.push(`[whatsapp] message in type=${short(m?.type, 20)} from=${tail(m?.from)}`);
      for (const e of Array.isArray(value.errors) ? value.errors : []) lines.push(`[whatsapp] account error code=${e?.code ?? '?'} title=${short(e?.title, 80)} message=${short(e?.message)}`);
    }
  }
  return lines;
}

export async function handleWhatsAppHook(request, env, url, log = console, now = Date.now()) {
  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token') || '';
    const challenge = url.searchParams.get('hub.challenge') || '';
    const want = env.WHATSAPP_HOOK_VERIFY || '';
    if (mode === 'subscribe' && want && sameText(token, want) && /^[0-9A-Za-z_-]{1,200}$/.test(challenge)) {
      log.log('[whatsapp] webhook check passed');
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    log.warn('[whatsapp] webhook check refused');
    return new Response('Forbidden', { status: 403 });
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response('Too large', { status: 413 });
  let mark = 'unsigned';
  if (env.WHATSAPP_APP_SECRET) {
    const got = (request.headers.get('X-Hub-Signature-256') || '').replace(/^sha256=/, '');
    const want = await hmacSha256Hex(env.WHATSAPP_APP_SECRET, raw);
    if (!sameText(got, want)) {
      log.warn('[whatsapp] webhook POST dropped: bad signature');
      return new Response('Forbidden', { status: 403 });
    }
    mark = 'signed';
  }
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    log.warn('[whatsapp] webhook POST was not JSON');
    return new Response('OK', { status: 200 });
  }
  const lines = statusLines(body);
  for (const line of lines) (line.includes('status=failed') || line.includes('error') ? log.error : log.log)(`${line} (${mark})`);
  if (lines.length === 0) log.log(`[whatsapp] webhook POST with no statuses (${mark})`);
  if (mark === 'signed') {
    try {
      await inboundMessages(env, body, now, log);
    } catch (e) {
      log.error('[phone-inbound] messages could not be checked', e instanceof Error ? e.message : e);
    }
  } else if (lines.some((l) => l.includes('message in'))) {
    log.warn('[phone-inbound] message in ignored for verifying: the webhook is unsigned (set WHATSAPP_APP_SECRET)');
  }
  // Meta retries anything that is not a 200, so always 200 once read.
  return new Response('OK', { status: 200 });
}
