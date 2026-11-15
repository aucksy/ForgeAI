// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). R-579 (15 Nov 2026): the one smart app link.
// Every kind of visitor, with and without a gym code, with APP_STORE_URL empty (today) and set (the iPhone app is out).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { PLAY_URL, appBoot, appStoreUrl, deviceOf, joinRedirect } from './appLink.js';
import worker from './worker.js';

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  oppo: 'Mozilla/5.0 (Linux; Android 15; CPH2629 Build/UKQ1.231108.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  // A phone brand with "bot" inside its name is still a phone.
  cubot: 'Mozilla/5.0 (Linux; Android 12; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  facebookInApp: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  whatsappAndroid: 'WhatsApp/2.24.22.79 A',
  whatsappIphone: 'WhatsApp/2.24.22.79 i',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  // iMessage's link preview names two bots at once.
  imessage: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
  telegram: 'TelegramBot (like TwitterBot)',
  googlebotPhone: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};
const STORE = 'https://apps.apple.com/in/app/mettleup/id6700000000';

test('deviceOf: each kind of visitor', () => {
  for (const k of ['androidChrome', 'samsung', 'oppo', 'cubot', 'facebookInApp']) assert.equal(deviceOf(UA[k]), 'android', k);
  for (const k of ['iphoneSafari', 'iphoneChrome', 'ipad']) assert.equal(deviceOf(UA[k]), 'ios', k);
  for (const k of ['windows', 'mac']) assert.equal(deviceOf(UA[k]), 'other', k);
  for (const k of ['whatsappAndroid', 'whatsappIphone', 'facebook', 'imessage', 'telegram', 'googlebotPhone']) assert.equal(deviceOf(UA[k]), 'bot', k);
  assert.equal(deviceOf(''), 'other');
  assert.equal(deviceOf(null), 'other');
});

test('APP_STORE_URL: empty today; only an apps.apple.com app address counts', () => {
  const wr = readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8');
  const vars = JSON.parse(/"vars": (\{[^}]*\})/.exec(wr)[1]);
  assert.equal(vars.APP_STORE_URL, '', 'the iPhone app is not out: the var stays empty until it is');
  assert.equal(appStoreUrl(vars), '');
  assert.equal(appStoreUrl({}), '');
  assert.equal(appStoreUrl(undefined), '');
  assert.equal(appStoreUrl({ APP_STORE_URL: ` ${STORE} ` }), STORE);
  for (const bad of ['http://apps.apple.com/in/app/x/id1', 'https://apps.apple.com.evil.example/app/x', 'https://example.com/app/x', 'apps.apple.com/app/x', 'https://apps.apple.com/in/developer/x', 'yes']) {
    assert.equal(appStoreUrl({ APP_STORE_URL: bad }), '', bad);
  }
  assert.equal(joinRedirect({}, UA.iphoneSafari), null);
  assert.equal(joinRedirect({ APP_STORE_URL: STORE }, UA.iphoneSafari), STORE);
  assert.equal(joinRedirect({ APP_STORE_URL: STORE }, UA.androidChrome), null);
  assert.equal(joinRedirect({ APP_STORE_URL: STORE }, UA.windows), null);
  assert.equal(joinRedirect({ APP_STORE_URL: STORE }, UA.whatsappIphone), null, 'a link preview always gets the page');
});

