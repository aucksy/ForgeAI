// node --test deploy/hq  (CI: ci.yml "HQ Worker tests"). The phone pop-up sender (push.js, R-153 step 2).
// Google, Firebase and the gym server are stand-ins: nothing leaves this machine.
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { test, beforeEach } from 'node:test';

import {
  CHANNEL_ID,
  accessToken,
  fcmHelpReplyMessage,
  fcmMessage,
  fcmNoteMessage,
  fcmOutcome,
  HELP_ROUTE,
  sendOne,
  forgetAccessToken,
  handlePushKick,
  line,
  readServiceAccount,
  resetKick,
  resetPushWarnings,
  runPush,
  signedJwt,
} from './push.js';
import { BILLING_CRON, cronJob, NIGHTLY_CRON } from './worker.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const SA = { type: 'service_account', project_id: 'forgeai-d7eea', client_email: 'push@forgeai-d7eea.iam.gserviceaccount.com', private_key: PEM, token_uri: 'https://oauth2.googleapis.com/token' };
const ENV = { FCM_SERVICE_ACCOUNT: JSON.stringify(SA), SUPABASE_URL: 'https://db.test', SUPABASE_HQ_KEY: 'hq-key' };

const PAGE = { jobId: 'j1', kind: 'message', refId: '11111111-1111-1111-1111-111111111111', gymId: 'g1', gymName: 'Iron Den', title: 'Closed on Sunday', body: 'Diwali', msgKind: 'closed', last: true };

beforeEach(() => {
  forgetAccessToken();
  resetPushWarnings();
  resetKick();
});

/** A stand-in for fetch: Google's token, the gym server's two functions, and FCM. */
function fakeNet({ pages = [PAGE], fcm = () => ({ status: 200, body: '{"name":"x"}' }), google = { status: 200, body: { access_token: 'at-1', expires_in: 3599 } }, next = null, notes = [], direct = null } = {}) {
  const calls = { google: 0, next: [], drop: [], fcm: [], direct: [] };
  const queue = pages.map((p) => ({ ...p }));
  const noteQueue = notes.map((p) => ({ ...p }));
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://oauth2.googleapis.com/')) {
      calls.google += 1;
      return new Response(JSON.stringify(google.body), { status: google.status });
    }
    if (u === 'https://db.test/rest/v1/rpc/hq_push_next') {
      assert.equal(init.headers.apikey, 'hq-key');
      calls.next.push(JSON.parse(init.body));
      if (next) return next(JSON.parse(init.body).p_max);
      const p = queue.shift();
      return new Response(p ? JSON.stringify(p) : 'null', { status: 200 });
    }
    if (u === 'https://db.test/rest/v1/rpc/hq_push_direct_next') {
      calls.direct.push(JSON.parse(init.body));
      if (direct) return direct(JSON.parse(init.body).p_max);
      return new Response(JSON.stringify(noteQueue.shift() || { notes: [] }), { status: 200 });
    }
    if (u === 'https://db.test/rest/v1/rpc/hq_push_drop') {
      calls.drop.push(JSON.parse(init.body).p_tokens);
      return new Response('1', { status: 200 });
    }
    if (u.startsWith('https://fcm.googleapis.com/v1/projects/forgeai-d7eea/messages:send')) {
      assert.equal(init.headers.Authorization, 'Bearer at-1');
      const msg = JSON.parse(init.body);
      calls.fcm.push(msg);
      const r = fcm(msg.message.token);
      return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status });
    }
    throw new Error(`unexpected call ${u}`);
  };
  return { fetchImpl, calls };
}

test('readServiceAccount takes a real key file and refuses anything else', () => {
  assert.equal(readServiceAccount(JSON.stringify(SA)).project, 'forgeai-d7eea');
  assert.equal(readServiceAccount(''), null);
  assert.equal(readServiceAccount('not json'), null);
  assert.equal(readServiceAccount(JSON.stringify({ ...SA, private_key: 'x' })), null);
  assert.equal(readServiceAccount(JSON.stringify({ ...SA, client_email: 'nobody' })), null);
});

