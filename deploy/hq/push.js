// The gym's messages and offers pop up on members' phones (R-151, R-153 step 2, R-158). The sender:
// Firebase Cloud Messaging (FCM HTTP v1) to the push addresses the member app saved (migration 0038).
//
// WHY HERE. This Worker already holds the only Supabase secret key ("hq", service_role), which the
// sender's two functions (hq_push_next, hq_push_drop) need; it already has a Cron Trigger; and it
// costs nothing new. Every minute (wrangler.jsonc) it sends whatever is due, and at once when the
// admin app sends a message or starts an offer (the panel Worker calls POST /push/run through a
// service binding; anyone else calling it only makes it send what is due a little sooner).
//
// WHAT IT NEEDS. The secret FCM_SERVICE_ACCOUNT: a Google service-account JSON key of Firebase
// project forgeai-d7eea that may send messages (role "Firebase Cloud Messaging API Admin",
// roles/firebasemessaging.admin). `npx wrangler secret put FCM_SERVICE_ACCOUNT` from deploy/hq.
// Without it (or without migration 0038 on the gym server) every run stops at once, quietly, with
// one line in the log; nothing is claimed, so nothing is lost and nothing is sent twice later.
//
// HOW. The Worker signs a short JWT with the service account's private key (RS256), swaps it at
// Google for an access token (kept ~55 minutes), then asks the gym server for the next due job's
// next addresses and sends one FCM message per address. A message is DATA-ONLY with title, message,
// channelId and tag: the app's notification library shows it itself (also with the app closed),
// on the "Messages from your gym" channel, under the same tag the phone's own 15-minute check uses,
// so the two can never stack; and it wakes the app's push task, which marks the notice as shown.
// Addresses Firebase calls dead (the app was removed, the address replaced) are deleted.
// The free Workers plan allows 50 outside calls per run: PUSH_SUBREQUESTS (default 45) caps the
// run; what is left is sent by the next run (a minute later, or the next send).

import { rpc } from './db.js';

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const CHANNEL_ID = 'gym-messages';
/** Same as the app's noticeAlerts.ts NOTICE_ROUTE / the gym tab (the offer card is at its top). */
export const INBOX_ROUTE = '/shop/inbox';
export const OFFER_ROUTE = '/shop';
/** The longest line a pop-up shows (the app's noticeAlertWords NOTICE_BODY_MAX). */
export const LINE_MAX = 120;
/** Phones sent to at the same time. */
const PARALLEL = 10;
/** A pop-up older than this is not worth showing (the job is skipped by the server after 6 hours too). */
const TTL = '21600s';
/** Access tokens live 60 minutes; this one is used for 55 at most. */
const TOKEN_KEEP_MS = 55 * 60 * 1000;

// ------------------------------------------------------------------ pure helpers

export function b64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(String(bytes));
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The service account from the secret, or null when it is not one. PURE. */
export function readServiceAccount(raw) {
  if (!raw) return null;
  let sa;
  try {
    sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!sa || typeof sa !== 'object') return null;
  const { client_email: email, private_key: key, project_id: project } = sa;
  if (typeof email !== 'string' || !email.includes('@')) return null;
  if (typeof key !== 'string' || !key.includes('PRIVATE KEY')) return null;
  if (typeof project !== 'string' || !/^[a-z0-9-]{4,40}$/.test(project)) return null;
  return { email, key, project, tokenUri: typeof sa.token_uri === 'string' ? sa.token_uri : GOOGLE_TOKEN_URL };
}

/** The first line of a notice's title, cut to fit a pop-up (the app's noticeLine). PURE. */
export function line(title) {
  const first = (String(title || '').split(/\r?\n/).find((l) => l.trim()) || '').replace(/\s+/g, ' ').trim();
  if (first.length <= LINE_MAX) return first;
  return `${first.slice(0, LINE_MAX - 1).trimEnd()}…`;
}

/**
 * The FCM v1 message for one phone. Data only (strings): the app's notification library shows it
 * from title/message/channelId/tag, and `body` (JSON) becomes the notification's data in the app.
 * PURE.
 */
