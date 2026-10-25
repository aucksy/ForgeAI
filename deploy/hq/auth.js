// MettleUp HQ sign-in (#51). Only the system owner's Google account may open HQ, and the Worker
// checks that itself on every request: it never trusts a header or a cookie it did not verify.
//
// Two ways in, chosen by the Worker variable AUTH_MODE:
//   "google" (the default, no cost, no card): "Sign in with Google" built into this Worker.
//     /auth/login sends the browser to Google with a one-time state, nonce and PKCE code; Google sends
//     it back to /auth/callback; this Worker swaps the code for Google's signed ID token, checks the
//     token's signature against Google's published keys, its issuer, audience (our client id),
//     expiry, nonce, that Google verified the email, and that the email is on HQ_ALLOWED_EMAIL. Then
//     it sets its own signed session cookie (HMAC with HQ_SESSION_SECRET, 30 days, HttpOnly, Secure,
//     __Host-). His Google account is what protects HQ: passkey and 2-step stay on there.
//   "access": Cloudflare Access in front (its Zero Trust free plan asks for a payment card at sign-up,
//     so it is not the default). The Worker still verifies the Cf-Access-Jwt-Assertion token against
//     the team's published keys, its audience tag (ACCESS_AUD), issuer and expiry, and the email
//     allow-list. A request without a valid token is refused even if Access were switched off.
// Support access ("break-glass") needs a FRESH sign-in: the Google sign-in time (auth_time) or the
// Access token's issue time must be under 15 minutes old.
//
// Secrets (never in files or logs): HQ_ALLOWED_EMAIL, HQ_SESSION_SECRET, GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET. Variables: AUTH_MODE, ACCESS_TEAM, ACCESS_AUD.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const SESSION_COOKIE = '__Host-hq_session';
export const OAUTH_COOKIE = '__Host-hq_oauth';
// 30 days (owner, 25 Oct 2026: the installed HQ app asked him to sign in every time; 8 hours was too short
// for a panel only his Google account can open). "Sign out" still ends it at once.
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
export const OAUTH_SECONDS = 10 * 60;
export const FRESH_SECONDS = 15 * 60;
export const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
export const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const JWKS_TTL_MS = 60 * 60 * 1000;

// ------------------------------------------------------------------ bytes
export function b64url(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64url(text) {
  const s = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomText(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

// ------------------------------------------------------------------ signed cookies (HMAC)
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** A value only this Worker can make: base64url(JSON).base64url(HMAC). */
export async function seal(value, secret) {
  const body = b64url(enc.encode(JSON.stringify(value)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** The value, or null when it was not made by this Worker, is damaged or is past its exp. */
export async function unseal(token, secret, nowSec) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(body));
    if (!ok) return null;
    const value = JSON.parse(dec.decode(unb64url(body)));
    if (!value || typeof value !== 'object' || typeof value.exp !== 'number' || value.exp <= nowSec) return null;
    return value;
  } catch (e) {
    console.warn('[hq-auth] damaged cookie', e instanceof Error ? e.name : 'error');
    return null;
  }
}

export function readCookie(request, name) {
  const all = request.headers.get('Cookie') || '';
  for (const part of all.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

// ------------------------------------------------------------------ email allow-list
export function allowedEmails(env) {
  return String(env.HQ_ALLOWED_EMAIL || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
}

export function isAllowed(env, email) {
  const list = allowedEmails(env);
  return typeof email === 'string' && list.length > 0 && list.includes(email.trim().toLowerCase());
}

/** "a***@gmail.com": for log lines, never the whole address. */
export function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  return domain ? `${(user || '').slice(0, 1)}***@${domain}` : '***';
}

// ------------------------------------------------------------------ RS256 JWTs (Google, Cloudflare Access)
const jwksCache = new Map();

export function clearJwksCache() {
  jwksCache.clear();
}

async function jwks(url, fetchImpl, force = false) {
  const hit = jwksCache.get(url);
  if (hit && !force && Date.now() - hit.at < JWKS_TTL_MS) return hit.keys;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`keys answered ${res.status}`);
  const body = await res.json();
  const keys = Array.isArray(body && body.keys) ? body.keys : [];
  jwksCache.set(url, { at: Date.now(), keys });
  return keys;
}

/**
 * The claims of an RS256 token signed by one of the keys at certsUrl, with the issuer, audience and
 * expiry checked. Throws Error('BAD_TOKEN: why') otherwise.
 */
export async function verifyJwt(token, { certsUrl, issuers, audience, nowSec, fetchImpl, leewaySec = 60 }) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) throw new Error('BAD_TOKEN: shape');
  let header;
  let claims;
  try {
    header = JSON.parse(dec.decode(unb64url(parts[0])));
    claims = JSON.parse(dec.decode(unb64url(parts[1])));
  } catch {
    throw new Error('BAD_TOKEN: not JSON'); // quiet: answered as a refusal by the caller
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('BAD_TOKEN: alg');
  let keys = await jwks(certsUrl, fetchImpl);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await jwks(certsUrl, fetchImpl, true); // the keys rotate: ask once more
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk || jwk.kty !== 'RSA') throw new Error('BAD_TOKEN: unknown key');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64url(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('BAD_TOKEN: signature');
  if (!issuers.includes(claims.iss)) throw new Error('BAD_TOKEN: issuer');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience || !aud.includes(audience)) throw new Error('BAD_TOKEN: audience');
  if (typeof claims.exp !== 'number' || claims.exp + leewaySec < nowSec) throw new Error('BAD_TOKEN: expired');
  if (typeof claims.nbf === 'number' && claims.nbf - leewaySec > nowSec) throw new Error('BAD_TOKEN: not yet');
  return claims;
}

// ------------------------------------------------------------------ Google
export function redirectUri(origin) {
  return `${origin}/auth/callback`;
}

/** Step 1: the Google page to send the browser to, and the sealed cookie that remembers this try. */
export async function googleStart(env, origin, { fresh = false, back = '/' } = {}, nowSec = Math.floor(Date.now() / 1000)) {
  const state = randomText();
  const nonce = randomText();
  const verifier = randomText(48);
  const challenge = b64url(await sha256(verifier));
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: 'openid email',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: fresh ? 'login' : 'select_account',
  });
  // max_age makes Google put auth_time in the token; 0 asks for the password / passkey again.
  q.set('max_age', fresh ? '0' : String(SESSION_SECONDS));
  const safeBack = typeof back === 'string' && /^\/[A-Za-z0-9/_\-#?=&.]*$/.test(back) && !back.startsWith('//') ? back : '/';
  const sealed = await seal({ state, nonce, verifier, back: safeBack, exp: nowSec + OAUTH_SECONDS }, env.HQ_SESSION_SECRET);
  return { location: `${GOOGLE_AUTH}?${q}`, cookie: cookie(OAUTH_COOKIE, sealed, OAUTH_SECONDS) };
}

/**
 * Step 2: Google sent the browser back. -> { email, authAt, back } or { error } (a plain reason for
 * the log; the page says only "could not sign you in").
 */
export async function googleFinish(request, env, { fetchImpl = fetch, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  const url = new URL(request.url);
  const saved = await unseal(readCookie(request, OAUTH_COOKIE), env.HQ_SESSION_SECRET, nowSec);
  if (!saved) return { error: 'no sign-in in progress (cookie missing or old)' };
  if (url.searchParams.get('error')) return { error: `google said ${url.searchParams.get('error')}` };
  if (!url.searchParams.get('state') || url.searchParams.get('state') !== saved.state) return { error: 'state does not match' };
  const code = url.searchParams.get('code');
  if (!code) return { error: 'no code' };
  let token;
  try {
    const res = await fetchImpl(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(url.origin),
        grant_type: 'authorization_code',
        code_verifier: saved.verifier,
      }),
    });
    if (!res.ok) return { error: `token exchange answered ${res.status}` };
    token = (await res.json()).id_token;
  } catch (e) {
    return { error: `token exchange failed: ${e instanceof Error ? e.message : 'error'}` };
  }
  let claims;
  try {
    claims = await verifyJwt(token, { certsUrl: GOOGLE_CERTS, issuers: GOOGLE_ISSUERS, audience: env.GOOGLE_CLIENT_ID, nowSec, fetchImpl });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'BAD_TOKEN' };
  }
  if (claims.nonce !== saved.nonce) return { error: 'nonce does not match' };
  if (claims.email_verified !== true && claims.email_verified !== 'true') return { error: 'email not verified by Google' };
  if (!isAllowed(env, claims.email)) return { error: `not on the allow-list: ${maskEmail(claims.email)}`, refused: true };
  const authAt = typeof claims.auth_time === 'number' ? claims.auth_time : claims.iat;
  return { email: String(claims.email).toLowerCase(), authAt, back: saved.back };
}