test('the JWT is RS256, for the FCM scope, and verifies with the public key', async () => {
  const sa = readServiceAccount(JSON.stringify(SA));
  const jwt = await signedJwt(sa, 1_800_000_000);
  const [h, c, s] = jwt.split('.');
  const dec = (x) => JSON.parse(Buffer.from(x, 'base64url').toString());
  assert.deepEqual(dec(h), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(dec(c), { iss: SA.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: SA.token_uri, iat: 1_800_000_000, exp: 1_800_003_600 });
  const v = createVerify('RSA-SHA256');
  v.update(`${h}.${c}`);
  assert.ok(v.verify(publicKey, Buffer.from(s, 'base64url')));
});

test('the access token is kept about 55 minutes, then fetched again', async () => {
  const sa = readServiceAccount(JSON.stringify(SA));
  const { fetchImpl, calls } = fakeNet();
  const t0 = 1_800_000_000_000;
  assert.deepEqual(await accessToken(sa, { fetchImpl, now: t0 }), { token: 'at-1', fetched: true });
  assert.deepEqual(await accessToken(sa, { fetchImpl, now: t0 + 54 * 60_000 }), { token: 'at-1', fetched: false });
  await accessToken(sa, { fetchImpl, now: t0 + 56 * 60_000 });
  assert.equal(calls.google, 2);
});

test('a message is data-only, on the gym channel, under the tag the phone check uses', () => {
  const m = fcmMessage(PAGE, 'tok-1').message;
  assert.equal(m.token, 'tok-1');
  assert.equal(m.notification, undefined);
  assert.equal(m.android.priority, 'HIGH');
  assert.equal(m.data.title, 'Iron Den');
  assert.equal(m.data.message, 'Closed on Sunday');
  assert.equal(m.data.channelId, CHANNEL_ID);
  assert.equal(m.data.tag, `gym-notice-${PAGE.refId}`);
  assert.deepEqual(JSON.parse(m.data.body), { kind: 'gym-message', route: '/shop/inbox', push: 'message', noticeId: PAGE.refId, gymId: 'g1' });
  for (const v of Object.values(m.data)) assert.equal(typeof v, 'string');
  const o = fcmMessage({ ...PAGE, kind: 'offer', title: 'Log 10 workouts, get 3 days', gymName: '' }, 't').message;
  assert.equal(o.data.title, 'Your gym');
  assert.equal(o.data.message, 'New offer: Log 10 workouts, get 3 days');
  assert.equal(o.data.tag, `gym-offer-${PAGE.refId}`);
  assert.equal(JSON.parse(o.data.body).route, '/shop');
});

test("a trainer's reply (0053) opens the Ask a trainer page and says who replied", () => {
  const page = { ...PAGE, kind: 'trainer_reply', title: 'Rohit', body: 'Keep your chest up.\nAnd push your knees out.', msgKind: 'trainer_reply' };
  const m = fcmMessage(page, 'tok-1').message;
  assert.equal(m.data.title, 'Iron Den');
  assert.equal(m.data.message, 'Rohit replied: Keep your chest up.');
  assert.equal(m.data.tag, `trainer-reply-${PAGE.refId}`);
  assert.equal(m.data.channelId, CHANNEL_ID);
  assert.deepEqual(JSON.parse(m.data.body), { kind: 'gym-message', route: '/shop/ask', push: 'reply', noticeId: PAGE.refId, gymId: 'g1' });
  for (const v of Object.values(m.data)) assert.equal(typeof v, 'string');
  assert.equal(fcmMessage({ ...page, title: '' }, 't').message.data.message, 'Your trainer replied: Keep your chest up.');
});

test('line keeps the first line and cuts a long one', () => {
  assert.equal(line('\n  Gym  closed \nsecond'), 'Gym closed');
  const long = line('x'.repeat(300));
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('…'));
});

test('fcmOutcome: only a bad address is dead, never a bad message', () => {
  assert.equal(fcmOutcome(200, '{}'), 'sent');
  assert.equal(fcmOutcome(404, JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } })), 'dead');
  assert.equal(fcmOutcome(400, JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } })), 'dead');
  assert.equal(fcmOutcome(400, JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received.' } })), 'retry');
  assert.equal(fcmOutcome(403, JSON.stringify({ error: { details: [{ errorCode: 'SENDER_ID_MISMATCH' }] } })), 'dead');
  assert.equal(fcmOutcome(401, '{}'), 'auth');
  assert.equal(fcmOutcome(503, 'oops'), 'retry');
  assert.equal(fcmOutcome(429, ''), 'retry');
});

test('no secret: nothing is asked, nothing is sent, one calm log line', async () => {
  const { fetchImpl, calls } = fakeNet();
  const warn = console.warn;
  const lines = [];
  console.warn = (...a) => lines.push(a.join(' '));
  try {
    assert.deepEqual(await runPush({ ...ENV, FCM_SERVICE_ACCOUNT: '' }, { fetchImpl }), { skipped: 'no-secret' });
    assert.deepEqual(await runPush({ ...ENV, FCM_SERVICE_ACCOUNT: '' }, { fetchImpl }), { skipped: 'no-secret' });
    assert.deepEqual(await runPush({ ...ENV, FCM_SERVICE_ACCOUNT: '{"x":1}' }, { fetchImpl }), { skipped: 'bad-secret' });
  } finally {
    console.warn = warn;
  }
  assert.equal(calls.google + calls.next.length + calls.fcm.length, 0);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /FCM_SERVICE_ACCOUNT is not set/);
});

