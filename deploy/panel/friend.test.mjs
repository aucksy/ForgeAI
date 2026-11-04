// node --test deploy/panel. F147 Bring a friend (4 Nov 2026): the friend invite page's form.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PER_DAY, checkFriend, deleteOldFriendAsks, handleFriend, serverAnswer } from './friend.js';
import { sqliteD1 } from './sqliteD1.mjs';

const env = (WEB) => ({ WEB, FEEDBACK_SALT: 'salt' });
const post = (b, ip = '1.1.1.1') => new Request('https://x/api/friend', { method: 'POST', body: JSON.stringify(b), headers: { 'CF-Connecting-IP': ip } });
const good = { code: 'abcd2345', name: '  Ravi   Kumar ', phone: '+91 98290 12345', time: 'evening', website: '' };

/** A fake gym server: records each call, answers `reply`. */
function fakeRpc(reply = { status: 200, data: { ok: true } }) {
  const calls = [];
  const rpc = async (fn, args) => {
    calls.push({ fn, args });
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { calls, rpc };
}

function quiet(fn) {
  return async () => {
    const warn = console.warn;
    const error = console.error;
    console.warn = () => {};
    console.error = () => {};
    try {
      await fn();
    } finally {
      console.warn = warn;
      console.error = error;
    }
  };
}

test('a good form: the code in capitals, a tidy name, 10 digits, a known time', () => {
  assert.deepEqual(checkFriend(good).value, { code: 'ABCD2345', name: 'Ravi Kumar', phone: '9829012345', time: 'evening' });
  assert.equal(checkFriend({ ...good, time: '<b>' }).value.time, 'any');
  assert.equal(checkFriend({ ...good, phone: '12345' }).error, 'BAD_PHONE');
  assert.equal(checkFriend({ ...good, phone: '1234567890' }).error, 'BAD_PHONE');
  assert.equal(checkFriend({ ...good, name: ' 7 ' }).error, 'BAD_NAME');
  assert.equal(checkFriend({ ...good, name: 'रवि' }).value.name, 'रवि');
  // 0, O, 1 and I are never in a code.
  assert.equal(checkFriend({ ...good, code: 'ABCD0123' }).error, 'NO_INVITE');
  assert.equal(checkFriend([]).error, 'BAD_REQUEST');
  assert.deepEqual(checkFriend({ ...good, website: 'spam.example' }), { bot: true });
});

test('the gym server’s answers become the page’s codes', () => {
  assert.deepEqual(serverAnswer({ ok: true }), { status: 201, body: { ok: true } });
  assert.deepEqual(serverAnswer([{ error: 'TOO_MANY' }]), { status: 429, body: { error: 'TOO_MANY' } });
  assert.deepEqual(serverAnswer({ error: 'NO_INVITE' }), { status: 404, body: { error: 'NO_INVITE' } });
  assert.deepEqual(serverAnswer({ error: 'BAD_PHONE' }), { status: 400, body: { error: 'BAD_PHONE' } });
  assert.deepEqual(serverAnswer(null), { status: 503, body: { error: 'TRY_AGAIN' } });
});

test('a good send reaches the gym server once, with the checked values and no hidden box', quiet(async () => {
  const WEB = sqliteD1();
  const s = fakeRpc();
  const res = await handleFriend(post(good), env(WEB), s.rpc);
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true });
  assert.deepEqual(s.calls, [{ fn: 'friend_invite_send', args: { p_code: 'ABCD2345', p_name: 'Ravi Kumar', p_phone: '9829012345', p_time: 'evening', p_website: null } }]);
  // Only when and a hash of the address are kept here: never the name or the number.
  const rows = WEB.sqlite.prepare('SELECT * FROM friend_asks').all();
  assert.equal(rows.length, 1);
  assert.doesNotMatch(JSON.stringify(rows), /9829012345|Ravi|1\.1\.1\.1/);
}));

test('a bot is answered as sent and nothing reaches the gym', quiet(async () => {
  const s = fakeRpc();
  const res = await handleFriend(post({ ...good, website: 'x' }), env(sqliteD1()), s.rpc);
  assert.equal(res.status, 201);
  assert.equal(s.calls.length, 0);
}));

test(`at most ${PER_DAY} sends a day from one address; another address still sends`, quiet(async () => {
  const WEB = sqliteD1();
  const s = fakeRpc();
  const now = new Date('2026-11-04T10:00:00Z');
  for (let i = 0; i < PER_DAY; i += 1) assert.equal((await handleFriend(post(good), env(WEB), s.rpc, now)).status, 201);
  const sixth = await handleFriend(post(good), env(WEB), s.rpc, now);
  assert.equal(sixth.status, 429);
  assert.deepEqual(await sixth.json(), { error: 'TOO_MANY' });
  assert.equal((await handleFriend(post(good, '2.2.2.2'), env(WEB), s.rpc, now)).status, 201);
  assert.equal(s.calls.length, PER_DAY + 1);
  // Two days later the old counts are cleaned away.
  assert.equal(await deleteOldFriendAsks(WEB, new Date('2026-11-06T11:00:00Z')), PER_DAY + 1);
}));

test('without the D1 table the send still goes (the gym server keeps its own limits)', quiet(async () => {
  const s = fakeRpc();
  const broken = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('no such table: friend_asks'); }, run: async () => ({}) }) }) };
  assert.equal((await handleFriend(post(good), env(broken), s.rpc)).status, 201);
  assert.equal((await handleFriend(post(good), {}, s.rpc)).status, 201);
  assert.equal(s.calls.length, 2);
}));

test('refusals: wrong method, bad JSON, a bad number never reach the gym', quiet(async () => {
  const s = fakeRpc();
  assert.equal((await handleFriend(new Request('https://x/api/friend'), env(sqliteD1()), s.rpc)).status, 405);
  assert.equal((await handleFriend(new Request('https://x/api/friend', { method: 'POST', body: '{' }), env(sqliteD1()), s.rpc)).status, 400);
  const bad = await handleFriend(post({ ...good, phone: '555' }), env(sqliteD1()), s.rpc);
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'BAD_PHONE' });
  assert.equal(s.calls.length, 0);
}));

test('a gym server without 0056, or out of reach, says so', quiet(async () => {
  const missing = fakeRpc({ status: 404, data: { code: 'PGRST202', message: 'Could not find the function' } });
  const res = await handleFriend(post(good), env(sqliteD1()), missing.rpc);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'NOT_READY' });
  const down = fakeRpc(new Error('fetch failed'));
  const r2 = await handleFriend(post(good, '3.3.3.3'), env(sqliteD1()), down.rpc);
  assert.equal(r2.status, 503);
  assert.deepEqual(await r2.json(), { error: 'TRY_AGAIN' });
  const tooMany = fakeRpc({ status: 200, data: { error: 'TOO_MANY' } });
  assert.equal((await handleFriend(post(good, '4.4.4.4'), env(sqliteD1()), tooMany.rpc)).status, 429);
}));