test('appBoot: what the pages are told, and a store address can never close the script tag', () => {
  assert.equal(appBoot({}, 'ios'), `<script>window.__APP__={"device":"ios","play":"${PLAY_URL}","appStore":""};</script>`);
  assert.match(appBoot({ APP_STORE_URL: STORE }, 'other'), new RegExp(`"appStore":"${STORE.replace(/[./]/g, '\\$&')}"`));
  assert.doesNotMatch(appBoot({ APP_STORE_URL: 'https://apps.apple.com/app/</script>' }, 'other').slice(8, -9), /<\//);
});

// ---------------------------------------------------------------- the Worker, /app

const PAGE = readFileSync(new URL('../../apps/dashboard/public/get-app.html', import.meta.url), 'utf8');
function fakeEnv(vars = {}) {
  const seen = [];
  return {
    seen,
    env: {
      LANDING: 'live',
      MOVE: 'on',
      ...vars,
      ASSETS: {
        fetch: async (req) => {
          const path = new URL(req.url).pathname;
          seen.push(path);
          return path === '/get-app' ? new Response(PAGE, { headers: { 'Content-Type': 'text/html' } }) : new Response(`asset ${path}`, { headers: { 'Content-Type': 'text/html' } });
        },
      },
    },
  };
}
const ctx = { waitUntil() {} };
const ask = (env, path, ua) => worker.fetch(new Request(`https://app.mettleup.fit${path}`, { headers: ua ? { 'User-Agent': ua } : {} }), env, ctx);

test('/app on Android (Chrome, Samsung Internet, an OPPO, a Facebook in-app browser): one 302 to Google Play, no page', async () => {
  for (const vars of [{}, { APP_STORE_URL: STORE }]) {
    const { env, seen } = fakeEnv(vars);
    for (const k of ['androidChrome', 'samsung', 'oppo', 'cubot', 'facebookInApp']) {
      for (const p of ['/app', '/app/']) {
        const res = await ask(env, p, UA[k]);
        assert.equal(res.status, 302, `${k} ${p}`);
        assert.equal(res.headers.get('Location'), PLAY_URL, k);
        assert.equal(res.headers.get('Cache-Control'), 'no-store');
        assert.equal(res.headers.get('Vary'), 'User-Agent', 'no cache may hand another phone this answer');
        assert.equal(res.headers.get('Set-Cookie'), null, 'no cookie');
      }
    }
    assert.deepEqual(seen, [], 'Android never waits for a page');
  }
});

test('/app on an iPhone or iPad: "coming soon" while APP_STORE_URL is empty; straight to the App Store once it is set', async () => {
  const today = fakeEnv();
  for (const k of ['iphoneSafari', 'iphoneChrome', 'ipad']) {
    const res = await ask(today.env, '/app', UA[k]);
    assert.equal(res.status, 200, k);
    assert.equal(res.headers.get('Vary'), 'User-Agent');
    assert.match(res.headers.get('Content-Type'), /^text\/html/);
    const html = await res.text();
    assert.match(html, /window\.__APP__=\{"device":"ios","play":"[^"]+","appStore":""\};<\/script><\/head>/, k);
    assert.match(html, /The iPhone app is coming soon/);
  }
  const out = fakeEnv({ APP_STORE_URL: STORE });
  for (const k of ['iphoneSafari', 'iphoneChrome', 'ipad']) {
    const res = await ask(out.env, '/app', UA[k]);
    assert.equal(res.status, 302, k);
    assert.equal(res.headers.get('Location'), STORE, k);
    assert.equal(res.headers.get('Vary'), 'User-Agent');
  }
  assert.deepEqual(out.seen, []);
});

test('/app on a computer (Windows, Mac, no User-Agent): the QR page with both stores', async () => {
  for (const [vars, store] of [[{}, ''], [{ APP_STORE_URL: STORE }, STORE]]) {
    const { env } = fakeEnv(vars);
    for (const ua of [UA.windows, UA.mac, undefined]) {
      const res = await ask(env, '/app', ua);
      assert.equal(res.status, 200, String(ua));
      const html = await res.text();
      assert.ok(html.includes(`window.__APP__=${JSON.stringify({ device: 'other', play: PLAY_URL, appStore: store })}`), String(ua));
      assert.match(html, /id="computer"/);
      assert.match(html, /id="qr"/);
      assert.match(html, /Google Play/);
      assert.match(html, /App Store/);
    }
  }
});

test('/app for a link preview (WhatsApp, Facebook, iMessage, Telegram): a proper preview, never a redirect', async () => {
  for (const vars of [{}, { APP_STORE_URL: STORE }]) {
    const { env } = fakeEnv(vars);
    for (const k of ['whatsappAndroid', 'whatsappIphone', 'facebook', 'imessage', 'telegram', 'googlebotPhone']) {
      const res = await ask(env, '/app', UA[k]);
      assert.equal(res.status, 200, k);
      const html = await res.text();
      assert.match(html, /<meta property="og:title" content="Get the MettleUp app">/, k);
      assert.match(html, /<meta property="og:image" content="https:\/\/mettleup\.fit\/brand\/og-1200x630\.png">/);
      assert.match(html, /<meta property="og:description" content="[^"]{40,}">/);
      assert.match(html, /"device":"bot"/);
    }
  }
});

test('/app: a missing page falls back to Google Play, and the old address and mettleup.fit reach the same link', async () => {
  const env = { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } };
  const res = await ask(env, '/app', UA.windows);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), PLAY_URL);
  const { env: e2 } = fakeEnv();
  const old = await worker.fetch(new Request('https://forgeai.aakashpahuja.in/app', { headers: { 'User-Agent': UA.androidChrome } }), e2, ctx);
  assert.equal(old.headers.get('Location'), PLAY_URL);
  const site = await worker.fetch(new Request('https://mettleup.fit/app', { headers: { 'User-Agent': UA.iphoneSafari } }), e2, ctx);
  assert.equal(site.status, 301);
  assert.equal(site.headers.get('Location'), 'https://app.mettleup.fit/app');
});

