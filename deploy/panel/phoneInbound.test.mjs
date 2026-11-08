// node --test deploy/panel/phoneInbound.test.mjs. "Verify with WhatsApp" (8 Nov 2026): the person sends US
// "MettleUp code 123456". The code parser, number matching, expiry, wrong number, a changed message, replay, the
// limits, the signed webhook and the proof (same shape as phoneCode.js). D1 is real SQLite; Meta is a fake POST.
// Fake numbers only (+91 90000 0000x); the business number here is a made-up one.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { MAX_WRONG, handlePhoneCode, hmacHex } from './phoneCode.js';
import { deleteOldInbound, inboundMessages, inboundNumber, openPhone, parseCode, sealPhone, stateOf } from './phoneInbound.js';
import { sqliteD1 } from './sqliteD1.mjs';
import { handleWhatsAppHook } from './whatsappHook.js';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const APP_SECRET = 'meta-app-secret-fake';
const T0 = Date.UTC(2026, 10, 8, 6, 0, 0);
const OWNER = '9000000001';
const OTHER = '9000000002';
const BIZ = '+91 90000 99999';

function setup(extra = {}) {
  const WEB = sqliteD1();
  const env = { WEB, PHONE_CODE_SECRET: SECRET, WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_INBOUND_NUMBER: BIZ, ...extra };
  return { env, WEB };
}

const silent = { log() {}, warn() {}, error() {} };
function quiet(fn) {
  return async () => {
    const saved = [console.log, console.warn, console.error];
    console.log = console.warn = console.error = () => {};
    try {
      await fn();
    } finally {
      [console.log, console.warn, console.error] = saved;
    }
  };
}