export function fcmMessage(page, token) {
  const gym = String(page.gymName || '').trim() || 'Your gym';
  const isOffer = page.kind === 'offer';
  const id = String(page.refId);
  const tag = isOffer ? `gym-offer-${id}` : `gym-notice-${id}`;
  const route = isOffer ? OFFER_ROUTE : INBOX_ROUTE;
  const message = isOffer ? line(`New offer: ${page.title}`) : line(page.title);
  const body = { kind: 'gym-message', route, push: isOffer ? 'offer' : 'message', noticeId: id, gymId: String(page.gymId || '') };
  return {
    message: {
      token,
      data: {
        title: gym,
        message,
        channelId: CHANNEL_ID,
        tag,
        body: JSON.stringify(body),
        push: body.push,
        noticeId: id,
        gymId: body.gymId,
      },
      android: { priority: 'HIGH', ttl: TTL },
    },
  };
}

/**
 * What an FCM answer means: 'sent', 'dead' (delete the address), 'auth' (our key is refused: stop),
 * or 'retry' (Firebase is busy or down: this phone is skipped). PURE.
 */
export function fcmOutcome(status, bodyText) {
  if (status >= 200 && status < 300) return 'sent';
  let err = {};
  try {
    err = JSON.parse(bodyText || '{}').error || {};
  } catch {
    err = {};
  }
  const codes = (Array.isArray(err.details) ? err.details : []).map((d) => d && d.errorCode).filter(Boolean);
  if (status === 404 || codes.includes('UNREGISTERED') || err.status === 'NOT_FOUND') return 'dead';
  if (codes.includes('SENDER_ID_MISMATCH')) return 'dead';
  // Only a bad ADDRESS is dead; a bad message (our bug) must never delete every phone.
  if (status === 400 && /registration token/i.test(String(err.message || ''))) return 'dead';
  if (status === 401 || status === 403) return 'auth';
  return 'retry';
}

