// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). MettleUp's addresses, R-105.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { APP_ORIGIN, MOVE_KEYS, OLD_HOST, SITE_ORIGIN, handleMove, routeFor, safePath } from './hosts.js';
import worker from './worker.js';
import { STAMP } from './proxy.js';

const go = (host, path, search = '', method = 'GET', opts) => routeFor(host, path, search, method, opts);

test('mettleup.in and both www hosts send people to mettleup.fit, same path', () => {
  for (const h of ['www.mettleup.fit', 'mettleup.in', 'www.mettleup.in', 'WWW.METTLEUP.IN']) {
    assert.deepEqual(go(h, '/'), { kind: 'redirect', to: 'https://mettleup.fit/', status: 301 });
    assert.deepEqual(go(h, '/j/ABC123', '?x=1'), { kind: 'redirect', to: 'https://mettleup.fit/j/ABC123?x=1', status: 301 });
  }
  // A POST keeps its method (308), never turned into a GET.
  assert.equal(go('mettleup.in', '/api/lead', '', 'POST').status, 308);
});

test('mettleup.fit is the landing page; what it does not keep moves to app.mettleup.fit', () => {
  assert.deepEqual(go('mettleup.fit', '/'), { kind: 'landing' });
  assert.deepEqual(go('mettleup.fit', '/home/'), { kind: 'redirect', to: 'https://mettleup.fit/', status: 301 });
  assert.deepEqual(go('mettleup.fit', '/home', '?utm=wa'), { kind: 'redirect', to: 'https://mettleup.fit/?utm=wa', status: 301 });
  for (const keep of ['/home/home.js', '/home/tiles.webp', '/api/lead', '/icons/admin-192.png', '/brand/mark.svg', '/.well-known/assetlinks.json', '/privacy', '/terms.html', '/data-agreement.html', '/favicon.ico']) {
    assert.deepEqual(go('mettleup.fit', keep), { kind: 'app' }, keep);
  }
  assert.deepEqual(go('mettleup.fit', '/start'), { kind: 'redirect', to: `${APP_ORIGIN}/start`, status: 301 });
  assert.deepEqual(go('mettleup.fit', '/j/ABC123'), { kind: 'redirect', to: `${APP_ORIGIN}/j/ABC123`, status: 301 });
  assert.deepEqual(go('mettleup.fit', '/sb/rest/v1/x', '', 'POST'), { kind: 'redirect', to: `${APP_ORIGIN}/sb/rest/v1/x`, status: 308 });
});

test('app.mettleup.fit is the admin app with everything it had; /home goes to mettleup.fit', () => {
  for (const p of ['/', '/start', '/members/abc', '/sb/auth/v1/health', '/j/ABC123', '/c/ABC123', '/api/feedback', '/api/move', '/app', '/sw.js', '/privacy.html', '/.well-known/assetlinks.json']) {
    assert.deepEqual(go('app.mettleup.fit', p), { kind: 'app' }, p);
  }
  assert.deepEqual(go('app.mettleup.fit', '/home/'), { kind: 'redirect', to: `${SITE_ORIGIN}/`, status: 301 });
  assert.deepEqual(go('app.mettleup.fit', '/home/home.js'), { kind: 'redirect', to: `${SITE_ORIGIN}/home/home.js`, status: 301 });
});

test('the old address keeps everything for good; only /home moves (and not while MOVE is "off")', () => {
  for (const p of ['/', '/start', '/sb', '/sb/rest/v1/rpc/member_me', '/j/ABC123', '/c/ABC123', '/api/feedback', '/checkin', '/join', '/sw.js', '/app']) {
    assert.deepEqual(go(OLD_HOST, p), { kind: 'app' }, p);
  }
  assert.deepEqual(go(OLD_HOST, '/home'), { kind: 'redirect', to: 'https://mettleup.fit/', status: 301 });
  assert.deepEqual(go(OLD_HOST, '/home/'), { kind: 'redirect', to: 'https://mettleup.fit/', status: 301 });
  assert.deepEqual(go(OLD_HOST, '/home/', '', 'GET', { moveOld: false }), { kind: 'app' });
  // A laptop's wrangler dev or workers.dev: as before.
  assert.deepEqual(go('localhost', '/home/'), { kind: 'app' });
});