// ---------------------------------------------------------------- the Worker, /j/<CODE> (the smart link with a gym)

/** The Workers runtime's HTMLRewriter and cache, just enough for joinPage: head handlers get an element that records appends. */
function workersRuntime() {
  const appended = [];
  class FakeRewriter {
    constructor() {
      this.handlers = [];
    }
    on(selector, handler) {
      this.handlers.push([selector, handler]);
      return this;
    }
    transform(res) {
      const el = { append: (h) => appended.push(h), setInnerContent() {}, setAttribute() {} };
      for (const [sel, h] of this.handlers) if (sel === 'head') h.element(el);
      return res;
    }
  }
  const real = { HTMLRewriter: globalThis.HTMLRewriter, caches: globalThis.caches, fetch: globalThis.fetch };
  globalThis.HTMLRewriter = FakeRewriter;
  globalThis.caches = { default: { match: async () => undefined, put: async () => undefined } };
  globalThis.fetch = async () => new Response(JSON.stringify({ gymName: 'Shakti Gym', joinCode: 'QA0002' }), { headers: { 'Content-Type': 'application/json' } });
  return {
    appended,
    restore() {
      globalThis.HTMLRewriter = real.HTMLRewriter;
      globalThis.caches = real.caches;
      globalThis.fetch = real.fetch;
    },
  };
}

test('/j/<CODE> on an iPhone: the gym page ("coming soon") today; straight to the App Store once APP_STORE_URL is set', async () => {
  const rt = workersRuntime();
  try {
    const { env } = fakeEnv();
    const res = await ask(env, '/j/QA0002', UA.iphoneSafari);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Vary'), 'User-Agent');
    assert.ok(rt.appended.includes(appBoot({}, 'ios')), 'the page is told: an iPhone, no App Store yet');
    for (const k of ['iphoneSafari', 'iphoneChrome', 'ipad']) {
      const out = await ask(fakeEnv({ APP_STORE_URL: STORE }).env, '/j/QA0002', UA[k]);
      assert.equal(out.status, 302, k);
      assert.equal(out.headers.get('Location'), STORE, k);
    }
  } finally {
    rt.restore();
  }
});

test('/j/<CODE> on Android, a computer and a link preview: always the gym page (Android opens the app from it)', async () => {
  const rt = workersRuntime();
  try {
    for (const vars of [{}, { APP_STORE_URL: STORE }]) {
      for (const [k, device] of [['androidChrome', 'android'], ['samsung', 'android'], ['windows', 'other'], ['mac', 'other'], ['whatsappAndroid', 'bot'], ['facebook', 'bot']]) {
        rt.appended.length = 0;
        const { env, seen } = fakeEnv(vars);
        const res = await ask(env, '/j/QA0002', UA[k]);
        assert.equal(res.status, 200, k);
        assert.deepEqual(seen, ['/join'], k);
        assert.ok(rt.appended.includes(appBoot(vars, device)), `${k} is told it is "${device}"`);
      }
    }
    // A wrong code is still the page that says so, never a store.
    const bad = await ask(fakeEnv({ APP_STORE_URL: STORE }).env, '/j/NOPE', UA.iphoneSafari);
    assert.equal(bad.status, 404);
  } finally {
    rt.restore();
  }
});

test('the gym page and the app page: what each kind of phone is shown, and the QR drawer only on a computer', () => {
  const join = readFileSync(new URL('../../apps/dashboard/public/join.html', import.meta.url), 'utf8');
  for (const id of ['iphone', 'computer', 'qr', 'play', 'appstore', 'appstore-soon', 'code-head', 'desk-gym']) assert.match(join, new RegExp(`id="${id}"`), id);
  assert.doesNotMatch(join, /notandroid/);
  assert.doesNotMatch(join, /<script src="\/vendor\//, 'phones never download the QR drawer');
  assert.doesNotMatch(PAGE, /<script src="\/vendor\//);
  for (const html of [join, PAGE]) {
    assert.match(html, /location\.replace\(STORE\)/, 'an iPad that says "Macintosh" still goes to the App Store once it is set');
    assert.match(html, /navigator\.maxTouchPoints > 1/);
    assert.match(html, /The iPhone app is coming soon/);
  }
  // R-579 public words: nothing promised that is not live, no other gym software named.
  assert.doesNotMatch(join + PAGE, /\b(available now on iPhone|download for iPhone)\b/i);
  const headers = readFileSync(new URL('../../apps/dashboard/public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /\/get-app\r?\n {2}! Content-Security-Policy\r?\n\/get-app\.html\r?\n {2}! Content-Security-Policy/);
});