test('Google refuses the key: nothing is claimed from the gym server', async () => {
  const { fetchImpl, calls } = fakeNet({ google: { status: 400, body: { error: 'invalid_grant' } } });
  const err = console.error;
  console.error = () => undefined;
  try {
    assert.deepEqual(await runPush(ENV, { fetchImpl }), { skipped: 'google' });
  } finally {
    console.error = err;
  }
  assert.equal(calls.next.length, 0);
});

test('migration 0038 not applied: stops calmly', async () => {
  const { fetchImpl } = fakeNet({ next: () => new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }), { status: 404 }) });
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    assert.deepEqual(await runPush(ENV, { fetchImpl }), { skipped: 'not-ready' });
  } finally {
    console.warn = warn;
  }
});

test('sends one message per phone, deletes dead addresses, keeps going till nothing is due', async () => {
  const pages = [
    { ...PAGE, tokens: ['a', 'b', 'gone'] },
    { ...PAGE, kind: 'offer', refId: '22222222-2222-2222-2222-222222222222', title: 'Offer', tokens: ['a'] },
  ];
  const { fetchImpl, calls } = fakeNet({
    pages,
    fcm: (t) => (t === 'gone' ? { status: 404, body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } } : { status: 200, body: '{}' }),
  });
  const log = console.log;
  console.log = () => undefined;
  let out;
  try {
    out = await runPush(ENV, { fetchImpl });
  } finally {
    console.log = log;
  }
  assert.deepEqual(out, { jobs: 2, sent: 3, dead: 1, failed: 0, left: false });
  assert.equal(calls.fcm.length, 4);
  assert.deepEqual(calls.drop, [['gone']]);
  assert.equal(calls.next.length, 3); // two pages, then "nothing due"
  assert.equal(calls.fcm[3].message.data.tag, 'gym-offer-22222222-2222-2222-2222-222222222222');
});

test('stays inside the free plan: at most PUSH_SUBREQUESTS calls in one run', async () => {
  const many = Array.from({ length: 200 }, (_, i) => `t${i}`);
  let served = 0;
  const { fetchImpl, calls } = fakeNet({
    next: (max) => {
      const take = many.slice(served, served + max);
      served += take.length;
      return new Response(JSON.stringify({ ...PAGE, tokens: take }), { status: 200 });
    },
  });
  const log = console.log;
  console.log = () => undefined;
  let out;
  try {
    out = await runPush({ ...ENV, PUSH_SUBREQUESTS: '45' }, { fetchImpl });
  } finally {
    console.log = log;
  }
  const total = calls.google + calls.next.length + calls.drop.length + calls.fcm.length;
  assert.ok(total <= 45, `made ${total} calls`);
  assert.equal(calls.next[0].p_max, 42); // 45 - Google's token - ask - drop
  assert.equal(out.left, true);
});

test('Firebase refuses our token: the run stops and the token is fetched fresh next time', async () => {
  const { fetchImpl, calls } = fakeNet({ pages: [{ ...PAGE, tokens: ['a', 'b'] }, { ...PAGE, tokens: ['c'] }], fcm: () => ({ status: 401, body: '{}' }) });
  const err = console.error;
  const log = console.log;
  console.error = () => undefined;
  console.log = () => undefined;
  try {
    const out = await runPush(ENV, { fetchImpl });
    assert.equal(out.failed, 2);
    assert.equal(calls.next.length, 1);
    await runPush(ENV, { fetchImpl });
  } finally {
    console.error = err;
    console.log = log;
  }
  assert.equal(calls.google, 2);
});

test('POST /push/run answers at once and runs at most once every 3 seconds', async () => {
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  const env = { ...ENV, FCM_SERVICE_ACCOUNT: '' };
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    let now = 10_000;
    assert.equal(handlePushKick(new Request('https://hq.test/push/run', { method: 'POST' }), env, ctx, { now: () => now }).status, 202);
    now = 11_000;
    assert.equal(handlePushKick(new Request('https://hq.test/push/run', { method: 'POST' }), env, ctx, { now: () => now }).status, 202);
    now = 13_500;
    handlePushKick(new Request('https://hq.test/push/run', { method: 'POST' }), env, ctx, { now: () => now });
    assert.equal(handlePushKick(new Request('https://hq.test/push/run'), env, ctx).status, 404);
    await Promise.all(waits);
  } finally {
    console.warn = warn;
  }
  assert.equal(waits.length, 2);
});

