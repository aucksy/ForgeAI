// node --test deploy/panel/whatsNewFeed.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanNews, readLatestNews, handleWhatsNew } from './whatsNewFeed.js';

const NEWS = { version: '0.76.0', lines: ['Your progress is now on the Profile tab.', 'Small fixes.'] };
const json = (v, status = 200) => new Response(JSON.stringify(v), { status });

function memCache() {
  const m = new Map();
  return {
    match: async (k) => (m.has(k.url) ? new Response(m.get(k.url)) : undefined),
    put: async (k, r) => { m.set(k.url, await r.text()); },
  };
}
const ctx = { waitUntil: (p) => p };

test('cleanNews keeps a plain version and the text lines only', () => {
  assert.deepEqual(cleanNews({ version: 'v0.76.0', lines: ['a', '', 3, 'b'] }), { version: '0.76.0', lines: ['a', 'b'] });
  assert.equal(cleanNews({ version: 'latest', lines: [] }), null);
  assert.equal(cleanNews(null), null);
});

test('the API door wins when it answers', async () => {
  const seen = [];
  const f = async (url) => {
    seen.push(url);
    if (url.includes('/releases/latest') && url.startsWith('https://api.')) return json({ assets: [{ name: 'whats-new.json', url: 'https://api.github.com/asset/1' }] });
    if (url === 'https://api.github.com/asset/1') return json(NEWS);
    return json({}, 504);
  };
  assert.deepEqual(await readLatestNews(f), NEWS);
  assert.equal(seen.length, 2);
});

test('the download door is used when the API fails (rate limit)', async () => {
  const f = async (url) => (url.startsWith('https://github.com/') ? json(NEWS) : json({ message: 'rate limit' }, 403));
  assert.deepEqual(await readLatestNews(f), NEWS);
});

test('negative: both doors down and nothing kept = 503, never a made-up note', async () => {
  const res = await handleWhatsNew(new Request('https://app.mettleup.fit/app/whats-new.json'), ctx, { cache: memCache(), fetch: async () => json({}, 504) });
  assert.equal(res.status, 503);
});

test('GitHub down after one good answer: the kept copy is served', async () => {
  const cache = memCache();
  let up = true;
  const f = async (url) => (!up ? json({}, 504) : url.startsWith('https://github.com/') ? json(NEWS) : json({}, 403));
  const req = () => new Request('https://app.mettleup.fit/app/whats-new.json');
  const pending = [];
  const wait = { waitUntil: (p) => pending.push(p) };
  assert.equal((await handleWhatsNew(req(), wait, { cache, fetch: f })).status, 200);
  await Promise.all(pending); // the cache writes finish in the background; wait for them (flaky in CI otherwise)
  // the fresh copy expires (simulated by deleting it); GitHub is down
  up = false;
  const store = cache;
  const fresh = new Request('https://cache.mettleup/whats-new-fresh');
  const origMatch = store.match;
  store.match = async (k) => (k.url === fresh.url ? undefined : origMatch(k));
  const res = await handleWhatsNew(req(), ctx, { cache: store, fetch: f });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), NEWS);
});

test('only GET and HEAD', async () => {
  const res = await handleWhatsNew(new Request('https://x/app/whats-new.json', { method: 'POST' }), ctx, { cache: memCache(), fetch: async () => json(NEWS) });
  assert.equal(res.status, 405);
});
