// node --test deploy/panel. R-513 Join online, phase 1 (14 Nov 2026): the "Become a member" form's Worker side.
// Fake numbers only (90000 77xxx).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PER_DAY, checkSelfJoin, handleSelfJoin, serverAnswer } from './selfJoin.js';
import { sqliteD1 } from './sqliteD1.mjs';

const env = (WEB) => ({ WEB, FEEDBACK_SALT: 'salt' });
const post = (b, ip = '1.1.1.1') =>
  new Request('https://x/api/self-join', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b), headers: { 'CF-Connecting-IP': ip } });
const PROOF = `v1.join.9000077001.1999999999.${'a'.repeat(32)}.${'b'.repeat(64)}`;
const good = {
  code: 'qa0002',
  name: '  Ravi   Kumar ',
  proof: PROOF,
  gender: 'male',
  plan: 'plan-monthly',
  start: '2026-11-20',
  adult: true,
  health: true,
  lang: 'hi',
  website: '',
};
const OK = { status: 200, data: { ok: true, gymName: 'Shakti Gym', planName: 'Monthly', startsOn: '2026-11-20', totalP: 200000, linked: false } };

/** A fake gym server: records each call, answers `reply`. */
function fakeRpc(reply = OK) {
  const calls = [];
  const rpc = async (fn, args) => {
    calls.push({ fn, args });
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply(fn, args) : reply;
  };
  return { calls, rpc };
}

function quiet(fn) {
  return async () => {
    const { warn, error, log } = console;
    console.warn = () => {};
    console.error = () => {};
    console.log = () => {};
    try {
      await fn();
    } finally {
      Object.assign(console, { warn, error, log });
    }
  };
}

test('a good form: the code in capitals, a tidy name, the proof, a known gender and language', () => {
  assert.deepEqual(checkSelfJoin(good).value, {
    code: 'QA0002',
    name: 'Ravi Kumar',
    proof: PROOF,
    plan: 'plan-monthly',
    start: '2026-11-20',
    gender: 'male',
    lang: 'hi',
  });
  assert.equal(checkSelfJoin({ ...good, gender: '<b>' }).value.gender, null);
  assert.equal(checkSelfJoin({ ...good, gender: undefined }).value.gender, null);
  assert.equal(checkSelfJoin({ ...good, lang: 'fr' }).value.lang, 'en');
  assert.equal(checkSelfJoin({ ...good, name: 'रवि कुमार' }).value.name, 'रवि कुमार');
});

test('each refusal before the gym server: bad code, name, proof, plan, date, boxes not ticked; a bot', () => {
  assert.equal(checkSelfJoin({ ...good, code: 'QA00' }).error, 'NO_GYM');
  assert.equal(checkSelfJoin({ ...good, code: 'QA00<2' }).error, 'NO_GYM');
  assert.equal(checkSelfJoin({ ...good, name: ' 7 ' }).error, 'BAD_NAME');
  // No WhatsApp check done: no proof, or a proof for another purpose, is refused here.
  assert.equal(checkSelfJoin({ ...good, proof: '' }).error, 'BAD_PROOF');
  assert.equal(checkSelfJoin({ ...good, proof: PROOF.replace('v1.join.', 'v1.member.') }).error, 'BAD_PROOF');
  assert.equal(checkSelfJoin({ ...good, proof: undefined }).error, 'BAD_PROOF');
  assert.equal(checkSelfJoin({ ...good, plan: '' }).error, 'BAD_PLAN');
  assert.equal(checkSelfJoin({ ...good, plan: 'x'.repeat(65) }).error, 'BAD_PLAN');
  assert.equal(checkSelfJoin({ ...good, start: '20 Nov' }).error, 'BAD_DATE');
  // Under 18 (the first box not ticked) or the health box not ticked: never sent.
  assert.equal(checkSelfJoin({ ...good, adult: false }).error, 'NO_CONSENT');
  assert.equal(checkSelfJoin({ ...good, health: 'yes' }).error, 'NO_CONSENT');
  assert.equal(checkSelfJoin([]).error, 'BAD_REQUEST');
  assert.equal(checkSelfJoin(null).error, 'BAD_REQUEST');
  assert.deepEqual(checkSelfJoin({ ...good, website: 'spam.example' }), { bot: true });
});

