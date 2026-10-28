// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). #34 crash reports, 28 Oct 2026.
// Runs the real SQL against a real SQLite built from ./migrations (sqliteD1.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CRASH_PER_DAY, MAX_MESSAGE, checkCrash, crashShape, crashSignature, handleCrash, scrub } from './crash.js';
import { handleFeedback } from './feedback.js';
import { sqliteD1 } from './sqliteD1.mjs';

const post = (body, ip = '1.2.3.4') =>
  new Request('https://x/api/crash', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'CF-Connecting-IP': ip } });
const env = () => ({ WEB: sqliteD1(), FEEDBACK_SALT: 'test-salt' });
const rows = (WEB) => WEB.sqlite.prepare('SELECT * FROM feedback ORDER BY id').all();

const STACK = 'TypeError: x is undefined\n    at Today (https://app.mettleup.fit/assets/index-AbC123xY.js:12:3456)\n    at render (https://app.mettleup.fit/assets/react-Zz99kk11.js:1:2)';

test('scrub takes out emails, phone numbers, long numbers and keys', () => {
  const s = scrub('rahul@gmail.com called +91 98290 12345, key sb_secret_abcdefghijklmnopqrst, jwt eyJabc.def.ghi');
  assert.ok(!s.includes('rahul'));
  assert.ok(!s.includes('98290'));
  assert.ok(!s.includes('sb_secret'));
  assert.ok(!s.includes('eyJabc'));
  assert.match(s, /\[email\].*\[n\].*\[key\].*\[token\]/);
});

test('scrub keeps a stack frame line and column (the only clue in a one-line bundle)', () => {
  const s = scrub('at anonymous (index.android.bundle:1:1234567)\n    at f (https://app.mettleup.fit/assets/index-AbC.js:12:345678)');
  assert.ok(s.includes('bundle:1:1234567'));
  assert.ok(s.includes('.js:12:345678'));
  assert.ok(!scrub('call me on 9829012345').includes('9829012345'));
});

test('the same crash in another build (new file hashes, line numbers) has the same signature', async () => {
  const other = STACK.replace('index-AbC123xY', 'index-QQ77pp00').replace(':12:3456', ':14:9');
  assert.equal(await crashSignature('admin', 'x is undefined', STACK), await crashSignature('admin', 'x is undefined', other));
  assert.notEqual(await crashSignature('admin', 'x is undefined', STACK), await crashSignature('member', 'x is undefined', STACK));
  assert.match(await crashSignature('admin', 'y', STACK), /^[0-9a-f]{12}$/);
  assert.ok(!crashShape('admin', 'Cannot read "Rahul"', STACK).includes('Rahul'));
});

test('checks the report: app, message, short stack, safe screen and version', () => {
  assert.equal(checkCrash({ source: 'phone', message: 'x' }).error, 'Unknown app.');
  assert.equal(checkCrash({ source: 'admin', message: ' ' }).error, 'No message.');
  const v = checkCrash({ source: 'member', message: 'm'.repeat(999), stack: 'a\n'.repeat(50), app: '0.59.0', screen: '/(tabs)/workout<script>' }).value;
  assert.equal(v.message.length, MAX_MESSAGE);
  assert.equal(v.stack.split('\n').length, 12);
  assert.equal(v.app, '0.59.0');
  assert.equal(v.screen, '/(tabs)/workoutscript');
  assert.equal(checkCrash({ source: 'admin', message: 'x', app: 'DROP TABLE;' }).value.app, '');
});

test('saves a crash as a crash row with its signature; the same crash from one address counts once a day', async () => {
  const e = env();
  const res = await handleCrash(post({ source: 'admin', message: 'x is undefined', stack: STACK, app: '2026-10-28', screen: '/members', fatal: true }), e);
  assert.equal(res.status, 201);
  const [r] = rows(e.WEB);
  assert.equal(r.status, 'crash');
  assert.match(r.note, /^sig:[0-9a-f]{12}$/);
  assert.match(r.text, /^\[fatal\] x is undefined\n\nTypeError/);
  assert.equal(r.gym, '');
  assert.equal(r.sender, '');
  assert.ok(!JSON.stringify(r).includes('1.2.3.4'));
  const again = await handleCrash(post({ source: 'admin', message: 'x is undefined', stack: STACK }), e);
  assert.equal(again.status, 200);
  assert.equal(rows(e.WEB).length, 1);
  assert.equal((await handleCrash(post({ source: 'admin', message: 'x is undefined', stack: STACK }, '5.6.7.8'), e)).status, 201);
});

test(`refuses the ${CRASH_PER_DAY + 1}th different crash from one address in a day`, async () => {
  const e = env();
  for (let i = 0; i < CRASH_PER_DAY; i++) assert.equal((await handleCrash(post({ source: 'member', message: `bad thing ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}` }), e)).status, 201);
  assert.equal((await handleCrash(post({ source: 'member', message: 'one more kind' }), e)).status, 429);
});

test('crash rows never use up the feedback limits', async () => {
  const e = env();
  for (let i = 0; i < 25; i++) {
    e.WEB.sqlite
      .prepare("INSERT INTO feedback (at, source, text, ip_hash, status, note) VALUES (?, 'member', 'x', 'h', 'crash', ?)")
      .run(new Date().toISOString(), `sig:${i}`);
  }
  const res = await handleFeedback(
    new Request('https://x/api/feedback', { method: 'POST', body: JSON.stringify({ source: 'member', text: 'hello' }), headers: { 'CF-Connecting-IP': '1.2.3.4' } }),
    e,
  );
  assert.equal(res.status, 201);
});

test('plain answers for bad input, a wrong method, no database, a database failure, too long', async () => {
  const e = env();
  assert.equal((await handleCrash(post('not json'), e)).status, 400);
  assert.equal((await handleCrash(new Request('https://x/api/crash'), e)).status, 405);
  assert.equal((await handleCrash(post({ source: 'admin', message: 'x' }), {})).status, 503);
  const broken = { WEB: { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('db down'); } }) }) }, FEEDBACK_SALT: 's' };
  const origError = console.error;
  console.error = () => {};
  try {
    assert.equal((await handleCrash(post({ source: 'admin', message: 'x' }), broken)).status, 503);
  } finally {
    console.error = origError;
  }
  assert.equal((await handleCrash(post('x'.repeat(20000)), e)).status, 413);
  assert.equal(rows(e.WEB).length, 0);
});
