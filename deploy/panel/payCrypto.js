// F79 online payments (R-328, 4 Nov 2026): every payment-company key or token a gym gives us is sealed
// here before it is stored, and opened only inside this Worker, only to call that company.
//
// AES-256-GCM (Web Crypto), a fresh 12-byte IV per seal. The master key is the Worker secret
// PAYMENTS_MASTER_KEY: 32 random bytes, written as base64 or hex (make one with
// `openssl rand -base64 32`). No master key = payments are "not switched on yet" (pay.js), never a
// crash and never a key stored in the clear.
//
// Rules this file keeps (and pay.test.mjs checks):
//  - a sealed value never contains the plain text;
//  - opening with another master key, or a changed byte, fails (GCM's tag);
//  - nothing here logs a key, a token or a sealed value.

const VERSION = 'v1';

/** The master key's 32 bytes from base64 or hex, or null when missing or the wrong size. PURE. */
export function masterKeyBytes(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let bytes = null;
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  } else {
    try {
      bytes = fromB64(s);
    } catch {
      return null;
    }
  }
  return bytes && bytes.length === 32 ? bytes : null;
}

/** Is a usable master key set on this Worker? PURE. */
export function hasMasterKey(env) {
  return masterKeyBytes(env && env.PAYMENTS_MASTER_KEY) !== null;
}

const keyCache = new Map();

async function aesKey(env) {
  const raw = String(env.PAYMENTS_MASTER_KEY ?? '').trim();
  const bytes = masterKeyBytes(raw);
  if (!bytes) throw new Error('PAYMENTS_OFF');
  let k = keyCache.get(raw);
  if (!k) {
    k = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    keyCache.clear();
    keyCache.set(raw, k);
  }
  return k;
}

/** Seal any JSON value: "v1.<iv b64>.<cipher b64>". Throws PAYMENTS_OFF without a master key. */
export async function seal(env, value) {
  const key = await aesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return `${VERSION}.${toB64(iv)}.${toB64(ct)}`;
}

/** Open a sealed value. Throws SEALED_BAD on a wrong key, a changed byte or a bad format. */
export async function unseal(env, sealed) {
  const key = await aesKey(env);
  const parts = String(sealed ?? '').split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) throw new Error('SEALED_BAD');
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(parts[1]) }, key, fromB64(parts[2]));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error('SEALED_BAD');
  }
}

/** "••••4f2a": the only part of a key any screen ever sees. PURE. */
export function lastFour(secret) {
  const s = String(secret ?? '').trim();
  return s.length >= 4 ? s.slice(-4) : '';
}

/** A random id of `n` bytes, url-safe. */
export function randomId(n = 16) {
  return toB64(crypto.getRandomValues(new Uint8Array(n))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** HMAC-SHA256 of `message` with `secret` -> bytes. */
export async function hmac256(secret, message) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

export async function sha256Hex(text) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

/** Equal strings, compared in time that does not depend on where they differ. PURE. */
export function sameText(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (x.length !== y.length || !x.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(s) {
  const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
