// node --test deploy/hq  (CI: ci.yml "HQ Worker tests"). MettleUp HQ, #51, 23 Oct 2026.
// Every network call is a stand-in: Google, Cloudflare Access, Supabase and GitHub are never reached.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import {
  FRESH_SECONDS,
  GOOGLE_CERTS,
  GOOGLE_TOKEN,
  OAUTH_COOKIE,
  SESSION_COOKIE,
  b64url,
  clearJwksCache,
  googleFinish,
  googleStart,
  isAllowed,
  makeSession,
  maskEmail,
  missingSettings,
  seal,
  unseal,
  verifyJwt,
  whoIsIt,
} from './auth.js';
import { handleApi } from './api.js';
import { refusalCode, rpc } from './db.js';
import { clearReleaseMemo, releases, removeFiles } from './outside.js';
import { costRupees, deleteRequestsInFeedback, indiaDay, nightlyWeb, setAiLimit, aiLimits, aiUsageByGym, setFeedbackStatus } from './web.js';
import worker, { CSP, handle, nightly, sameOrigin, secure } from './worker.js';

const enc = new TextEncoder();
const ORIGIN = 'https://forgeai-hq.aakashpahuja.in';
const OWNER = 'owner@example.com';
const HQ_KEY = 'sb_secret_test_hq_key_never_shown';
const NOW = 1_800_000_000; // seconds
const GYM = '11111111-2222-4333-8444-555555555555';

const env = (extra = {}) => ({
  SUPABASE_URL: 'https://db.example',
  SUPABASE_HQ_KEY: HQ_KEY,
  HQ_ALLOWED_EMAIL: OWNER,
  HQ_SESSION_SECRET: 's'.repeat(64),
  GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  AUTH_MODE: 'google',
  ASSETS: { fetch: async () => new Response('<!doctype html><title>HQ</title>', { headers: { 'Content-Type': 'text/html' } }) },
  ...extra,
});

// ------------------------------------------------------------------ an RSA key pair, like Google's
async function keyPair(kid) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { kid, privateKey: pair.privateKey, jwk: { kty: 'RSA', n: jwk.n, e: jwk.e, kid, alg: 'RS256', use: 'sig' } };
}
const KEY_A = await keyPair('key-a');
const KEY_B = await keyPair('key-b');

