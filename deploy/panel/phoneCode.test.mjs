// node --test deploy/panel. F187 sign-in codes by WhatsApp (R-383): codes, limits, the daily cap, the neutral
// answer, Indian numbers only, expiry and 5 wrong tries. WhatsApp and the gym server are fakes; D1 is real SQLite.
// Fake numbers only (+91 90000 0000x).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CODE_MINUTES,
  DEFAULT_DAILY_CAP,
  LIMITS,
  accountQuestion,
  codeHash,
  deleteOldPhoneCodes,
  handlePhoneCode,
  hmacHex,
  indiaDayStart,
  indianMobile,
  isAvailable,
  limitFor,
  makeProof,
  newCode,
  sameText,
  templateBody,
} from './phoneCode.js';
import { sqliteD1 } from './sqliteD1.mjs';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const T0 = Date.UTC(2026, 10, 6, 6, 0, 0); // 6 Nov 2026, 11:30 IST
const OWNER = '9000000001';
const NOBODY = '9000000002';

function setup(extra = {}) {
  const WEB = sqliteD1();
  const env = { WEB, WHATSAPP_TOKEN: 'fake-token-never-real', WHATSAPP_PHONE_NUMBER_ID: '1410811765454726', PHONE_CODE_SECRET: SECRET, ...extra };
  const sent = [];
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push({ url, auth: init.headers.Authorization, body });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }), { status: 200 });
  };
  const rpcCalls = [];
  const rpc = async (fn, args) => {
    rpcCalls.push({ fn, args });
    return { status: 200, data: args.p_phone === OWNER };
  };
  return { env, WEB, sent, fetcher, rpc, rpcCalls };
}

const req = (path, body, ip = '10.0.0.1') =>
  new Request(`https://app.mettleup.fit${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'CF-Connecting-IP': ip },
  });

async function call(s, path, body, { now = T0, ip, fetcher } = {}) {
  const r = await handlePhoneCode(req(path, body, ip), s.env, new URL(`https://app.mettleup.fit${path}`), s.rpc, { fetcher: fetcher ?? s.fetcher, now });
  return { status: r.status, body: await r.json() };
}

const sendCode = (s, phone, purpose = 'pin', opts) => call(s, '/api/phone-code/send', { phone, purpose, website: '' }, opts);
const verify = (s, phone, code, purpose = 'pin', opts) => call(s, '/api/phone-code/verify', { phone, purpose, code }, opts);
const lastCode = (s) => s.sent.at(-1).body.template.components[0].parameters[0].text;

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

test('codes: 6 digits, crypto-random, no modulo bias, leading zeros kept', () => {
  for (let i = 0; i < 200; i++) assert.match(newCode(), /^\d{6}$/);
  assert.equal(newCode((a) => (a[0] = 7)), '000007');
  // A value in the biased top slice is drawn again.
  let n = 0;
  assert.equal(newCode((a) => (a[0] = n++ === 0 ? 0xffffffff : 123456)), '123456');
  assert.ok(new Set(Array.from({ length: 50 }, () => newCode())).size > 40);
});

test('hash and compare: salted with the secret and the code id; constant-time equality', async () => {
  const a = await codeHash(SECRET, 'id-1', '123456');
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, await codeHash(SECRET, 'id-2', '123456'));
  assert.notEqual(a, await codeHash('other-secret', 'id-1', '123456'));
  assert.equal(a, await codeHash(SECRET, 'id-1', '123456'));
  assert.ok(sameText(a, a));
  assert.ok(!sameText(a, a.slice(0, -1) + (a.endsWith('0') ? '1' : '0')));
  assert.ok(!sameText(a, a.slice(0, 10)));
  // Known HMAC-SHA256 answer (RFC 4231 test 2), so the gym server's pgcrypto hmac() matches.
  assert.equal(await hmacHex('Jefe', 'what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
});

test('Indian mobiles only: +91, 10 digits, starting 6-9', () => {
  assert.equal(indianMobile('+91 90000 00001'), OWNER);
  assert.equal(indianMobile('090000-00001'), OWNER);
  assert.equal(indianMobile('919000000001'), OWNER);
  for (const bad of ['5000000001', '900000001', '+1 415 555 0100', '+44 7700 900123', '', null, '90000000011']) assert.equal(indianMobile(bad), null, String(bad));
});

test('the WhatsApp body is Meta’s copy-code authentication template: the code in the body and the button', () => {
  const b = templateBody(OWNER, '482913');
  assert.equal(b.to, '919000000001');
  assert.equal(b.template.name, 'login_code');
  assert.deepEqual(b.template.language, { code: 'en' });
  assert.deepEqual(b.template.components[0], { type: 'body', parameters: [{ type: 'text', text: '482913' }] });
  assert.deepEqual(b.template.components[1], { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '482913' }] });
});