// ------------------------------------------------------------------ R-319 item 8: member notes (0054)
const NOTE = { noteId: '33333333-3333-3333-3333-333333333333', kind: 'order', refId: 'o1', gymId: 'g1', gymName: 'Iron Den', line: 'Your order 12 is ready. Collect it at the desk.', route: '/shop/orders', tokens: ['a'] };

test('a member note pops up on the same channel and a tap opens its own page', () => {
  const m = fcmNoteMessage(NOTE, 'tok-1').message;
  assert.equal(m.token, 'tok-1');
  assert.equal(m.data.title, 'Iron Den');
  assert.equal(m.data.message, NOTE.line);
  assert.equal(m.data.channelId, CHANNEL_ID);
  assert.equal(m.data.tag, `gym-order-${NOTE.noteId}`);
  assert.deepEqual(JSON.parse(m.data.body), { kind: 'gym-message', route: '/shop/orders', push: 'order', noteId: NOTE.noteId, gymId: 'g1' });
  // A route that is not an app path never reaches the phone.
  assert.equal(JSON.parse(fcmNoteMessage({ ...NOTE, route: 'https://evil.test' }, 't').message.data.body).route, '/shop');
});

test('a help reply pop-up opens Help and feedback', () => {
  const m = fcmHelpReplyMessage(42, 'tok-9').message;
  assert.equal(m.data.title, 'MettleUp');
  assert.equal(m.data.tag, 'help-reply-42');
  assert.deepEqual(JSON.parse(m.data.body), { kind: 'gym-message', route: HELP_ROUTE, push: 'help_reply', noteId: '42' });
});

test('after the messages, each member note goes to that member\'s phones; dead ones are deleted', async () => {
  const { fetchImpl, calls } = fakeNet({
    pages: [],
    notes: [{ notes: [NOTE, { ...NOTE, noteId: '44444444-4444-4444-4444-444444444444', kind: 'plan_request', route: '/shop', tokens: ['b', 'gone'] }] }],
    fcm: (t) => (t === 'gone' ? { status: 404, body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } } : { status: 200, body: '{}' }),
  });
  const log = console.log;
  console.log = () => undefined;
  let out;
  try {
    out = await runPush(ENV, { fetchImpl });
  } finally {
    console.log = log;
  }
  assert.deepEqual(out, { jobs: 0, sent: 2, dead: 1, failed: 0, left: false, notes: 2 });
  assert.equal(calls.fcm.length, 3);
  assert.deepEqual(calls.drop, [['gone']]);
  assert.equal(calls.direct.length, 2); // the notes, then "nothing waiting"
  assert.equal(calls.fcm[1].message.data.tag, 'gym-plan_request-44444444-4444-4444-4444-444444444444');
});

test('before migration 0054 the member notes are skipped quietly; messages still go', async () => {
  const { fetchImpl, calls } = fakeNet({ pages: [{ ...PAGE, tokens: ['a'] }], direct: () => new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }), { status: 404 }) });
  const log = console.log;
  const warn = console.warn;
  console.log = () => undefined;
  console.warn = () => undefined;
  let out;
  try {
    out = await runPush(ENV, { fetchImpl });
  } finally {
    console.log = log;
    console.warn = warn;
  }
  assert.deepEqual(out, { jobs: 1, sent: 1, dead: 0, failed: 0, left: false });
  assert.equal(calls.direct.length, 1);
});

test('sendOne sends one pop-up now, and says when there is no key', async () => {
  const { fetchImpl, calls } = fakeNet();
  assert.equal(await sendOne(ENV, fcmHelpReplyMessage(7, 'tok-7'), { fetchImpl }), 'sent');
  assert.equal(calls.fcm[0].message.token, 'tok-7');
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    assert.equal(await sendOne({ ...ENV, FCM_SERVICE_ACCOUNT: '' }, fcmHelpReplyMessage(7, 'x'), { fetchImpl }), 'no-secret');
  } finally {
    console.warn = warn;
  }
});

test('the nightly cron still runs the clean-up; the minute one sends pop-ups', () => {
  assert.equal(cronJob(NIGHTLY_CRON), 'nightly');
  assert.equal(cronJob('* * * * *'), 'push');
  assert.equal(cronJob(BILLING_CRON), 'billing');
});