async function jwt(key, claims, kid = key.kid) {
  const head = b64url(enc.encode(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

const jsonRes = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** One fake network: Google keys and token endpoint, Access keys, Supabase RPCs, GitHub. */
function fakeNet({ idToken = null, keys = [KEY_A.jwk], db = {}, dbFail = null, dbMissing = [] } = {}) {
  const calls = [];
  async function fetchImpl(url, init = {}) {
    const u = String(url);
    calls.push({ url: u, init });
    if (u === GOOGLE_CERTS || u.endsWith('/cdn-cgi/access/certs')) return jsonRes(200, { keys });
    if (u === GOOGLE_TOKEN) return idToken ? jsonRes(200, { id_token: idToken }) : jsonRes(400, { error: 'invalid_grant' });
    const m = /\/rest\/v1\/rpc\/([a-z_]+)$/.exec(u);
    if (m) {
      if (dbFail && dbFail[m[1]]) return jsonRes(400, { code: 'P0001', message: dbFail[m[1]] });
      // A function whose migration is not applied yet: what PostgREST answers.
      if (dbMissing.includes(m[1])) {
        return jsonRes(404, { code: 'PGRST202', message: `Could not find the function public.${m[1]}(p_actor, p_gym) in the schema cache`, hint: null, details: null });
      }
      const answer = db[m[1]];
      const body = JSON.parse(init.body || '{}');
      return jsonRes(200, typeof answer === 'function' ? answer(body) : answer ?? null);
    }
    if (u.includes('api.github.com')) return jsonRes(200, [{ tag_name: 'v0.70.0', published_at: '2026-10-20T00:00:00Z', assets: [{ name: 'forgeai-v0.70.0.apk', download_count: 12 }, { name: 'x.aab', download_count: 3 }] }]);
    if (u.includes('/storage/v1/object/')) return jsonRes(200, []);
    throw new Error(`unexpected fetch ${u}`);
  }
  return { calls, fetchImpl, rpcCalls: (fn) => calls.filter((c) => c.url.endsWith(`/rpc/${fn}`)) };
}

const googleClaims = (extra = {}) => ({
  iss: 'https://accounts.google.com',
  aud: 'client-123.apps.googleusercontent.com',
  sub: '1234',
  email: OWNER,
  email_verified: true,
  iat: NOW - 10,
  exp: NOW + 3600,
  auth_time: NOW - 10,
  ...extra,
});

async function sessionCookie(e = env(), email = OWNER, authAt = NOW - 10) {
  return (await makeSession(e, email, authAt, NOW)).split(';')[0];
}

const quiet = async (fn) => {
  const was = [console.warn, console.error, console.log];
  console.warn = () => {};
  console.error = () => {};
  console.log = () => {};
  try {
    return await fn();
  } finally {
    [console.warn, console.error, console.log] = was;
  }
};

// ------------------------------------------------------------------ sealed cookies
test('a sealed value opens only with the same secret, unchanged and before it expires', async () => {
  const t = await seal({ email: OWNER, exp: NOW + 60 }, 'secret-1');
  assert.deepEqual(await unseal(t, 'secret-1', NOW), { email: OWNER, exp: NOW + 60 });
  assert.equal(await unseal(t, 'secret-2', NOW), null);
  assert.equal(await unseal(t, 'secret-1', NOW + 61), null);
  const [body, sig] = t.split('.');
  const forged = b64url(enc.encode(JSON.stringify({ email: 'attacker@example.com', exp: NOW + 60 })));
  assert.equal(await quiet(() => unseal(`${forged}.${sig}`, 'secret-1', NOW)), null);
  assert.equal(await unseal(`${body}.${sig}.x`, 'secret-1', NOW), null);
  assert.equal(await quiet(() => unseal('not-a-token', 'secret-1', NOW)), null);
});

test('the allow-list: exact addresses, any case; an empty list lets nobody in; logs show a masked address', () => {
  assert.equal(isAllowed(env(), 'OWNER@example.com'), true);
  assert.equal(isAllowed(env(), 'owner@example.co'), false);
  assert.equal(isAllowed(env({ HQ_ALLOWED_EMAIL: '' }), OWNER), false);
  assert.equal(isAllowed(env({ HQ_ALLOWED_EMAIL: 'a@b.com, owner@example.com' }), OWNER), true);
  assert.equal(maskEmail('owner@example.com'), 'o***@example.com');
});

test('missing settings are named (never their values)', () => {
  assert.deepEqual(missingSettings(env()), []);
  assert.deepEqual(missingSettings(env({ SUPABASE_HQ_KEY: '', GOOGLE_CLIENT_SECRET: undefined })), ['SUPABASE_HQ_KEY', 'GOOGLE_CLIENT_SECRET']);
  assert.ok(missingSettings(env({ HQ_SESSION_SECRET: 'short' }))[0].startsWith('HQ_SESSION_SECRET'));
  assert.deepEqual(missingSettings(env({ AUTH_MODE: 'access', HQ_SESSION_SECRET: '', ACCESS_TEAM: 'forge', ACCESS_AUD: 'aud' })), []);
});

// ------------------------------------------------------------------ RS256 tokens
test('a token is accepted only with a good signature, issuer, audience and time', async () => {
  clearJwksCache();
  const net = fakeNet();
  const opts = { certsUrl: GOOGLE_CERTS, issuers: ['https://accounts.google.com'], audience: 'client-123.apps.googleusercontent.com', nowSec: NOW, fetchImpl: net.fetchImpl };
  assert.equal((await verifyJwt(await jwt(KEY_A, googleClaims()), opts)).email, OWNER);
  await assert.rejects(verifyJwt(await jwt(KEY_B, googleClaims(), 'key-a'), opts), /signature/);
  await assert.rejects(verifyJwt(await jwt(KEY_B, googleClaims()), opts), /unknown key/);
  await assert.rejects(verifyJwt(await jwt(KEY_A, googleClaims({ aud: 'someone-else' })), opts), /audience/);
  await assert.rejects(verifyJwt(await jwt(KEY_A, googleClaims({ iss: 'https://evil.example' })), opts), /issuer/);
  await assert.rejects(verifyJwt(await jwt(KEY_A, googleClaims({ exp: NOW - 120 })), opts), /expired/);
  const none = `${b64url(enc.encode(JSON.stringify({ alg: 'none', kid: 'key-a' })))}.${b64url(enc.encode(JSON.stringify(googleClaims())))}.`;
  await assert.rejects(verifyJwt(none, opts), /alg/);
});

test('keys that rotate are fetched again once', async () => {
  clearJwksCache();
  let keys = [KEY_A.jwk];
  const fetchImpl = async () => jsonRes(200, { keys });
  const opts = { certsUrl: GOOGLE_CERTS, issuers: ['https://accounts.google.com'], audience: 'client-123.apps.googleusercontent.com', nowSec: NOW, fetchImpl };
  await verifyJwt(await jwt(KEY_A, googleClaims()), opts);
  keys = [KEY_B.jwk];
  assert.equal((await verifyJwt(await jwt(KEY_B, googleClaims()), opts)).email, OWNER);
});

// ------------------------------------------------------------------ Google sign-in
test('sign-in starts at Google with PKCE, a state and a nonce; a fresh sign-in asks again', async () => {
  const s = await googleStart(env(), ORIGIN, { back: '/#gym' }, NOW);
  const u = new URL(s.location);
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('redirect_uri'), `${ORIGIN}/auth/callback`);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('scope'), 'openid email');
  assert.ok(u.searchParams.get('state').length > 20 && u.searchParams.get('nonce').length > 20);
  assert.ok(s.cookie.startsWith(`${OAUTH_COOKIE}=`) && /HttpOnly; Secure; SameSite=Lax/.test(s.cookie));
  assert.ok(!s.location.includes('google-secret'), 'the client secret never goes to the browser');
  const f = new URL((await googleStart(env(), ORIGIN, { fresh: true }, NOW)).location);
  assert.equal(f.searchParams.get('prompt'), 'login');
  assert.equal(f.searchParams.get('max_age'), '0');
  // Only a path on this site is kept to go back to.
  const sealed = (await googleStart(env(), ORIGIN, { back: 'https://evil.example' }, NOW)).cookie.split(';')[0].split('=')[1];
  assert.equal((await unseal(sealed, env().HQ_SESSION_SECRET, NOW)).back, '/');
});

async function callback(claims, { stateOk = true, e = env(), idKey = KEY_A } = {}) {
  clearJwksCache();
  const start = await googleStart(e, ORIGIN, {}, NOW);
  const u = new URL(start.location);
  const saved = await unseal(start.cookie.split(';')[0].split('=')[1], e.HQ_SESSION_SECRET, NOW);
  const token = await jwt(idKey, { ...claims, nonce: claims.nonce ?? saved.nonce });
  const net = fakeNet({ idToken: token, db: { hq_log: null } });
  const req = new Request(`${ORIGIN}/auth/callback?code=abc&state=${stateOk ? u.searchParams.get('state') : 'wrong'}`, {
    headers: { Cookie: start.cookie.split(';')[0] },
  });
  return { net, req, result: await googleFinish(req, e, { fetchImpl: net.fetchImpl, nowSec: NOW }) };
}

test('Google comes back: the allowed, verified address signs in; anything else is refused', async () => {
  const ok = await callback(googleClaims());
  assert.equal(ok.result.email, OWNER);
  assert.equal(ok.result.authAt, NOW - 10);
  const exchange = ok.net.calls.find((c) => c.url === GOOGLE_TOKEN);
  assert.match(String(exchange.init.body), /code_verifier=/);
  assert.equal((await callback(googleClaims({ email: 'stranger@example.com' }))).result.refused, true);
  assert.match((await callback(googleClaims({ email_verified: false }))).result.error, /not verified/);
  assert.match((await callback(googleClaims({ nonce: 'other' }))).result.error, /nonce/);
  assert.match((await callback(googleClaims(), { stateOk: false })).result.error, /state/);
  assert.match((await callback(googleClaims(), { idKey: KEY_B })).result.error, /BAD_TOKEN/);
  const noCookie = await googleFinish(new Request(`${ORIGIN}/auth/callback?code=a&state=b`), env(), { fetchImpl: fakeNet().fetchImpl, nowSec: NOW });
  assert.match(noCookie.error, /no sign-in in progress/);
});

test('the callback page: signs in only after the audit log has the sign-in', async () => {
  clearJwksCache();
  const e = env();
  const start = await googleStart(e, ORIGIN, { back: '/#system' }, NOW);
  const state = new URL(start.location).searchParams.get('state');
  const saved = await unseal(start.cookie.split(';')[0].split('=')[1], e.HQ_SESSION_SECRET, NOW);
  const token = await jwt(KEY_A, googleClaims({ nonce: saved.nonce }));
  const req = () => new Request(`${ORIGIN}/auth/callback?code=abc&state=${state}`, { headers: { Cookie: start.cookie.split(';')[0], 'CF-Connecting-IP': '203.0.113.9' } });
  const net = fakeNet({ idToken: token, db: { hq_log: null } });
  const res = await handle(req(), e, { fetchImpl: net.fetchImpl, now: new Date(NOW * 1000) });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/#system');
  assert.ok(res.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`)));
  const logged = net.rpcCalls('hq_log')[0];
  assert.equal(JSON.parse(logged.init.body).p_action, 'sign_in');
  assert.equal(logged.init.headers['x-hq-client-ip'], '203.0.113.9');
  // Gym server down: no session.
  clearJwksCache();
  const down = fakeNet({ idToken: token, dbFail: { hq_log: 'connection refused' } });
  const res2 = await quiet(() => handle(req(), e, { fetchImpl: down.fetchImpl, now: new Date(NOW * 1000) }));
  assert.equal(res2.status, 503);
  assert.ok(!res2.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`) && !c.includes('Max-Age=0')));
});