test('limits (pure): 1 a minute, 3 an hour, 5 a day per number; 10 an hour per address', () => {
  const ago = (ms) => T0 - ms;
  assert.equal(limitFor({ phoneTimes: [], ipTimes: [] }, T0), null);
  const soon = limitFor({ phoneTimes: [ago(20_000)], ipTimes: [] }, T0);
  assert.equal(soon.error, 'TOO_SOON');
  assert.equal(soon.retryAfter, 40);
  assert.equal(limitFor({ phoneTimes: [ago(61_000)], ipTimes: [] }, T0), null);
  assert.equal(limitFor({ phoneTimes: [ago(2 * 60_000), ago(5 * 60_000), ago(9 * 60_000)], ipTimes: [] }, T0).error, 'TOO_MANY');
  const day = [1, 2, 3, 4, 5].map((h) => ago(h * 3_600_000 + 1000));
  assert.equal(limitFor({ phoneTimes: day, ipTimes: [] }, T0).error, 'TOO_MANY');
  assert.equal(limitFor({ phoneTimes: day.slice(0, 4), ipTimes: [] }, T0), null);
  assert.equal(limitFor({ phoneTimes: [], ipTimes: Array.from({ length: 10 }, (_, i) => ago(i * 60_000 + 1000)) }, T0).error, 'TOO_MANY');
  assert.equal(LIMITS.perIpHour, 10);
});

test('switched off without the token, the secret or the number id: status false, send says NOT_AVAILABLE', quiet(async () => {
  for (const missing of ['WHATSAPP_TOKEN', 'PHONE_CODE_SECRET', 'WHATSAPP_PHONE_NUMBER_ID']) {
    const s = setup({ [missing]: undefined });
    assert.deepEqual((await call(s, '/api/phone-code/status')).body, { available: false });
    const r = await sendCode(s, OWNER);
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'NOT_AVAILABLE');
    assert.equal(s.sent.length, 0);
  }
  const off = setup({ PHONE_CODES: 'off' });
  assert.equal(await isAvailable(off.env, T0), false);
  const on = setup();
  assert.deepEqual((await call(on, '/api/phone-code/status')).body, { available: true });
}));

test('forgot PIN: an account gets a real WhatsApp; no account gets the SAME answer and nothing is sent', quiet(async () => {
  const s = setup();
  const a = await sendCode(s, '+91 90000 00001');
  const b = await sendCode(s, NOBODY);
  assert.deepEqual(a, { status: 200, body: { ok: true } });
  assert.deepEqual(b, a);
  assert.equal(s.sent.length, 1);
  assert.match(s.sent[0].url, /^https:\/\/graph\.facebook\.com\/v27\.0\/1410811765454726\/messages$/);
  assert.equal(s.sent[0].auth, 'Bearer fake-token-never-real');
  // The account check is signed with the secret, so only this Worker can ask it.
  const q = s.rpcCalls[0];
  assert.equal(q.fn, 'phone_code_has_account');
  assert.deepEqual(q.args, await accountQuestion(SECRET, OWNER, T0));
  // A wrong code answers the same for both (the no-account number holds a code nobody was sent).
  const wa = await verify(s, OWNER, '000000', 'pin', { now: T0 + 1000 });
  const wb = await verify(s, NOBODY, '000000', 'pin', { now: T0 + 1000 });
  assert.deepEqual(wa.body, { error: 'WRONG_CODE', triesLeft: 4 });
  assert.deepEqual(wb.body, wa.body);
  assert.equal(wa.status, wb.status);
  // And the limits count both the same way.
  assert.deepEqual(await sendCode(s, OWNER, 'pin', { now: T0 + 5000 }), await sendCode(s, NOBODY, 'pin', { now: T0 + 5000 }));
}));