// ------------------------------------------------------------------ the sign-in hand-over

const payload = Buffer.from(JSON.stringify({ 'forgeai.cloudGym.v1': '{"gymId":"g1"}' })).toString('base64url');
const movePost = (origin, body, type = 'application/x-www-form-urlencoded') =>
  new Request(`${APP_ORIGIN}/api/move`, { method: 'POST', headers: { Origin: origin, 'Content-Type': type }, body });

test('the hand-over takes a form only from the old address, and writes nothing but the page', async () => {
  const ok = await handleMove(movePost(`https://${OLD_HOST}`, `m=${payload}&to=${encodeURIComponent('/members?x=1')}`));
  assert.equal(ok.status, 200);
  const html = await ok.text();
  assert.match(html, new RegExp(`<meta name="mettleup-move" content="${payload}">`));
  assert.match(html, /<meta name="mettleup-to" content="\/members\?x=1">/);
  assert.match(html, /<script src="\/move\.js"><\/script>/);
  assert.match(ok.headers.get('Content-Security-Policy'), /script-src 'self'/);
  assert.equal(ok.headers.get('Cache-Control'), 'no-store');
  assert.equal(ok.headers.get('Set-Cookie'), null);

  assert.equal((await handleMove(movePost('https://evil.example', `m=${payload}`))).status, 303); // refused: back to sign-in, nothing written
  assert.equal((await handleMove(movePost(null, `m=${payload}`))).status, 303); // refused: back to sign-in, nothing written
  assert.equal((await handleMove(new Request(`${APP_ORIGIN}/api/move`))).status, 303); // refused: back to sign-in, nothing written
  // Only base64url letters ride in the page: nothing can break out of the tag.
  assert.equal((await handleMove(movePost(`https://${OLD_HOST}`, 'm=%22%3E%3Cscript%3E'))).status, 303); // refused: back to sign-in, nothing written
  assert.equal((await handleMove(movePost(`https://${OLD_HOST}`, `m=${'a'.repeat(16_001)}`))).status, 303); // refused: back to sign-in, nothing written
  // Another site's address is never opened afterwards.
  const away = await (await handleMove(movePost(`https://${OLD_HOST}`, `m=${payload}&to=${encodeURIComponent('//evil.example/x')}`))).text();
  assert.match(away, /<meta name="mettleup-to" content="\/">/);
});

test('safePath keeps only this site’s own pages', () => {
  assert.equal(safePath('/start'), '/start');
  assert.equal(safePath('/members/abc?x=1'), '/members/abc?x=1');
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'start', '', '/a b', '/api/feedback', `/${'a'.repeat(400)}`]) {
    assert.equal(safePath(bad), '/', bad);
  }
});