// ------------------------------------------------------------------ the door on every request
test('nothing is served without a verified session; a removed address stops at once', async () => {
  const net = fakeNet({ db: { hq_gyms: [] } });
  const page = await handle(new Request(`${ORIGIN}/`), env(), { fetchImpl: net.fetchImpl, now: new Date(NOW * 1000) });
  assert.equal(page.status, 302);
  assert.match(page.headers.get('Location'), /^\/auth\/login/);
  const api = await handle(new Request(`${ORIGIN}/api/gyms`), env(), { fetchImpl: net.fetchImpl, now: new Date(NOW * 1000) });
  assert.equal(api.status, 401);
  assert.equal(net.rpcCalls('hq_gyms').length, 0, 'the gym server is not asked before sign-in');
  const cookie = await sessionCookie();
  const ok = await handle(new Request(`${ORIGIN}/`, { headers: { Cookie: cookie } }), env(), { fetchImpl: net.fetchImpl, now: new Date(NOW * 1000) });
  assert.equal(ok.status, 200);
  const removed = await handle(new Request(`${ORIGIN}/api/gyms`, { headers: { Cookie: cookie } }), env({ HQ_ALLOWED_EMAIL: 'new@example.com' }), { fetchImpl: net.fetchImpl, now: new Date(NOW * 1000) });
  assert.equal(removed.status, 401);
  // A header that only says who you are is never trusted in Google mode.
  const header = await handle(new Request(`${ORIGIN}/api/gyms`, { headers: { 'Cf-Access-Authenticated-User-Email': OWNER } }), env(), { fetchImpl: net.fetchImpl, now: new Date(NOW * 1000) });
  assert.equal(header.status, 401);
});