export async function makeSession(env, email, authAt, nowSec = Math.floor(Date.now() / 1000)) {
  return cookie(SESSION_COOKIE, await seal({ email, auth: authAt, exp: nowSec + SESSION_SECONDS }, env.HQ_SESSION_SECRET), SESSION_SECONDS);
}

// ------------------------------------------------------------------ who is asking
/**
 * The verified person on this request: { email, authAt } or null. Google mode reads the sealed
 * session cookie; Access mode verifies Access's token. Either way the email is checked against the
 * allow-list again (a removed address stops working at once).
 */
export async function whoIsIt(request, env, { fetchImpl = fetch, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  if (env.AUTH_MODE === 'access') {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token || !env.ACCESS_TEAM || !env.ACCESS_AUD) return null;
    const team = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`;
    try {
      const claims = await verifyJwt(token, {
        certsUrl: `${team}/cdn-cgi/access/certs`,
        issuers: [team],
        audience: env.ACCESS_AUD,
        nowSec,
        fetchImpl,
      });
      if (!isAllowed(env, claims.email)) {
        console.warn('[hq-auth] access token for an address not on the list', maskEmail(claims.email));
        return null;
      }
      return { email: String(claims.email).toLowerCase(), authAt: Number(claims.iat) || 0 };
    } catch (e) {
      console.warn('[hq-auth] access token refused', e instanceof Error ? e.message : 'error');
      return null;
    }
  }
  const s = await unseal(readCookie(request, SESSION_COOKIE), env.HQ_SESSION_SECRET, nowSec);
  if (!s || !isAllowed(env, s.email)) return null;
  return { email: s.email, authAt: Number(s.auth) || 0 };
}

export function isFresh(who, nowSec = Math.floor(Date.now() / 1000)) {
  return Boolean(who) && nowSec - who.authAt <= FRESH_SECONDS;
}

/** The setting names this mode needs that are missing (names only, never values). */
export function missingSettings(env) {
  const need = ['SUPABASE_URL', 'SUPABASE_HQ_KEY', 'HQ_ALLOWED_EMAIL'];
  if (env.AUTH_MODE === 'access') need.push('ACCESS_TEAM', 'ACCESS_AUD');
  else need.push('HQ_SESSION_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET');
  const out = need.filter((k) => !env[k]);
  if (env.HQ_SESSION_SECRET && String(env.HQ_SESSION_SECRET).length < 32 && env.AUTH_MODE !== 'access') out.push('HQ_SESSION_SECRET (32+ characters)');
  if (env.HQ_ALLOWED_EMAIL && allowedEmails(env).length === 0) out.push('HQ_ALLOWED_EMAIL (an email)');
  return out;
}