test('the bot trap: a filled hidden box gets the neutral answer and nothing else happens', quiet(async () => {
  const s = setup();
  const r = await call(s, '/api/phone-code/send', { phone: OWNER, purpose: 'pin', website: 'spam.example' });
  assert.deepEqual(r.body, { ok: true });
  assert.equal(s.sent.length, 0);
  assert.equal(s.rpcCalls.length, 0);
  assert.equal((await call(s, '/api/phone-code/send', { phone: '+1 415 555 0100', purpose: 'pin' })).body.error, 'BAD_PHONE');
  assert.equal((await call(s, '/api/phone-code/send', { phone: OWNER, purpose: 'admin' })).body.error, 'BAD_REQUEST');
}));

test('a right code: one use, gives a proof the gym server can check; the code itself is never stored', quiet(async () => {
  const s = setup();
  await sendCode(s, OWNER);
  const code = lastCode(s);
  const rows = s.WEB.sqlite.prepare('SELECT * FROM phone_codes').all();
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes(code));
  assert.ok(!JSON.stringify(rows).includes(OWNER));
  const ok = await verify(s, OWNER, code, 'pin', { now: T0 + 30_000 });
  assert.equal(ok.status, 200);
  const parts = ok.body.proof.split('.');
  assert.equal(parts.length, 6);
  assert.deepEqual(parts.slice(0, 3), ['v1', 'pin', OWNER]);
  assert.equal(Number(parts[3]), Math.floor((T0 + 30_000) / 1000) + 15 * 60);
  assert.equal(parts[5], await hmacHex(SECRET, parts.slice(0, 5).join('.')));
  assert.equal(ok.body.expiresAt, Number(parts[3]) * 1000);
  // Used once: the same code again is refused; a signup proof needs a signup code.
  assert.deepEqual((await verify(s, OWNER, code, 'pin', { now: T0 + 31_000 })).body, { error: 'WRONG_CODE', triesLeft: 0 });
  const again = await makeProof(SECRET, 'signup', OWNER, T0, '0'.repeat(32));
  assert.match(again.proof, /^v1\.signup\.9000000001\.\d{10}\.0{32}\.[0-9a-f]{64}$/);
}));

test('expiry: a code is dead after 10 minutes', quiet(async () => {
  const s = setup();
  await sendCode(s, OWNER, 'signup');
  const code = lastCode(s);
  assert.deepEqual((await verify(s, OWNER, code, 'signup', { now: T0 + CODE_MINUTES * 60_000 + 1 })).body, { error: 'WRONG_CODE', triesLeft: 0 });
  // Just inside the 10 minutes it still works.
  await sendCode(s, OWNER, 'signup', { now: T0 + 2 * 60_000 });
  assert.equal((await verify(s, OWNER, lastCode(s), 'signup', { now: T0 + 2 * 60_000 + CODE_MINUTES * 60_000 - 1 })).status, 200);
}));

test('5 wrong tries and the code dies, even the right one after', quiet(async () => {
  const s = setup();
  await sendCode(s, OWNER, 'signup');
  const code = lastCode(s);
  const wrong = code === '111111' ? '222222' : '111111';
  for (let left = 4; left >= 0; left--) assert.deepEqual((await verify(s, OWNER, wrong, 'signup')).body, { error: 'WRONG_CODE', triesLeft: left });
  assert.deepEqual((await verify(s, OWNER, code, 'signup')).body, { error: 'WRONG_CODE', triesLeft: 0 });
  // A new code replaces the old one; the old one never works again.
  await sendCode(s, OWNER, 'signup', { now: T0 + 61_000 });
  assert.equal((await verify(s, OWNER, code, 'signup', { now: T0 + 62_000 })).status, code === lastCode(s) ? 200 : 400);
}));