test('not set up: a plain page, and the log names what is missing', async () => {
  const lines = [];
  const was = console.error;
  console.error = (...a) => lines.push(a.join(' '));
  try {
    const res = await handle(new Request(`${ORIGIN}/`), env({ SUPABASE_HQ_KEY: '' }), { fetchImpl: fakeNet().fetchImpl });
    assert.equal(res.status, 503);
  } finally {
    console.error = was;
  }
  assert.ok(lines.some((l) => l.includes('SUPABASE_HQ_KEY')));
});

test('a POST from another page is refused (same origin, JSON only)', async () => {
  const net = fakeNet({ db: { hq_end_access: null } });
  const cookie = await sessionCookie();
  const post = (headers) => new Request(`${ORIGIN}/api/access/end`, { method: 'POST', body: JSON.stringify({ gymId: GYM }), headers: { Cookie: cookie, ...headers } });
  const run = (r) => quiet(() => handle(r, env(), { fetchImpl: net.fetchImpl, now: new Date(NOW * 1000) }));
  assert.equal((await run(post({ 'Content-Type': 'application/json' }))).status, 403);
  assert.equal((await run(post({ Origin: 'https://evil.example', 'Content-Type': 'application/json' }))).status, 403);
  assert.equal((await run(post({ Origin: ORIGIN, 'Content-Type': 'text/plain' }))).status, 403);
  assert.equal((await run(post({ Origin: ORIGIN, 'Content-Type': 'application/json' }))).status, 200);
  assert.equal(sameOrigin(new Request(`${ORIGIN}/api/me`), new URL(`${ORIGIN}/api/me`)), true);
});

test('Cloudflare Access mode: the Worker verifies Access token itself', async () => {
  clearJwksCache();
  const e = env({ AUTH_MODE: 'access', ACCESS_TEAM: 'forgeteam', ACCESS_AUD: 'aud-tag-1', HQ_SESSION_SECRET: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
  const team = 'https://forgeteam.cloudflareaccess.com';
  const claims = { iss: team, aud: ['aud-tag-1'], email: OWNER, iat: NOW - 5, exp: NOW + 600 };
  const net = fakeNet({ db: { hq_gyms: [] } });
  const go = (headers) => quiet(() => handle(new Request(`${ORIGIN}/api/gyms`, { headers }), e, { fetchImpl: net.fetchImpl, now: new Date(NOW * 1000) }));
  assert.equal((await go({ 'Cf-Access-Jwt-Assertion': await jwt(KEY_A, claims) })).status, 200);
  assert.equal(net.calls.find((c) => c.url.endsWith('/cdn-cgi/access/certs')).url, `${team}/cdn-cgi/access/certs`);
  assert.equal((await go({})).status, 401);
  assert.equal((await go({ 'Cf-Access-Jwt-Assertion': await jwt(KEY_B, claims, 'key-a') })).status, 401);
  assert.equal((await go({ 'Cf-Access-Jwt-Assertion': await jwt(KEY_A, { ...claims, aud: ['other-app'] }) })).status, 401);
  assert.equal((await go({ 'Cf-Access-Jwt-Assertion': await jwt(KEY_A, { ...claims, email: 'x@example.com' }) })).status, 401);
  const who = await whoIsIt(new Request(ORIGIN, { headers: { 'Cf-Access-Jwt-Assertion': await jwt(KEY_A, claims) } }), e, { fetchImpl: net.fetchImpl, nowSec: NOW });
  assert.deepEqual(who, { email: OWNER, authAt: NOW - 5 });
});

test('every answer carries the strict headers', async () => {
  const res = secure(new Response('x'));
  assert.equal(res.headers.get('Content-Security-Policy'), CSP);
  assert.match(CSP, /connect-src 'self'/);
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const viaDefault = await worker.fetch(new Request(`${ORIGIN}/`), env({ SUPABASE_URL: '' }));
  assert.equal(viaDefault.headers.get('X-Frame-Options'), 'DENY');
});

// ------------------------------------------------------------------ the API
const who = { email: OWNER, authAt: NOW - 10 };
const api = (method, path, body, e, net, now = new Date(NOW * 1000)) =>
  quiet(() => handleApi(new Request(`${ORIGIN}${path}`, { method, body: body ? JSON.stringify(body) : undefined }), e, who, { fetchImpl: net.fetchImpl, now, clientIp: '198.51.100.7' }));

test('the gym server is called with the HQ key and the verified email; the key never reaches the page', async () => {
  const net = fakeNet({ db: { hq_gyms: [{ gymId: GYM, joinCode: 'ABC123', name: 'Iron' }] } });
  const res = await api('GET', '/api/gyms', null, env(), net);
  const body = await res.text();
  assert.equal(res.status, 200);
  const call = net.rpcCalls('hq_gyms')[0];
  assert.equal(call.init.headers.apikey, HQ_KEY);
  assert.equal(JSON.parse(call.init.body).p_actor, OWNER);
  assert.equal(call.init.headers['x-hq-client-ip'], '198.51.100.7');
  assert.ok(!body.includes(HQ_KEY));
  assert.equal(JSON.parse(body).gyms[0].aiLimit, null, 'no Cloudflare database bound: AI columns empty, page still works');
});

test('gym groups (0031): passed to the page; a server without 0031 answers no groups, the list still works', async () => {
  const groups = [{ groupId: 'grp-1', name: 'Iron Temple', branches: [{ gymId: GYM, name: 'Iron', membersRegister: 5, membersApp: 1 }] }];
  const net = fakeNet({ db: { hq_gyms: [{ gymId: GYM, joinCode: 'ABC123', name: 'Iron' }], hq_groups: groups } });
  const body = await (await api('GET', '/api/gyms', null, env(), net)).json();
  assert.deepEqual(body.groups, groups);
  assert.equal(JSON.parse(net.rpcCalls('hq_groups')[0].init.body).p_actor, OWNER, 'audited under the verified email');
  const before = fakeNet({ db: { hq_gyms: [{ gymId: GYM, joinCode: 'ABC123', name: 'Iron' }] }, dbMissing: ['hq_groups'] });
  const res = await api('GET', '/api/gyms', null, env(), before);
  assert.equal(res.status, 200);
  const old = await res.json();
  assert.equal(old.groups, null);
  assert.equal(old.gyms.length, 1);
});

test('a refusal comes back as its code, never the raw database message', async () => {
  assert.equal(refusalCode('SUSPENDED'), 'SUSPENDED');
  assert.equal(refusalCode('STILL_ROWS 3 in crm_records'), 'STILL_ROWS');
  assert.equal(refusalCode('permission denied for function hq_gyms'), 'UNKNOWN');
  const net = fakeNet({ dbFail: { hq_set_gym_status: 'NEED_REASON' } });
  const res = await api('POST', '/api/gym/status', { gymId: GYM, status: 'suspended', reason: '' }, env(), net);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'NEED_REASON' });
  const odd = fakeNet({ dbFail: { hq_gyms: 'relation "x" does not exist at character 5' } });
  assert.deepEqual(await (await api('GET', '/api/gyms', null, env(), odd)).json(), { error: 'UNKNOWN' });
  await assert.rejects(rpc(env(), 'owner_gym', {}, { fetchImpl: net.fetchImpl }), /INVALID/);
});

