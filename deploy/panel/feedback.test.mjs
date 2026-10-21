// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). Launch H7, 21 Oct 2026.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ALL_PER_DAY, MAX_TEXT, PER_DAY, checkFeedback, handleFeedback } from './feedback.js';

/** A tiny D1 stand-in: the two statements feedback.js uses. */
function fakeD1({ fail = false } = {}) {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (fail) throw new Error('db down');
              const [ip, sender, since] = args;
              const day = rows.filter((r) => r.at > since);
              return { n: day.length, ip: day.filter((r) => r.ip_hash === ip).length, me: day.filter((r) => r.sender && r.sender === sender).length };
            },
            async run() {
              if (fail) throw new Error('db down');
              assert.match(sql, /^INSERT INTO feedback/);
              const [at, source, text, app, device, screen, gym, sender, ip_hash] = args;
              rows.push({ at, source, text, app, device, screen, gym, sender, ip_hash });
            },
          };
        },
      };
    },
  };
}

const post = (body, ip = '1.2.3.4') =>
  new Request('https://x/api/feedback', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'CF-Connecting-IP': ip } });

test('checks the message: text, app, short fields, gym code, sender id', () => {
  assert.equal(checkFeedback({ source: 'member', text: '  ' }).error, 'Write something first.');
  assert.equal(checkFeedback({ source: 'phone', text: 'hi' }).error, 'Unknown app.');
  assert.ok(checkFeedback({ source: 'member', text: 'x'.repeat(MAX_TEXT + 1) }).error);
  const v = checkFeedback({ source: 'admin', text: ' Rest timer is slow ', gym: 'forge1', sender: 'abc', device: 'd'.repeat(500) }).value;
  assert.equal(v.text, 'Rest timer is slow');
  assert.equal(v.gym, 'FORGE1');
  assert.equal(v.sender, ''); // too short to be an install id
  assert.equal(v.device.length, 120);
  assert.equal(checkFeedback({ source: 'member', text: 'x', gym: 'DROP TABLE' }).value.gym, '');
});

test('saves a good message with a hashed address, never the address itself', async () => {
  const WEB = fakeD1();
  const res = await handleFeedback(post({ source: 'member', text: 'Love it', app: '0.50.0', sender: 'install-12345678' }), { WEB, FEEDBACK_SALT: 'test-salt' });
  assert.equal(res.status, 201);
  assert.equal(WEB.rows.length, 1);
  assert.equal(WEB.rows[0].text, 'Love it');
  assert.match(WEB.rows[0].ip_hash, /^[0-9a-f]{24}$/);
  assert.ok(!JSON.stringify(WEB.rows).includes('1.2.3.4'));
});

test(`refuses the ${PER_DAY + 1}th message from one address in a day, not from another`, async () => {
  const WEB = fakeD1();
  for (let i = 0; i < PER_DAY; i++) assert.equal((await handleFeedback(post({ source: 'member', text: `m${i}` }), { WEB, FEEDBACK_SALT: 'test-salt' })).status, 201);
  assert.equal((await handleFeedback(post({ source: 'member', text: 'one more' }), { WEB, FEEDBACK_SALT: 'test-salt' })).status, 429);
  assert.equal((await handleFeedback(post({ source: 'member', text: 'other phone' }, '5.6.7.8'), { WEB, FEEDBACK_SALT: 'test-salt' })).status, 201);
});

test('plain answers for bad input, a wrong method, no database, a database failure', async () => {
  const WEB = fakeD1();
  assert.equal((await handleFeedback(post('not json'), { WEB, FEEDBACK_SALT: 'test-salt' })).status, 400);
  assert.equal((await handleFeedback(new Request('https://x/api/feedback'), { WEB, FEEDBACK_SALT: 'test-salt' })).status, 405);
  assert.equal((await handleFeedback(post({ source: 'member', text: 'x' }), {})).status, 503);
  assert.equal((await handleFeedback(post({ source: 'member', text: 'x' }), { WEB: fakeD1({ fail: true }), FEEDBACK_SALT: 'test-salt' })).status, 503);
  assert.equal((await handleFeedback(post('x'.repeat(MAX_TEXT * 4 + 1)), { WEB, FEEDBACK_SALT: 'test-salt' })).status, 413);
  assert.equal(WEB.rows.length, 0);
});

test('one install is limited too (gym Wi-Fi shares an address), and all messages together', async () => {
  const WEB = fakeD1();
  const env = { WEB, FEEDBACK_SALT: 'test-salt' };
  for (let i = 0; i < PER_DAY; i++) await handleFeedback(post({ source: 'member', text: `m${i}`, sender: 'install-aaaaaaaa' }, `10.0.0.${i}`), env);
  assert.equal((await handleFeedback(post({ source: 'member', text: 'x', sender: 'install-aaaaaaaa' }, '10.0.1.1'), env)).status, 429);
  assert.equal((await handleFeedback(post({ source: 'member', text: 'x', sender: 'install-bbbbbbbb' }, '10.0.1.1'), env)).status, 201);
  for (let i = WEB.rows.length; i < ALL_PER_DAY; i++) WEB.rows.push({ at: new Date().toISOString(), ip_hash: `h${i}`, sender: '' });
  assert.equal((await handleFeedback(post({ source: 'member', text: 'x' }, '10.9.9.9'), env)).status, 429);
});

test('the address hash needs the secret and changes each day', async () => {
  const a = fakeD1();
  const b = fakeD1();
  await handleFeedback(post({ source: 'member', text: 'x' }), { WEB: a, FEEDBACK_SALT: 's1' }, new Date('2026-10-21T10:00:00Z'));
  await handleFeedback(post({ source: 'member', text: 'x' }), { WEB: a, FEEDBACK_SALT: 's1' }, new Date('2026-10-22T10:00:00Z'));
  await handleFeedback(post({ source: 'member', text: 'x' }), { WEB: b, FEEDBACK_SALT: 's2' }, new Date('2026-10-21T10:00:00Z'));
  assert.notEqual(a.rows[0].ip_hash, a.rows[1].ip_hash);
  assert.notEqual(a.rows[0].ip_hash, b.rows[0].ip_hash);
  assert.equal((await handleFeedback(post({ source: 'member', text: 'x' }), { WEB: a })).status, 503);
});