test('the keys the hand-over may carry match the admin app and public/move.js', () => {
  const app = readFileSync(new URL('../../apps/dashboard/src/crm/move/move.ts', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../apps/dashboard/public/move.js', import.meta.url), 'utf8');
  assert.deepEqual(MOVE_KEYS, ['forgeai.cloudGym.v1', 'forgeai.branchKeys.v1', 'forgeai.theme.v1']);
  assert.match(app, /MOVE_KEYS = \[CLOUD_GYM_KEY, BRANCH_KEYS, THEME_KEY\]/);
  for (const k of MOVE_KEYS) assert.ok(page.includes(`'${k}'`), k);
});

// ------------------------------------------------------------------ the Worker end to end

function fakeEnv(vars = {}) {
  const seen = [];
  return {
    seen,
    env: {
      LANDING: 'live',
      MOVE: 'on',
      ...vars,
      ASSETS: { fetch: async (req) => (seen.push(new URL(req.url).pathname), new Response(`asset ${new URL(req.url).pathname}`, { headers: { 'Content-Type': 'text/html' } })) },
    },
  };
}
const ctx = { waitUntil() {} };

test('Worker: app.mettleup.fit/sb reaches the gym server with the stamp, exactly like the old address', async () => {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (target, init) => (calls.push(String(target)), new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  try {
    for (const host of ['app.mettleup.fit', OLD_HOST]) {
      const { env } = fakeEnv();
      const res = await worker.fetch(new Request(`https://${host}/sb/auth/v1/health`), env, ctx);
      assert.equal(res.status, 200, host);
      assert.equal(res.headers.get(STAMP), '1', host);
    }
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.endsWith('/auth/v1/health')));
  } finally {
    globalThis.fetch = real;
  }
});

test('Worker: landing page at mettleup.fit, redirects, /api/moved and the hand-over host', async () => {
  let { env, seen } = fakeEnv();
  const landing = await worker.fetch(new Request('https://mettleup.fit/'), env, ctx);
  assert.equal(await landing.text(), 'asset /home/');
  assert.deepEqual(seen, ['/home/']);

  const www = await worker.fetch(new Request('https://www.mettleup.in/j/ABC123'), env, ctx);
  assert.equal(www.status, 301);
  assert.equal(www.headers.get('Location'), 'https://mettleup.fit/j/ABC123');

  const oldHome = await worker.fetch(new Request(`https://${OLD_HOST}/home/`), env, ctx);
  assert.equal(oldHome.status, 301);
  assert.equal(oldHome.headers.get('Location'), 'https://mettleup.fit/');

  const moved = await (await worker.fetch(new Request(`https://${OLD_HOST}/api/moved`), env, ctx)).json();
  assert.deepEqual(moved, { move: true, to: APP_ORIGIN });
  ({ env } = fakeEnv({ MOVE: 'off' }));
  assert.deepEqual(await (await worker.fetch(new Request(`https://${OLD_HOST}/api/moved`), env, ctx)).json(), { move: false, to: APP_ORIGIN });
  // MOVE off: the old address's landing page stays where it was.
  assert.equal(await (await worker.fetch(new Request(`https://${OLD_HOST}/home/`), env, ctx)).text(), 'asset /home/');

  // The hand-over is answered only on app.mettleup.fit.
  const post = (host) => new Request(`https://${host}/api/move`, { method: 'POST', headers: { Origin: `https://${OLD_HOST}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `m=${payload}` });
  assert.equal((await worker.fetch(post('app.mettleup.fit'), env, ctx)).status, 200);
  assert.equal((await worker.fetch(post(OLD_HOST), env, ctx)).status, 404);

  // The landing page hidden (LANDING off): mettleup.fit sends people to the admin app.
  ({ env } = fakeEnv({ LANDING: 'off' }));
  const hidden = await worker.fetch(new Request('https://mettleup.fit/'), env, ctx);
  assert.equal(hidden.status, 302);
  assert.equal(hidden.headers.get('Location'), `${APP_ORIGIN}/`);
});

test('wrangler: every address is a custom domain, the old one kept; the Worker runs first except /assets/', () => {
  const raw = readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8');
  for (const h of ['forgeai.aakashpahuja.in', 'app.mettleup.fit', 'mettleup.fit', 'www.mettleup.fit', 'mettleup.in', 'www.mettleup.in']) {
    assert.match(raw, new RegExp(`\\{ "pattern": "${h.replace(/\./g, '\\.')}", "custom_domain": true \\}`), h);
  }
  assert.match(raw, /"run_worker_first": \["\/\*", "!\/assets\/\*"\]/);
  assert.match(raw, /"MOVE": "on"/);
});

test('Android link check: both apps, the same signing key, one file for every address', () => {
  const links = JSON.parse(readFileSync(new URL('../../apps/dashboard/public/.well-known/assetlinks.json', import.meta.url), 'utf8'));
  const pkgs = links.map((l) => l.target.package_name).sort();
  assert.deepEqual(pkgs, ['com.forgeai.app', 'com.mettleup.app']);
  const prints = new Set(links.flatMap((l) => l.target.sha256_cert_fingerprints));
  assert.deepEqual([...prints], ['B2:B0:C2:11:5C:A2:13:62:D4:EB:50:C0:70:97:5C:74:8E:2E:9B:37:93:DC:87:32:53:17:43:B5:2D:85:75:B2']);
  for (const l of links) assert.deepEqual(l.relation, ['delegate_permission/common.handle_all_urls']);
});