test('emergency support access needs a sign-in from the last 15 minutes', async () => {
  const net = fakeNet({ db: { hq_open_emergency: { open: true } } });
  const body = { gymId: GYM, reasonKind: 'legal', reason: 'Police letter dated 22 Oct', minutes: 30 };
  const stale = await quiet(() => handleApi(new Request(`${ORIGIN}/api/access/open`, { method: 'POST', body: JSON.stringify(body) }), env(), { email: OWNER, authAt: NOW - FRESH_SECONDS - 5 }, { fetchImpl: net.fetchImpl, now: new Date(NOW * 1000) }));
  assert.equal(stale.status, 401);
  assert.deepEqual(await stale.json(), { error: 'FRESH' });
  assert.equal(net.rpcCalls('hq_open_emergency').length, 0);
  const fresh = await api('POST', '/api/access/open', body, env(), net);
  assert.equal(fresh.status, 200);
  assert.deepEqual(JSON.parse(net.rpcCalls('hq_open_emergency')[0].init.body), { p_actor: OWNER, p_gym: GYM, p_reason_kind: 'legal', p_reason: 'Police letter dated 22 Oct', p_minutes: 30 });
});

test('a new owner code and a gym delete also need a sign-in from the last 15 minutes', async () => {
  const net = fakeNet({ db: { hq_reset_owner_signin: { code: '123456' }, hq_delete_gym: { deleted: true, files: [] } } });
  const stale = { email: OWNER, authAt: NOW - FRESH_SECONDS - 5 };
  const run = (path, body, w) => quiet(() => handleApi(new Request(`${ORIGIN}${path}`, { method: 'POST', body: JSON.stringify(body) }), env(), w, { fetchImpl: net.fetchImpl, now: new Date(NOW * 1000) }));
  for (const [path, body] of [['/api/gym/reset-signin', { gymId: GYM, called: true }], ['/api/delete-requests/delete-gym', { requestId: GYM, typedCode: 'ABC123' }]]) {
    const res = await run(path, body, stale);
    assert.equal(res.status, 401, path);
    assert.deepEqual(await res.json(), { error: 'FRESH' });
    assert.equal((await run(path, body, who)).status, 200, path);
  }
  assert.equal(net.rpcCalls('hq_reset_owner_signin').length, 1);
  assert.equal(net.rpcCalls('hq_delete_gym').length, 1);
});