test('per-number limits through the route: 1 a minute, 3 an hour, 5 a day (sent or not)', quiet(async () => {
  const s = setup();
  assert.equal((await sendCode(s, OWNER, 'signup')).status, 200);
  const soon = await sendCode(s, OWNER, 'signup', { now: T0 + 10_000 });
  assert.equal(soon.status, 429);
  assert.deepEqual(soon.body, { error: 'TOO_SOON', retryAfter: 50 });
  assert.equal((await sendCode(s, OWNER, 'signup', { now: T0 + 61_000 })).status, 200);
  assert.equal((await sendCode(s, OWNER, 'signup', { now: T0 + 122_000 })).status, 200);
  assert.deepEqual((await sendCode(s, OWNER, 'signup', { now: T0 + 183_000 })).body, { error: 'TOO_MANY' });
  assert.equal(s.sent.length, 3);
  // Next hour: 2 more, then the day is full.
  const h = 3_600_000;
  assert.equal((await sendCode(s, OWNER, 'signup', { now: T0 + h + 1000 })).status, 200);
  assert.equal((await sendCode(s, OWNER, 'signup', { now: T0 + h + 62_000 })).status, 200);
  assert.deepEqual((await sendCode(s, OWNER, 'signup', { now: T0 + 2 * h + 200_000 })).body, { error: 'TOO_MANY' });
  assert.equal(s.sent.length, 5);
  // A day later the number may ask again.
  assert.equal((await sendCode(s, OWNER, 'signup', { now: T0 + 25 * h })).status, 200);
}));

test('per-address limit: 10 an hour from one network address, any numbers', quiet(async () => {
  const s = setup();
  for (let i = 0; i < 10; i++) assert.equal((await sendCode(s, `90000001${String(i).padStart(2, '0')}`, 'signup', { ip: '10.9.9.9' })).status, 200);
  assert.deepEqual((await sendCode(s, '9000000199', 'signup', { ip: '10.9.9.9' })).body, { error: 'TOO_MANY' });
  assert.equal((await sendCode(s, '9000000199', 'signup', { ip: '10.9.9.8' })).status, 200);
}));

test('the daily cap for everyone: sending stops, the screens hide it, and the log says so loudly', async () => {
  const s = setup({ PHONE_CODE_DAILY_CAP: '3' });
  const errors = [];
  const saved = [console.log, console.warn, console.error];
  console.log = console.warn = () => {};
  console.error = (...a) => errors.push(a.join(' '));
  try {
    for (let i = 0; i < 3; i++) assert.equal((await sendCode(s, `900000020${i}`, 'signup', { ip: `10.1.1.${i}` })).status, 200);
    const r = await sendCode(s, '9000000209', 'signup', { ip: '10.1.1.9' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'NOT_AVAILABLE');
    assert.equal(s.sent.length, 3);
    assert.ok(errors.some((e) => e.includes('DAILY CAP REACHED')));
    assert.deepEqual((await call(s, '/api/phone-code/status')).body, { available: false });
    // A new India day opens it again.
    const tomorrow = indiaDayStart(T0) + 24 * 3_600_000 + 1000;
    assert.equal(await isAvailable(s.env, tomorrow), true);
  } finally {
    [console.log, console.warn, console.error] = saved;
  }
  assert.equal(DEFAULT_DAILY_CAP, 200);
  assert.equal(indiaDayStart(Date.UTC(2026, 10, 6, 18, 31)), Date.UTC(2026, 10, 6, 18, 30));
});

test('a failed WhatsApp send: logged without the code or the token; signup hears SEND_FAILED, forgot PIN stays neutral', async () => {
  const s = setup();
  const logs = [];
  const saved = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = (...a) => logs.push(a.join(' '));
  const failing = async () => new Response(JSON.stringify({ error: { code: 133010, message: 'Account not registered' } }), { status: 400 });
  try {
    assert.deepEqual((await sendCode(s, OWNER, 'signup', { fetcher: failing })).body, { error: 'SEND_FAILED' });
    assert.deepEqual((await sendCode(s, OWNER, 'pin', { fetcher: failing, now: T0 + 61_000 })).body, { ok: true });
  } finally {
    [console.log, console.warn, console.error] = saved;
  }
  const text = logs.join('\n');
  assert.match(text, /send FAILED purpose=signup status=400 code=133010 message=Account not registered/);
  assert.ok(!text.includes('fake-token-never-real'));
  assert.ok(!text.includes(OWNER));
  // A failed send counts nothing against the daily cap.
  assert.equal(s.WEB.sqlite.prepare('SELECT COUNT(*) AS n FROM phone_code_asks WHERE sent = 1').get().n, 0);
});

test('clean-up: rows older than 2 days go', quiet(async () => {
  const s = setup();
  await sendCode(s, OWNER, 'signup');
  assert.equal(await deleteOldPhoneCodes(s.WEB, T0 + 24 * 3_600_000), 0);
  assert.equal(await deleteOldPhoneCodes(s.WEB, T0 + 49 * 3_600_000), 2);
}));
