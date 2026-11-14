// node --test deploy/panel  (CI). R-506 phase 3: /api/push/web-key passes HQ's PUBLIC Web Push key on (webKey.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleWebKey } from './webKey.js';
import worker from './worker.js';

const KEY = 'B'.repeat(87);
const hq = (answer) => ({
  calls: [],
  async fetch(url, init) {
    this.calls.push({ url, init });
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  },
});

test('the public key from HQ, cached an hour', async () => {
  const HQ_PUSH = hq({ status: 200, body: { key: KEY } });
  const res = await handleWebKey(new Request('https://app.mettleup.fit/api/push/web-key'), { HQ_PUSH });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { key: KEY });
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=3600');
  assert.equal(HQ_PUSH.calls[0].url, 'https://hq.mettleup.fit/push/web-key');
});

test('not set up, unreachable, or something that is not a key: 503, never passed on', async () => {
  assert.equal((await handleWebKey(new Request('https://app.mettleup.fit/api/push/web-key'), {})).status, 503);
  const off = await handleWebKey(new Request('https://app.mettleup.fit/api/push/web-key'), { HQ_PUSH: hq({ status: 503, body: { error: 'NOT_SET_UP' } }) });
  assert.deepEqual([off.status, await off.json()], [503, { error: 'NOT_SET_UP' }]);
  const odd = await handleWebKey(new Request('https://app.mettleup.fit/api/push/web-key'), { HQ_PUSH: hq({ status: 200, body: { key: '<script>' } }) });
  assert.equal(odd.status, 503);
  const down = await handleWebKey(new Request('https://app.mettleup.fit/api/push/web-key'), { HQ_PUSH: hq(new Error('down')) });
  assert.deepEqual(await down.json(), { error: 'UNREACHABLE' });
  const post = await handleWebKey(new Request('https://app.mettleup.fit/api/push/web-key', { method: 'POST' }), {});
  assert.equal(post.status, 405);
});

test('the Worker answers it at /api/push/web-key', async () => {
  const res = await worker.fetch(new Request('https://app.mettleup.fit/api/push/web-key'), { HQ_PUSH: hq({ status: 200, body: { key: KEY } }) }, { waitUntil() {} });
  assert.equal(res.status, 200);
});