test('a refused gym delete is written to the audit log in its own call', async () => {
  const net = fakeNet({ db: { hq_log: null }, dbFail: { hq_delete_gym: 'WRONG_CODE' } });
  const res = await api('POST', '/api/delete-requests/delete-gym', { requestId: GYM, typedCode: 'NOPE00' }, env(), net);
  assert.deepEqual(await res.json(), { error: 'WRONG_CODE' });
  const logged = JSON.parse(net.rpcCalls('hq_log')[0].init.body);
  assert.equal(logged.p_action, 'delete_gym_refused');
  assert.equal(logged.p_detail.why, 'WRONG_CODE');
  assert.equal(net.calls.filter((c) => c.url.includes('/storage/')).length, 0, 'no picture is touched');
});

test('the sign-in history is passed on as the server shapes it (names only inside support access)', async () => {
  const net = fakeNet({ db: { hq_access_log: { rows: [{ id: 1, at: '2026-10-23T08:00:00Z', action: 'sign_in' }], counts7Days: { sign_in: 1 }, detailed: false } } });
  const body = await (await api('GET', `/api/gym/access-log?id=${GYM}`, null, env(), net)).json();
  assert.equal(body.detailed, false);
  assert.deepEqual(Object.keys(body.rows[0]).sort(), ['action', 'at', 'id']);
});

test('bad input is refused before the gym server is asked', async () => {
  const net = fakeNet();
  assert.equal((await api('GET', '/api/gym?id=not-a-uuid', null, env(), net)).status, 400);
  assert.equal((await api('GET', '/api/access/records?id=' + GYM + '&kind=secrets', null, env(), net)).status, 400);
  assert.equal((await api('POST', '/api/ai/limit', { gymId: GYM, perDay: 999 }, env({ WEB: {} }), net)).status, 400);
  assert.equal((await api('POST', '/api/gym/status', { gymId: GYM, status: 'deleted' }, env(), net)).status, 400);
  assert.equal((await api('DELETE', '/api/gyms', null, env(), net)).status, 404);
  assert.equal(net.calls.length, 0);
});

test('delete a gym: the pictures it returns are removed from Storage with the HQ key', async () => {
  const files = [{ bucket: 'product-photos', path: `${'ab'.repeat(24)}/shaker.jpg` }, { bucket: 'gym-logos', path: `${'cd'.repeat(24)}/logo.png` }];
  const net = fakeNet({ db: { hq_delete_gym: { deleted: true, files, tablesChecked: 30 } } });
  const res = await api('POST', '/api/delete-requests/delete-gym', { requestId: GYM, typedCode: 'abc123' }, env(), net);
  const body = await res.json();
  assert.equal(body.filesRemoved, 2);
  assert.deepEqual(body.filesLeft, []);
  const del = net.calls.filter((c) => c.url.includes('/storage/v1/object/'));
  assert.equal(del.length, 2);
  assert.equal(del[0].init.method, 'DELETE');
  assert.equal(del[0].init.headers.apikey, HQ_KEY);
  // Anything that is not one of our picture paths is never sent.
  const odd = await removeFiles(env(), [{ bucket: 'other', path: 'x' }, { bucket: 'gym-logos', path: '../../etc' }], { fetchImpl: net.fetchImpl });
  assert.deepEqual(odd, { removed: 0, left: [] });
});

// ------------------------------------------------------------------ free trial and plan (0030, R-97)
test('before 0030: the gym list says plans are not ready, and a trial change answers NOT_READY (not broken)', async () => {
  const net = fakeNet({ db: { hq_gyms: [{ gymId: GYM, joinCode: 'ABC123', name: 'Iron', status: 'active' }], hq_gym: { gymId: GYM, name: 'Iron', owners: [], recentHq: [] } }, dbMissing: ['hq_set_trial', 'hq_set_plan'] });
  const list = await (await api('GET', '/api/gyms', null, env(), net)).json();
  assert.equal(list.plansReady, false);
  assert.equal(list.gyms.length, 1, 'the list still works');
  assert.equal((await (await api('GET', `/api/gym?id=${GYM}`, null, env(), net)).json()).plansReady, false);
  const trial = await api('POST', '/api/gym/trial', { gymId: GYM, endsAt: '2027-02-24T00:00:00Z', reason: 'Owner asked' }, env(), net);
  assert.equal(trial.status, 400);
  assert.deepEqual(await trial.json(), { error: 'NOT_READY' });
  const plan = await api('POST', '/api/gym/plan', { gymId: GYM, plan: 'pro', billing: 'yearly', paidUntil: '2027-10-24T00:00:00Z', reason: 'Paid' }, env(), net);
  assert.deepEqual(await plan.json(), { error: 'NOT_READY' });
});