async function call(s, path, body, { now = T0, ip = '10.0.0.1' } = {}) {
  const req = new Request(`https://app.mettleup.fit${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'CF-Connecting-IP': ip },
  });
  const r = await handlePhoneCode(req, s.env, new URL(req.url), async () => ({ status: 500 }), { now });
  return { status: r.status, body: await r.json() };
}
const startFor = (s, phone, purpose = 'pin', opts) => call(s, '/api/phone-code/inbound/start', { phone, purpose, website: '' }, opts);
const statusOf = (s, id, opts) => call(s, `/api/phone-code/inbound/status?id=${id}`, undefined, opts);

const hookBody = (from, text) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { messages: [{ from, id: 'wamid.1', type: 'text', text: { body: text } }] } }] }],
});

/** Meta's POST, signed (or not) with the app secret. Returns the log lines. */
async function metaSays(s, from, text, { now = T0, sign = true } = {}) {
  const raw = JSON.stringify(hookBody(from, text));
  const headers = sign ? { 'X-Hub-Signature-256': `sha256=${createHmac('sha256', APP_SECRET).update(raw).digest('hex')}` } : {};
  const req = new Request('https://app.mettleup.fit/api/whatsapp/hook', { method: 'POST', body: raw, headers });
  const out = [];
  const f = (...a) => out.push(a.join(' '));
  const r = await handleWhatsAppHook(req, s.env, new URL(req.url), { log: f, warn: f, error: f }, now);
  assert.equal(r.status, 200);
  return out;
}

test('the code parser: "MettleUp code 123456", any case, spaces, ":" or "-", nothing else', () => {
  assert.equal(parseCode('MettleUp code 482913'), '482913');
  assert.equal(parseCode('mettleup code 482913'), '482913');
  assert.equal(parseCode('  METTLE UP CODE: 482913 '), '482913');
  assert.equal(parseCode('Hi! MettleUp code - 482 913 thanks'), '482913');
  assert.equal(parseCode('MettleUp code 012345'), '012345');
  for (const bad of ['482913', 'MettleUp 482913', 'MettleUp code 48291', 'MettleUp code 4829134', 'MettleUp code abcdef', '', null, undefined, 42]) {
    assert.equal(parseCode(bad), null, String(bad));
  }
});

test('the business number: digits with the country code, or off', () => {
  assert.equal(inboundNumber({ WHATSAPP_INBOUND_NUMBER: '+91 90000 99999' }), '919000099999');
  assert.equal(inboundNumber({ WHATSAPP_INBOUND_NUMBER: '9000099999' }), '919000099999');
  assert.equal(inboundNumber({ WHATSAPP_INBOUND_NUMBER: '' }), null);
  assert.equal(inboundNumber({}), null);
  assert.equal(inboundNumber({ WHATSAPP_INBOUND_NUMBER: '123' }), null);
});

test('status says inbound only with the number, both secrets and the 0013 table; else the old answer', quiet(async () => {
  assert.deepEqual((await call(setup(), '/api/phone-code/status')).body, { available: true, mode: 'inbound' });
  for (const missing of ['WHATSAPP_INBOUND_NUMBER', 'WHATSAPP_APP_SECRET', 'PHONE_CODE_SECRET']) {
    const s = setup({ [missing]: undefined });
    assert.deepEqual((await call(s, '/api/phone-code/status')).body, { available: false }, missing);
    assert.equal((await startFor(s, OWNER)).body.error, 'NOT_AVAILABLE', missing);
  }
  assert.deepEqual((await call(setup({ PHONE_CODES: 'off' }), '/api/phone-code/status')).body, { available: false });
  // No 0013 table yet: off, not an error.
  const s = setup();
  s.WEB.sqlite.exec('DROP TABLE phone_inbound');
  assert.deepEqual((await call(s, '/api/phone-code/status')).body, { available: false });
}));

test('start: an id, a 6-digit code, the wa.me number and text, 10 minutes; nothing private is stored', quiet(async () => {
  const s = setup();
  const r = await startFor(s, '+91 90000 00001');
  assert.equal(r.status, 200);
  assert.match(r.body.id, /^[0-9a-f-]{36}$/);
  assert.match(r.body.code, /^\d{6}$/);
  assert.equal(r.body.waNumber, '919000099999');
  assert.equal(r.body.waText, `MettleUp code ${r.body.code}`);
  assert.equal(r.body.expiresAt, T0 + 10 * 60_000);
  const dump = JSON.stringify(s.WEB.sqlite.prepare('SELECT * FROM phone_inbound').all()) + JSON.stringify(s.WEB.sqlite.prepare('SELECT * FROM phone_code_asks').all());
  assert.ok(!dump.includes(OWNER) && !dump.includes(r.body.code) && !dump.includes(r.body.id), 'no number, code or id in D1');
  assert.equal(s.WEB.sqlite.prepare('SELECT sent FROM phone_code_asks').get().sent, 0, 'a message to us is not a paid send');
  assert.deepEqual((await statusOf(s, r.body.id)).body, { ok: true, state: 'waiting', expiresAt: T0 + 10 * 60_000 });
  // Bad input
  assert.equal((await startFor(s, '12345')).body.error, 'BAD_PHONE');
  assert.equal((await call(s, '/api/phone-code/inbound/start', { phone: OWNER, purpose: 'x' })).status, 400);
  assert.equal((await statusOf(s, 'nope')).status, 400);
}));

test('verified: the right code from the typed number (91…, +91, spaces all match), then the proof ONCE', quiet(async () => {
  const s = setup();
  const r = await startFor(s, '90000 00001', 'pin');
  const lines = await metaSays(s, '919000000001', `MettleUp code ${r.body.code}`, { now: T0 + 5000 });
  assert.ok(lines.some((l) => l.includes('[phone-inbound] verified purpose=pin from=..01')));
  assert.ok(lines.every((l) => !l.includes(OWNER) && !l.includes(r.body.code)), 'no number or code in the logs');
  // While verified and not yet fetched, only the encrypted number is kept.
  const row = s.WEB.sqlite.prepare('SELECT * FROM phone_inbound').get();
  assert.equal(row.state, 'verified');
  assert.ok(row.sender_box && !row.sender_box.includes(OWNER));

  const got = await statusOf(s, r.body.id, { now: T0 + 6000 });
  assert.equal(got.body.state, 'verified');
  // The same proof shape as phoneCode.js (supabase 0061 checks it): v1.<purpose>.<phone>.<exp>.<nonce>.<hmac>
  const parts = got.body.proof.split('.');
  assert.equal(parts.length, 6);
  assert.deepEqual(parts.slice(0, 3), ['v1', 'pin', OWNER]);
  assert.equal(Number(parts[3]), Math.floor((T0 + 6000) / 1000) + 15 * 60);
  assert.equal(parts[5], await hmacHex(SECRET, parts.slice(0, 5).join('.')));
  // Second ask: verified, no proof; the number is gone from D1.
  assert.deepEqual((await statusOf(s, r.body.id, { now: T0 + 9000 })).body, { ok: true, state: 'verified' });
  assert.equal(s.WEB.sqlite.prepare('SELECT sender_box FROM phone_inbound').get().sender_box, null);
}));

test('replay: the same message again verifies nothing new; a used code cannot be used for a new tap', quiet(async () => {
  const s = setup();
  const r = await startFor(s, OWNER, 'signup');
  await metaSays(s, '919000000001', `MettleUp code ${r.body.code}`);
  assert.equal((await statusOf(s, r.body.id)).body.state, 'verified');
  assert.equal((await inboundMessages(s.env, hookBody('919000000001', `MettleUp code ${r.body.code}`), T0 + 1000, silent))[0], 'none');
  assert.equal((await inboundMessages(s.env, hookBody('919000000002', `MettleUp code ${r.body.code}`), T0 + 1000, silent))[0], 'none');
  assert.equal(s.WEB.sqlite.prepare("SELECT COUNT(*) AS n FROM phone_inbound WHERE state = 'verified'").get().n, 1);
}));

test('wrong number: "wrong_number" and still waiting; the right number then works; 5 wrong = too many', quiet(async () => {
  const s = setup();
  const r = await startFor(s, OWNER);
  const text = `MettleUp code ${r.body.code}`;
  assert.equal((await inboundMessages(s.env, hookBody('919000000002', text), T0 + 1000, silent))[0], 'wrong_number');
  const st = await statusOf(s, r.body.id, { now: T0 + 2000 });
  assert.equal(st.body.state, 'wrong_number');
  assert.equal(st.body.proof, undefined);
  // A non-Indian sender is a wrong number too.
  assert.equal((await inboundMessages(s.env, hookBody('14155550100', text), T0 + 1000, silent))[0], 'wrong_number');
  assert.equal((await inboundMessages(s.env, hookBody('919000000001', text), T0 + 3000, silent))[0], 'verified');
  assert.equal((await statusOf(s, r.body.id, { now: T0 + 4000 })).body.state, 'verified');

  const s2 = setup();
  const r2 = await startFor(s2, OWNER);
  for (let i = 0; i < MAX_WRONG; i++) await inboundMessages(s2.env, hookBody(`91900000001${i}`, `MettleUp code ${r2.body.code}`), T0 + 1000, silent);
  assert.deepEqual((await statusOf(s2, r2.body.id)).body, { ok: true, state: 'too_many' });
  assert.equal((await inboundMessages(s2.env, hookBody('919000000001', `MettleUp code ${r2.body.code}`), T0 + 2000, silent))[0], 'none', 'dead stays dead');
}));

test('a changed message from the typed number: still waiting, with hint "no_code"; other chats are left alone', quiet(async () => {
  const s = setup();
  const r = await startFor(s, OWNER);
  assert.equal((await inboundMessages(s.env, hookBody('919000000001', 'hello, I want to join'), T0 + 1000, silent))[0], 'no_code');
  assert.deepEqual((await statusOf(s, r.body.id, { now: T0 + 2000 })).body, { ok: true, state: 'waiting', expiresAt: T0 + 600_000, hint: 'no_code' });
  // A changed digit is "no code" too, not a wrong number.
  const other = r.body.code === '111111' ? '222222' : '111111';
  assert.equal((await inboundMessages(s.env, hookBody('919000000001', `MettleUp code ${other}`), T0 + 1000, silent))[0], 'no_code');
  // Someone who is not verifying: nothing happens.
  assert.equal((await inboundMessages(s.env, hookBody('919000000005', 'hi'), T0 + 1000, silent))[0], 'none');
}));

test('expiry: after 10 minutes the status says expired and a late message verifies nothing', quiet(async () => {
  const s = setup();
  const r = await startFor(s, OWNER);
  const late = T0 + 10 * 60_000 + 1;
  assert.equal((await inboundMessages(s.env, hookBody('919000000001', `MettleUp code ${r.body.code}`), late, silent))[0], 'none');
  assert.deepEqual((await statusOf(s, r.body.id, { now: late })).body, { ok: true, state: 'expired' });
  assert.equal(stateOf(null, T0), 'expired');
  // An unknown id reads as expired (cleaned up, or a bot's id).
  assert.deepEqual((await statusOf(s, '00000000-0000-4000-8000-000000000000')).body, { ok: true, state: 'expired' });
}));

test('a new tap replaces the waiting one for that number: the old code no longer verifies', quiet(async () => {
  const s = setup();
  const a = await startFor(s, OWNER);
  const b = await startFor(s, OWNER, 'pin', { now: T0 + 61_000 });
  assert.equal((await statusOf(s, a.body.id, { now: T0 + 62_000 })).body.state, 'expired');
  assert.equal((await inboundMessages(s.env, hookBody('919000000001', `MettleUp code ${a.body.code}`), T0 + 62_000, silent))[0], a.body.code === b.body.code ? 'verified' : 'no_code');
}));

test('limits as asking for a code: 1 a minute, 3 an hour per number; 10 an hour per address', quiet(async () => {
  const s = setup();
  assert.equal((await startFor(s, OWNER)).status, 200);
  const soon = await startFor(s, OWNER, 'pin', { now: T0 + 20_000 });
  assert.equal(soon.status, 429);
  assert.deepEqual(soon.body, { error: 'TOO_SOON', retryAfter: 40 });
  assert.equal((await startFor(s, OWNER, 'pin', { now: T0 + 61_000 })).status, 200);
  assert.equal((await startFor(s, OWNER, 'pin', { now: T0 + 122_000 })).status, 200);
  assert.deepEqual((await startFor(s, OWNER, 'pin', { now: T0 + 183_000 })).body, { error: 'TOO_MANY' });
  const s2 = setup();
  for (let i = 0; i < 10; i++) assert.equal((await startFor(s2, `90000000${String(i + 10)}`, 'signup', { now: T0 + i * 1000, ip: '10.9.9.9' })).status, 200);
  assert.deepEqual((await startFor(s2, '9000000099', 'signup', { now: T0 + 20_000, ip: '10.9.9.9' })).body, { error: 'TOO_MANY' });
  assert.equal((await startFor(s2, '9000000099', 'signup', { now: T0 + 20_000, ip: '10.1.1.1' })).status, 200);
}));

test('the webhook: an UNSIGNED message never verifies; a bad signature is dropped; Meta always gets 200 once read', quiet(async () => {
  const s = setup({ WHATSAPP_APP_SECRET: undefined });
  // Without the app secret inbound is off entirely (start refuses); a forged unsigned POST changes nothing.
  assert.equal((await startFor(s, OWNER)).body.error, 'NOT_AVAILABLE');
  const s2 = setup();
  const r = await startFor(s2, OWNER);
  const raw = JSON.stringify(hookBody('919000000001', `MettleUp code ${r.body.code}`));
  const forged = new Request('https://x/api/whatsapp/hook', { method: 'POST', body: raw, headers: { 'X-Hub-Signature-256': 'sha256=00' } });
  assert.equal((await handleWhatsAppHook(forged, s2.env, new URL(forged.url), silent, T0)).status, 403);
  assert.equal((await statusOf(s2, r.body.id)).body.state, 'waiting');
  // D1 broken mid-way: still 200 to Meta.
  const broken = setup();
  const r3 = await startFor(broken, OWNER);
  broken.WEB.sqlite.exec('DROP TABLE phone_inbound');
  const lines = await metaSays(broken, '919000000001', `MettleUp code ${r3.body.code}`);
  assert.ok(lines.some((l) => l.includes('could not be checked')));
}));

test('the bot box: a normal-looking answer, nothing stored, its id reads as expired', quiet(async () => {
  const s = setup();
  const r = await call(s, '/api/phone-code/inbound/start', { phone: OWNER, purpose: 'pin', website: 'http://spam' });
  assert.equal(r.status, 200);
  assert.match(r.body.code, /^\d{6}$/);
  assert.equal(s.WEB.sqlite.prepare('SELECT COUNT(*) AS n FROM phone_inbound').get().n, 0);
  assert.equal((await statusOf(s, r.body.id)).body.state, 'expired');
}));

test('the sealed number opens only with the same secret and the same row', async () => {
  const box = await sealPhone(SECRET, 'row-a', OWNER);
  assert.equal(await openPhone(SECRET, 'row-a', box), OWNER);
  await assert.rejects(openPhone(SECRET, 'row-b', box));
  await assert.rejects(openPhone('other-secret', 'row-a', box));
});

test('clean-up: rows older than 2 days go', quiet(async () => {
  const s = setup();
  await startFor(s, OWNER);
  await startFor(s, OTHER, 'pin', { now: T0 + 3 * 86_400_000 });
  assert.equal(await deleteOldInbound(s.WEB, T0 + 3 * 86_400_000), 1);
}));