test('the gym server’s answers become the page’s codes', () => {
  assert.deepEqual(serverAnswer(OK.data), {
    status: 201,
    body: { ok: true, gymName: 'Shakti Gym', planName: 'Monthly', startsOn: '2026-11-20', totalP: 200000, linked: false },
  });
  assert.deepEqual(serverAnswer({ ok: true }), { status: 201, body: { ok: true, linked: false } });
  assert.deepEqual(serverAnswer([{ error: 'MEMBER' }]), { status: 409, body: { error: 'MEMBER' } });
  assert.deepEqual(serverAnswer({ error: 'CLOSED' }), { status: 403, body: { error: 'CLOSED' } });
  assert.deepEqual(serverAnswer({ error: 'NO_GYM' }), { status: 404, body: { error: 'NO_GYM' } });
  assert.deepEqual(serverAnswer({ error: 'TOO_MANY' }), { status: 429, body: { error: 'TOO_MANY' } });
  for (const e of ['BAD_NAME', 'BAD_PROOF', 'BAD_PLAN', 'BAD_DATE', 'NO_CONSENT']) assert.deepEqual(serverAnswer({ error: e }), { status: 400, body: { error: e } });
  assert.deepEqual(serverAnswer({ error: 'WHO_KNOWS' }), { status: 503, body: { error: 'TRY_AGAIN' } });
  assert.deepEqual(serverAnswer(null), { status: 503, body: { error: 'TRY_AGAIN' } });
});

test('a good send reaches the gym server once, with the checked values only', quiet(async () => {
  const { calls, rpc } = fakeRpc();
  const r = await handleSelfJoin(post(good), env(sqliteD1()), rpc);
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { ok: true, gymName: 'Shakti Gym', planName: 'Monthly', startsOn: '2026-11-20', totalP: 200000, linked: false });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    fn: 'self_join_send',
    args: {
      p_code: 'QA0002',
      p_name: 'Ravi Kumar',
      p_proof: PROOF,
      p_gender: 'male',
      p_plan: 'plan-monthly',
      p_start: '2026-11-20',
      p_adult: true,
      p_health: true,
      p_lang: 'hi',
      p_website: null,
    },
  });
}));

test('a tampered price is never passed on: the total comes from the gym server', quiet(async () => {
  const { calls, rpc } = fakeRpc();
  const tampered = { ...good, priceP: 1, totalP: 1, joiningFeeP: 0, p_price: 1, price: '₹1' };
  const r = await handleSelfJoin(post(tampered), env(sqliteD1()), rpc);
  assert.equal(r.status, 201);
  assert.equal((await r.json()).totalP, 200000);
  const sent = JSON.stringify(calls[0].args);
  assert.doesNotMatch(sent, /price|total|fee/i);
  assert.deepEqual(Object.keys(calls[0].args).sort(), ['p_adult', 'p_code', 'p_gender', 'p_health', 'p_lang', 'p_name', 'p_plan', 'p_proof', 'p_start', 'p_website']);
}));

test('the hidden box: answered as sent, the gym server never asked', quiet(async () => {
  const { calls, rpc } = fakeRpc();
  const r = await handleSelfJoin(post({ ...good, website: 'http://spam' }), env(sqliteD1()), rpc);
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(calls.length, 0);
}));