test('after 0030: the list says ready; trial and plan changes go to the database as asked', async () => {
  const row = { gymId: GYM, joinCode: 'ABC123', name: 'Iron', trialStartsAt: '2026-10-24T00:00:00Z', trialEndsAt: '2027-01-24T00:00:00Z', plan: null, billing: null, paidUntil: null };
  const net = fakeNet({ db: { hq_gyms: [row], hq_set_trial: row, hq_set_plan: row } });
  assert.equal((await (await api('GET', '/api/gyms', null, env(), net)).json()).plansReady, true);
  assert.equal((await api('POST', '/api/gym/trial', { gymId: GYM, endsAt: '2027-02-24T00:00:00+05:30', reason: 'Moving 300 members' }, env(), net)).status, 200);
  assert.deepEqual(JSON.parse(net.rpcCalls('hq_set_trial')[0].init.body), { p_actor: OWNER, p_gym: GYM, p_new_end: '2027-02-23T18:30:00.000Z', p_reason: 'Moving 300 members' });
  // Lifetime has no paid-until; "no plan" sends no billing either.
  await api('POST', '/api/gym/plan', { gymId: GYM, plan: 'ai', billing: 'lifetime', paidUntil: '2030-01-01T00:00:00Z', reason: 'Lifetime deal' }, env(), net);
  await api('POST', '/api/gym/plan', { gymId: GYM, plan: '', billing: 'monthly', paidUntil: '2027-01-01T00:00:00Z', reason: 'Mistake' }, env(), net);
  const [life, none] = net.rpcCalls('hq_set_plan').map((c) => JSON.parse(c.init.body));
  assert.deepEqual([life.p_plan, life.p_billing, life.p_paid_until], ['ai', 'lifetime', null]);
  assert.deepEqual([none.p_plan, none.p_billing, none.p_paid_until], [null, null, null]);
  // A refusal comes back as its word.
  const capped = fakeNet({ dbFail: { hq_set_trial: 'TRIAL_CAP' } });
  assert.deepEqual(await (await api('POST', '/api/gym/trial', { gymId: GYM, endsAt: '2028-01-01T00:00:00Z', reason: 'Owner asked' }, env(), capped)).json(), { error: 'TRIAL_CAP' });
});

test('trial and plan: bad input is refused before the database is asked', async () => {
  const net = fakeNet();
  for (const body of [{ gymId: 'x', endsAt: '2027-01-01T00:00:00Z' }, { gymId: GYM, endsAt: 'soon' }, { gymId: GYM }]) {
    assert.equal((await api('POST', '/api/gym/trial', body, env(), net)).status, 400);
  }
  for (const body of [{ gymId: GYM, plan: 'gold', billing: 'monthly' }, { gymId: GYM, plan: 'pro', billing: 'weekly' }, { gymId: GYM, plan: 'pro' }]) {
    assert.equal((await api('POST', '/api/gym/plan', body, env(), net)).status, 400);
  }
  assert.equal(net.calls.length, 0);
});

test('Export gyms (CSV) is written to the audit log first', async () => {
  const net = fakeNet({ db: { hq_log: null } });
  const res = await api('POST', '/api/gyms/export-log', { gyms: 12, withTestGyms: false, filter: 'trial' }, env(), net);
  assert.equal(res.status, 200);
  const logged = JSON.parse(net.rpcCalls('hq_log')[0].init.body);
  assert.equal(logged.p_action, 'export_gyms');
  assert.deepEqual(logged.p_detail, { gyms: 12, withTestGyms: false, filter: 'trial' });
  assert.equal((await api('POST', '/api/gyms/export-log', { gyms: -1 }, env(), fakeNet())).status, 400);
  // The log is down: no download (the page only downloads after a 200).
  const down = fakeNet({ dbFail: { hq_log: 'boom' } });
  assert.notEqual((await api('POST', '/api/gyms/export-log', { gyms: 3 }, env(), down)).status, 200);
});

test('GitHub download counts per release (APK and all), cached 10 minutes, null when GitHub is down', async () => {
  clearReleaseMemo();
  const net = fakeNet();
  const r = await releases(env(), { fetchImpl: net.fetchImpl, nowMs: 1000 });
  assert.deepEqual(r, [{ tag: 'v0.70.0', publishedAt: '2026-10-20T00:00:00Z', apkDownloads: 12, allDownloads: 15 }]);
  await releases(env(), { fetchImpl: net.fetchImpl, nowMs: 2000 });
  assert.equal(net.calls.length, 1);
  clearReleaseMemo();
  assert.equal(await quiet(() => releases(env(), { fetchImpl: async () => jsonRes(503, {}), nowMs: 0 })), null);
});

// ------------------------------------------------------------------ Cloudflare D1 on real SQLite
const sqlite = (() => {
  try {
    return createRequire(import.meta.url)('node:sqlite');
  } catch {
    return null; // quiet: Node 20 (CI) has no built-in SQLite; the tests above still run
  }
})();

function d1() {
  const db = new sqlite.DatabaseSync(':memory:');
  for (const f of ['0001_feedback.sql', '0002_leads.sql', '0003_ai_usage.sql', '0004_ai_limits.sql']) {
    db.exec(readFileSync(new URL(`../panel/migrations/${f}`, import.meta.url), 'utf8'));
  }
  const stmt = (sql, args) => db.prepare(sql);
  const wrap = (sql, args = []) => ({
    all: async () => ({ results: stmt(sql).all(...args) }),
    first: async () => stmt(sql).get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(stmt(sql).run(...args).changes) } }),
  });
  return { raw: db, prepare: (sql) => ({ ...wrap(sql), bind: (...args) => wrap(sql, args) }) };
}