function pemToDer(pem) {
  const b64 = String(pem).replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The signed JWT Google swaps for an access token (RS256). */
export async function signedJwt(sa, nowSec) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.email, scope: FCM_SCOPE, aud: sa.tokenUri, iat: nowSec, exp: nowSec + 3600 }));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(new Uint8Array(sig))}`;
}

// ------------------------------------------------------------------ the access token (kept)

let kept = null; // { email, token, until }

/** Tests only. */
export function forgetAccessToken() {
  kept = null;
}

export async function accessToken(sa, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (kept && kept.email === sa.email && kept.until > now) return { token: kept.token, fetched: false };
  const assertion = await signedJwt(sa, Math.floor(now / 1000));
  const res = await fetchImpl(sa.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = {};
  }
  if (!res.ok || typeof body.access_token !== 'string') {
    // Google's own words (never the key): "invalid_grant", "unauthorized_client", ...
    throw new Error(`Google refused the service account (${res.status} ${String(body.error || '').slice(0, 60)})`);
  }
  const life = Math.max(60, Math.min(Number(body.expires_in) || 3600, 3600)) * 1000;
  kept = { email: sa.email, token: body.access_token, until: now + Math.min(TOKEN_KEEP_MS, life - 5 * 60 * 1000) };
  return { token: body.access_token, fetched: true };
}

// ------------------------------------------------------------------ the run

const warned = new Set();
function warnOnce(key, ...args) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(...args);
}
/** Tests only. */
export function resetPushWarnings() {
  warned.clear();
}

let running = false;

/**
 * Send what is due. Never throws. -> { skipped?: why } or { jobs, sent, dead, failed, left }.
 * `left`: true when the run stopped at its call budget with more perhaps to send.
 */
export async function runPush(env, { fetchImpl = fetch, now = () => Date.now() } = {}) {
  if (running) return { skipped: 'busy' };
  running = true;
  try {
    return await runOnce(env, fetchImpl, now);
  } catch (e) {
    console.error('[push] run failed', e instanceof Error ? e.message : 'error');
    return { skipped: 'error' };
  } finally {
    running = false;
  }
}

async function runOnce(env, fetchImpl, now) {
  if (!env.FCM_SERVICE_ACCOUNT) {
    warnOnce('secret', '[push] FCM_SERVICE_ACCOUNT is not set: no phone pop-ups are sent (the app still checks every ~15 minutes)');
    return { skipped: 'no-secret' };
  }
  const sa = readServiceAccount(env.FCM_SERVICE_ACCOUNT);
  if (!sa) {
    warnOnce('bad-secret', '[push] FCM_SERVICE_ACCOUNT is not a service-account JSON key (client_email, private_key, project_id)');
    return { skipped: 'bad-secret' };
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_HQ_KEY) {
    warnOnce('db', '[push] SUPABASE_URL or SUPABASE_HQ_KEY is not set');
    return { skipped: 'no-db' };
  }
  let budget = Math.max(3, Math.min(Number(env.PUSH_SUBREQUESTS) || 45, 990));
  // The access token FIRST: with a refused key nothing is claimed (so nothing is lost).
  let token;
  try {
    const t = await accessToken(sa, { fetchImpl, now: now() });
    token = t.token;
    if (t.fetched) budget -= 1;
  } catch (e) {
    console.error('[push]', e instanceof Error ? e.message : 'error');
    return { skipped: 'google' };
  }
  const out = { jobs: 0, sent: 0, dead: 0, failed: 0, left: false };
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project}/messages:send`;
  while (budget >= 3) {
    const max = Math.min(100, budget - 2); // one call to ask, one to drop dead addresses
    let page;
    try {
      page = await rpc(env, 'hq_push_next', { p_max: max }, { fetchImpl });
    } catch (e) {
      if (e && e.code === 'NOT_READY') {
        warnOnce('not-ready', '[push] the gym server has no push tables yet (migration 0038 not applied)');
        return { skipped: 'not-ready' };
      }
      console.error('[push] could not ask the gym server', e instanceof Error ? e.message : 'error');
      break;
    }
    budget -= 1;
    if (!page || !Array.isArray(page.tokens)) break;
    out.jobs += 1;
    const tokens = page.tokens.filter((t) => typeof t === 'string');
    const dead = [];
    let stop = false;
    for (let i = 0; i < tokens.length; i += PARALLEL) {
      const group = tokens.slice(i, i + PARALLEL);
      budget -= group.length;
      const results = await Promise.all(
        group.map(async (t) => {
          try {
            const res = await fetchImpl(url, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(fcmMessage(page, t)),
            });
            return { t, outcome: fcmOutcome(res.status, await res.text()) };
          } catch {
            return { t, outcome: 'retry' };
          }
        }),
      );
      for (const r of results) {
        if (r.outcome === 'sent') out.sent += 1;
        else if (r.outcome === 'dead') {
          out.dead += 1;
          dead.push(r.t);
        } else out.failed += 1;
        if (r.outcome === 'auth') stop = true;
      }
      if (stop) break;
    }
    if (dead.length) {
      try {
        await rpc(env, 'hq_push_drop', { p_tokens: dead }, { fetchImpl });
      } catch (e) {
        console.error('[push] could not delete dead addresses', e instanceof Error ? e.message : 'error');
      }
      budget -= 1;
    }
    if (stop) {
      forgetAccessToken();
      console.error('[push] Firebase refused our access token; stopped this run');
      break;
    }
    if (budget < 3) out.left = true;
  }
  if (out.jobs) console.log('[push] done', JSON.stringify(out));
  return out;
}

// ------------------------------------------------------------------ POST /push/run

let lastKick = 0;
/** Tests only. */
export function resetKick() {
  lastKick = 0;
}

/** "Something was just sent": run now (at most once every 3 seconds). Answers at once. */
export function handlePushKick(request, env, ctx, deps = {}) {
  if (request.method !== 'POST') return new Response('Not found', { status: 404 });
  const t = (deps.now || Date.now)();
  if (t - lastKick >= 3000) {
    lastKick = t;
    const run = runPush(env, deps);
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(run);
  }
  return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