test('the WhatsApp check not done, a bad code, boxes not ticked: refused here, nothing sent on', quiet(async () => {
  const { calls, rpc } = fakeRpc();
  const WEB = sqliteD1();
  const noProof = await handleSelfJoin(post({ ...good, proof: '' }), env(WEB), rpc);
  assert.equal(noProof.status, 400);
  assert.deepEqual(await noProof.json(), { error: 'BAD_PROOF' });
  const badCode = await handleSelfJoin(post({ ...good, code: 'NOPE' }), env(WEB), rpc);
  assert.equal(badCode.status, 404);
  assert.deepEqual(await badCode.json(), { error: 'NO_GYM' });
  const under18 = await handleSelfJoin(post({ ...good, adult: false }), env(WEB), rpc);
  assert.equal(under18.status, 400);
  assert.deepEqual(await under18.json(), { error: 'NO_CONSENT' });
  assert.equal(calls.length, 0);
  // Refusals before the server do not count against the address.
  assert.equal(WEB.sqlite.prepare('SELECT COUNT(*) AS n FROM friend_asks').get().n, 0);
}));

test('the gym server says: already a member, paused gym, unknown code, too many', quiet(async () => {
  const WEB = sqliteD1();
  for (const [error, status] of [['MEMBER', 409], ['CLOSED', 403], ['NO_GYM', 404], ['TOO_MANY', 429], ['BAD_PROOF', 400]]) {
    const { rpc } = fakeRpc({ status: 200, data: { error } });
    const r = await handleSelfJoin(post(good, `2.2.2.${status}`), env(WEB), rpc);
    assert.equal(r.status, status, error);
    assert.deepEqual(await r.json(), { error });
  }
}));

test(`${PER_DAY} sends a day from one network address, then TOO_MANY; another address is fine`, quiet(async () => {
  const WEB = sqliteD1();
  const { calls, rpc } = fakeRpc();
  for (let i = 0; i < PER_DAY; i++) assert.equal((await handleSelfJoin(post(good, '3.3.3.3'), env(WEB), rpc)).status, 201);
  const over = await handleSelfJoin(post(good, '3.3.3.3'), env(WEB), rpc);
  assert.equal(over.status, 429);
  assert.deepEqual(await over.json(), { error: 'TOO_MANY' });
  assert.equal(calls.length, PER_DAY);
  assert.equal((await handleSelfJoin(post(good, '4.4.4.4'), env(WEB), rpc)).status, 201);
  // Only a salted hash is kept, never the address; the friend page's own hashes are separate.
  const rows = WEB.sqlite.prepare('SELECT ip_hash FROM friend_asks').all();
  assert.ok(rows.every((x) => /^[0-9a-f]{24}$/.test(x.ip_hash) && !x.ip_hash.includes('3.3.3.3')));
}));

test('no D1 (or no salt): the send still goes, the gym server’s limits hold', quiet(async () => {
  const { calls, rpc } = fakeRpc();
  assert.equal((await handleSelfJoin(post(good), {}, rpc)).status, 201);
  assert.equal(calls.length, 1);
}));

test('a server without 0077 says NOT_READY; an outage says TRY_AGAIN; bad bodies are refused', quiet(async () => {
  const WEB = sqliteD1();
  const missing = fakeRpc({ status: 404, data: { code: 'PGRST202' } });
  const r1 = await handleSelfJoin(post(good, '5.5.5.1'), env(WEB), missing.rpc);
  assert.equal(r1.status, 503);
  assert.deepEqual(await r1.json(), { error: 'NOT_READY' });
  const down = fakeRpc(new Error('network'));
  const r2 = await handleSelfJoin(post(good, '5.5.5.2'), env(WEB), down.rpc);
  assert.deepEqual(await r2.json(), { error: 'TRY_AGAIN' });
  const broken = fakeRpc({ status: 500, data: { message: 'boom' } });
  assert.deepEqual(await (await handleSelfJoin(post(good, '5.5.5.3'), env(WEB), broken.rpc)).json(), { error: 'TRY_AGAIN' });
  const { calls, rpc } = fakeRpc();
  assert.equal((await handleSelfJoin(new Request('https://x/api/self-join'), env(WEB), rpc)).status, 405);
  assert.equal((await handleSelfJoin(post('not json'), env(WEB), rpc)).status, 400);
  assert.equal((await handleSelfJoin(post({ ...good, name: 'x'.repeat(4000) }), env(WEB), rpc)).status, 413);
  assert.equal(calls.length, 0);
}));