test('D1: AI use, cost, limits, delete requests in feedback, statuses', { skip: !sqlite && 'no node:sqlite here' }, async () => {
  const db = d1();
  db.raw.exec(`INSERT INTO ai_usage (day, gym_id, kind, calls, failed, tokens_in, tokens_out, provider) VALUES
    ('2026-10-02', 'g1', 'columns', 3, 1, 12000, 3000, 'gemini'), ('2026-09-30', 'g1', 'columns', 5, 0, 1, 1, 'gemini')`);
  const by = await aiUsageByGym(db, '2026-10-01');
  assert.equal(by.g1.calls, 3);
  assert.equal(by.g1.rupees.toFixed(4), costRupees('gemini', 12000, 3000).toFixed(4));
  assert.ok(costRupees('gemini', 4000, 1000) < 1, 'one spreadsheet costs well under a rupee');
  assert.deepEqual(await aiLimits(db), {});
  await setAiLimit(db, 'g1', 5, new Date());
  await setAiLimit(db, 'g2', 0, new Date());
  assert.deepEqual(await aiLimits(db), { g1: 5, g2: 0 });
  await setAiLimit(db, 'g1', null, new Date());
  assert.deepEqual(await aiLimits(db), { g2: 0 });
  db.raw.exec(`INSERT INTO feedback (at, source, text, screen) VALUES
    ('2026-10-20T10:00:00Z', 'admin', 'DELETE REQUEST: gym "Iron", code IRON01, gym phone -, asked by Ravi (owner).', 'settings/delete-request'),
    ('2026-10-21T10:00:00Z', 'member', 'Love the app', 'settings')`);
  const dr = await deleteRequestsInFeedback(db);
  assert.equal(dr.length, 1);
  assert.equal(dr[0].joinCode, 'IRON01');
  assert.equal(dr[0].checked, false, 'anyone in the admin app could have sent it: call the owner first');
  assert.equal(await setFeedbackStatus(db, dr[0].feedbackId, 'done', 'written in HQ', new Date()), true);
  assert.equal(await setFeedbackStatus(db, dr[0].feedbackId, 'deleted', '', new Date()), false);
});

test('D1 nightly clean-up: old feedback, old leads without a deal, old AI use', { skip: !sqlite && 'no node:sqlite here' }, async () => {
  const db = d1();
  const now = new Date('2026-10-23T00:00:00Z');
  db.raw.exec(`INSERT INTO feedback (at, source, text) VALUES ('2025-10-01T00:00:00Z', 'member', 'old'), ('2026-10-01T00:00:00Z', 'member', 'new');
    INSERT INTO leads (at, phone, gym, city, status) VALUES ('2025-09-01T00:00:00Z', '9800000001', 'A', '', 'lost'),
      ('2025-09-01T00:00:00Z', '9800000002', 'B', '', 'won'), ('2026-09-01T00:00:00Z', '9800000003', 'C', '', 'new');
    INSERT INTO ai_usage (day, gym_id) VALUES ('2025-01-01', 'g'), ('2026-10-01', 'g');`);
  assert.deepEqual(await nightlyWeb(db, now), { feedback: 1, leads: 1, aiUsage: 1 });
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 2);
});

test('the Cron Trigger: Cloudflare clean-up first, then the gym server, which writes both into its audit row', async () => {
  const fakeWeb = { prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: 2 } }) }) }) };
  const net = fakeNet({ db: { hq_nightly_cleanup: (b) => ({ ok: true, web: b.p_detail }) } });
  const out = await quiet(() => nightly(env({ WEB: fakeWeb }), { fetchImpl: net.fetchImpl, now: new Date('2026-10-23T21:30:00Z') }));
  assert.deepEqual(out.web, { feedback: 2, leads: 2, aiUsage: 2 });
  assert.equal(net.rpcCalls('hq_nightly_cleanup')[0].init.headers.apikey, HQ_KEY);
  const down = fakeNet({ dbFail: { hq_nightly_cleanup: 'boom' } });
  await assert.rejects(quiet(() => nightly(env(), { fetchImpl: down.fetchImpl })));
  assert.equal(indiaDay(new Date('2026-10-23T18:31:00Z')), '2026-10-24');
});

test('the wrangler file: its own name, addresses, cron, the page folder, no secrets', () => {
  const raw = readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(raw, /"name": "forgeai-hq"/);
  assert.match(raw, /"pattern": "forgeai-hq\.aakashpahuja\.in", "custom_domain": true/);
  // MettleUp (R-105): the new address, with the old one kept.
  assert.match(raw, /"pattern": "hq\.mettleup\.fit", "custom_domain": true/);
  assert.match(raw, /"run_worker_first": true/);
  assert.match(raw, /"crons": \["30 21 \* \* \*"\]/);
  assert.doesNotMatch(raw, /sb_secret_|GOCSPX-|"SUPABASE_HQ_KEY":/);
});
