// R-506 phase 3 (14 Nov 2026): Web Push from the HQ Worker to the gym staff's browsers (the admin app's alerts with
// the app closed). No library: WebCrypto only, the same in Workers and in Node.
//   - the message is encrypted for the one browser (RFC 8291, "aes128gcm" content coding of RFC 8188): only that
//     browser can read it; the push company sees nothing but bytes;
//   - each request is signed with the server's VAPID key (RFC 8292): a JWT (ES256) for the push company's address,
//     so only this server can send to the addresses saved for it.
// The VAPID key is the Worker secret VAPID_PRIVATE_JWK: a P-256 JWK {kty, crv, d, x, y}, made once by
// scripts/vapid-keygen.mjs and piped straight into `wrangler secret put` (it is never printed). Its public half is
// what browsers subscribe with (webPushPublicKey, served at /push/web-key).

const te = new TextEncoder();

export function b64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url to bytes; nothing (0 bytes) when it is not base64url. */
export function fromB64u(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  let bin;
  try {
    bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  } catch {
    return new Uint8Array(0);
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** A P-256 public key as 65 raw bytes (0x04 || x || y) from a JWK. */
function rawFromJwk(jwk) {
  return concat(new Uint8Array([4]), fromB64u(jwk.x), fromB64u(jwk.y));
}

/** The VAPID secret, checked: a P-256 private JWK, or null. PURE. */
export function readVapidKey(secret) {
  let jwk;
  try {
    jwk = typeof secret === 'string' ? JSON.parse(secret) : secret;
  } catch {
    return null;
  }
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256') return null;
  for (const k of ['d', 'x', 'y']) if (typeof jwk[k] !== 'string' || fromB64u(jwk[k]).length !== 32) return null;
  return { kty: 'EC', crv: 'P-256', d: jwk.d, x: jwk.x, y: jwk.y };
}

/** The key browsers subscribe with (applicationServerKey), base64url. */
export function webPushPublicKey(jwk) {
  return b64u(rawFromJwk(jwk));
}

/**
 * Encrypt `plaintext` for one browser (RFC 8291). `sub`: { p256dh, auth } as the browser gave them (base64url).
 * `fixed` (tests only): { salt, senderJwk } for the RFC's example; otherwise both are fresh for every message.
 * -> the request body (header || ciphertext), one record.
 */
export async function encryptPayload(plaintext, sub, fixed = {}) {
  const data = typeof plaintext === 'string' ? te.encode(plaintext) : plaintext;
  const uaPublic = fromB64u(sub.p256dh);
  const authSecret = fromB64u(sub.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new Error('BAD_SUBSCRIPTION');
  if (data.length > 3900) throw new Error('TOO_LONG');
  const salt = fixed.salt ? fromB64u(fixed.salt) : crypto.getRandomValues(new Uint8Array(16));
  let senderPrivate;
  let asPublic;
  if (fixed.senderJwk) {
    senderPrivate = await crypto.subtle.importKey('jwk', { ...fixed.senderJwk, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    asPublic = rawFromJwk(fixed.senderJwk);
  } else {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    senderPrivate = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  }
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, senderPrivate, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // One record, the last: the padding delimiter 0x02 and no padding.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(data, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

/** The VAPID Authorization header value for an endpoint (RFC 8292): "vapid t=<JWT>, k=<public key>". */
export async function vapidAuthorization(endpoint, jwk, subject, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const header = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${webPushPublicKey(jwk)}`;
}

/** Only the big browsers' push companies (the same list as supabase 0076). PURE. */
export const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

/**
 * Send one push. `sub`: { endpoint, p256dh, auth }; `message`: what the service worker shows ({ title, body, route,
 * tag }). -> { ok, status, gone } (gone: the address no longer exists, drop it). Never throws.
 */
export async function sendWebPush(sub, message, { jwk, subject, fetchImpl = fetch, now = Date.now(), urgency = 'high', ttl = 6 * 3600 } = {}) {
  try {
    if (!PUSH_HOST.test(String(sub.endpoint || ''))) return { ok: false, status: 0, gone: true };
    const body = await encryptPayload(JSON.stringify(message), sub);
    const res = await fetchImpl(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(sub.endpoint, jwk, subject, now),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: urgency,
      },
      body,
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
  } catch (e) {
    console.warn('[web-push] not sent', e instanceof Error ? e.message : 'error');
    return { ok: false, status: 0, gone: false };
  }
}
