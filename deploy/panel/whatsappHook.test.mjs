// node --test deploy/panel/whatsappHook.test.mjs. R-392: Meta's WhatsApp webhook only logs, never logs a full number.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { handleWhatsAppHook, statusLines } from './whatsappHook.js';

const env = { WHATSAPP_HOOK_VERIFY: 'mettleup-wa-hook' };
const quiet = () => {
  const out = [];
  const f = (...a) => out.push(a.join(' '));
  return { out, log: { log: f, warn: f, error: f } };
};
const get = (q) => new Request(`https://app.mettleup.fit/api/whatsapp/hook?${q}`);
const failed = {
  entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.X', status: 'failed', recipient_id: '919000000001',
    errors: [{ code: 131042, title: 'Business eligibility payment issue', error_data: { details: 'card' } }] }] } }] }],
};

test('GET: the right verify token echoes the challenge', async () => {
  const q = 'hub.mode=subscribe&hub.verify_token=mettleup-wa-hook&hub.challenge=12345';
  const r = await handleWhatsAppHook(get(q), env, new URL(get(q).url), quiet().log);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '12345');
});

test('GET: a wrong token, or no token set, is refused', async () => {
  const q = 'hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1';
  assert.equal((await handleWhatsAppHook(get(q), env, new URL(get(q).url), quiet().log)).status, 403);
  const q2 = 'hub.mode=subscribe&hub.verify_token=&hub.challenge=1';
  assert.equal((await handleWhatsAppHook(get(q2), {}, new URL(get(q2).url), quiet().log)).status, 403);
});

test('a failed status logs the error code and only the last 2 digits of the number', () => {
  const [line] = statusLines(failed);
  assert.match(line, /status=failed/);
  assert.match(line, /code=131042/);
  assert.match(line, /to=\.\.01/);
  assert.doesNotMatch(line, /9000000001/);
});

test('POST: unsigned without a secret, logged, answers 200', async () => {
  const { out, log } = quiet();
  const req = new Request('https://app.mettleup.fit/api/whatsapp/hook', { method: 'POST', body: JSON.stringify(failed) });
  const r = await handleWhatsAppHook(req, env, new URL(req.url), log);
  assert.equal(r.status, 200);
  assert.ok(out.some((l) => l.includes('code=131042') && l.includes('(unsigned)')));
});

test('POST: with the app secret, a bad signature is dropped and a good one is logged', async () => {
  const e = { ...env, WHATSAPP_APP_SECRET: 's3' };
  const raw = JSON.stringify(failed);
  const bad = new Request('https://x/api/whatsapp/hook', { method: 'POST', body: raw, headers: { 'X-Hub-Signature-256': 'sha256=00' } });
  assert.equal((await handleWhatsAppHook(bad, e, new URL(bad.url), quiet().log)).status, 403);
  const sig = createHmac('sha256', 's3').update(raw).digest('hex');
  const { out, log } = quiet();
  const good = new Request('https://x/api/whatsapp/hook', { method: 'POST', body: raw, headers: { 'X-Hub-Signature-256': `sha256=${sig}` } });
  assert.equal((await handleWhatsAppHook(good, e, new URL(good.url), log)).status, 200);
  assert.ok(out.some((l) => l.includes('(signed)')));
});

test('POST: junk is answered 200 (Meta would retry otherwise) and logs nothing private', async () => {
  const { out, log } = quiet();
  const req = new Request('https://x/api/whatsapp/hook', { method: 'POST', body: 'not json' });
  assert.equal((await handleWhatsAppHook(req, env, new URL(req.url), log)).status, 200);
  assert.ok(out.every((l) => !/\d{6,}/.test(l)));
});
